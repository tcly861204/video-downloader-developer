//! 抖音视频解析（移植自 demo，逻辑已验证）
//!
//! 解析链路：
//! 1. 从分享文本里提取链接 → 请求短链拿到最终 URL / 页面
//! 2. 提取视频 aweme_id
//! 3. 依次尝试多种方案拿视频数据：web API / ies API / 旧 API / PC 分享页 / 移动分享页 / share 路径
//! 4. 从 JSON 或 HTML 中抽取无水印播放地址
//!
//! 全部方案都失败时才返回聚合错误，保证单个方案被抖音风控时也能兜底。

use percent_encoding::percent_decode_str;
use regex::Regex;
use serde_json::Value;

use crate::http::{PC_UA, ProxyCfg};
use super::{PostItem, PostListResult, VideoInfo};

// ============================================================
// URL 检测
// ============================================================

pub fn can_handle(text: &str) -> bool {
    text.contains("douyin.com")
        || text.contains("iesdouyin.com")
        || text.contains("snssdk.com")
        || text.contains("v.douyin.")
}

// ============================================================
// ttwid 获取
// ============================================================

/// 注册 ttwid Cookie，多数 web 接口需要带上它才不会被拦截
pub(crate) async fn fetch_ttwid(proxy: &ProxyCfg) -> Result<String, String> {
    let mut builder = reqwest::Client::builder().user_agent(PC_UA);
    if let Some(p) = proxy.to_reqwest() {
        builder = builder.proxy(p);
    }
    let client = builder.build().map_err(|e| format!("ttwid 客户端: {e}"))?;

    let body = r#"{"region":"cn","aid":1768,"needFid":false,"service":"www.douyin.com","migrate_info":{"ticket":"","source":"node"},"cbUrlProtocol":"https","union":true}"#;
    let resp = client
        .post("https://ttwid.bytedance.com/ttwid/union/register/")
        .header("Content-Type", "application/json")
        .header("Referer", "https://www.douyin.com/")
        .header("User-Agent", PC_UA)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("ttwid 注册请求失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("ttwid 注册返回 HTTP {status}"));
    }

    for cookie_val in resp.headers().get_all(reqwest::header::SET_COOKIE) {
        let s = cookie_val.to_str().unwrap_or("");
        if s.starts_with("ttwid=") {
            let value = s
                .split(';')
                .next()
                .unwrap_or("")
                .strip_prefix("ttwid=")
                .unwrap_or("");
            if !value.is_empty() {
                return Ok(value.to_string());
            }
        }
    }
    Err("ttwid 注册成功但响应中未找到 ttwid Cookie".into())
}

// ============================================================
// URL / aweme_id 提取
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

fn extract_aweme_id(s: &str) -> Option<String> {
    let patterns = [
        r"/(?:video|note)/(\d{10,})",
        r"modal_id=(\d{10,})",
        r#""aweme_id"\s*:\s*"?(\d{10,})"#,
        r"item_ids=(\d{10,})",
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(s) {
                return Some(cap[1].to_string());
            }
        }
    }
    None
}

fn first_url(v: &Value) -> Option<String> {
    v.as_array()?
        .iter()
        .filter_map(|x| x.as_str())
        .find(|u| u.starts_with("http"))
        .map(|u| u.to_string())
}

// ============================================================
// JSON 解析核心
// ============================================================

/// 把一条 aweme 详情 JSON 归一化为 VideoInfo
fn detail_to_info(id: &str, detail: &Value) -> Result<VideoInfo, String> {
    let desc = detail["desc"]
        .as_str()
        .or_else(|| detail.get("aweme_detail").and_then(|d| d["desc"].as_str()))
        .unwrap_or("")
        .to_string();

    let title = detail["preview_title"]
        .as_str()
        .or_else(|| detail.get("aweme_detail").and_then(|d| d["preview_title"].as_str()))
        .or_else(|| detail["desc"].as_str())
        .or_else(|| detail.get("aweme_detail").and_then(|d| d["desc"].as_str()))
        .unwrap_or("douyin_video")
        .to_string();

    let author = detail["author"]["nickname"]
        .as_str()
        .or_else(|| {
            detail
                .get("aweme_detail")
                .and_then(|d| d["author"]["nickname"].as_str())
        })
        .unwrap_or("未知作者")
        .to_string();

    let duration_ms = detail["duration"]
        .as_u64()
        .or_else(|| detail["video"]["duration"].as_u64())
        .or_else(|| {
            detail
                .get("aweme_detail")
                .and_then(|d| d["video"]["duration"].as_u64())
        })
        .unwrap_or(0);

    let video_node = if detail.get("video").and_then(|v| v.get("play_addr")).is_some() {
        &detail["video"]
    } else if let Some(inner) = detail.get("aweme_detail") {
        &inner["video"]
    } else {
        &detail["video"]
    };

    let cover = first_url(&video_node["cover"]["url_list"])
        .or_else(|| first_url(&video_node["origin_cover"]["url_list"]))
        .or_else(|| first_url(&video_node["dynamic_cover"]["url_list"]))
        .unwrap_or_default();

    let play_url = first_url(&video_node["play_addr"]["url_list"])
        .or_else(|| first_url(&video_node["download_addr"]["url_list"]))
        .or_else(|| {
            video_node["bit_rate"]
                .as_array()
                .and_then(|arr| arr.last())
                .and_then(|b| first_url(&b["play_addr"]["url_list"]))
        })
        .or_else(|| {
            video_node["play_addr_h264"]["url_list"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|u| u.as_str().filter(|s| s.starts_with("http")))
                .map(|u| u.to_string())
        })
        .ok_or("没有解析到视频播放地址")?;

    let play_url = play_url.replace("playwm", "play");
    Ok(VideoInfo {
        aweme_id: id.to_string(),
        title,
        desc,
        author,
        duration_ms,
        cover,
        play_url,
        platform: "抖音".to_string(),
    })
}

/// 深度优先在整棵 JSON 里找第一条带播放地址的 aweme 详情
fn find_aweme_detail<'a>(v: &'a Value, id: &str) -> Option<&'a Value> {
    if let Some(obj) = v.as_object() {
        let has_play = obj
            .get("video")
            .and_then(|video| video.get("play_addr"))
            .and_then(|p| p.get("url_list"))
            .and_then(|u| u.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if has_play {
            match obj.get("aweme_id").and_then(|x| x.as_str()) {
                Some(aid) if aid != id => {}
                _ => return Some(v),
            }
        }
        for val in obj.values() {
            if let Some(found) = find_aweme_detail(val, id) {
                return Some(found);
            }
        }
    } else if let Some(arr) = v.as_array() {
        for item in arr {
            if let Some(found) = find_aweme_detail(item, id) {
                return Some(found);
            }
        }
    }
    None
}

// ============================================================
// HTML 诊断
// ============================================================

/// 生成页面诊断摘要，方便定位「被风控/换结构」时的问题
fn html_diag(html: &str) -> String {
    let len = html.len();
    let preview = html.chars().take(120).collect::<String>();
    let has_render = html.contains("RENDER_DATA");
    let has_router = html.contains("_ROUTER_DATA");
    let has_aweme = html.contains("aweme_id");
    let has_play = html.contains("play_addr");
    let has_next = html.contains("__next_f");
    let has_initial = html.contains("__INITIAL_STATE__");
    let has_slide = html.contains("captcha") || html.contains("verify") || html.contains("slide");
    format!(
        "len={len} render={has_render} router={has_router} aweme={has_aweme} play={has_play} nextjs={has_next} init_state={has_initial} captcha={has_slide} preview=`{preview}`"
    )
}

// ============================================================
// HTML 解析
// ============================================================

fn parse_from_html(id: &str, html: &str) -> Result<VideoInfo, String> {
    // 模式 1: RENDER_DATA
    if let Ok(re) = Regex::new(r#"<script[^>]*id="RENDER_DATA"[^>]*>([^<]+)</script>"#) {
        if let Some(cap) = re.captures(html) {
            let decoded = percent_decode_str(cap.get(1).unwrap().as_str())
                .decode_utf8_lossy()
                .to_string();
            if let Ok(json) = serde_json::from_str::<Value>(&decoded) {
                if let Some(detail) = find_aweme_detail(&json, id) {
                    return detail_to_info(id, detail);
                }
            }
        }
    }

    // 模式 2: _ROUTER_DATA
    if let Ok(re) = Regex::new(r"window\._ROUTER_DATA\s*=\s*(\{.+?\});?\s*</script>") {
        if let Some(cap) = re.captures(html) {
            let js_text = cap.get(1).unwrap().as_str();
            if let Ok(json) = serde_json::from_str::<Value>(js_text) {
                if let Some(detail) = find_aweme_detail(&json, id) {
                    return detail_to_info(id, detail);
                }
            }
        }
    }

    // 模式 3: __INITIAL_STATE__
    if let Ok(re) = Regex::new(r"window\.__INITIAL_STATE__\s*=\s*(\{.+?\});?\s*</script>") {
        if let Some(cap) = re.captures(html) {
            let js_text = cap.get(1).unwrap().as_str();
            if let Ok(json) = serde_json::from_str::<Value>(js_text) {
                if let Some(detail) = find_aweme_detail(&json, id) {
                    return detail_to_info(id, detail);
                }
            }
        }
    }

    // 模式 4: 直接正则提取视频 URL
    let re_video_url =
        Regex::new(r#"(?:play_addr|download_addr).*?"url_list"\s*:\s*\["(https?://[^"]*video/[^"]*)""#).unwrap();
    let mut fallback_play_url: Option<String> = None;
    if let Some(cap) = re_video_url.captures(html) {
        fallback_play_url = Some(cap.get(1).unwrap().as_str().replace("playwm", "play"));
    }
    if fallback_play_url.is_none() {
        let re_cdn =
            Regex::new(r#"https?://[^"'\s]*aweme\.snssdk\.com[^"'\s]*video[^"'\s]*"#).unwrap();
        if let Some(cap) = re_cdn.captures(html) {
            fallback_play_url = Some(cap.get(0).unwrap().as_str().replace("playwm", "play"));
        }
    }

    let re_title = Regex::new(r#""desc"\s*:\s*"([^"]*)""#).unwrap();
    let re_author = Regex::new(r#""nickname"\s*:\s*"([^"]*)""#).unwrap();

    if let Some(play_url) = fallback_play_url {
        let desc = re_title
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let title = if desc.is_empty() {
            "douyin_video".into()
        } else {
            desc.clone()
        };
        let author = re_author
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "未知作者".to_string());
        return Ok(VideoInfo {
            aweme_id: id.to_string(),
            title,
            desc,
            author,
            duration_ms: 0,
            cover: String::new(),
            play_url,
            platform: "抖音".to_string(),
        });
    }

    Err(format!("HTML 无视频数据（{}）", html_diag(html)))
}

// ============================================================
// API 解析方案
// ============================================================

async fn fetch_via_web_api(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let api = format!(
        "https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={id}&device_platform=webapp&aid=6383"
    );
    let resp = client
        .get(&api)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.douyin.com/")
        .header("Sec-Fetch-Dest", "empty")
        .header("Sec-Fetch-Mode", "cors")
        .header("Sec-Fetch-Site", "same-origin")
        .send()
        .await
        .map_err(|e| format!("web API 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("web API → HTTP {status}"));
    }

    let text = resp.text().await.unwrap_or_default();
    let body_len = text.len();
    if text.is_empty() {
        return Err("web API → 空响应(len=0)".into());
    }
    if text.trim_start().starts_with('<') {
        let preview = text.chars().take(60).collect::<String>();
        return Err(format!("web API → HTML拦截页(len={body_len}): {preview}"));
    }

    let json: Value = serde_json::from_str(&text)
        .map_err(|e| format!("web API → JSON解析失败(len={body_len}): {e}"))?;

    let code = json["status_code"].as_u64().unwrap_or(0);
    if code != 0 {
        let msg = json["status_msg"].as_str().unwrap_or("?");
        return Err(format!("web API → 业务错误[{code}]: {msg}"));
    }

    let detail = json
        .get("aweme_detail")
        .filter(|d| !d.is_null())
        .ok_or("web API → aweme_detail 为空")?;
    detail_to_info(id, detail)
}

async fn fetch_via_ies_api(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let api = format!(
        "https://www.iesdouyin.com/aweme/v1/web/aweme/detail/?aweme_id={id}&device_platform=webapp&aid=6383"
    );
    let resp = client
        .get(&api)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.iesdouyin.com/")
        .send()
        .await
        .map_err(|e| format!("ies API 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("ies API → HTTP {status}"));
    }

    let text = resp.text().await.unwrap_or_default();
    if text.is_empty() || text.trim_start().starts_with('<') {
        return Err(format!("ies API → 非JSON响应(len={})", text.len()));
    }

    let json: Value = serde_json::from_str(&text)
        .map_err(|e| format!("ies API → JSON解析失败: {e}"))?;
    let detail = json
        .get("aweme_detail")
        .filter(|d| !d.is_null())
        .ok_or("ies API → aweme_detail 为空")?;
    detail_to_info(id, detail)
}

async fn fetch_via_old_api(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let api = format!("https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={id}");
    let resp = client
        .get(&api)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.iesdouyin.com/")
        .send()
        .await
        .map_err(|e| format!("旧 API 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("旧 API → HTTP {status}"));
    }

    let text = resp.text().await.unwrap_or_default();
    if text.is_empty() {
        return Err("旧 API → 空响应".into());
    }
    let json: Value =
        serde_json::from_str(&text).map_err(|e| format!("旧 API → JSON解析失败: {e}"))?;

    let detail = json["item_list"]
        .as_array()
        .and_then(|a| a.first())
        .filter(|d| !d.is_null())
        .ok_or("旧 API → item_list 为空")?;
    detail_to_info(id, detail)
}

async fn fetch_via_pc_share(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let share_url = format!("https://www.douyin.com/video/{id}");
    let resp = client
        .get(&share_url)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.douyin.com/")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .header("Upgrade-Insecure-Requests", "1")
        .send()
        .await
        .map_err(|e| format!("PC分享页 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("PC分享页 → HTTP {status}"));
    }
    let html = resp.text().await.unwrap_or_default();
    parse_from_html(id, &html).map_err(|e| format!("PC分享页 → {e}"))
}

async fn fetch_via_mobile_share(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let share_url = format!("https://www.iesdouyin.com/share/video/{id}/");
    let resp = client
        .get(&share_url)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.iesdouyin.com/")
        .send()
        .await
        .map_err(|e| format!("移动分享页 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("移动分享页 → HTTP {status}"));
    }
    let html = resp.text().await.unwrap_or_default();
    parse_from_html(id, &html).map_err(|e| format!("移动分享页 → {e}"))
}

async fn fetch_via_share_path(
    client: &reqwest::Client,
    id: &str,
    ttwid: &str,
) -> Result<VideoInfo, String> {
    let share_url = format!("https://www.douyin.com/share/video/{id}");
    let resp = client
        .get(&share_url)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.douyin.com/")
        .send()
        .await
        .map_err(|e| format!("share/video 网络: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("share/video → HTTP {status}"));
    }
    let html = resp.text().await.unwrap_or_default();
    parse_from_html(id, &html).map_err(|e| format!("share/video → {e}"))
}

// ============================================================
// 对外入口
// ============================================================

/// 解析分享文本，返回视频信息；内部自动尝试全部方案。
pub async fn parse(client: &reqwest::Client, proxy: &ProxyCfg, text: &str) -> Result<VideoInfo, String> {
    let ttwid = fetch_ttwid(proxy).await?;
    let url = extract_url(text).ok_or("没有找到链接，请粘贴包含抖音链接的分享文本")?;

    let resp = client
        .get(&url)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .header("Upgrade-Insecure-Requests", "1")
        .send()
        .await
        .map_err(|e| format!("请求分享链接失败: {e}"))?;

    let final_url = resp.url().to_string();
    let body = resp.text().await.unwrap_or_default();

    let id = extract_aweme_id(&final_url)
        .or_else(|| extract_aweme_id(&body))
        .ok_or("无法从链接中识别视频 ID，请确认链接完整")?;

    let mut errors: Vec<String> = Vec::new();

    // 依次尝试各方案，任一成功即返回
    macro_rules! try_parse {
        ($fetcher:expr, $name:expr) => {
            match $fetcher.await {
                Ok(info) => return Ok(info),
                Err(e) => {
                    errors.push(format!("[{}] {}", $name, e));
                }
            }
        };
    }

    try_parse!(fetch_via_web_api(client, &id, &ttwid), "web API");
    try_parse!(fetch_via_ies_api(client, &id, &ttwid), "ies API");
    try_parse!(fetch_via_old_api(client, &id, &ttwid), "旧 API");
    try_parse!(fetch_via_pc_share(client, &id, &ttwid), "PC 分享页");
    try_parse!(fetch_via_mobile_share(client, &id, &ttwid), "移动分享页");
    try_parse!(fetch_via_share_path(client, &id, &ttwid), "share/video");

    let detail = errors.join("\n  ");
    Err(format!(
        "抖音：所有解析方案均失败（共 6 种）。\n视频 ID: {id}\n详细错误：\n  {}",
        detail
    ))
}

// ============================================================
// 主页作品列表
// ============================================================

/// 拉取用户主页作品列表（分页，每页 20 条）。
///
/// `a_bogus` 由前端用 abogus.js 生成，query 参数顺序必须与前端签名串一致，
/// 否则风控签名校验不通过。`max_cursor` 为上一页返回的分页游标（首页传 None）。
pub async fn fetch_user_posts(
    client: &reqwest::Client,
    proxy: &ProxyCfg,
    sec_user_id: &str,
    a_bogus: &str,
    max_cursor: Option<u64>,
) -> Result<PostListResult, String> {
    let ttwid = fetch_ttwid(proxy).await?;
    let cursor = max_cursor.unwrap_or(0).to_string();

    let resp = client
        .get("https://www.douyin.com/aweme/v1/web/aweme/post/")
        .query(&[
            ("device_platform", "webapp"),
            ("aid", "6383"),
            ("channel", "channel_pc_web"),
            ("sec_user_id", sec_user_id),
            ("max_cursor", cursor.as_str()),
            ("count", "20"),
            ("a_bogus", a_bogus),
        ])
        .header("Cookie", format!("ttwid={ttwid}"))
        .header(
            "Referer",
            format!("https://www.douyin.com/user/{sec_user_id}"),
        )
        .send()
        .await
        .map_err(|e| format!("主页 API 请求失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("主页 API 返回 HTTP {status}"));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析主页 JSON 失败: {e}"))?;

    let aweme_list = data
        .get("aweme_list")
        .and_then(|v| v.as_array())
        .ok_or("未找到 aweme_list")?;

    let items: Vec<PostItem> = aweme_list
        .iter()
        .filter_map(|a| {
            let aweme_id = a.get("aweme_id")?.as_str()?.to_string();
            let desc = a
                .get("desc")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let author = a
                .get("author")
                .and_then(|a| a.get("nickname"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let duration_ms = a.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
            let cover = a
                .get("video")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.get("url_list"))
                .and_then(|v| v.as_array())
                .and_then(|v| v.first())
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let create_time = a.get("create_time").and_then(|v| v.as_u64()).unwrap_or(0);
            let stats = a.get("statistics").unwrap_or(&Value::Null);
            let digg_count = stats.get("digg_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let comment_count = stats
                .get("comment_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let share_count = stats.get("share_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let collect_count = stats
                .get("collect_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let play_count = stats.get("play_count").and_then(|v| v.as_u64()).unwrap_or(0);

            Some(PostItem {
                aweme_id,
                desc,
                author,
                duration_ms,
                cover,
                create_time,
                digg_count,
                comment_count,
                share_count,
                collect_count,
                play_count,
            })
        })
        .collect();

    let has_more = data.get("has_more").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
    let max_cursor = data.get("max_cursor").and_then(|v| v.as_u64()).unwrap_or(0);

    Ok(PostListResult {
        items,
        has_more,
        max_cursor,
    })
}
