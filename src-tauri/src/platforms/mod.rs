//! 平台解析统一入口
//!
//! 按平台分目录存放各自解析实现（当前仅抖音）。
//! 对外提供 `parse(text, proxy)`：先识别平台，再调用对应实现；
//! 以后新增平台（快手 / 视频号等）只需加一个 `pub mod xxx` 并在下方分发即可。

pub mod douyin;

use serde::Serialize;

use crate::http::{http_client, ProxyCfg};

/// 解析出的视频元信息，序列化为 camelCase 供前端使用
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub aweme_id: String,
    pub title: String,
    pub desc: String,
    pub author: String,
    pub duration_ms: u64,
    pub cover: String,
    pub play_url: String,
}

/// 解析分享文本/链接，返回视频信息；`proxy` 来自设置，透传给各平台。
pub async fn parse(text: &str, proxy: &ProxyCfg) -> Result<VideoInfo, String> {
    if !douyin::can_handle(text) {
        return Err("未识别的链接，目前仅支持抖音分享链接".into());
    }

    let client = http_client(proxy)?;
    douyin::parse(&client, proxy, text).await
}
