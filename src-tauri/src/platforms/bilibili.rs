//! 哔哩哔哩视频解析（不登录方案）
//!
//! 解析链路：
//! 1. 从分享文本提取 BV 号 / av 号（b23.tv 短链先跟随重定向）
//! 2. view API → 标题 / 作者 / 封面 / 时长 / cid
//! 3. playurl API（fnval=0 + platform=html5）→ 单个 mp4 直链，无需 ffmpeg 合并
//!
//! 清晰度受登录限制：不登录一般 ≤720p；1080p+ / 杜比需要 SESSDATA（暂未支持）。

use regex::Regex;
use serde_json::Value;

use crate::http::PC_UA;
use super::VideoInfo;

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.contains("bilibili.com") || text.contains("b23.tv")
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

fn extract_bvid(text: &str) -> Option<String> {
    Regex::new(r"BV[0-9A-Za-z]{10}")
        .ok()?
        .find(text)
        .map(|m| m.as_str().to_string())
}

fn extract_aid(text: &str) -> Option<String> {
    Regex::new(r"(?i)\bav(\d+)\b")
        .ok()?
        .captures(text)
        .map(|c| c[1].to_string())
}

/// 解析出视频标识；返回 (展示用 id, 查询参数)。优先 BV，其次 av，b23.tv 短链跟随重定向。
async fn resolve_id(client: &reqwest::Client, text: &str) -> Result<(String, String), String> {
    if let Some(b) = extract_bvid(text) {
        return Ok((b.clone(), format!("bvid={b}")));
    }
    if let Some(a) = extract_aid(text) {
        return Ok((format!("av{a}"), format!("aid={a}")));
    }

    if text.contains("b23.tv") {
        let url = extract_url(text).ok_or("没有找到哔哩哔哩链接")?;
        let resp = client
            .get(&url)
            .header("Referer", "https://www.bilibili.com/")
            .header("User-Agent", PC_UA)
            .send()
            .await
            .map_err(|e| format!("b23.tv 短链请求失败: {e}"))?;
        let final_url = resp.url().to_string();
        if let Some(b) = extract_bvid(&final_url) {
            return Ok((b.clone(), format!("bvid={b}")));
        }
        return Err(format!("b23.tv 短链重定向后未识别出 BV 号: {final_url}"));
    }

    Err("没有找到哔哩哔哩链接（BV 号），请粘贴包含 bilibili.com 的分享文本".into())
}

// ============================================================
// 对外入口
// ============================================================

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    // Step 0: 预热 Cookie（buvid3），多数 API 需要它避免风控拦截
    let _ = client.get("https://www.bilibili.com/").send().await;

    let (id_label, id_query) = resolve_id(client, text).await?;

    // Step 1: view API → 元信息
    let view_url = format!("https://api.bilibili.com/x/web-interface/view?{id_query}");
    let resp = client
        .get(&view_url)
        .header("Referer", "https://www.bilibili.com/")
        .header("User-Agent", PC_UA)
        .send()
        .await
        .map_err(|e| format!("详情 API 请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("详情 API → HTTP {}", resp.status()));
    }
    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("详情 API → JSON 解析失败: {e}"))?;
    let code = data["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        let msg = data["message"].as_str().unwrap_or("?");
        return Err(format!("详情 API → code={code}: {msg}"));
    }
    let d = data.get("data").ok_or("详情 API → 缺少 data")?;
    let cid = d["cid"].as_u64().ok_or("详情 API → 缺少 cid")?;
    let title = d["title"].as_str().unwrap_or("bilibili_video").to_string();
    let desc = d["desc"].as_str().unwrap_or("").to_string();
    let author = d["owner"]["name"].as_str().unwrap_or("未知作者").to_string();
    let duration_ms = d["duration"].as_u64().unwrap_or(0) * 1000;
    let cover = d["pic"].as_str().unwrap_or("").to_string();

    // Step 2: playurl API（fnval=0 + platform=html5 → 单文件 mp4）
    let play_url = format!(
        "https://api.bilibili.com/x/player/playurl?{id_query}&cid={cid}&qn=64&fnval=0&platform=html5&high_quality=1"
    );
    let resp2 = client
        .get(&play_url)
        .header("Referer", "https://www.bilibili.com/")
        .header("User-Agent", PC_UA)
        .send()
        .await
        .map_err(|e| format!("播放地址 API 请求失败: {e}"))?;
    if !resp2.status().is_success() {
        return Err(format!("播放地址 API → HTTP {}", resp2.status()));
    }
    let json: Value = resp2
        .json()
        .await
        .map_err(|e| format!("播放地址 API → JSON 解析失败: {e}"))?;
    let code2 = json["code"].as_i64().unwrap_or(-1);
    if code2 != 0 {
        let msg = json["message"].as_str().unwrap_or("?");
        return Err(format!("播放地址 API → code={code2}: {msg}"));
    }
    let url = json["data"]["durl"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|u| u["url"].as_str())
        .ok_or("播放地址 API → 未返回视频地址（可能需要登录）")?;

    Ok(VideoInfo {
        aweme_id: id_label,
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url: url.to_string(),
        platform: "哔哩哔哩".to_string(),
        quality_options: Vec::new(),
    })
}
