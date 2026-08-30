use serde::Serialize;
use tauri::{AppHandle, Manager};

/// 埋点上报地址：占位，发布前替换成你自己的服务地址。
const TRACKING_URL: &str = "https://your-tracker.example/launch";

/// 启动上报的匿名事件，只含统计所需的最少字段，不含任何用户内容。
#[derive(Serialize)]
struct LaunchEvent {
    /// 应用版本
    v: String,
    /// 操作系统（windows / macos / linux）
    os: String,
    /// 匿名设备 ID：首次启动生成并持久保存，用于去重统计 MAU/DAU
    id: String,
}

/// 上报一次启动事件。完全静默：任何失败都不影响应用启动。
/// 调试构建直接跳过，避免本地开发污染统计数据。
pub fn report_launch(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let event = LaunchEvent {
        v: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        id: device_id(app),
    };
    // fire-and-forget：不阻塞主线程，5 秒超时防止拖慢退出
    tauri::async_runtime::spawn(async move {
        if let Ok(client) = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
        {
            let _ = client.post(TRACKING_URL).json(&event).send().await;
        }
    });
}

/// 读取或生成匿名设备 ID，保存在配置目录下的 device_id 文件中。
fn device_id(app: &AppHandle) -> String {
    let path = app
        .path()
        .app_config_dir()
        .map(|dir| dir.join("device_id"))
        .unwrap_or_default();
    if path.exists() {
        if let Ok(id) = std::fs::read_to_string(&path) {
            let id = id.trim().to_string();
            if !id.is_empty() {
                return id;
            }
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &id);
    id
}
