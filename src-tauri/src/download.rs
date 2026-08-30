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
    abort: Arc<AtomicBool>,
) {
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
    // 已存在完整文件：直接视为完成，避免重复下载
    if dir.join(format!("{stem}.mp4")).exists() {
        let path = dir.join(format!("{stem}.mp4"));
        let path_str = path.to_string_lossy().to_string();
        let _ = app.emit("download-done", DownloadDone { task_id: task_id.to_string(), path: path_str });
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
}
