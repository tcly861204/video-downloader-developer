use serde::{Deserialize, Serialize};
use std::path::Path;

/// 应用配置模型，与前端 `src/store/settings.ts` 的 `AppSettings` 保持一致。
/// 字段蛇形命名、序列化转驼峰；加载时缺字段回退默认值。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub save_dir: String,
    pub default_quality: String,
    pub concurrency: u8,
    pub filename_rule: String,
    pub resume: bool,
    pub proxy_enabled: bool,
    pub proxy_host: String,
    pub proxy_port: String,
    pub notify_done: bool,
    pub notify_fail: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            save_dir: String::new(),
            default_quality: "1080".into(),
            concurrency: 3,
            filename_rule: "title".into(),
            resume: true,
            proxy_enabled: false,
            proxy_host: "127.0.0.1".into(),
            proxy_port: "7890".into(),
            notify_done: true,
            notify_fail: true,
        }
    }
}

/// 读取配置文件；文件不存在或损坏时回退默认值，保证前端永远能拿到一份合法配置。
pub fn load_config(path: &Path) -> AppSettings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// 写入配置文件，父目录不存在时自动创建。
pub fn save_config(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(settings).map_err(|e| format!("序列化配置失败: {e}"))?;
    std::fs::write(path, text).map_err(|e| format!("写入配置文件失败: {e}"))
}
