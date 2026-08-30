mod commands;
mod config;
mod download;
mod http;
mod platforms;

use commands::{cancel_download, get_default_dir, get_settings, parse_video, save_settings, start_download, DownloadState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 保存每个下载任务的暂停标志
        .manage(DownloadState::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            parse_video,
            start_download,
            cancel_download,
            get_default_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
