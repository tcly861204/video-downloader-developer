//! 好看视频解析（移动端页面方案）
//!
//! 解析链路：
//! 1. 从分享文本提取 vid（`v?vid=` 查询参数或 `/video/` 路径；短链先跟随重定向）
//! 2. 用移动端 UA 拉取 `https://haokan.baidu.com/v?vid=xxx`，该页面 SSR 了完整数据
//! 3. 提取 `<script id="_page_data"> window.__PRELOADED_STATE__ = {...}` 中的 JSON
//! 4. 从 `curVideoMeta` 拿标题/作者/封面/时长，播放地址按 `clarityUrl` 选最高清晰度，回退 `playurl`
//!
//! 用 PC UA 请求会被返回 JS 壳（mkdcheck），移动端 UA 才能拿到 SSR 数据。

use regex::Regex;
use serde_json::Value;

use crate::http::MOBILE_UA;
use super::VideoInfo;

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.contains("haokan.baidu.com") || text.contains("haokan.com")
}

// ============================================================
// ID 提取
// ============================================================

fn extract_url(text: &str) -> Option<String> {
    let re = Regex::new(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+").ok()?;
    let m = re.find(text)?;
    Some(
        m.as_str()
            .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'))
            .to_string(),
    )
}

fn extract_vid(text: &str) -> Option<String> {
    let patterns = [r"[?&]vid=(\d{5,})", r"(?:/video/|/v/)(\d{5,})"];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(text) {
                return Some(cap[1].to_string());
            }
        }
    }
    None
}

// ============================================================
// 页面 JSON 提取
// ============================================================

/// 从 `window.__PRELOADED_STATE__ = ` 后找到第一个 `{`，括号计数取匹配的 JSON 文本
fn extract_preloaded_json(html: &str) -> Option<String> {
    let marker = "window.__PRELOADED_STATE__ = ";
    let marker_pos = html.find(marker)?;
    let after = &html[marker_pos + marker.len()..];
    let brace_start = marker_pos + marker.len() + after.find('{')?;
    let json_end = find_matching_brace(html, brace_start)?;
    Some(html[brace_start..=json_end].to_string())
}

/// 括号计数：从 html[open_pos] 这个 `{` 开始，找到匹配的 `}` 位置（跳过字符串与转义）
fn find_matching_brace(html: &str, open_pos: usize) -> Option<usize> {
    let bytes = html.as_bytes();
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for i in open_pos..bytes.len() {
        let ch = bytes[i];

        if escape_next {
            escape_next = false;
            continue;
        }

        if ch == b'\\' && in_string {
            escape_next = true;
            continue;
        }

        if ch == b'"' {
            in_string = !in_string;
            continue;
        }

        if in_string {
            continue;
        }

        if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }

    None
}

// ============================================================
// 对外入口
// ============================================================

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    // Step 0: 拿 vid；分享文本里没有就跟随链接重定向再试一次
    let vid = if let Some(v) = extract_vid(text) {
        v
    } else if let Some(url) = extract_url(text) {
        let resp = client
            .get(&url)
            .header("User-Agent", MOBILE_UA)
            .header("Referer", "https://haokan.baidu.com/")
            .send()
            .await
            .map_err(|e| format!("好看视频短链请求失败: {e}"))?;
        let final_url = resp.url().to_string();
        extract_vid(&final_url)
            .ok_or_else(|| format!("好看视频短链重定向后未识别出 vid: {final_url}"))?
    } else {
        return Err("没有找到好看视频链接，请粘贴包含 haokan.baidu.com 的分享文本".into());
    };

    // Step 1: 移动端页面 → SSR 数据
    let page_url = format!("https://haokan.baidu.com/v?vid={vid}");
    let resp = client
        .get(&page_url)
        .header("User-Agent", MOBILE_UA)
        .header("Referer", "https://haokan.baidu.com/")
        .send()
        .await
        .map_err(|e| format!("好看视频页面请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("好看视频页面 → HTTP {}", resp.status()));
    }
    let html = resp.text().await.unwrap_or_default();

    let json_text = extract_preloaded_json(&html)
        .ok_or("好看视频页面未包含视频数据（可能被风控，或视频已失效）")?;
    let data: Value = serde_json::from_str(&json_text)
        .map_err(|e| format!("好看视频页面 JSON 解析失败: {e}"))?;

    // Step 2: curVideoMeta 不存在说明视频已下架/失效
    let meta = match data.get("curVideoMeta") {
        Some(m) if m.is_object() => m,
        _ => {
            let msg = data["responseInfo"]["msg"]
                .as_str()
                .unwrap_or("视频不存在或已被删除");
            return Err(format!("好看视频：{msg}"));
        }
    };

    // Step 3: 播放地址 — clarityUrl 里按清晰度 rank 取最高，回退 playurl
    let play_url = meta["clarityUrl"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .filter_map(|e| {
                    let rank = e["rank"].as_u64()?;
                    let url = e["url"].as_str()?;
                    Some((rank, url))
                })
                .max_by_key(|(rank, _)| *rank)
        })
        .map(|(_, url)| url)
        .or_else(|| meta["playurl"].as_str())
        .ok_or("好看视频：未解析到视频播放地址")?
        .to_string();

    Ok(VideoInfo {
        aweme_id: vid,
        title: meta["title"].as_str().unwrap_or("haokan_video").to_string(),
        desc: meta["description"].as_str().unwrap_or("").to_string(),
        author: meta["source_name"].as_str().unwrap_or("未知作者").to_string(),
        duration_ms: meta["duration"].as_u64().unwrap_or(0) * 1000,
        cover: meta["poster"].as_str().unwrap_or("").to_string(),
        play_url,
        platform: "好看视频".to_string(),
    })
}
