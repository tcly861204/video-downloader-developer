use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// 封禁检查地址：Cloudflare Pages Function /api/gate。
const GATE_URL: &str = "https://stock.tcly-club.top/api/gate";

/// 启动后延迟多久做首次检查（毫秒）：先让主窗口渲染出来，避免一上来就弹窗。
const INITIAL_DELAY_MS: u64 = 800;

/// 定期复查间隔（秒）：负责"踢出"正在使用的被封设备，1 小时一次足够。
const RECHECK_INTERVAL_SECS: u64 = 3600;

/// 前端确认遮罩展示的超时（秒）：前端未就绪时退回原生弹窗，保证"封禁必踢"。
const ACK_TIMEOUT_SECS: u64 = 6;

/// 重试基础间隔（秒）：接口不稳定时指数退避重试的起始值。
const RETRY_BASE_DELAY_SECS: u64 = 1;
/// 重试最大间隔（秒）：退避封顶，避免对不稳定接口频繁轰炸。
const RETRY_MAX_DELAY_SECS: u64 = 30;

/// 服务器裁决响应。
#[derive(Deserialize)]
struct GateResponse {
    /// "ok" 或 "blocked"
    status: String,
    /// 封禁原因（可选），展示给用户
    #[serde(default)]
    reason: Option<String>,
}

/// 前端封禁遮罩已展示的确认标志：收到 ack 后停止兜底计时。
static ACKED: AtomicBool = AtomicBool::new(false);

/// 封禁事件负载，经 `gate-blocked` 事件发给前端。
#[derive(Clone, Serialize)]
struct GateBlocked {
    /// 封禁原因，展示给用户
    reason: String,
}

/// 启动封禁检查：首次延迟检查 + 周期性复查。
/// 命中封禁 → 通知前端展示封禁界面（前端未就绪时退回原生弹窗），随后退出应用。
///
/// 默认：发布版执行、调试构建跳过（避免误封开发机）。
/// 开发环境测试：设置环境变量 `FRAMECATCH_GATE_ENABLE=1` 可强制开启；
/// 可用 `FRAMECATCH_GATE_URL` 覆盖检查地址（如指向本地 mock 服务器）。
pub fn init(app: &AppHandle) {
    if cfg!(debug_assertions) && std::env::var("FRAMECATCH_GATE_ENABLE").is_err() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(INITIAL_DELAY_MS)).await;
        loop {
            if let Some(reason) = check_blocked(&app).await {
                notify_blocked(&app, reason);
                return;
            }
            tokio::time::sleep(std::time::Duration::from_secs(RECHECK_INTERVAL_SECS)).await;
        }
    });
}

/// 封禁检查地址：默认线上，可用环境变量 FRAMECATCH_GATE_URL 覆盖
/// （开发测试指向本地 mock，如 http://127.0.0.1:8787/api/gate）。
fn gate_url() -> String {
    std::env::var("FRAMECATCH_GATE_URL").unwrap_or_else(|_| GATE_URL.to_string())
}

/// 查询服务器裁决。返回 `Some(原因)` 表示该设备已被禁止使用。
/// 接口不稳定：这里持续重试直到拿到有效 2xx 响应，避免一次抖动漏判封禁；
/// 重试间隔指数退避并封顶（见 RETRY_BASE/MAX_DELAY_SECS）。
/// 设置 FRAMECATCH_GATE_DEBUG=1 会在终端打印请求、响应与每次重试，便于排查。
async fn check_blocked(app: &AppHandle) -> Option<String> {
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    else {
        return None;
    };
    let id = crate::analytics::device_id();
    let url = gate_url();
    let body = serde_json::json!({
        "id": id,
        "v": app.package_info().version.to_string(),
        "os": std::env::consts::OS,
    });
    if std::env::var("FRAMECATCH_GATE_DEBUG").is_ok() {
        eprintln!("[gate] POST {url} id={id}");
    }
    let mut delay = RETRY_BASE_DELAY_SECS;
    loop {
        match probe(&client, &url, &body).await {
            GateProbe::Verdict(payload) => {
                if std::env::var("FRAMECATCH_GATE_DEBUG").is_ok() {
                    eprintln!("[gate] response: {} {:?}", payload.status, payload.reason);
                }
                return (payload.status == "blocked").then(|| {
                    payload
                        .reason
                        .unwrap_or_else(|| "该设备已被禁止使用本软件".to_string())
                });
            }
            GateProbe::Retry => {
                if std::env::var("FRAMECATCH_GATE_DEBUG").is_ok() {
                    eprintln!("[gate] retry in {delay}s…");
                }
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                delay = (delay * 2).min(RETRY_MAX_DELAY_SECS);
            }
        }
    }
}

/// 单次请求结果：拿到有效裁决继续，否则进入指数退避重试。
enum GateProbe {
    /// 拿到 2xx 且成功解析的裁决
    Verdict(GateResponse),
    /// 需要重试：网络错误、超时、非 2xx、或响应无法解析
    Retry,
}

/// 发起一次 POST 并尝试解析裁决；任何异常都归为 `Retry`。
async fn probe(client: &reqwest::Client, url: &str, body: &serde_json::Value) -> GateProbe {
    let resp = match client.post(url).json(body).send().await {
        Ok(r) => r,
        Err(_) => return GateProbe::Retry,
    };
    if !resp.status().is_success() {
        return GateProbe::Retry;
    }
    match resp.json::<GateResponse>().await {
        Ok(v) => GateProbe::Verdict(v),
        Err(_) => GateProbe::Retry,
    }
}

/// 命中封禁：优先通知前端渲染封禁界面。
/// 前端在 ACK_TIMEOUT_SECS 内确认展示（gate_ack_blocked）则交由前端收尾；
/// 超时未确认（如 WebView 未就绪）退回原生弹窗，保证"封禁必踢"。
fn notify_blocked(app: &AppHandle, reason: String) {
    let _ = app.emit("gate-blocked", GateBlocked { reason: reason.clone() });
    let app = app.clone();
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        while start.elapsed().as_secs() < ACK_TIMEOUT_SECS {
            if ACKED.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        show_blocked_and_exit(&app, reason);
    });
}

/// 前端已渲染出封禁遮罩：停止兜底计时，交由前端「退出应用」按钮收尾。
#[tauri::command]
pub fn gate_ack_blocked() {
    ACKED.store(true, Ordering::Relaxed);
}

/// 封禁界面「退出应用」按钮：直接结束进程。
#[tauri::command]
pub fn gate_exit(app: AppHandle) {
    app.exit(0);
}

/// 弹窗告知封禁原因，用户点击确认后退出应用。
/// 对话框是阻塞式、且不能在主线程调用，故放到独立线程。
fn show_blocked_and_exit(app: &AppHandle, reason: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        app.dialog()
            .message(reason)
            .title("访问受限")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::Ok)
            .blocking_show();
        app.exit(0);
    });
}
