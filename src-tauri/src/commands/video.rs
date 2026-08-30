//! 视频解析 / 下载命令
//!
//! 所有命令都从设置文件读取配置（保存目录、文件名规则、代理、断点续传），
//! 保证「设置页改了什么，下载就按什么来」。
//!
//! 下载为后台任务：`start_download` 立即返回，进度/完成/失败通过事件推送前端：
//! - `download-progress` { taskId, downloaded, total }
//! - `download-done`     { taskId, path }
//! - `download-error`    { taskId, error }

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};

use crate::config::{load_config, AppSettings};
use crate::download::{self, FilenameRule};
use crate::http::{self, ProxyCfg};
use crate::platforms::{self, PostListResult, VideoInfo};

/// 共享的下载状态：task_id → 中止标志，用于暂停
#[derive(Default)]
pub struct DownloadState {
    aborts: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// 读取设置，并在保存目录为空时回填系统下载目录
fn resolve_settings(app: &AppHandle) -> AppSettings {
    let mut settings = app
        .path()
        .app_config_dir()
        .map(|d| d.join("settings.json"))
        .map(|p| load_config(&p))
        .unwrap_or_default();
    if settings.save_dir.is_empty() {
        if let Ok(d) = app.path().download_dir() {
            settings.save_dir = d.to_string_lossy().to_string();
        }
    }
    settings
}

/// 从配置构造代理设置
fn proxy_from(settings: &AppSettings) -> ProxyCfg {
    ProxyCfg {
        enabled: settings.proxy_enabled,
        host: settings.proxy_host.clone(),
        port: settings.proxy_port.clone(),
    }
}

/// 解析抖音分享文本/链接，返回视频元信息
#[tauri::command]
pub async fn parse_video(app: AppHandle, text: String) -> Result<VideoInfo, String> {
    let settings = resolve_settings(&app);
    let proxy = proxy_from(&settings);
    platforms::parse(&text, &proxy).await
}

/// 启动一个下载任务（后台异步执行，立即返回）
///
/// `play_url` 为空时视为「批量任务」（前端 enqueueBatch 创建、没有解析出的播放地址）：
/// 后台先按 aweme_id 走 `platforms::parse` 拿到无水印地址，再进入统一下载流程。
#[tauri::command]
pub fn start_download(
    app: AppHandle,
    task_id: String,
    play_url: String,
    title: String,
    aweme_id: String,
    platform: String,
    quality: String,
) -> Result<(), String> {
    // 解析配置
    let settings = resolve_settings(&app);
    let proxy = proxy_from(&settings);
    let client = http::http_client(&proxy)?;
    let save_dir = settings.save_dir;
    let rule = FilenameRule::from_str(&settings.filename_rule);
    let resume = settings.resume;
    let notify_done = settings.notify_done;

    // 注册中止标志，供暂停使用（解析也发生在后台，暂停在解析期间即可置位）
    let abort = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<DownloadState>();
        state
            .aborts
            .lock()
            .unwrap()
            .insert(task_id.clone(), abort.clone());
    }

    // 后台跑：先补全 play_url（批量任务），再下载。结束后清理中止标志。
    // 进度/完成/失败事件由 download::run 内部发出，暂停无需事件（前端已置 paused）。
    let app2 = app.clone();
    let tid = task_id.clone();
    let pid = aweme_id.clone();
    let proxy2 = proxy.clone();
    tauri::async_runtime::spawn(async move {
        // 批量任务没有播放地址 → 先解析出无水印地址
        let play_url = if play_url.is_empty() {
            match platforms::parse(&format!("https://www.douyin.com/video/{pid}"), &proxy2).await {
                Ok(info) => info.play_url,
                Err(e) => {
                    let _ = app2.emit(
                        "download-error",
                        download::DownloadError {
                            task_id: tid.clone(),
                            error: format!("解析视频地址失败: {e}"),
                        },
                    );
                    let state = app2.state::<DownloadState>();
                    state.aborts.lock().unwrap().remove(&tid);
                    return;
                }
            }
        } else {
            play_url
        };

        download::run(
            &app2,
            &client,
            &tid,
            &play_url,
            &title,
            &aweme_id,
            &save_dir,
            rule,
            &platform,
            &quality,
            resume,
            notify_done,
            abort,
        )
        .await;

        let state = app2.state::<DownloadState>();
        state.aborts.lock().unwrap().remove(&tid);
    });

    Ok(())
}

/// 拉取用户主页作品列表（分页，20 条/页）。
/// `a_bogus` 由前端用 abogus.js 对同一组 query 参数签名后传入。
#[tauri::command]
pub async fn fetch_user_posts(
    app: AppHandle,
    sec_user_id: String,
    a_bogus: String,
    max_cursor: Option<u64>,
) -> Result<PostListResult, String> {
    let settings = resolve_settings(&app);
    let proxy = proxy_from(&settings);
    let client = http::http_client(&proxy)?;
    platforms::douyin::fetch_user_posts(&client, &proxy, &sec_user_id, &a_bogus, max_cursor).await
}

/// 暂停任务：置位中止标志，后台下载循环检测到后中断并保留 `.part`
#[tauri::command]
pub fn cancel_download(app: AppHandle, task_id: String) -> Result<(), String> {
    let state = app.state::<DownloadState>();
    if let Some(flag) = state.aborts.lock().unwrap().get(&task_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// 获取系统默认下载目录（首次打开设置时兜底用）
#[tauri::command]
pub fn get_default_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .download_dir()
        .map_err(|e| format!("获取下载目录失败: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}
