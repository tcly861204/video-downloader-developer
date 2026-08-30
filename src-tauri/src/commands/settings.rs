use crate::config::{load_config, save_config, AppSettings};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 配置文件路径：系统用户配置目录下的 settings.json。
/// Windows: %APPDATA%\com.administrator.framecatch\
/// macOS:   ~/Library/Application Support/com.administrator.framecatch/
/// Linux:   ~/.config/com.administrator.framecatch/
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("获取配置目录失败: {e}"))?;
    Ok(dir.join("settings.json"))
}

/// 读取配置；首次运行返回默认值，并把保存目录默认指向系统下载目录。
#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    let mut settings = config_path(&app).map(|p| load_config(&p)).unwrap_or_default();
    if settings.save_dir.is_empty() {
        if let Ok(dir) = app.path().download_dir() {
            settings.save_dir = dir.to_string_lossy().to_string();
        }
    }
    settings
}

/// 将配置写入用户目录。
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = config_path(&app)?;
    save_config(&path, &settings)
}
