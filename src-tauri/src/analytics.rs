use serde::Serialize;
use tauri::AppHandle;

/// 埋点上报地址：Cloudflare Pages Function /api/launch。
const TRACKING_URL: &str = "https://stock.tcly-club.top/api/launch";

/// 启动上报的匿名事件，只含统计所需的最少字段，不含任何用户内容。
#[derive(Serialize)]
struct LaunchEvent {
    /// 应用版本
    v: String,
    /// 操作系统（windows / macos / linux）
    os: String,
    /// 匿名设备 ID：基于机器硬件/系统的稳定 ID（Windows 为注册表 MachineGuid，
    /// macOS 为硬件 UUID，Linux 为 /etc/machine-id）。卸载重装应用后保持不变，
    /// 用于去重统计 MAU/DAU
    id: String,
}

/// 上报一次启动事件。完全静默：任何失败都不影响应用启动。
///
/// 默认：发布版上报、调试构建跳过（避免本地开发污染统计数据）。
/// 开发环境测试：设置环境变量 `FRAMECATCH_ANALYTICS_ENABLE=1` 可强制上报；
/// 可用 `FRAMECATCH_TRACKING_URL` 覆盖上报地址（如指向本地 mock 服务器）；
/// 设置 `FRAMECATCH_ANALYTICS_DEBUG=1` 会在终端打印请求与响应。
pub fn report_launch(app: &AppHandle) {
    if cfg!(debug_assertions) && std::env::var("FRAMECATCH_ANALYTICS_ENABLE").is_err() {
        return;
    }
    let event = LaunchEvent {
        v: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        id: device_id(),
    };
    let url = tracking_url();
    if std::env::var("FRAMECATCH_ANALYTICS_DEBUG").is_ok() {
        eprintln!("[analytics] POST {url} id={}", event.id);
    }
    // fire-and-forget：不阻塞主线程，5 秒超时防止拖慢退出
    tauri::async_runtime::spawn(async move {
        let Ok(client) = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
        else {
            return;
        };
        // 接口不稳定：重试直到成功（应用退出时后台任务会被丢弃）。仅网络错误或
        // 5xx 服务端错误重试；4xx 客户端错误重试无用，直接放弃。
        // 退避从 1s 指数翻倍，封顶 60s，避免服务器长期不可用时一直轰炸。
        for attempt in 0.. {
            let should_retry = match client.post(url.as_str()).json(&event).send().await {
                Ok(resp) => {
                    if std::env::var("FRAMECATCH_ANALYTICS_DEBUG").is_ok() {
                        eprintln!("[analytics] response: {}", resp.status());
                    }
                    resp.status().is_server_error()
                }
                Err(_) => true,
            };
            if !should_retry {
                break;
            }
            let backoff = (1u64 << attempt.min(6)).min(60); // 1,2,4,8,16,32,60,60,...
            tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;
        }
    });
}

/// 埋点上报地址：默认线上，可用环境变量 FRAMECATCH_TRACKING_URL 覆盖
/// （开发测试指向本地 mock，如 http://127.0.0.1:8787/api/launch）。
fn tracking_url() -> String {
    std::env::var("FRAMECATCH_TRACKING_URL").unwrap_or_else(|_| TRACKING_URL.to_string())
}

/// 获取机器级稳定 ID：同一台电脑无论卸载重装多少次应用，都返回同一个 ID。
/// - Windows：读注册表 `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`（随系统安装生成）
/// - macOS：`gethostuuid`，即硬件 UUID（重装系统也不变）
/// - Linux：`/etc/machine-id`（随系统安装生成）
/// 极少数拿不到机器 ID 的环境（如精简容器）才退化为随机 UUID。
pub(crate) fn device_id() -> String {
    machine_uid::get().unwrap_or_else(|_| uuid::Uuid::new_v4().to_string())
}
