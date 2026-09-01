//! 下载核心
//!
//! 平台无关的视频下载实现：
//! - 多候选地址兜底（无水印域名替换）
//! - 流式写盘 + 进度事件（`download-progress`）
//! - 断点续传：下载到 `.part` 临时文件，续传时带 `Range` 头追加写
//! - 暂停：通过 `abort` 标志中断循环，保留 `.part`
//!
//! 事件约定（与前端 `src/api/video.ts` 对齐，camelCase）：
//! - `download-progress` { taskId, downloaded, total }
//! - `download-done`     { taskId, path }
//! - `download-error`    { taskId, error }

use futures_util::StreamExt;
use regex::Regex;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;
use url::Url;

use crate::http::{MOBILE_UA, PC_UA};

/// 文件名前缀规则，与设置页 `filename_rule` 一致
#[derive(Debug, Clone, Copy)]
pub enum FilenameRule {
    Title,
    TitlePlatform,
    TitleQuality,
}

impl FilenameRule {
    /// 从配置字符串解析；未知值回退为纯标题
    pub fn from_str(s: &str) -> Self {
        match s {
            "title-platform" => Self::TitlePlatform,
            "title-quality" => Self::TitleQuality,
            _ => Self::Title,
        }
    }
}

/// 进度事件负载
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub task_id: String,
    pub downloaded: u64,
    pub total: u64,
}

/// 完成事件负载
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDone {
    pub task_id: String,
    pub path: String,
}

/// 失败事件负载
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadError {
    pub task_id: String,
    pub error: String,
}

/// 清洗文件名中的非法字符并截断，避免写盘失败
pub fn sanitize_filename(name: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|\r\n]+"#).unwrap();
    let cleaned = re.replace_all(name, " ");
    let trimmed = cleaned.trim();
    let truncated: String = trimmed.chars().take(60).collect();
    if truncated.is_empty() {
        "video".to_string()
    } else {
        truncated
    }
}

/// 按文件名规则拼出文件「前缀」（不含 aweme_id）
fn build_prefix(title: &str, platform: &str, quality: &str, rule: FilenameRule) -> String {
    let base = sanitize_filename(title);
    match rule {
        FilenameRule::Title => base,
        FilenameRule::TitlePlatform => format!("{base}_{platform}"),
        FilenameRule::TitleQuality => format!("{base}_{quality}"),
    }
}

/// 去重：目录里已存在以 `_{aweme_id}.mp4` / `_{aweme_id}.ts` 结尾的文件即视为该视频已下载。
/// 用 aweme_id 后缀而非完整文件名匹配，兼容标题 / 命名规则 / 清晰度变化导致文件名不同的情况。
fn find_existing_video(dir: &Path, aweme_id: &str) -> Option<String> {
    let suffixes = [format!("_{aweme_id}.mp4"), format!("_{aweme_id}.ts")];
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if suffixes.iter().any(|s| name.ends_with(s.as_str())) {
            return Some(entry.path().to_string_lossy().to_string());
        }
    }
    None
}

/// 已存在同名文件时追加 `(n)` 后缀，返回不冲突的路径
fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}{ext}"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{stem}({n}){ext}"));
        n += 1;
    }
    path
}

/// 按播放地址的 CDN 域名推断 Referer（各平台 CDN 校验来源域名，失败会拒绝返回内容）
fn referer_for(url: &str) -> &'static str {
    if url.contains("bilibili") || url.contains("bilivideo") || url.contains("hdslb") {
        "https://www.bilibili.com/"
    } else if url.contains("kuaishou")
        || url.contains("yximgs")
        || url.contains("kwimgs")
        || url.contains("gifshow")
        || url.contains("chenzhongtech")
    {
        "https://www.kuaishou.com/"
    } else if url.contains("haokan") || url.contains("bdstatic") {
        "https://haokan.baidu.com/"
    } else if url.contains("pornhub") || url.contains("phncdn") {
        "https://www.pornhub.com/"
    } else {
        "https://www.douyin.com/"
    }
}

/// 尝试下载一个候选地址，返回响应体（保留 Range/UA 等细节调用方控制）
async fn try_download(
    client: &reqwest::Client,
    url: &str,
    use_pc_ua: bool,
    resume_from: u64,
) -> Result<reqwest::Response, String> {
    let ua = if use_pc_ua { PC_UA } else { MOBILE_UA };
    let mut req = client
        .get(url)
        .header("User-Agent", ua)
        .header("Referer", referer_for(url))
        .header("Accept", "video/mp4,video/*,*/*")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .header("Sec-Fetch-Dest", "video")
        .header("Sec-Fetch-Mode", "no-cors")
        .header("Sec-Fetch-Site", "cross-site");

    // 断点续传：从已有 `.part` 长度发起 Range 请求
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={resume_from}-"));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!("HTTP {status}"));
    }
    Ok(resp)
}

/// 核心下载：把 play_url 保存为本地 mp4，全程发进度事件。
///
/// 不返回结果，所有事件（进度 / 完成 / 失败）通过 `app` 发出；
/// 调用方只需负责在任务结束后清理 abort 标志。
pub async fn run(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    task_id: &str,
    play_url: &str,
    title: &str,
    aweme_id: &str,
    save_dir: &str,
    rule: FilenameRule,
    platform: &str,
    quality: &str,
    resume: bool,
    notify_done: bool,
    abort: Arc<AtomicBool>,
) {
    // HLS 流（m3u8）走分段下载，不走单文件直链逻辑
    if is_hls_url(play_url) {
        run_hls(
            app, client, task_id, play_url, title, aweme_id, save_dir, rule, platform, quality,
            notify_done, abort,
        )
        .await;
        return;
    }

    // 事件统一用 task_id 标识任务，前端按它路由到对应任务行
    let emit_progress = |downloaded: u64, total: u64| {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                task_id: task_id.to_string(),
                downloaded,
                total,
            },
        );
    };

    // ---- 目标文件与临时文件路径 ----
    let dir = PathBuf::from(save_dir);
    if let Err(e) = std::fs::create_dir_all(&dir) {
        let msg = format!("创建保存目录失败: {e}");
        let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
        return;
    }

    let prefix = build_prefix(title, platform, quality, rule);
    let stem = format!("{prefix}_{aweme_id}");
    // 去重：已存在该视频的文件则直接视为完成，跳过下载
    if let Some(existing) = find_existing_video(&dir, aweme_id) {
        let _ = app.emit(
            "download-done",
            DownloadDone {
                task_id: task_id.to_string(),
                path: existing,
            },
        );
        return;
    }

    let part_path = dir.join(format!("{stem}.mp4.part"));
    let mut part_len: u64 = 0;
    if resume {
        part_len = std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
    } else if part_path.exists() {
        // 未开启续传：丢弃旧的半截文件，重新下载
        let _ = std::fs::remove_file(&part_path);
    }

    // ---- 候选地址兜底（无水印域名替换） ----
    let mut candidates: Vec<(String, bool)> = Vec::new();
    candidates.push((play_url.to_string(), false));
    candidates.push((play_url.to_string(), true));

    let alt_url = play_url
        .replace("playwm", "play")
        .replace("aweme.snssdk.com", "www.douyin.com")
        .replace("api.amemv.com", "www.douyin.com");
    if alt_url != play_url {
        candidates.push((alt_url.clone(), true));
    }

    let ies_url = play_url
        .replace("aweme.snssdk.com", "www.iesdouyin.com")
        .replace("api.amemv.com", "www.iesdouyin.com");
    if ies_url != play_url && ies_url != alt_url {
        candidates.push((ies_url, true));
    }

    let mut last_err = String::new();
    let resp = 'outer: {
        for (url, use_pc_ua) in &candidates {
            match try_download(client, url, *use_pc_ua, part_len).await {
                Ok(r) => break 'outer Some(r),
                Err(e) => last_err = format!("{url} → {e}"),
            }
        }
        None
    };

    let resp = match resp {
        Some(r) => r,
        None => {
            let msg = format!("所有下载候选均失败: {last_err}");
            let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
            return;
        }
    };

    // 若请求了 Range 但服务端忽略并整包返回（HTTP 200），
    // 丢弃已有半截文件、从 0 重新下载，避免追写导致文件损坏。
    let resumed = resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resumed {
        part_len = 0;
    }

    // 续传时服务端返回剩余字节数，加上已有部分才是完整大小
    let total = part_len + resp.content_length().unwrap_or(0);
    emit_progress(part_len, total);

    let file = match if part_len > 0 {
        std::fs::OpenOptions::new().append(true).open(&part_path)
    } else {
        std::fs::File::create(&part_path)
    } {
        Ok(f) => f,
        Err(e) => {
            let msg = format!("创建文件失败: {e}");
            let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
            return;
        }
    };
    let mut file = file;
    let mut downloaded = part_len;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        // 暂停：中断循环，保留 `.part` 供续传
        if abort.load(Ordering::Relaxed) {
            return;
        }
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("下载中断: {e}");
                let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
                return;
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            let msg = format!("写入文件失败: {e}");
            let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
            return;
        }
        downloaded += chunk.len() as u64;
        emit_progress(downloaded, total);
    }

    // ---- 下载完成：`.part` 重命名为正式文件 ----
    let final_path = unique_path(&dir, &stem, ".mp4");
    if let Err(e) = std::fs::rename(&part_path, &final_path) {
        let msg = format!("重命名文件失败: {e}");
        let _ = app.emit("download-error", DownloadError { task_id: task_id.to_string(), error: msg.clone() });
        return;
    }
    let final_str = final_path.to_string_lossy().to_string();
    let _ = app.emit("download-done", DownloadDone { task_id: task_id.to_string(), path: final_str });

    // 系统通知：下载真正完成（去重命中的“已完成”不打扰用户）；是否弹窗由设置页“下载完成通知”控制
    if notify_done {
        let body: String = title.chars().take(40).collect();
        let _ = app
            .notification()
            .builder()
            .title("FRAMECATCH · 下载完成")
            .body(body)
            .show();
    }
}

// ============================================================
// HLS 分段下载
// ============================================================

/// 是否为 HLS 播放列表地址
fn is_hls_url(url: &str) -> bool {
    url.contains(".m3u8") || url.contains("m3u8")
}

/// 重试退避：第 n 次重试前等 1s / 2s / 4s / 8s，
/// 给 phncdn 的限流窗口留出清除时间（紧贴的重试会撞在同一窗口上）
async fn retry_backoff(attempt: usize) {
    tokio::time::sleep(std::time::Duration::from_secs(1u64 << attempt)).await;
}

/// HLS 请求统一加浏览器头；Pornhub CDN 需要 Origin / 年龄 Cookie 才能放行。
/// 显式 `Accept-Encoding: identity` 避免服务器给视频分段套 gzip，
/// 否则连接中途被掐时 reqwest 会在解码 gzip 时报「error decoding response body」。
fn hls_req(
    client: &reqwest::Client,
    url: &str,
    range: Option<&str>,
) -> reqwest::RequestBuilder {
    let mut req = client
        .get(url)
        .header("User-Agent", PC_UA)
        .header("Referer", referer_for(url))
        .header("Accept-Encoding", "identity")
        .header("Accept", "video/mp2t,video/mp4,video/*,*/*");
    if url.contains("pornhub") || url.contains("phncdn") {
        req = req
            .header("Origin", "https://www.pornhub.com")
            .header("Cookie", "age_verified=1; accessPH=1; platform=pc");
    }
    if let Some(r) = range {
        req = req.header("Range", r);
    }
    req
}

/// 拉取 m3u8 播放列表文本（带退避重试，phncdn 连接间歇性被重置）
async fn hls_get(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let mut last: Option<String> = None;
    for attempt in 0..4 {
        match hls_get_once(client, url).await {
            Ok(t) => return Ok(t),
            Err(e) => {
                last = Some(e);
                if attempt < 3 {
                    retry_backoff(attempt).await;
                }
            }
        }
    }
    Err(last.unwrap_or_else(|| "未知错误".into()))
}

async fn hls_get_once(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let resp = hls_req(client, url, None)
        .send()
        .await
        .map_err(|e| format!("请求 {url} 失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("读取响应失败: {e}"))
}

/// 相对地址解析：http 原样返回，否则相对 master/media URL 解析
fn resolve_url(base: &str, rel: &str) -> String {
    if rel.starts_with("http") {
        return rel.to_string();
    }
    if let Ok(base_url) = Url::parse(base) {
        if let Ok(joined) = base_url.join(rel) {
            return joined.to_string();
        }
    }
    let cut = base.rfind('/').map(|i| i + 1).unwrap_or(0);
    format!("{}{}", &base[..cut], rel)
}

/// 从 master 播放列表里选带宽最高的变体；没有变体则原样返回（本身就是 media）
fn pick_variant(master_url: &str, playlist: &str) -> String {
    let mut best: Option<(u64, String)> = None;
    let mut pending_bw: Option<u64> = None;
    for raw in playlist.lines() {
        let line = raw.trim();
        if line.starts_with("#EXT-X-STREAM-INF") {
            pending_bw = Regex::new(r"BANDWIDTH=(\d+)")
                .ok()
                .and_then(|re| re.captures(line))
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u64>().ok());
        } else if !line.is_empty() && !line.starts_with('#') {
            if let Some(bw) = pending_bw {
                let uri = resolve_url(master_url, line);
                if best.as_ref().map(|(b, _)| bw > *b).unwrap_or(true) {
                    best = Some((bw, uri));
                }
            }
            pending_bw = None;
        }
    }
    best.map(|(_, u)| u).unwrap_or_else(|| master_url.to_string())
}

/// HLS 里的一个资源引用：URI + 可选 BYTERANGE
struct HlsRef {
    uri: String,
    range: Option<String>,
}

/// 解析 media 播放列表：返回 (init 分片, 分段列表)
fn parse_media_playlist(media_url: &str, text: &str) -> (Option<HlsRef>, Vec<HlsRef>) {
    let mut init: Option<HlsRef> = None;
    let mut segs: Vec<HlsRef> = Vec::new();
    let mut pending_range: Option<String> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("#EXT-X-MAP") {
            let uri = Regex::new(r#"URI="([^"]+)""#)
                .ok()
                .and_then(|re| re.captures(line))
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());
            let range = Regex::new(r#"BYTERANGE="([0-9@\-]+)""#)
                .ok()
                .and_then(|re| re.captures(line))
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());
            if let Some(u) = uri {
                init = Some(HlsRef {
                    uri: resolve_url(media_url, &u),
                    range,
                });
            }
        } else if line.starts_with("#EXT-X-BYTERANGE") {
            pending_range = Some(
                line.trim_start_matches("#EXT-X-BYTERANGE:").trim().to_string(),
            );
        } else if !line.is_empty() && !line.starts_with('#') {
            let uri = resolve_url(media_url, line);
            segs.push(HlsRef {
                uri,
                range: pending_range.take(),
            });
        }
    }

    (init, segs)
}

/// 把 `#EXT-X-BYTERANGE:length@offset` 转成 Range 头
fn byterange_to_range(br: &str) -> Option<String> {
    let (len_s, off_s) = br.split_once('@')?;
    let len: u64 = len_s.trim().parse().ok()?;
    let off: u64 = off_s.trim().parse().ok()?;
    if len == 0 {
        return None;
    }
    Some(format!("bytes={}-{}", off, off + len - 1))
}

/// 探测单个分段的大小（Range 0-0 → Content-Range 的 total），失败返回 0
async fn hls_segment_len(client: &reqwest::Client, uri: &str) -> u64 {
    let resp = match hls_req(client, uri, Some("bytes=0-0")).send().await {
        Ok(r) => r,
        Err(_) => return 0,
    };
    if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        if let Some(cr) = resp.headers().get(reqwest::header::CONTENT_RANGE) {
            if let Ok(s) = cr.to_str() {
                if let Some(total) = s
                    .rsplit('/')
                    .next()
                    .and_then(|t| t.trim().parse::<u64>().ok())
                {
                    return total;
                }
            }
        }
        return 0;
    }
    resp.content_length().unwrap_or(0)
}

/// 下载单个分段（支持可选 BYTERANGE），返回字节
async fn hls_segment_get(
    client: &reqwest::Client,
    uri: &str,
    range: Option<&str>,
) -> Result<Vec<u8>, String> {
    let range_header = range
        .and_then(byterange_to_range)
        .or_else(|| range.map(|r| format!("bytes=0-{r}")));
    let resp = hls_req(client, uri, range_header.as_deref())
        .send()
        .await
        .map_err(|e| format!("请求 {uri} 失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("读取 {uri} 失败: {e}"))
}

/// 下载单个 HLS 资源（init/分段），对瞬时网络错误做几次退避重试。
/// phncdn 等 CDN 会限流或重置长连接，重试能显著降低下载中断概率。
async fn hls_fetch(
    client: &reqwest::Client,
    uri: &str,
    range: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut last: Option<String> = None;
    for attempt in 0..5 {
        match hls_segment_get(client, uri, range).await {
            Ok(b) => return Ok(b),
            Err(e) => {
                last = Some(e);
                if attempt < 4 {
                    retry_backoff(attempt).await;
                }
            }
        }
    }
    Err(last.unwrap_or_else(|| "未知错误".into()))
}

/// HLS 下载：master → 选变体 → media → 下载 init + 分段 → 拼接写盘。
/// 不支持下发的断点续传（每次重新拉取分段），暂停时清理半截文件。
async fn run_hls(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    task_id: &str,
    m3u8_url: &str,
    title: &str,
    aweme_id: &str,
    save_dir: &str,
    rule: FilenameRule,
    platform: &str,
    quality: &str,
    notify_done: bool,
    abort: Arc<AtomicBool>,
) {
    let fail = |msg: String| {
        let _ = app.emit(
            "download-error",
            DownloadError {
                task_id: task_id.to_string(),
                error: msg,
            },
        );
    };

    let dir = PathBuf::from(save_dir);
    if let Err(e) = std::fs::create_dir_all(&dir) {
        fail(format!("创建保存目录失败: {e}"));
        return;
    }

    let prefix = build_prefix(title, platform, quality, rule);
    let stem = format!("{prefix}_{aweme_id}");
    if let Some(existing) = find_existing_video(&dir, aweme_id) {
        let _ = app.emit(
            "download-done",
            DownloadDone {
                task_id: task_id.to_string(),
                path: existing,
            },
        );
        return;
    }

    // ---- 拉取 master，必要时选最高带宽变体 ----
    let master = match hls_get(client, m3u8_url).await {
        Ok(s) => s,
        Err(e) => {
            fail(format!("拉取 HLS 播放列表失败: {e}"));
            return;
        }
    };
    let media_url = pick_variant(m3u8_url, &master);
    let media = if media_url == m3u8_url {
        master
    } else {
        match hls_get(client, &media_url).await {
            Ok(s) => s,
            Err(e) => {
                fail(format!("拉取 HLS 媒体播放列表失败: {e}"));
                return;
            }
        }
    };

    let (init, segs) = parse_media_playlist(&media_url, &media);
    if segs.is_empty() {
        fail("HLS 媒体播放列表里没有可下载的分段".into());
        return;
    }

    // fMP4（有 EXT-X-MAP）输出 .mp4，否则按 TS
    let ext = if media.contains("#EXT-X-MAP") { "mp4" } else { "ts" };
    let part_path = dir.join(format!("{stem}.{ext}.part"));
    let _ = std::fs::remove_file(&part_path);

    // init 分片
    let init_bytes = match &init {
        Some(r) => match hls_fetch(client, &r.uri, r.range.as_deref()).await {
            Ok(b) => Some(b),
            Err(e) => {
                fail(format!("下载 init 分片失败: {e}"));
                return;
            }
        },
        None => None,
    };

    // ---- 估总大小：只探测首个分段粗算进度 ----
    // 之前对每个分段发 Range 探测再下载，请求量翻倍，会触发 phncdn 限流断连。
    // 只探测一次，按段数粗算总大小即可；探测失败则 total=0（前端对 total=0 已安全处理）。
    let mut total: u64 = init_bytes.as_ref().map(|b| b.len() as u64).unwrap_or(0);
    if let Some(first) = segs.first() {
        let per = hls_segment_len(client, &first.uri).await;
        if per > 0 {
            total += per * segs.len() as u64;
        }
    }

    let emit_progress = |downloaded: u64, total: u64| {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                task_id: task_id.to_string(),
                downloaded,
                total,
            },
        );
    };

    let mut downloaded = init_bytes.as_ref().map(|b| b.len() as u64).unwrap_or(0);
    emit_progress(downloaded, total);

    let mut file = match std::fs::File::create(&part_path) {
        Ok(f) => f,
        Err(e) => {
            fail(format!("创建文件失败: {e}"));
            return;
        }
    };

    if let Some(b) = &init_bytes {
        if abort.load(Ordering::Relaxed) {
            let _ = std::fs::remove_file(&part_path);
            return;
        }
        if let Err(e) = file.write_all(b) {
            fail(format!("写入 init 分片失败: {e}"));
            return;
        }
    }

    for r in &segs {
        if abort.load(Ordering::Relaxed) {
            let _ = std::fs::remove_file(&part_path);
            return;
        }
        let bytes = match hls_fetch(client, &r.uri, r.range.as_deref()).await {
            Ok(b) => b,
            Err(e) => {
                fail(format!("下载分段失败（{e}）"));
                return;
            }
        };
        if let Err(e) = file.write_all(&bytes) {
            fail(format!("写入分段失败: {e}"));
            return;
        }
        downloaded += bytes.len() as u64;
        emit_progress(downloaded, total);
    }

    drop(file);
    let final_path = unique_path(&dir, &stem, &format!(".{ext}"));
    if let Err(e) = std::fs::rename(&part_path, &final_path) {
        fail(format!("重命名文件失败: {e}"));
        return;
    }
    let final_str = final_path.to_string_lossy().to_string();
    let _ = app.emit(
        "download-done",
        DownloadDone {
            task_id: task_id.to_string(),
            path: final_str,
        },
    );

    if notify_done {
        let body: String = title.chars().take(40).collect();
        let _ = app
            .notification()
            .builder()
            .title("FRAMECATCH · 下载完成")
            .body(body)
            .show();
    }
}

// ============================================================
// 单元测试（纯文件逻辑，不依赖网络）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fdt_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn find_existing_video_matches_any_prefix() {
        let dir = temp_dir();
        std::fs::write(dir.join("旧标题_12345.mp4"), b"x").unwrap();
        std::fs::write(dir.join("无关_99999.mp4"), b"x").unwrap();
        // 半截文件不应命中去重（断点续传要继续下载）
        std::fs::write(dir.join("半截_12345.mp4.part"), b"x").unwrap();

        let found = find_existing_video(&dir, "12345").expect("应命中已下载的视频");
        assert!(found.ends_with("旧标题_12345.mp4"));

        assert!(find_existing_video(&dir, "00000").is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn find_existing_video_matches_quality_variant() {
        let dir = temp_dir();
        // 同一视频因命名规则/清晰度不同产生了不同文件名
        std::fs::write(dir.join("标题_好看视频_超清_12345.mp4"), b"x").unwrap();

        let found = find_existing_video(&dir, "12345").expect("应命中清晰度变体");
        assert!(found.ends_with("标题_好看视频_超清_12345.mp4"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // ---------- HLS 辅助函数 ----------

    #[test]
    fn is_hls_url_detects_m3u8() {
        assert!(is_hls_url("https://ev-h.phncdn.com/hls/videos/1/master.m3u8?validfrom=1"));
        assert!(is_hls_url("https://x/y/master.m3u8"));
        assert!(!is_hls_url("https://x/y/1080P_4000K.mp4"));
        assert!(!is_hls_url("https://x/y/video.mp4?token=abc"));
    }

    #[test]
    fn resolve_url_handles_relative_and_absolute() {
        let base = "https://cdn.example.com/hls/videos/202502/01/123/master.m3u8";
        assert_eq!(
            resolve_url(base, "segment0.ts"),
            "https://cdn.example.com/hls/videos/202502/01/123/segment0.ts"
        );
        assert_eq!(
            resolve_url(base, "../init.mp4"),
            "https://cdn.example.com/hls/videos/202502/01/init.mp4"
        );
        assert_eq!(
            resolve_url(base, "https://other.com/a.m3u8"),
            "https://other.com/a.m3u8"
        );
        // 无路径部分的 base 退化为纯拼接
        assert_eq!(resolve_url("https://x.com", "seg.ts"), "https://x.com/seg.ts");
    }

    #[test]
    fn pick_variant_selects_highest_bandwidth() {
        let master = r#"#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=480x270
https://cdn/480.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1080x1920
https://cdn/1080.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=720x1280
https://cdn/720.m3u8
"#;
        assert_eq!(
            pick_variant("https://cdn/master.m3u8", master),
            "https://cdn/1080.m3u8"
        );
    }

    #[test]
    fn pick_variant_no_variant_returns_original() {
        // 本身就是 media playlist：没有 STREAM-INF，应原样返回
        let media = "#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:5,\nseg0.ts\n";
        assert_eq!(
            pick_variant("https://cdn/video.m3u8", media),
            "https://cdn/video.m3u8"
        );
    }

    #[test]
    fn parse_media_playlist_extracts_init_and_segments() {
        let media_url = "https://cdn/video.m3u8";
        let text = r#"#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"
#EXTINF:5.000,
seg0.m4s
#EXT-X-BYTERANGE:1000@200
#EXTINF:5.000,
seg1.m4s
"#;
        let (init, segs) = parse_media_playlist(media_url, text);
        let init = init.expect("应有 init 分片");
        assert_eq!(init.uri, "https://cdn/init.mp4");
        assert_eq!(init.range.as_deref(), Some("720@0"));
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].uri, "https://cdn/seg0.m4s");
        assert!(segs[0].range.is_none());
        assert_eq!(segs[1].uri, "https://cdn/seg1.m4s");
        assert_eq!(segs[1].range.as_deref(), Some("1000@200"));
    }

    #[test]
    fn parse_media_playlist_plain_ts() {
        let media_url = "https://cdn/video.m3u8";
        let text = "#EXTM3U\n#EXTINF:5,\nseg0.ts\n#EXTINF:5,\nseg1.ts\n";
        let (init, segs) = parse_media_playlist(media_url, text);
        assert!(init.is_none());
        assert_eq!(segs.len(), 2);
    }

    #[test]
    fn byterange_to_range_formats_bytes() {
        assert_eq!(byterange_to_range("1000@200"), Some("bytes=200-1199".into()));
        assert_eq!(byterange_to_range("720@0"), Some("bytes=0-719".into()));
        assert_eq!(byterange_to_range("0@0"), None);
        assert_eq!(byterange_to_range("nope"), None);
    }
}
