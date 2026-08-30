use regex::Regex;
use serde_json::Value;

use crate::VideoInfo;

const PC_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.contains("weixin.qq.com/sph/") || text.contains("channels.weixin.qq.com")
}

// ============================================================
// 辅助函数
// ============================================================

fn extract_share_url(text: &str) -> Option<String> {
    // 视频号短链 weixin.qq.com/sph/xxx
    if let Ok(re) = Regex::new(r"(?i)https?://weixin\.qq\.com/sph/[A-Za-z0-9_-]+") {
        if let Some(m) = re.find(text) {
            return Some(
                m.as_str()
                    .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'))
                    .to_string(),
            );
        }
    }
    // 直接 channels 链接（含 query 参数）
    if let Ok(re) = Regex::new(r"(?i)https?://channels\.weixin\.qq\.com/[A-Za-z0-9_/-]+\?[A-Za-z0-9_=&-]+") {
        if let Some(m) = re.find(text) {
            return Some(
                m.as_str()
                    .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'))
                    .to_string(),
            );
        }
    }
    // 直接 channels 视频页链接
    if let Ok(re) = Regex::new(r"(?i)https?://channels\.weixin\.qq\.com/video/[A-Za-z0-9_-]+") {
        if let Some(m) = re.find(text) {
            return Some(
                m.as_str()
                    .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'))
                    .to_string(),
            );
        }
    }
    // 通用 URL 提取
    if let Ok(re) = Regex::new(r"https?://[^\s<>'\x22]+") {
        if let Some(m) = re.find(text) {
            let u = m
                .as_str()
                .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'));
            if u.contains("weixin.qq.com") || u.contains("channels.weixin.qq.com") {
                return Some(u.to_string());
            }
        }
    }
    None
}

fn extract_short_uri(url: &str) -> Option<String> {
    // weixin.qq.com/sph/{shortUri}
    if let Ok(re) = Regex::new(r"/sph/([A-Za-z0-9_-]+)") {
        if let Some(cap) = re.captures(url) {
            return Some(cap[1].to_string());
        }
    }
    // channels.weixin.qq.com/finder-preview/pages/sph?id={id}
    if let Ok(re) = Regex::new(r"\?id=([A-Za-z0-9_-]+)") {
        if let Some(cap) = re.captures(url) {
            return Some(cap[1].to_string());
        }
    }
    // channels.weixin.qq.com/video/{videoId}
    if let Ok(re) = Regex::new(r"/video/([A-Za-z0-9_-]+)") {
        if let Some(cap) = re.captures(url) {
            return Some(cap[1].to_string());
        }
    }
    None
}

// ============================================================
// API 调用
// ============================================================

/// 通过视频号公开 API 获取视频信息
async fn fetch_via_api(client: &reqwest::Client, short_uri: &str) -> Result<VideoInfo, String> {
    let body = serde_json::json!({
        "baseReq": {
            "generalToken": ""
        },
        "shortUri": short_uri
    });

    let resp = client
        .post("https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info")
        .header("User-Agent", PC_UA)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Referer", format!("https://channels.weixin.qq.com/finder-preview/pages/sph?id={short_uri}"))
        .header("Origin", "https://channels.weixin.qq.com")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {e}"))?;

    let status = resp.status();
    let data: Value = resp.json().await.map_err(|e| format!("API 响应解析失败: {e}"))?;

    if !status.is_success() {
        return Err(format!("API 返回 HTTP {status}"));
    }

    // 检查错误
    if data.get("error").is_some() {
        let err_msg = data["error"]["message"].as_str().unwrap_or("unknown");
        return Err(format!("API 错误: {err_msg}"));
    }

    if data.get("errCode").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
        return Err(format!(
            "API errCode={}: {}",
            data["errCode"].as_i64().unwrap_or(-1),
            data["errMsg"].as_str().unwrap_or("")
        ));
    }

    let feed_info = data
        .get("data")
        .and_then(|d| d.get("feedInfo"))
        .ok_or("API 响应缺少 feedInfo")?;

    let author_info = data
        .get("data")
        .and_then(|d| d.get("authorInfo"));

    // ----- 提取视频播放地址 -----
    // 视频号 API 对 Web 端不返回真实视频 URL（仅限微信内播放）
    // 优先级：h265VideoInfo > h264VideoInfo > videoUrl > coverUrl(兜底)
    let play_url = feed_info
        .get("h265VideoInfo")
        .and_then(|v| v.get("videoUrl"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            feed_info
                .get("h264VideoInfo")
                .and_then(|v| v.get("videoUrl"))
                .and_then(|v| v.as_str())
        })
        .or_else(|| feed_info.get("videoUrl").and_then(|v| v.as_str()))
        .or_else(|| feed_info.get("coverUrl").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    // ----- 标题 -----
    let desc = feed_info
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let title = if desc.is_empty() {
        "shipinhao_video".to_string()
    } else {
        desc.clone()
    };

    // ----- 作者 -----
    let author = author_info
        .and_then(|a| a.get("nickname"))
        .and_then(|v| v.as_str())
        .unwrap_or("未知作者")
        .to_string();

    // ----- 时长 -----
    let duration_ms = feed_info
        .get("duration")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // ----- 封面 -----
    let cover = feed_info
        .get("coverUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    Ok(VideoInfo {
        aweme_id: short_uri.to_string(),
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url,
    })
}

// ============================================================
// HTML 数据提取（备用方案）
// ============================================================

fn extract_json_blocks(html: &str) -> Vec<String> {
    let mut blocks: Vec<String> = Vec::new();
    let var_names = ["__NEXT_DATA__", "__INITIAL_DATA__", "__INITIAL_STATE__"];

    for name in &var_names {
        let prefix = format!("window.{}", name);
        let mut search_from = 0usize;

        while let Some(pos) = html[search_from..].find(&prefix) {
            let abs_pos = search_from + pos;
            let after_var = &html[abs_pos + prefix.len()..];
            let eq_pos = match after_var.find('=') {
                Some(p) => p,
                None => break,
            };
            let after_eq = &after_var[eq_pos + 1..];
            let brace_start = match after_eq.find('{') {
                Some(p) => p,
                None => break,
            };

            let json_start_in_html = abs_pos + prefix.len() + eq_pos + 1 + brace_start;
            if let Some(json_end) = find_matching_brace(html, json_start_in_html) {
                let json_str = html[json_start_in_html..=json_end].to_string();
                if !blocks.iter().any(|b| *b == json_str) {
                    blocks.push(json_str);
                }
            }

            search_from = abs_pos + prefix.len() + 1;
            if search_from >= html.len() {
                break;
            }
        }
    }

    if let Ok(re) = Regex::new(r#"<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)</script>"#) {
        if let Some(cap) = re.captures(html) {
            let json_str = cap[1].trim().to_string();
            if !blocks.iter().any(|b| *b == json_str) {
                blocks.push(json_str);
            }
        }
    }

    blocks
}

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

fn extract_video_from_json(data: &Value, short_uri: &str) -> Option<VideoInfo> {
    // 递归查找含有 videoUrl / h265VideoInfo 的对象
    find_video_in_json(data, short_uri)
}

fn find_video_in_json(value: &Value, short_uri: &str) -> Option<VideoInfo> {
    if let Some(obj) = value.as_object() {
        if obj.contains_key("h265VideoInfo") || obj.contains_key("h264VideoInfo") || obj.contains_key("videoUrl") {
            let play_url = obj
                .get("h265VideoInfo")
                .and_then(|v| v.get("videoUrl"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    obj.get("h264VideoInfo")
                        .and_then(|v| v.get("videoUrl"))
                        .and_then(|v| v.as_str())
                })
                .or_else(|| obj.get("videoUrl").and_then(|v| v.as_str()))
                .or_else(|| obj.get("coverUrl").and_then(|v| v.as_str()))?;

            let desc = obj
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let title = if desc.is_empty() {
                "shipinhao_video".to_string()
            } else {
                desc.clone()
            };

            return Some(VideoInfo {
                aweme_id: short_uri.to_string(),
                title,
                desc,
                author: String::new(),
                duration_ms: 0,
                cover: String::new(),
                play_url: play_url.to_string(),
            });
        }
        for (_, val) in obj {
            if let Some(info) = find_video_in_json(val, short_uri) {
                return Some(info);
            }
        }
    }
    if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(info) = find_video_in_json(item, short_uri) {
                return Some(info);
            }
        }
    }
    None
}

// fn extract_from_meta(html: &str) -> Option<VideoInfo> {
//     let og_video = Regex::new(r#"<meta\s[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']"#)
//         .ok()?
//         .captures(html)
//         .map(|c| c[1].to_string())
//         .or_else(|| {
//             Regex::new(r#"<meta\s[^>]*property=["']og:video:url["'][^>]*content=["']([^"']+)["']"#)
//                 .ok()
//                 .and_then(|re| re.captures(html))
//                 .map(|c| c[1].to_string())
//         })?;

//     let title = Regex::new(r#"<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']"#)
//         .ok()
//         .and_then(|re| re.captures(html))
//         .map(|c| c[1].to_string())
//         .unwrap_or_else(|| "shipinhao_video".to_string());

//     let desc = Regex::new(r#"<meta\s[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']"#)
//         .ok()
//         .and_then(|re| re.captures(html))
//         .map(|c| c[1].to_string())
//         .unwrap_or_default();

//     let cover = Regex::new(r#"<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']"#)
//         .ok()
//         .and_then(|re| re.captures(html))
//         .map(|c| c[1].to_string())
//         .unwrap_or_default();

//     Some(VideoInfo {
//         aweme_id: String::new(),
//         title,
//         desc,
//         author: String::new(),
//         duration_ms: 0,
//         cover,
//         play_url: og_video,
//     })
// }

// ============================================================
// 对外入口
// ============================================================

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    let share_url =
        extract_share_url(text).ok_or("没有找到视频号链接，请粘贴包含 weixin.qq.com/sph/ 的分享文本")?;

    let short_uri = extract_short_uri(&share_url).ok_or_else(|| {
        format!("无法从链接提取视频 ID: {share_url}")
    })?;

    // ============================================================
    // Step 1: 预热 session
    // ============================================================
    let _ = client
        .get("https://channels.weixin.qq.com")
        .header("User-Agent", PC_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;

    // ============================================================
    // Step 2: 访问分享链接并跟随重定向（获取 Cookie）
    // ============================================================
    let _ = client
        .get(&share_url)
        .header("User-Agent", PC_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;

    // ============================================================
    // Step 3: 通过 API 获取视频信息（主要方案）
    // ============================================================
    match fetch_via_api(client, &short_uri).await {
        Ok(info) => return Ok(info),
        Err(e) => {
            // API 失败时尝试 HTML 解析作为备用
            let page_url = format!("https://channels.weixin.qq.com/finder-preview/pages/sph?id={short_uri}");
            let resp = client
                .get(&page_url)
                .header("User-Agent", PC_UA)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
                .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                .send()
                .await
                .map_err(|_| format!("视频号解析失败\n[API] {e}"))?;

            let html = resp.text().await.unwrap_or_default();

            // 尝试 JSON 块
            let blocks = extract_json_blocks(&html);
            for raw in &blocks {
                if let Ok(data) = serde_json::from_str::<Value>(raw) {
                    if let Some(info) = extract_video_from_json(&data, &short_uri) {
                        return Ok(info);
                    }
                }
            }

            Err(format!("视频号解析失败\n[API] {e}"))
        }
    }
}
