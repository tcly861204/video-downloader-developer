//! Pornhub 视频解析
//!
//! 解析链路（对齐 yt-dlp 的 PornHubIE 实现）：
//! 1. 从分享文本提取 viewkey（`viewkey=` 查询参数）
//! 2. 带年龄门 Cookie（age_verified / accessPH 等）+ `platform=pc` 请求 view_video.php
//! 3. 页面里播放器配置在 `var flashvars_<id> = {...}`（不是 __PRELOADED_STATE__），
//!    从中取 `mediaDefinitions[]`，每项直链字段是 `videoUrl`（有些项为 `url`）
//! 4. `videoUrl` 若指向 `/video/get_media` 则再请求一次拿真正的 CDN 直链列表
//! 5. 在全部候选中优先选清晰度最高、可直接下载的 mp4（跳过 hls / dash）；
//!    2026 年起 Pornhub 只提供 HLS（fMP4 分片），没有直链 MP4 时退而选最高清晰度的
//!    HLS 变体，由下载器走 HLS 下载
//!
//! 注意：
//! - Pornhub 为境外站点，国内网络需在设置里开启代理才能访问
//! - 命中 Cloudflare 人机校验（403 / 校验页）会给出提示，稍后重试即可

use regex::Regex;
use serde_json::Value;

use crate::http::PC_UA;
use super::{QualityOption, VideoInfo};

/// 请求 Pornhub 页面/接口统一带的 Cookie：年龄门 + 桌面端标识
const PH_COOKIE: &str =
    "age_verified=1; accessAgeDisclaimerPH=1; accessAgeDisclaimerUK=1; accessPH=1; platform=pc";

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.to_ascii_lowercase().contains("pornhub")
}

// ============================================================
// viewkey 提取
// ============================================================

fn extract_viewkey(text: &str) -> Option<String> {
    let re = Regex::new(r"[?&]viewkey=([A-Za-z0-9]+)").ok()?;
    re.captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

// ============================================================
// JSON 块提取（括号计数，跳过字符串与转义）
// ============================================================

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

/// 提取 `var flashvars_<id> = {...}` 里的 JSON（用括号计数，比非贪婪正则稳健）。
/// viewkey 是字母数字混合（如 `6a9007b90a961`），故 id 部分不能用 `\d+`，否则全漏掉。
fn extract_flashvars(html: &str) -> Option<String> {
    let re = Regex::new(r"flashvars_[A-Za-z0-9]+\s*=\s*\{").ok()?;
    let m = re.find(html)?;
    let open_pos = m.end() - 1;
    let close_pos = find_matching_brace(html, open_pos)?;
    Some(html[open_pos..=close_pos].to_string())
}

// ============================================================
// 媒体地址收集
// ============================================================

/// 从 get_media 接口拉取真正的 CDN 直链列表（该接口返回 JSON 数组）
async fn fetch_get_media(client: &reqwest::Client, url: &str) -> Vec<Value> {
    let abs = if url.starts_with('/') {
        format!("https://www.pornhub.com{url}")
    } else {
        url.to_string()
    };
    let resp = client
        .get(&abs)
        .header("User-Agent", PC_UA)
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://www.pornhub.com/")
        .header("Origin", "https://www.pornhub.com")
        .header("Cookie", PH_COOKIE)
        .send()
        .await;
    match resp {
        Ok(r) => {
            let text = r.text().await.unwrap_or_default();
            serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default()
        }
        Err(_) => Vec::new(),
    }
}

/// 收集全部候选 (url, 清晰度)。来源：mediaDefinitions 的 videoUrl/url、
/// media_/quality_ JS 变量、get_media 展开、页面里直接扫描 .mp4 兜底。
async fn collect_candidates(
    client: &reqwest::Client,
    html: &str,
    flashvars: Option<&Value>,
) -> Vec<(String, u64)> {
    let mut cands: Vec<(String, u64)> = Vec::new();

    // 1) mediaDefinitions
    if let Some(defs) = flashvars
        .and_then(|fv| fv.get("mediaDefinitions"))
        .and_then(|v| v.as_array())
    {
        for d in defs {
            let q = d.get("quality").and_then(|v| v.as_u64()).unwrap_or(0);
            let vu = d.get("videoUrl").and_then(|v| v.as_str()).unwrap_or("");
            let u = d.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if !vu.is_empty() {
                cands.push((vu.to_string(), q));
            }
            if !u.is_empty() && u != vu {
                cands.push((u.to_string(), q));
            }
        }
    }

    // 2) 兜底 JS 变量：media_xxx / quality_xxx / qualityItems_xxx
    //    （`var ` 前缀可选，页面里也可能是 `window.media_<id> = ...` 等写法）
    if cands.is_empty() {
        if let Ok(re) =
            Regex::new(r#"(?:var\s+)?(?:media|quality)_\w+\s*=\s*["']([^"']+)["']"#)
        {
            for cap in re.captures_iter(html) {
                let u = cap[1].to_string();
                if !u.is_empty() {
                    cands.push((u, 0));
                }
            }
        }
    }

    // 3) 展开 get_media 型地址
    let mut expanded: Vec<(String, u64)> = Vec::new();
    for (u, q) in cands {
        if u.contains("/video/get_media") {
            for m in fetch_get_media(client, &u).await {
                if let Some(mu) = m
                    .get("videoUrl")
                    .and_then(|v| v.as_str())
                    .or_else(|| m.get("url").and_then(|v| v.as_str()))
                {
                    if !mu.is_empty() {
                        expanded.push((
                            mu.to_string(),
                            m.get("quality").and_then(|v| v.as_u64()).unwrap_or(0),
                        ));
                    }
                }
            }
        } else {
            expanded.push((u, q));
        }
    }

    // 4) 页面直接扫 .mp4 兜底（前面全失败时）
    if expanded.is_empty() {
        if let Ok(re) = Regex::new(r#"https?://[^"'\s<>]+?\.mp4[^"'\s<>]*"#) {
            for m in re.find_iter(html) {
                let u = m.as_str().to_string();
                if u.contains("m3u8") {
                    continue;
                }
                let q = Regex::new(r"(\d{3,4})[pP]")
                    .ok()
                    .and_then(|r| r.captures(&u))
                    .and_then(|c| c.get(1))
                    .and_then(|m| m.as_str().parse::<u64>().ok())
                    .unwrap_or(0);
                expanded.push((u, q));
            }
        }
    }

    // 5) 下载按钮直链（/download.php?...），解析为绝对地址，质量未知按 0 兜底
    if let Ok(re) = Regex::new(r#"class=["']downloadBtn["'][^>]*href=["']([^"']+)["']"#) {
        for cap in re.captures_iter(html) {
            let u = cap[1].to_string();
            let abs = if u.starts_with('/') {
                format!("https://www.pornhub.com{u}")
            } else {
                u
            };
            if !expanded.iter().any(|(e, _)| *e == abs) {
                expanded.push((abs, 0));
            }
        }
    }

    // 去重（保持顺序，后续选最高清晰度）
    let mut seen = std::collections::HashSet::new();
    expanded
        .into_iter()
        .filter(|(u, _)| seen.insert(u.clone()))
        .collect()
}

/// URL 是否是可直接下载的视频直链：必须是 http，且排除播放清单 / 图片 / 脚本等
fn is_direct_video_url(u: &str) -> bool {
    if !u.starts_with("http") {
        return false;
    }
    let lower = u.to_ascii_lowercase();
    let bad = [
        "m3u8", "mpd", "/mpd", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".css", ".js", ".svg",
        ".html",
    ];
    !bad.iter().any(|b| lower.contains(b))
}

/// 从候选中选清晰度最高、可直接下载的视频直链（跳过 hls/dash，排除图片等）。
/// 不要求必须带 `.mp4` 扩展名——部分 CDN 直链不带扩展名，也能直接下载。
fn pick_direct_mp4(cands: &[(String, u64)]) -> Option<String> {
    cands
        .iter()
        .filter(|(u, _)| is_direct_video_url(u))
        // 明确带 .mp4 的同清晰度下优先
        .max_by_key(|(u, q)| {
            let bonus = if u.contains(".mp4") || u.contains("mp4/") { 1 } else { 0 };
            (*q, bonus)
        })
        .map(|(u, _)| u.clone())
}

/// 从 URL 里解析清晰度（如 `1080P_4000K` → 1080），mediaDefinitions 没给 quality 时兜底
fn quality_from_url(u: &str) -> u64 {
    Regex::new(r"(\d{3,4})[pP]")
        .ok()
        .and_then(|r| r.captures(u))
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u64>().ok())
        .unwrap_or(0)
}

/// 没有直链 MP4 时，选清晰度最高的 HLS 变体作为播放地址。
/// 2026 年起 Pornhub 只提供 HLS（fMP4 分片），下载器收到 m3u8 会走 HLS 下载。
fn pick_hls(cands: &[(String, u64)]) -> Option<String> {
    cands
        .iter()
        .filter(|(u, _)| u.contains("m3u8"))
        .max_by_key(|(u, q)| (*q).max(quality_from_url(u)))
        .map(|(u, _)| u.clone())
}

/// 把候选地址整理成可选清晰度档位（label 如 1080P / 720P…）。
/// 只保留「可直接下载」的直链与 HLS 变体；同清晰度优先 MP4 直链。
fn build_quality_options(cands: &[(String, u64)]) -> Vec<QualityOption> {
    use std::collections::HashMap;
    let mut best: HashMap<u64, &str> = HashMap::new();
    for (u, q) in cands {
        if !u.starts_with("http") {
            continue;
        }
        let is_hls = u.contains("m3u8");
        if !is_hls && !is_direct_video_url(u) {
            continue;
        }
        let qq = (*q).max(quality_from_url(u));
        if qq == 0 {
            continue;
        }
        match best.get(&qq) {
            // 当前是非 HLS 直链（优先），或原值也是 HLS（HLS 间后者覆盖）才替换
            Some(prev) => {
                if !is_hls || prev.contains("m3u8") {
                    best.insert(qq, u);
                }
            }
            None => {
                best.insert(qq, u);
            }
        }
    }
    let mut v: Vec<(u64, String)> = best
        .into_iter()
        .map(|(q, u)| (q, u.to_string()))
        .collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    v.into_iter()
        .map(|(q, u)| QualityOption {
            label: format!("{q}P"),
            play_url: u,
        })
        .collect()
}

/// 候选地址摘要，供解析失败时排障
fn describe_candidates(cands: &[(String, u64)]) -> String {
    if cands.is_empty() {
        return "  （没有任何候选地址）".to_string();
    }
    let mut lines: Vec<String> = Vec::new();
    for (u, q) in cands.iter().take(8) {
        let short: String = u.chars().take(110).collect();
        let qq = (*q).max(quality_from_url(u));
        lines.push(format!("  [{qq}p] {short}"));
    }
    if cands.len() > 8 {
        lines.push(format!("  … 另有 {} 条", cands.len() - 8));
    }
    lines.join("\n")
}

/// 页面快照，供「零候选」时排障：能看出拿到的到底是视频页还是风控/拦截页
fn page_snapshot(html: &str) -> String {
    let flashvars = if extract_flashvars(html).is_some() {
        "有"
    } else {
        "无"
    };
    let mp4 = Regex::new(r"\.mp4").ok().map(|r| r.find_iter(html).count()).unwrap_or(0);
    let m3u8 = Regex::new(r"m3u8").ok().map(|r| r.find_iter(html).count()).unwrap_or(0);
    let btn = Regex::new(r"downloadBtn")
        .ok()
        .map(|r| r.find_iter(html).count())
        .unwrap_or(0);
    let title = title_from_html(html);
    format!(
        "页面快照：长度 {} 字节，标题「{title}」，flashvars={flashvars}，.mp4 出现 {mp4} 次，m3u8 出现 {m3u8} 次，downloadBtn 出现 {btn} 次",
        html.len()
    )
}

// ============================================================
// 元信息提取
// ============================================================

fn title_from_html(html: &str) -> String {
    let patterns = [
        r#"<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']"#,
        r#"<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']"#,
        r#"data-video-title=["']([^"']+)["']"#,
        r#"shareTitle["']\s*[=:]\s*["']([^"']+)["']"#,
        r#"(?s)<h1[^>]+class=["']title["'][^>]*>(?P<t>.+?)</h1>"#,
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(html) {
                let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                let raw = raw.replace(" - Pornhub.com", "");
                // 去掉标题里可能混入的标签（如 h1 里的 verified 徽章）
                let clean = Regex::new(r"<[^>]+>")
                    .ok()
                    .map(|re| re.replace_all(&raw, "").trim().to_string())
                    .unwrap_or(raw);
                if !clean.is_empty() {
                    return clean;
                }
            }
        }
    }
    "pornhub_video".to_string()
}

fn author_from_html(html: &str) -> String {
    let patterns = [
        r#"<a[^>]+href=["']/(?:(?:user|channel)s|model|pornstar)/[^"']*["'][^>]*>([^<]+)<"#,
        r#"class=["']username["'][^>]*>([^<]+)<"#,
        r#""username"\s*:\s*"([^"]+)""#,
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(html) {
                let name = cap[1].trim().to_string();
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }
    "未知作者".to_string()
}

/// 提取「视频已删除 / 禁用」页面提示文本（必须真实存在于元素内，避免误判）
fn removed_message(html: &str) -> Option<String> {
    let re = Regex::new(
        r#"(?s)<(?:div|section)[^>]+class=["'](?:[^"']*\b(?:removed|userMessageSection)\b[^"']*)["'][^>]*>(?P<e>.+?)</(?:div|section)>"#,
    )
    .ok()?;
    let m = re.captures(html)?;
    let raw = m.name("e").map(|x| x.as_str()).unwrap_or("");
    let text = Regex::new(r"<[^>]+>")
        .ok()
        .map(|re| re.replace_all(raw, " ").to_string())
        .unwrap_or_else(|| raw.to_string());
    let msg = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if msg.is_empty() {
        None
    } else {
        Some(msg)
    }
}

// ============================================================
// 页面解析
// ============================================================

async fn try_extract(
    client: &reqwest::Client,
    html: &str,
    viewkey: &str,
) -> Result<VideoInfo, String> {
    // flashvars 缺失也能靠「页面直接扫 .mp4」兜底，故解析失败不致命
    let fv = extract_flashvars(html).and_then(|s| serde_json::from_str::<Value>(&s).ok());

    let duration_ms = fv
        .as_ref()
        .and_then(|fv| fv.get("video_duration"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        * 1000;
    let cover = fv
        .as_ref()
        .and_then(|fv| fv.get("image_url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let cands = collect_candidates(client, html, fv.as_ref()).await;
    let play_url = match pick_direct_mp4(&cands) {
        Some(u) => u,
        None => match pick_hls(&cands) {
            // HLS 兜底：下载器收到 m3u8 会自动走 HLS 下载（拼接 fMP4 分片）
            Some(u) => u,
            None => {
                return Err(format!(
                    "未找到可用的直链（既无 MP4 也无 HLS 流）\n{}\n候选地址：\n{}",
                    page_snapshot(html),
                    describe_candidates(&cands)
                ));
            }
        },
    };
    let quality_options = build_quality_options(&cands);

    Ok(VideoInfo {
        aweme_id: viewkey.to_string(),
        title: title_from_html(html),
        desc: String::new(),
        author: author_from_html(html),
        duration_ms,
        cover,
        play_url,
        platform: "Pornhub".to_string(),
        quality_options,
    })
}

async fn fetch_and_parse(
    client: &reqwest::Client,
    page_url: &str,
    viewkey: &str,
) -> Result<VideoInfo, String> {
    let resp = client
        .get(page_url)
        .header("User-Agent", PC_UA)
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", "https://www.pornhub.com/")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Cookie", PH_COOKIE)
        .send()
        .await
        .map_err(|e| format!("页面请求失败（国内网络请先在设置里开启代理）: {e}"))?;

    let status = resp.status();
    if status == reqwest::StatusCode::FORBIDDEN {
        return Err("返回 HTTP 403，可能触发了 Cloudflare 人机校验，请稍后重试".into());
    }
    if !status.is_success() {
        return Err(format!("页面返回 HTTP {status}"));
    }

    // 重定向检测：被踢走（视频删除 / 需要登录）时最终 URL 不再含 viewkey。
    // 注意 view_video.php 带 viewkey= 参数、embed 是 /embed/<viewkey> 路径，统一按 viewkey 判断。
    if !resp.url().to_string().contains(viewkey) {
        return Err("页面发生跳转，视频可能已被删除或需要登录".into());
    }

    let html = resp.text().await.unwrap_or_default();

    if html.contains("Just a moment")
        || html.contains("cf-chl")
        || html.contains("challenge-platform")
    {
        return Err("触发了 Cloudflare 校验页，请稍后重试，或在浏览器先打开一次该链接".into());
    }
    if html.contains("geoBlocked")
        || html.contains("This content is unavailable in your country")
    {
        return Err("视频有地区限制，请更换代理出口地区后再试".into());
    }

    match try_extract(client, &html, viewkey).await {
        Ok(info) => Ok(info),
        Err(e) => {
            // 解析失败时才去识别「删除 / 锁定」等页面标记，避免正常视频被误报
            if let Some(msg) = removed_message(&html) {
                return Err(format!("该视频已被删除 / 禁用或标记审查（{msg}）"));
            }
            if html.contains("lockedPlayer") {
                return Err("该视频为付费 / 锁定内容，无法解析".into());
            }
            Err(e)
        }
    }
}

// ============================================================
// 对外入口
// ============================================================

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    let viewkey = extract_viewkey(text)
        .ok_or("没有找到 Pornhub 链接，请粘贴包含 pornhub.com 且带 viewkey= 的分享链接")?;

    let mut errors: Vec<String> = Vec::new();

    let page_url = format!("https://www.pornhub.com/view_video.php?viewkey={viewkey}");
    match fetch_and_parse(client, &page_url, &viewkey).await {
        Ok(info) => return Ok(info),
        Err(e) => errors.push(format!("[视频页] {e}")),
    }

    let embed_url = format!("https://www.pornhub.com/embed/{viewkey}");
    match fetch_and_parse(client, &embed_url, &viewkey).await {
        Ok(info) => return Ok(info),
        Err(e) => errors.push(format!("[embed页] {e}")),
    }

    Err(format!(
        "Pornhub 解析失败（viewkey: {viewkey}）：\n  {}",
        errors.join("\n  ")
    ))
}

// ============================================================
// 单元测试（纯本地逻辑，不依赖网络）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_flashvars() -> &'static str {
        r#"{"video_duration": 361, "image_url": "https://di.phncdn.com/thumb.jpg", "mediaDefinitions": [
            {"quality": 240, "format": "mp4", "videoUrl": "https://hw-cdn.phncdn.com/videos/240P_1.mp4?t=x"},
            {"quality": 720, "format": "mp4", "videoUrl": "https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x"},
            {"quality": 1080, "format": "hls", "videoUrl": "https://hw-cdn.phncdn.com/hls/index.m3u8?t=x", "url": "https://hw-cdn.phncdn.com/hls/index.m3u8?t=x"}
        ]}"#
    }

    fn sample_html() -> String {
        format!(
            r#"<html><head><title>My Title - Pornhub.com</title>
<meta name="twitter:title" content="My Title">
</head><body>
From:&nbsp;<a class="usernameBadgesWrapper" href="/users/myuser">MyUser</a>
<h1 class="title"><span class="icon-verified"></span>My Title</h1>
<script>var flashvars_123456 = {};</script>
</body></html>"#,
            sample_flashvars()
        )
    }

    #[test]
    fn can_handle_detects_pornhub() {
        assert!(can_handle("https://www.pornhub.com/view_video.php?viewkey=679db53d02b5d"));
        assert!(can_handle("PORNHUB.COM/view_video.php?viewkey=ph123"));
        assert!(!can_handle("https://v.douyin.com/abc"));
    }

    #[test]
    fn flashvars_extracted_with_alphanumeric_viewkey() {
        // 真实 viewkey 是字母数字混合（如 6a9007b90a961），旧正则 flashvars_\d+ 会整个漏掉
        let html = r#"<html><script>var flashvars_6a9007b90a961 = {"video_duration": 361, "mediaDefinitions": [{"quality": 720, "videoUrl": "https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x"}]};</script></html>"#;
        let json = extract_flashvars(html).expect("应提取到 flashvars（字母数字 viewkey）");
        let v: Value = serde_json::from_str(&json).expect("flashvars 应为合法 JSON");
        assert_eq!(v["video_duration"].as_u64(), Some(361));
        assert_eq!(v["mediaDefinitions"][0]["quality"].as_u64(), Some(720));
    }

    #[test]
    fn extract_viewkey_works() {
        assert_eq!(
            extract_viewkey("https://www.pornhub.com/view_video.php?viewkey=679db53d02b5d"),
            Some("679db53d02b5d".to_string())
        );
        assert_eq!(extract_viewkey("随便贴点文本没有链接"), None);
    }

    #[test]
    fn flashvars_extracted_and_parsed() {
        let json = extract_flashvars(&sample_html()).expect("应提取到 flashvars");
        let v: Value = serde_json::from_str(&json).expect("flashvars 应为合法 JSON");
        assert_eq!(v["video_duration"].as_u64(), Some(361));
        assert_eq!(v["mediaDefinitions"][1]["quality"].as_u64(), Some(720));
    }

    #[test]
    fn pick_mp4_skips_hls_and_prefers_highest() {
        let cands = vec![
            ("https://hw-cdn.phncdn.com/videos/240P_1.mp4?t=x".to_string(), 240),
            ("https://hw-cdn.phncdn.com/hls/index.m3u8?t=x".to_string(), 1080),
            ("https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x".to_string(), 720),
        ];
        assert_eq!(
            pick_direct_mp4(&cands).unwrap(),
            "https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x"
        );
        assert_eq!(
            pick_direct_mp4(&[(cands[1].0.clone(), 1080)]),
            None,
            "只有 HLS 时返回 None"
        );
    }

    #[test]
    fn title_and_author_from_html() {
        let html = sample_html();
        assert_eq!(title_from_html(&html), "My Title");
        assert_eq!(author_from_html(&html), "MyUser");
    }

    #[test]
    fn pick_hls_chooses_highest_variant_when_no_direct() {
        let cands = vec![
            ("https://ev-h.phncdn.com/hls/videos/202502/01/1/240P_1000K_1.mp4/master.m3u8?h=x".to_string(), 0),
            ("https://ev-h.phncdn.com/hls/videos/202502/01/1/480P_2000K_1.mp4/master.m3u8?h=y".to_string(), 0),
            ("https://ev-h.phncdn.com/hls/videos/202502/01/1/1080P_4000K_1.mp4/master.m3u8?h=z".to_string(), 0),
        ];
        // 质量 0 时按 URL 里的分辨率（1080P）兜底选最高的
        assert_eq!(
            pick_hls(&cands).unwrap(),
            "https://ev-h.phncdn.com/hls/videos/202502/01/1/1080P_4000K_1.mp4/master.m3u8?h=z"
        );
        // 有 mp4 直链时仍优先直链，pick_hls 只用于兜底
        let mixed = vec![
            ("https://ev-h.phncdn.com/hls/videos/202502/01/1/1080P_4000K_1.mp4/master.m3u8?h=z".to_string(), 0),
            ("https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x".to_string(), 720),
        ];
        assert_eq!(
            pick_direct_mp4(&mixed).unwrap(),
            "https://hw-cdn.phncdn.com/videos/720P_1.mp4?t=x"
        );
    }

    #[test]
    fn quality_options_built_and_sorted_with_mp4_preference() {
        let cands = vec![
            ("https://hw-cdn.phncdn.com/videos/480P_1.mp4?t=x".to_string(), 480),
            ("https://ev-h.phncdn.com/hls/videos/1/1080P_4000K_1.mp4/master.m3u8?h=a".to_string(), 0),
            ("https://ev-h.phncdn.com/hls/videos/1/720P_4000K_1.mp4/master.m3u8?h=b".to_string(), 0),
            // 同 720：MP4 直链应优先于 HLS 变体
            ("https://hw-cdn.phncdn.com/videos/720P_2.mp4?t=y".to_string(), 720),
            ("https://cs-phncdn.com/videos/202401/01/1/thumb.jpg".to_string(), 0),
        ];
        let opts = build_quality_options(&cands);
        let labels: Vec<&str> = opts.iter().map(|o| o.label.as_str()).collect();
        assert_eq!(labels, vec!["1080P", "720P", "480P"], "应按清晰度从高到低排序");
        let hd = opts.iter().find(|o| o.label == "1080P").unwrap();
        assert!(hd.play_url.contains("master.m3u8"), "1080P 只有 HLS");
        let sd = opts.iter().find(|o| o.label == "720P").unwrap();
        assert!(sd.play_url.contains(".mp4"), "720P 有 MP4 直链时应优先直链");
        assert!(opts.iter().all(|o| !o.play_url.contains("thumb.jpg")));
    }

    #[test]
    fn pick_allows_extensionless_video_urls() {
        // 图片、hls 被排除；不带 .mp4 扩展名的 CDN 直链也应被选中
        let cands = vec![
            ("https://cs-phncdn.com/videos/202401/01/1/thumb.jpg".to_string(), 0),
            ("https://cs-phncdn.com/videos/202401/01/1/720P_170000".to_string(), 720),
            ("https://cs-phncdn.com/hls/202401/01/1/index.m3u8".to_string(), 1080),
        ];
        assert_eq!(
            pick_direct_mp4(&cands).unwrap(),
            "https://cs-phncdn.com/videos/202401/01/1/720P_170000"
        );
    }

    #[test]
    fn removed_message_detection_requires_real_element() {
        assert!(removed_message(r#"<div class="removed">This video has been disabled.</div>"#)
            .is_some());
        // 页面里只有 "removed" 字样但不在目标元素内 → 不误判
        assert!(removed_message(r#"<div class="videoWrapper">var removed = 1;</div>"#).is_none());
    }
}
