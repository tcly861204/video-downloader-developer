//! 快手视频解析（移植自 demo，逻辑已验证）
//!
//! 解析链路：
//! 1. 从分享文本提取链接 → 预热 Cookie（访问首页）→ 访问短链跟随重定向
//! 2. 提取 photo_id
//! 3. 依次尝试：GraphQL API / 短链 HTML / 最终页 HTML / CDN URL 兜底 / 移动端 HTML
//!
//! 全部方案都失败时才返回聚合错误。

use regex::Regex;
use serde_json::Value;
use url::Url;

use crate::http::{MOBILE_UA, PC_UA};
use super::VideoInfo;

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.contains("kuaishou.com")
        || text.contains("kuaishouapp.com")
        || text.contains("gifshow.com")
        || text.contains("chenzhongtech.com")
}

// ============================================================
// 辅助函数
// ============================================================

fn extract_share_url(text: &str) -> Option<String> {
    if let Ok(re) = Regex::new(r"(?i)v\.kuaishouapp\.com/s/(\w+)") {
        if let Some(cap) = re.captures(text) {
            return Some(format!("https://v.kuaishouapp.com/s/{}", &cap[1]));
        }
    }
    if let Ok(re) = Regex::new(r"(?i)v\.kuaishou\.com/(\w+)") {
        if let Some(cap) = re.captures(text) {
            return Some(format!("https://v.kuaishou.com/{}", &cap[1]));
        }
    }
    if let Ok(re) = Regex::new(r"(?i)www\.kuaishou\.com/(f/[\w|-]+|short-video/\w+)") {
        if let Some(cap) = re.captures(text) {
            return Some(format!("https://www.kuaishou.com/{}", &cap[1]));
        }
    }
    if let Ok(re) = Regex::new(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+") {
        if let Some(m) = re.find(text) {
            let u = m.as_str().trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'));
            if u.contains("kuaishou") || u.contains("gifshow") || u.contains("chenzhongtech") {
                return Some(u.to_string());
            }
        }
    }
    None
}

fn extract_photo_id_from_url(url: &str) -> Option<String> {
    if let Ok(re) = Regex::new(r"(?i)/(?:photo|short-video)/(\w+)") {
        if let Some(cap) = re.captures(url) {
            return Some(cap[1].to_string());
        }
    }
    if let Ok(parsed) = Url::parse(url) {
        for (key, val) in parsed.query_pairs() {
            if key == "photoId" && !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

// ============================================================
// HTML 数据提取（核心逻辑）
// ============================================================

/// 从 HTML 中提取 JSON 数据块（括号计数法，不依赖正则匹配嵌套 JSON）
fn extract_json_blocks(html: &str) -> Vec<String> {
    let mut blocks: Vec<String> = Vec::new();
    let var_names = ["__APOLLO_STATE__", "__INITIAL_STATE__", "INIT_STATE"];

    for name in &var_names {
        let prefix = format!("window.{}", name);
        let mut search_from = 0usize;

        while let Some(pos) = html[search_from..].find(&prefix) {
            let abs_pos = search_from + pos;
            // 跳到 = 后面的 {
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

            // 括号计数：找到匹配的 }
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

    blocks
}

/// 括号计数：从 html[open_pos] 这个 '{' 开始，找到匹配的 '}' 位置
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

/// 清理快手 JSON 中常见的格式问题
fn sanitize_ks_json(raw: &str) -> String {
    let mut sanitized = raw.to_string();

    // 移除 JSON 中的 JS 函数引用
    if let Ok(re) = Regex::new(r#"function\s*\([^)]*\)\s*\{[^}]*\}"#) {
        sanitized = re.replace_all(&sanitized, "null").to_string();
    }

    // 处理 trailing commas (JSON 规范不允许)
    if let Ok(re) = Regex::new(r",(\s*[}\]])") {
        sanitized = re.replace_all(&sanitized, "$1").to_string();
    }

    sanitized
}

/// 从 JSON Value 中提取视频信息（支持多种嵌套结构）
fn extract_video_from_json(data: &Value, photo_id: &str) -> Option<VideoInfo> {
    // ---- 新版 Apollo State：直接查找 VisionVideoDetailPhoto:* 条目 ----
    if let Some(info) = extract_video_from_apollo_cache_root(data, photo_id) {
        return Some(info);
    }

    // ---- 旧版 INIT_STATE / Apollo State 递归搜索 ----
    find_photo_in_json(data, photo_id)
}

/// 新版 Apollo normalized cache 根结构解析
fn extract_video_from_apollo_cache_root(data: &Value, photo_id: &str) -> Option<VideoInfo> {
    let default_client = data.get("defaultClient")?;
    let client_obj = default_client.as_object()?;

    // 1. 找到 VisionVideoDetailPhoto:* 条目
    let photo_entry = client_obj.iter().find_map(|(key, val)| {
        if key.starts_with("VisionVideoDetailPhoto:") {
            Some(val)
        } else {
            None
        }
    })?;

    let photo = photo_entry.as_object()?;

    // 2. 提取视频 URL：优先级 photoUrl > videoResource > manifestH265
    let play_url = photo
        .get("photoUrl")
        .and_then(|v| v.as_str())
        .or_else(|| extract_url_from_video_resource(photo_entry))
        .or_else(|| extract_url_from_manifest_h265(photo_entry))
        .or_else(|| extract_url_from_representation(client_obj))?;

    // 3. 描述/标题
    let desc = photo
        .get("caption")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let title = if desc.is_empty() {
        "kuaishou_video".to_string()
    } else {
        desc.clone()
    };

    // 4. 作者 — 从 VisionVideoDetailAuthor:* 查找
    let author = client_obj
        .iter()
        .find_map(|(key, val)| {
            if key.starts_with("VisionVideoDetailAuthor:") {
                val.get("name")
                    .or_else(|| val.get("userName"))
                    .or_else(|| val.get("user_name"))
                    .and_then(|v| v.as_str())
            } else {
                None
            }
        })
        .unwrap_or("未知作者")
        .to_string();

    // 5. 时长（毫秒）
    let duration_ms = photo.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);

    // 6. 封面
    let cover = photo
        .get("coverUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    Some(VideoInfo {
        aweme_id: photo_id.to_string(),
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url: play_url.to_string(),
        platform: "快手".to_string(),
    })
}

/// 从 videoResource.json.{h264,hevc}.adaptationSet[0].representation[0].url 提取
fn extract_url_from_video_resource(photo: &Value) -> Option<&str> {
    let vr = photo.get("videoResource")?;
    let json_obj = vr.get("json")?;
    // 优先 H.264，回退 HEVC
    for codec in &["h264", "hevc"] {
        if let Some(url) = json_obj
            .get(codec)
            .and_then(|c| c.get("adaptationSet"))
            .and_then(|a| a.as_array())
            .and_then(|a| a.first())
            .and_then(|s| s.get("representation"))
            .and_then(|r| r.as_array())
            .and_then(|r| r.first())
            .and_then(|r| r.get("url"))
            .and_then(|v| v.as_str())
        {
            return Some(url);
        }
    }
    None
}

/// 从 manifestH265.json.adaptationSet[0].representation[0].url 提取
fn extract_url_from_manifest_h265(photo: &Value) -> Option<&str> {
    let mh = photo.get("manifestH265")?;
    let json_obj = mh.get("json")?;
    json_obj
        .get("adaptationSet")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|s| s.get("representation"))
        .and_then(|r| r.as_array())
        .and_then(|r| r.first())
        .and_then(|r| r.get("url"))
        .and_then(|v| v.as_str())
}

/// 从 Apollo cache 中的 VisionVideoSetRepresentation:* 条目提取 url
fn extract_url_from_representation(client_obj: &serde_json::Map<String, Value>) -> Option<&str> {
    for (key, val) in client_obj {
        if key.starts_with("VisionVideoSetRepresentation:") {
            if let Some(url) = val.get("url").and_then(|v| v.as_str()) {
                if !url.is_empty() {
                    return Some(url);
                }
            }
        }
    }
    None
}

fn find_photo_in_json(value: &Value, photo_id: &str) -> Option<VideoInfo> {
    // ---- 最优先：递归搜索 mainMvUrls 所在的对象（不依赖任何 key 命名约定） ----
    if let Some(info) = find_video_by_main_mv_urls(value, photo_id) {
        return Some(info);
    }

    if let Some(obj) = value.as_object() {
        // ---- INIT_STATE 模式：tusjoh / visionVideo 前缀 key ----
        for (key, val) in obj {
            if (key.starts_with("tusjoh") || key.starts_with("visionVideo"))
                && val.is_object()
            {
                if let Some(info) = try_extract_video_node(val, photo_id, true) {
                    return Some(info);
                }
            }
            if key == "photo" && val.is_object() {
                if let Some(info) = try_extract_video_node(val, photo_id, false) {
                    return Some(info);
                }
            }

            // ---- Apollo State 模式：key 包含 ":" ----
            if key.contains(':') && val.is_object() {
                if let Some(info) = extract_video_from_apollo_entry(val, photo_id) {
                    return Some(info);
                }
            }
        }

        // 递归搜索子对象
        for (_, val) in obj {
            if let Some(info) = find_photo_in_json(val, photo_id) {
                return Some(info);
            }
        }
    }

    if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(info) = find_photo_in_json(item, photo_id) {
                return Some(info);
            }
        }
    }

    None
}

/// 递归搜索任何含有 mainMvUrls 的对象（最通用的兜底）
fn find_video_by_main_mv_urls(value: &Value, photo_id: &str) -> Option<VideoInfo> {
    if let Some(obj) = value.as_object() {
        if obj.contains_key("mainMvUrls") {
            return try_extract_video_node(value, photo_id, false);
        }
        for (_, val) in obj {
            if let Some(info) = find_video_by_main_mv_urls(val, photo_id) {
                return Some(info);
            }
        }
    }
    if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(info) = find_video_by_main_mv_urls(item, photo_id) {
                return Some(info);
            }
        }
    }
    None
}

/// 从 Apollo State 的一个条目中提取视频信息
fn extract_video_from_apollo_entry(entry: &Value, photo_id: &str) -> Option<VideoInfo> {
    let obj = entry.as_object()?;

    // Apollo State 中的视频数据可能在 photo 字段下
    if let Some(photo) = obj.get("photo") {
        if let Some(info) = try_extract_video_node(photo, photo_id, false) {
            return Some(info);
        }
    }

    // 旧版：直接含 mainMvUrls / videoMp4Url
    if obj.contains_key("mainMvUrls") || obj.contains_key("videoMp4Url") {
        return try_extract_video_node(entry, photo_id, false);
    }

    // 新版：VisionVideoDetailPhoto 条目本身就是 photo 数据
    if obj.contains_key("caption") || obj.contains_key("photoUrl") || obj.contains_key("coverUrl") {
        return try_extract_video_node(entry, photo_id, false);
    }

    None
}

fn try_extract_video_node(node: &Value, photo_id: &str, check_nested: bool) -> Option<VideoInfo> {
    // 直接在 node 中搜索 photo 子对象
    let photo = if check_nested {
        node.get("photo")
            .or_else(|| node.get("visionVideoDetail"))
            .unwrap_or(node)
    } else {
        node
    };

    // 获取播放地址: 按优先级尝试多种来源
    let play_url = photo
        .get("mainMvUrls")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|u| u.get("url"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            // 备用: videoMp4Url, videoUrl, playUrl
            photo.get("videoMp4Url")
                .or_else(|| photo.get("videoUrl"))
                .or_else(|| photo.get("playUrl"))
                .and_then(|v| v.as_str())
        })
        .or_else(|| {
            // 新版 Apollo State: photoUrl 直接是视频地址
            photo.get("photoUrl").and_then(|v| v.as_str())
        })
        .or_else(|| {
            // videoResource.json.{h264,hevc}.adaptationSet[0].representation[0].url
            extract_url_from_video_resource(photo)
        })
        .or_else(|| {
            // manifestH265.json.adaptationSet[0].representation[0].url
            extract_url_from_manifest_h265(photo)
        })
        .or_else(|| {
            // manifest.adaptationSet[0].representation[0].url (旧版引用格式)
            photo.get("manifest")
                .and_then(|m| m.get("adaptationSet"))
                .and_then(|a| a.as_array())
                .and_then(|a| a.first())
                .and_then(|s| s.get("representation"))
                .and_then(|r| r.as_array())
                .and_then(|r| r.first())
                .and_then(|r| r.get("url"))
                .and_then(|v| v.as_str())
        })?;

    let play_url = play_url.to_string();

    // 描述
    let desc = photo
        .get("caption")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let title = if desc.is_empty() {
        "kuaishou_video".to_string()
    } else {
        desc.clone()
    };

    // 作者
    let author = photo
        .get("userName")
        .or_else(|| node.get("userName"))
        .or_else(|| node.get("authorName"))
        .and_then(|v| v.as_str())
        .unwrap_or("未知作者")
        .to_string();

    // 时长（秒 → 毫秒）
    let duration_ms = photo
        .get("duration")
        .and_then(|v| v.as_u64())
        .map(|d| d * 1000)
        .unwrap_or(0);

    // 封面
    let cover = photo
        .get("coverUrls")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|u| u.get("url"))
        .and_then(|v| v.as_str())
        .or_else(|| photo.get("coverUrl").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .unwrap_or_default();

    Some(VideoInfo {
        aweme_id: photo_id.to_string(),
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url,
        platform: "快手".to_string(),
    })
}

/// 从 CDN URL 直接匹配视频地址（终极兜底）
fn extract_video_from_cdn(html: &str, photo_id: &str) -> Option<VideoInfo> {
    // 快手 CDN 域名
    let cdn_patterns = [
        r#"(?i)["'](https?://[^"']*(?:kwimgs|yximgs|kuaishou|gifshow|chenzhongtech)[^"']*\.mp4(?:\?[^"']*)?)["']"#,
        r#"(?i)src=["'](https?://[^"']*(?:kwimgs|yximgs|kuaishou|gifshow)[^"']*\.mp4[^"']*)["']"#,
    ];

    let mut play_url: Option<String> = None;

    for pat in &cdn_patterns {
        if let Ok(re) = Regex::new(pat) {
            if let Some(cap) = re.captures(html) {
                play_url = Some(cap[1].to_string());
                break;
            }
        }
    }

    let play_url = play_url?;

    // 尝试提取标题/作者
    let title = Regex::new(r#"<title[^>]*>([^<]+)</title>"#)
        .ok()
        .and_then(|re| re.captures(html))
        .map(|c| c[1].to_string())
        .unwrap_or_else(|| "kuaishou_video".to_string());

    let author = Regex::new(r#"class="[^"]*profile-name[^"]*"[^>]*>([^<]*)</"#)
        .ok()
        .and_then(|re| re.captures(html))
        .map(|c| c[1].trim().to_string())
        .unwrap_or_else(|| "未知作者".to_string());

    Some(VideoInfo {
        aweme_id: photo_id.to_string(),
        title: title.clone(),
        desc: title,
        author,
        duration_ms: 0,
        cover: String::new(),
        play_url,
        platform: "快手".to_string(),
    })
}

// ============================================================
// GraphQL API 直调
// ============================================================

/// 通过快手 GraphQL API 直接获取视频信息
async fn try_graphql_api(
    client: &reqwest::Client,
    photo_id: &str,
) -> Result<VideoInfo, String> {
    let query = r#"query visionVideoDetail($photoId: String!, $page: String) { visionVideoDetail(photoId: $photoId, page: $page) { status photo { id caption duration coverUrl photoUrl } author { id name } } }"#;

    let body = serde_json::json!({
        "operationName": "visionVideoDetail",
        "variables": {
            "photoId": photo_id,
            "page": "selected"
        },
        "query": query
    });

    // 生成设备 ID：快手用 web_<md5(uuid)[:24]> 格式
    let did = {
        use md5::Digest;
        let hash = md5::Md5::digest(uuid::Uuid::new_v4().to_string());
        format!("web_{:x}", hash)[..28].to_string() // "web_" + 24 hex chars
    };

    let resp = client
        .post("https://video.kuaishou.com/graphql")
        .header("User-Agent", PC_UA)
        .header("Content-Type", "application/json")
        .header("Referer", format!("https://www.kuaishou.com/short-video/{photo_id}"))
        .header("Origin", "https://www.kuaishou.com")
        .header("Accept", "*/*")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .header("Cookie", format!("did={did}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GraphQL 请求失败: {e}"))?;

    let data: Value = resp.json().await.map_err(|e| format!("GraphQL 响应解析失败: {e}"))?;

    // 检查是否有错误
    if data.get("errors").is_some() {
        let err_msg = data["errors"][0]["message"]
            .as_str()
            .unwrap_or("unknown");
        return Err(format!("GraphQL 错误: {err_msg}"));
    }

    let vvd = data
        .get("data")
        .and_then(|d| d.get("visionVideoDetail"))
        .ok_or("GraphQL 响应缺少 data.visionVideoDetail")?;

    let status = vvd.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
    if status != 1 {
        return Err(format!("GraphQL status={status}（认证失败或视频不存在）"));
    }

    let photo = vvd.get("photo").ok_or("GraphQL 响应缺少 photo 数据")?;
    let play_url = photo
        .get("photoUrl")
        .and_then(|v| v.as_str())
        .ok_or("GraphQL 响应缺少 photoUrl")?;

    let desc = photo
        .get("caption")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let title = if desc.is_empty() {
        "kuaishou_video".to_string()
    } else {
        desc.clone()
    };

    let author = vvd
        .get("author")
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("未知作者")
        .to_string();

    let duration_ms = photo.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);

    let cover = photo
        .get("coverUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    Ok(VideoInfo {
        aweme_id: photo_id.to_string(),
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url: play_url.to_string(),
        platform: "快手".to_string(),
    })
}

// ============================================================
// 对外入口
// ============================================================

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    let share_url = extract_share_url(text)
        .ok_or("没有找到快手链接，请粘贴包含 kuaishou.com 的分享文本")?;

    // ============================================================
    // Step 0: 预热 Cookie（访问首页建立 session）
    // ============================================================
    let _ = client
        .get("https://www.kuaishou.com")
        .header("User-Agent", PC_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;

    // ============================================================
    // Step 1: 访问短链，跟随重定向，拿到最终 URL + Cookie
    // ============================================================
    let resp = client
        .get(&share_url)
        .header("User-Agent", PC_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Accept-Encoding", "gzip, deflate, br")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .send()
        .await
        .map_err(|e| format!("快手短链请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("快手短链返回 HTTP {}", resp.status()));
    }

    let redirect_url = resp.url().to_string();
    let html_step1 = resp.text().await.unwrap_or_default();
    let photo_id = extract_photo_id_from_url(&redirect_url)
        .or_else(|| extract_photo_id_from_url(&share_url))
        .ok_or_else(|| format!("无法从链接提取视频 ID: {redirect_url}"))?;

    let mut errors: Vec<String> = Vec::new();

    // ============================================================
    // Step 1.5: 优先尝试 GraphQL API（利用 Step1 已获取的 Cookie）
    // ============================================================
    match try_graphql_api(client, &photo_id).await {
        Ok(info) => return Ok(info),
        Err(e) => errors.push(format!("[GraphQL] {e}")),
    }

    // 然后尝试从短链重定向的 HTML 直接解析
    match parse_html_for_video(&html_step1, &photo_id) {
        Ok(info) => return Ok(info),
        Err(e) => errors.push(format!("[短链HTML] {e}")),
    }

    // ============================================================
    // Step 2: 访问最终页面（带 Step1 的 Cookie），拿完整 HTML
    // ============================================================
    let resp2 = client
        .get(&redirect_url)
        .header("User-Agent", PC_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Accept-Encoding", "gzip, deflate, br")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .send()
        .await
        .map_err(|e| format!("快手页面请求失败: {e}"))?;

    if resp2.status().is_success() {
        let page_html = resp2.text().await.unwrap_or_default();

        match parse_html_for_video(&page_html, &photo_id) {
            Ok(info) => return Ok(info),
            Err(e) => errors.push(format!("[页面HTML] {e}")),
        }

        // CDN URL 兜底
        if let Some(info) = extract_video_from_cdn(&page_html, &photo_id) {
            return Ok(info);
        }
        errors.push("[CDN] HTML 中未找到视频 CDN 地址".into());
    } else {
        errors.push(format!("[页面] HTTP {}", resp2.status()));
    }

    // ============================================================
    // Step 3: mobile 版页面（更可能带 SSR 数据）
    // ============================================================
    let mobile_url = redirect_url.replace("www.kuaishou.com", "m.kuaishou.com");
    let resp3 = client
        .get(&mobile_url)
        .header("User-Agent", MOBILE_UA)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .send()
        .await
        .map_err(|e| format!("快手移动端页面请求失败: {e}"))?;

    if resp3.status().is_success() {
        let mobile_html = resp3.text().await.unwrap_or_default();

        match parse_html_for_video(&mobile_html, &photo_id) {
            Ok(info) => return Ok(info),
            Err(e) => errors.push(format!("[移动端HTML] {e}")),
        }
    } else {
        errors.push(format!("[移动端] HTTP {}", resp3.status()));
    }

    Err(format!(
        "快手所有解析方案均失败（共 {} 种）\n{}",
        errors.len(),
        errors
            .iter()
            .enumerate()
            .map(|(i, e)| format!("  [{i}] {e}"))
            .collect::<Vec<_>>()
            .join("\n"),
    ))
}

/// 统一的 HTML 解析入口
fn parse_html_for_video(html: &str, photo_id: &str) -> Result<VideoInfo, String> {
    let blocks = extract_json_blocks(html);

    if blocks.is_empty() {
        return Err(format!(
            "HTML 中未找到 INIT_STATE/APOLLO_STATE 数据块（len={}, init={}, apollo={}）",
            html.len(),
            html.contains("__INITIAL_STATE__") || html.contains("INIT_STATE"),
            html.contains("__APOLLO_STATE__"),
        ));
    }

    let mut block_details: Vec<String> = Vec::new();

    for (_i, raw) in blocks.iter().enumerate() {
        let mut parsed_ok = false;

        // 先尝试直接解析
        if let Ok(data) = serde_json::from_str::<Value>(raw) {
            parsed_ok = true;
            if let Some(info) = extract_video_from_json(&data, photo_id) {
                return Ok(info);
            }
        }

        // 尝试 sanitize 后再解析
        let sanitized = sanitize_ks_json(raw);
        if sanitized != *raw {
            if let Ok(data) = serde_json::from_str::<Value>(&sanitized) {
                parsed_ok = true;
                if let Some(info) = extract_video_from_json(&data, photo_id) {
                    return Ok(info);
                }
            }
        }

        // 诊断：记录块的 key 信息
        if parsed_ok {
            if let Ok(data) = serde_json::from_str::<Value>(raw) {
                let keys: Vec<String> = data
                    .as_object()
                    .map(|o| o.keys().take(15).map(|k| k.to_string()).collect())
                    .unwrap_or_default();
                let total_keys = data.as_object().map(|o| o.len()).unwrap_or(0);
                block_details.push(format!(
                    "块#{}: len={}, total_keys={}, 前15个key={}",
                    _i,
                    raw.len(),
                    total_keys,
                    keys.join("|")
                ));
            } else {
                block_details.push(format!("块#{}: len={}, 解析失败", _i, raw.len()));
            }
        } else {
            block_details.push(format!("块#{}: len={}, JSON解析均失败", _i, raw.len()));
        }
    }

    Err(format!(
        "找到 {} 个 JSON 块，但均未解析出视频数据\n{}",
        blocks.len(),
        block_details.join("\n"),
    ))
}
