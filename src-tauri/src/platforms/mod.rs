//! 平台解析统一入口
//!
//! 按平台分目录存放各自解析实现（抖音 / 快手）。
//! 对外提供 `parse(text, proxy)`：先识别平台，再调用对应实现；
//! 以后新增平台只需加一个 `pub mod xxx` 并在下方分发即可。

pub mod bilibili;
pub mod douyin;
pub mod haokan;
pub mod kuaishou;
pub mod pornhub;

use serde::Serialize;

use crate::http::{http_client, ProxyCfg};

/// 一个可选的清晰度档位：标签 + 该档位的播放地址。
/// 多档位平台（如 Pornhub 的 1080P/720P/480P…）解析时带回，前端任务行供用户选择。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub label: String,
    pub play_url: String,
}

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
    /// 平台中文标签（如 抖音 / 快手），供任务行展示与文件名规则使用
    pub platform: String,
    /// 可选的清晰度档位列表；无档位概念的平台返回空数组
    pub quality_options: Vec<QualityOption>,
}

/// 主页作品列表中的一条
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostItem {
    pub aweme_id: String,
    pub desc: String,
    pub author: String,
    pub duration_ms: u64,
    pub cover: String,
    pub create_time: u64,
    pub digg_count: u64,
    pub comment_count: u64,
    pub share_count: u64,
    pub collect_count: u64,
    pub play_count: u64,
}

/// 主页作品列表（分页）
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostListResult {
    pub items: Vec<PostItem>,
    pub has_more: bool,
    pub max_cursor: u64,
}

/// 解析分享文本/链接，返回视频信息；`proxy` 来自设置，透传给各平台。
pub async fn parse(text: &str, proxy: &ProxyCfg) -> Result<VideoInfo, String> {
    let client = http_client(proxy)?;

    if douyin::can_handle(text) {
        return douyin::parse(&client, proxy, text).await;
    }
    if kuaishou::can_handle(text) {
        return kuaishou::parse(&client, text).await;
    }
    if bilibili::can_handle(text) {
        return bilibili::parse(&client, text).await;
    }
    if haokan::can_handle(text) {
        return haokan::parse(&client, text).await;
    }
    if pornhub::can_handle(text) {
        return pornhub::parse(&client, text).await;
    }

    Err("未识别的链接，目前仅支持抖音、快手、哔哩哔哩、好看视频和 Pornhub 分享链接".into())
}
