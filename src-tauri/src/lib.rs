mod analytics;
mod commands;
mod config;
mod download;
mod gate;
mod http;
mod platforms;
mod tray;

use commands::{
    cancel_download, fetch_user_posts, get_default_dir, get_settings, parse_video, save_settings,
    start_download, DownloadState,
};
use gate::{gate_ack_blocked, gate_exit};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // 保存每个下载任务的暂停标志
        .manage(DownloadState::default())
        .setup(|app| {
            // 系统托盘：左键唤起主窗口 / 菜单显示、退出
            tray::init(app.handle())?;
            // 启动埋点：调试构建内部会跳过，仅发布版上报
            analytics::report_launch(app.handle());
            // 封禁检查：命中封禁会弹窗说明并退出应用（调试构建跳过）
            gate::init(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            parse_video,
            start_download,
            cancel_download,
            get_default_dir,
            fetch_user_posts,
            gate_ack_blocked,
            gate_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
