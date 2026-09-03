//! 微博视频解析
//!
//! 目标：
//! 1. 支持分享文本、t.cn 短链、`m.weibo.cn/status|detail/...`、
//!    `weibo.com/<uid>/<bid>`、`video.weibo.com/show?fid=...`、`weibo.com/tv/show/...`
//! 2. 走微博访客态拿到页面 / TV 组件接口数据，不要求用户登录
//! 3. 尽量返回多清晰度档位；最差也要兜底到单个 mp4 / m3u8 地址

use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use regex::Regex;
use serde_json::Value;
use url::form_urlencoded;

use crate::http::{MOBILE_UA, PC_UA};

use super::{QualityOption, VideoInfo};

#[derive(Default, Clone)]
struct WeiboMeta {
    fid: Option<String>,
    title: String,
    desc: String,
    author: String,
    cover: String,
    duration_ms: u64,
    play_url: String,
    quality_options: Vec<QualityOption>,
}

pub fn can_handle(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("weibo.com")
        || lower.contains("weibo.cn")
        || lower.contains("video.weibo.com")
        || lower.contains("t.cn/")
        || extract_fid(text).is_some()
}

fn extract_candidate_url(text: &str) -> Option<String> {
    let re = Regex::new(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+").ok()?;
    let mut best: Option<(i32, String)> = None;
    for m in re.find_iter(text) {
        let url = m
            .as_str()
            .trim_end_matches(|c| matches!(c, '.' | ',' | ')' | ';' | '!' | '?'))
            .to_string();
        let score = url_score(&url);
        if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            best = Some((score, url));
        }
    }
    best.map(|(_, url)| url)
}

fn url_score(url: &str) -> i32 {
    let lower = url.to_ascii_lowercase();
    if lower.contains("video.weibo.com/show?fid=") {
        100
    } else if lower.contains("weibo.com/tv/show/") {
        95
    } else if lower.contains("m.weibo.cn/status/") || lower.contains("m.weibo.cn/detail/") {
        90
    } else if lower.contains("weibo.com/") && !lower.contains("/u/") && !lower.contains("/n/") {
        80
    } else if lower.contains("t.cn/") {
        70
    } else {
        10
    }
}

fn extract_fid(text: &str) -> Option<String> {
    let patterns = [
        r#"(?i)[?&]fid=(\d+:\d+)"#,
        r#"(?i)/tv/show/(\d+:\d+)"#,
        r#"(?i)\b(1034:\d{8,})\b"#,
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(text) {
                return Some(cap[1].to_string());
            }
        }
    }
    None
}

fn clean_html(text: &str) -> String {
    let stripped = Regex::new(r"<[^>]+>")
        .ok()
        .map(|re| re.replace_all(text, " ").to_string())
        .unwrap_or_else(|| text.to_string());
    decode_entities(&stripped)
        .replace('\u{a0}', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#x2F;", "/")
        .replace("&#47;", "/")
        .replace("&nbsp;", " ")
}

fn strip_jsonp(text: &str) -> Result<Value, String> {
    let start = text.find('{').ok_or("微博返回中未找到 JSON 起始位置")?;
    let end = text.rfind('}').ok_or("微博返回中未找到 JSON 结束位置")?;
    serde_json::from_str::<Value>(&text[start..=end]).map_err(|e| format!("微博 JSON 解析失败: {e}"))
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

async fn ensure_visitor(client: &reqwest::Client, target_url: &str) -> Result<(), String> {
    match ensure_visitor_legacy(client, target_url).await {
        Ok(()) => Ok(()),
        Err(_) => ensure_visitor_v2(client, target_url).await,
    }
}

async fn ensure_visitor_legacy(client: &reqwest::Client, target_url: &str) -> Result<(), String> {
    let referer = format!(
        "https://passport.weibo.com/visitor/visitor?entry=miniblog&a=enter&url={}&domain=weibo.com",
        utf8_percent_encode(target_url, NON_ALPHANUMERIC)
    );
    let resp = client
        .post("https://passport.weibo.com/visitor/genvisitor")
        .header("User-Agent", PC_UA)
        .header("Referer", referer)
        .form(&[
            ("cb", "gen_callback"),
            (
                "fp",
                r#"{"os":"2","browser":"Gecko57,0,0,0","fonts":"undefined","screenInfo":"1440*900*24","plugins":""}"#,
            ),
        ])
        .send()
        .await
        .map_err(|e| format!("微博访客态初始化失败: {e}"))?;
    let text = resp.text().await.unwrap_or_default();
    let json = strip_jsonp(&text)?;
    let tid = json["data"]["tid"]
        .as_str()
        .ok_or("微博访客态未返回 tid")?;
    let confidence = json["data"]["confidence"].as_u64().unwrap_or(100);
    let _ = client
        .get("https://passport.weibo.com/visitor/visitor")
        .header("User-Agent", PC_UA)
        .query(&[
            ("a", "incarnate"),
            ("t", tid),
            ("w", "2"),
            ("c", &format!("{confidence:03}")),
            ("cb", "cross_domain"),
            ("from", "weibo"),
            ("_rand", "0.5"),
        ])
        .send()
        .await
        .map_err(|e| format!("微博访客态激活失败: {e}"))?;
    Ok(())
}

async fn ensure_visitor_v2(client: &reqwest::Client, target_url: &str) -> Result<(), String> {
    let rid = now_millis().to_string();
    let req_id = format!("fc{}", now_millis());
    let resp = client
        .post("https://passport.weibo.com/visitor/genvisitor2")
        .header("User-Agent", PC_UA)
        .form(&[
            ("cb", "visitor_gray_callback"),
            ("ver", "20250916"),
            ("request_id", req_id.as_str()),
            ("tid", ""),
            ("from", "weibo"),
            ("webdriver", "false"),
            ("rid", rid.as_str()),
            ("return_url", target_url),
        ])
        .send()
        .await
        .map_err(|e| format!("微博新版访客态初始化失败: {e}"))?;
    let text = resp.text().await.unwrap_or_default();
    let json = strip_jsonp(&text)?;
    let tid = json["data"]["tid"]
        .as_str()
        .ok_or("微博新版访客态未返回 tid")?;
    let _ = client
        .get("https://passport.weibo.com/visitor/visitor")
        .header("User-Agent", PC_UA)
        .query(&[
            ("a", "incarnate"),
            ("t", tid),
            ("w", "2"),
            ("c", "100"),
            ("cb", "cross_domain"),
            ("from", "weibo"),
            ("_rand", "0.5"),
        ])
        .send()
        .await
        .map_err(|e| format!("微博新版访客态激活失败: {e}"))?;
    Ok(())
}

async fn resolve_target_url(client: &reqwest::Client, text: &str) -> Result<String, String> {
    if let Some(fid) = extract_fid(text) {
        return Ok(format!("https://video.weibo.com/show?fid={fid}"));
    }
    let url = extract_candidate_url(text)
        .ok_or("没有找到微博链接，请粘贴包含 weibo.com / m.weibo.cn / t.cn 的分享文本")?;
    if url.contains("t.cn/") {
        let resp = client
            .get(&url)
            .header("User-Agent", MOBILE_UA)
            .header("Referer", "https://m.weibo.cn/")
            .send()
            .await
            .map_err(|e| format!("微博短链请求失败: {e}"))?;
        Ok(resp.url().to_string())
    } else {
        Ok(url)
    }
}

fn page_referer(url: &str) -> &'static str {
    if url.contains("m.weibo.cn") || url.contains("weibo.cn") {
        "https://m.weibo.cn/"
    } else {
        "https://weibo.com/"
    }
}

async fn fetch_page_html(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let _ = ensure_visitor(client, url).await;
    let ua = if url.contains("m.weibo.cn") || url.contains("weibo.cn") {
        MOBILE_UA
    } else {
        PC_UA
    };
    let resp = client
        .get(url)
        .header("User-Agent", ua)
        .header("Referer", page_referer(url))
        .send()
        .await
        .map_err(|e| format!("微博页面请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("微博页面返回 HTTP {}", resp.status()));
    }
    let html = resp.text().await.unwrap_or_default();
    if html.contains("Sina Visitor System") {
        return Err("微博页面仍然返回访客校验页，请稍后重试".into());
    }
    Ok(html)
}

fn meta_content(html: &str, key: &str) -> Option<String> {
    let patterns = [
        format!(r#"(?is)<meta[^>]+property=["']{}["'][^>]+content=["']([^"']+)["']"#, regex::escape(key)),
        format!(r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']{}["']"#, regex::escape(key)),
        format!(r#"(?is)<meta[^>]+name=["']{}["'][^>]+content=["']([^"']+)["']"#, regex::escape(key)),
        format!(r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']{}["']"#, regex::escape(key)),
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(&p) {
            if let Some(cap) = re.captures(html) {
                return Some(decode_entities(&cap[1]));
            }
        }
    }
    None
}

fn title_from_html(html: &str) -> String {
    if let Some(t) = meta_content(html, "og:title") {
        let t = clean_html(&t);
        if !t.is_empty() {
            return t;
        }
    }
    if let Ok(re) = Regex::new(r"(?is)<title>(.*?)</title>") {
        if let Some(cap) = re.captures(html) {
            let t = clean_html(&cap[1]).replace(" - 微博", "");
            if !t.is_empty() {
                return t;
            }
        }
    }
    String::new()
}

fn extract_render_data(html: &str) -> Option<Value> {
    let re = Regex::new(r#"(?s)var\s+\$render_data\s*=\s*\[({.*?})\]\[0\]\s*\|\|\s*\{\};"#).ok()?;
    let cap = re.captures(html)?;
    serde_json::from_str::<Value>(&cap[1]).ok()
}

fn media_duration_ms(v: &Value) -> u64 {
    let raw = v["duration"]
        .as_u64()
        .or_else(|| v["duration_ms"].as_u64())
        .or_else(|| v["time"].as_u64())
        .unwrap_or(0);
    if raw > 10_000 { raw } else { raw * 1000 }
}

fn looks_video_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://"))
        && (lower.contains(".mp4")
            || lower.contains("m3u8")
            || lower.contains("weibocdn.com")
            || lower.contains("video.weibo.com"))
        && !lower.contains(".jpg")
        && !lower.contains(".jpeg")
        && !lower.contains(".png")
        && !lower.contains(".webp")
        && !lower.contains(".gif")
}

fn parse_quality_num(text: &str) -> u64 {
    let lower = text.to_ascii_lowercase();
    for n in [2160_u64, 1440, 1080, 720, 480, 360, 240] {
        if lower.contains(&n.to_string()) {
            return n;
        }
    }
    if lower.contains("4k") {
        return 2160;
    }
    if lower.contains("2k") {
        return 1440;
    }
    if lower.contains("stream_hd") || lower.contains("mp4_hd") || lower.contains(" hd") {
        return 720;
    }
    if lower.contains("stream_sd") || lower.contains("mp4_sd") || lower.contains(" sd") {
        return 480;
    }
    if lower.contains("stream_ld") || lower.contains("mp4_ld") || lower.contains(" ld") {
        return 360;
    }
    0
}

fn label_from_hint(hint: &str, url: &str) -> String {
    let q = parse_quality_num(hint).max(parse_quality_num(url));
    if q > 0 {
        return format!("{q}P");
    }
    let lower = format!("{} {}", hint.to_ascii_lowercase(), url.to_ascii_lowercase());
    if lower.contains("hd") {
        return "HD".into();
    }
    if lower.contains("sd") {
        return "SD".into();
    }
    if lower.contains("ld") {
        return "LD".into();
    }
    "默认".into()
}

fn sort_quality_options(options: &mut [QualityOption]) {
    options.sort_by(|a, b| {
        parse_quality_num(&b.label)
            .cmp(&parse_quality_num(&a.label))
            .then_with(|| b.label.cmp(&a.label))
    });
}

fn collect_media_urls(value: &Value, path: &mut Vec<String>, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                path.push(k.clone());
                collect_media_urls(v, path, out);
                path.pop();
            }
        }
        Value::Array(arr) => {
            for v in arr {
                collect_media_urls(v, path, out);
            }
        }
        Value::String(s) => {
            if looks_video_url(s) {
                out.push((path.join("."), s.to_string()));
            }
        }
        _ => {}
    }
}

fn quality_options_from_value(value: &Value) -> Vec<QualityOption> {
    let mut collected = Vec::new();
    collect_media_urls(value, &mut Vec::new(), &mut collected);
    dedupe_quality_options(collected)
}

fn dedupe_quality_options(items: Vec<(String, String)>) -> Vec<QualityOption> {
    let mut seen_url = HashSet::new();
    let mut out = Vec::new();
    for (hint, url) in items {
        if !seen_url.insert(url.clone()) {
            continue;
        }
        out.push(QualityOption {
            label: label_from_hint(&hint, &url),
            play_url: url,
        });
    }
    sort_quality_options(&mut out);
    out
}

fn best_play_url(options: &[QualityOption]) -> String {
    options
        .first()
        .map(|o| o.play_url.clone())
        .unwrap_or_default()
}

fn extract_video_sources(html: &str) -> Vec<QualityOption> {
    let mut out = Vec::new();
    let mut raw_attr = None;
    let patterns = [
        r#"video-sources=\\?"([^"]+)""#,
        r#"video-sources=&quot;([^"]+)&quot;"#,
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(p) {
            if let Some(cap) = re.captures(html) {
                raw_attr = Some(cap[1].to_string());
                break;
            }
        }
    }
    if let Some(raw) = raw_attr {
        let decoded = decode_entities(&raw).replace(r"\u0026", "&").replace(r"\/", "/");
        for (k, v) in form_urlencoded::parse(decoded.as_bytes()) {
            let url = v.into_owned();
            if looks_video_url(&url) {
                out.push(QualityOption {
                    label: label_from_hint(k.as_ref(), &url),
                    play_url: url,
                });
            }
        }
    }
    if out.is_empty() {
        if let Ok(re) = Regex::new(r#"https?://[^"'\s<>]+?(?:\.mp4|\.m3u8)[^"'\s<>]*"#) {
            let mut seen = HashSet::new();
            for m in re.find_iter(html) {
                let url = decode_entities(m.as_str());
                if seen.insert(url.clone()) {
                    out.push(QualityOption {
                        label: label_from_hint("", &url),
                        play_url: url,
                    });
                }
            }
        }
    }
    sort_quality_options(&mut out);
    out
}

fn extract_meta_from_render_data(v: &Value) -> WeiboMeta {
    let mut meta = WeiboMeta::default();
    let status = if v["status"]["page_info"].is_object() {
        &v["status"]
    } else if v["status"]["retweeted_status"]["page_info"].is_object() {
        &v["status"]["retweeted_status"]
    } else {
        &v["status"]
    };
    meta.title = status["status_title"]
        .as_str()
        .map(clean_html)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| clean_html(status["text"].as_str().unwrap_or("")));
    meta.desc = clean_html(status["text"].as_str().unwrap_or(""));
    meta.author = status["user"]["screen_name"].as_str().unwrap_or("").to_string();
    meta.cover = status["page_info"]["page_pic"]["url"]
        .as_str()
        .or_else(|| status["page_info"]["media_info"]["poster"].as_str())
        .unwrap_or("")
        .to_string();
    meta.duration_ms = media_duration_ms(&status["page_info"]["media_info"]);
    meta.fid = status["page_info"]["page_url"]
        .as_str()
        .and_then(extract_fid)
        .or_else(|| extract_fid(&status["page_info"].to_string()));
    meta.quality_options = quality_options_from_value(&status["page_info"]["media_info"]);
    meta.play_url = best_play_url(&meta.quality_options);
    meta
}

fn extract_meta_from_html(html: &str, url: &str) -> WeiboMeta {
    let mut meta = WeiboMeta::default();
    meta.fid = extract_fid(html).or_else(|| extract_fid(url));
    meta.title = title_from_html(html);
    meta.author = meta_content(html, "og:nick-name").unwrap_or_default();
    meta.cover = meta_content(html, "og:image").unwrap_or_default();
    meta.quality_options = extract_video_sources(html);
    meta.play_url = best_play_url(&meta.quality_options);
    meta
}

fn merge_meta(mut base: WeiboMeta, fallback: &WeiboMeta) -> WeiboMeta {
    if base.fid.is_none() {
        base.fid = fallback.fid.clone();
    }
    if base.title.is_empty() {
        base.title = fallback.title.clone();
    }
    if base.desc.is_empty() {
        base.desc = fallback.desc.clone();
    }
    if base.author.is_empty() {
        base.author = fallback.author.clone();
    }
    if base.cover.is_empty() {
        base.cover = fallback.cover.clone();
    }
    if base.duration_ms == 0 {
        base.duration_ms = fallback.duration_ms;
    }
    if base.play_url.is_empty() {
        base.play_url = fallback.play_url.clone();
    }
    if base.quality_options.is_empty() {
        base.quality_options = fallback.quality_options.clone();
    }
    base
}

async fn fetch_tv_playinfo(
    client: &reqwest::Client,
    fid: &str,
    page_url: &str,
) -> Result<WeiboMeta, String> {
    let _ = ensure_visitor(client, page_url).await;
    let resp = client
        .post(format!("https://weibo.com/tv/api/component?page=/tv/show/{fid}"))
        .header("User-Agent", PC_UA)
        .header("Referer", format!("https://weibo.com/tv/show/{fid}?mid={}", fid.split(':').nth(1).unwrap_or(fid)))
        .form(&[(
            "data",
            format!(r#"{{"Component_Play_Playinfo":{{"oid":"{fid}"}}}}"#),
        )])
        .send()
        .await
        .map_err(|e| format!("微博 TV 播放信息请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("微博 TV 播放信息返回 HTTP {}", resp.status()));
    }
    let v = resp
        .json::<Value>()
        .await
        .map_err(|e| format!("微博 TV 播放信息 JSON 解析失败: {e}"))?;
    let info = &v["data"]["Component_Play_Playinfo"];
    if !info.is_object() {
        return Err("微博 TV 播放信息缺失".into());
    }

    let mut meta = WeiboMeta {
        fid: Some(fid.to_string()),
        title: clean_html(info["text"].as_str().unwrap_or("")),
        desc: clean_html(info["text"].as_str().unwrap_or("")),
        author: info["nickname"].as_str().unwrap_or("").to_string(),
        cover: info["page_pic"]
            .as_str()
            .or_else(|| info["cover_image"].as_str())
            .or_else(|| info["poster"].as_str())
            .unwrap_or("")
            .to_string(),
        duration_ms: media_duration_ms(info),
        play_url: String::new(),
        quality_options: Vec::new(),
    };

    if let Some(urls) = info["urls"].as_object() {
        let mut items = Vec::new();
        for (k, v) in urls {
            if let Some(url) = v.as_str() {
                if looks_video_url(url) {
                    items.push((k.clone(), url.to_string()));
                }
            }
        }
        meta.quality_options = dedupe_quality_options(items);
        meta.play_url = best_play_url(&meta.quality_options);
    }
    if meta.play_url.is_empty() {
        meta.quality_options = quality_options_from_value(info);
        meta.play_url = best_play_url(&meta.quality_options);
    }
    if meta.play_url.is_empty() {
        return Err("微博 TV 播放信息里未找到可用视频地址".into());
    }
    Ok(meta)
}

fn into_video_info(meta: WeiboMeta, raw_id: &str) -> VideoInfo {
    let aweme_id = meta
        .fid
        .as_deref()
        .and_then(|fid| fid.split(':').nth(1))
        .unwrap_or(raw_id)
        .to_string();
    VideoInfo {
        aweme_id,
        title: if meta.title.is_empty() {
            "weibo_video".to_string()
        } else {
            meta.title
        },
        desc: meta.desc,
        author: meta.author,
        duration_ms: meta.duration_ms,
        cover: meta.cover,
        play_url: meta.play_url,
        platform: "微博".to_string(),
        quality_options: meta.quality_options,
    }
}

pub async fn parse(client: &reqwest::Client, text: &str) -> Result<VideoInfo, String> {
    let target = resolve_target_url(client, text).await?;
    let direct_fid = extract_fid(&target);

    let html = fetch_page_html(client, &target).await.ok();
    let page_meta = html
        .as_ref()
        .map(|h| {
            let render = extract_render_data(h)
                .map(|v| extract_meta_from_render_data(&v))
                .unwrap_or_default();
            let html_meta = extract_meta_from_html(h, &target);
            merge_meta(render, &html_meta)
        })
        .unwrap_or_else(|| {
            let mut meta = WeiboMeta::default();
            meta.fid = direct_fid.clone();
            meta
        });

    let fid = direct_fid
        .clone()
        .or_else(|| page_meta.fid.clone())
        .ok_or("没有识别出微博视频 ID，请确认链接里包含视频内容")?;

    if let Ok(tv_meta) = fetch_tv_playinfo(client, &fid, &target).await {
        let meta = merge_meta(tv_meta, &page_meta);
        return Ok(into_video_info(meta, &fid));
    }

    if !page_meta.play_url.is_empty() {
        let meta = merge_meta(page_meta, &WeiboMeta::default());
        return Ok(into_video_info(meta, &fid));
    }

    Err("微博解析失败：未找到可用的视频播放地址".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_fid_from_common_urls() {
        assert_eq!(
            extract_fid("https://video.weibo.com/show?fid=1034:5124992397148206"),
            Some("1034:5124992397148206".into())
        );
        assert_eq!(
            extract_fid("https://weibo.com/tv/show/1034:5124992397148206?mid=5124994877361038"),
            Some("1034:5124992397148206".into())
        );
    }

    #[test]
    fn strips_jsonp_wrapper() {
        let v = strip_jsonp(r#"window.gen_callback && gen_callback({"retcode":20000000,"data":{"tid":"abc"}});"#)
            .expect("jsonp 应可解析");
        assert_eq!(v["data"]["tid"].as_str(), Some("abc"));
    }

    #[test]
    fn parses_video_sources_attribute() {
        let html = r#"<div video-sources=\"480=https%3A%2F%2Ff.video.weibocdn.com%2Fa.mp4%3Flabel%3Dmp4_480p&720=https%3A%2F%2Ff.video.weibocdn.com%2Fb.mp4%3Flabel%3Dmp4_720p\"></div>"#;
        let opts = extract_video_sources(html);
        let labels: Vec<&str> = opts.iter().map(|o| o.label.as_str()).collect();
        assert_eq!(labels, vec!["720P", "480P"]);
    }

    #[test]
    fn collects_quality_options_from_media_info() {
        let v: Value = serde_json::from_str(
            r#"{
                "stream_url":"https://f.video.weibocdn.com/low.mp4?label=mp4_480p",
                "stream_url_hd":"https://f.video.weibocdn.com/high.mp4?label=mp4_720p",
                "playback_list":[
                    {"play_info":{"label":"1080p","url":"https://f.video.weibocdn.com/top.mp4?label=mp4_1080p"}}
                ]
            }"#,
        )
        .unwrap();
        let opts = quality_options_from_value(&v);
        let labels: Vec<&str> = opts.iter().map(|o| o.label.as_str()).collect();
        assert_eq!(labels, vec!["1080P", "720P", "480P"]);
    }
}
