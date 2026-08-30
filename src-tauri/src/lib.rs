mod commands;
mod config;
mod download;
mod http;
mod platforms;
mod tray;

use commands::{
    cancel_download, fetch_user_posts, get_default_dir, get_settings, parse_video, save_settings,
    start_download, DownloadState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // 保存每个下载任务的暂停标志
        .manage(DownloadState::default())
        .setup(|app| {
            // 系统托盘：左键唤起主窗口 / 菜单显示、退出
            tray::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            parse_video,
            start_download,
            cancel_download,
            get_default_dir,
            fetch_user_posts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
