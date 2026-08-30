mod platforms;

use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager};

// 对外共享的常量
pub(crate) const MOBILE_UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
pub(crate) const PC_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

#[derive(Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

// ============================================================
// 批量下载相关数据结构
// ============================================================

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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostListResult {
    pub items: Vec<PostItem>,
    pub has_more: bool,
    pub max_cursor: u64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BatchDownloadItem {
    pub aweme_id: String,
    pub desc: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchProgress {
    current: usize,
    total: usize,
    aweme_id: String,
    desc: String,
    status: String,
    error: Option<String>,
}

// ============================================================
// 共享工具
// ============================================================

pub(crate) fn http_client() -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"),
    );
    headers.insert(
        reqwest::header::CACHE_CONTROL,
        reqwest::header::HeaderValue::from_static("no-cache"),
    );
    headers.insert(
        reqwest::header::PRAGMA,
        reqwest::header::HeaderValue::from_static("no-cache"),
    );

    reqwest::Client::builder()
        .user_agent(PC_UA)
        .default_headers(headers)
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

pub fn sanitize_filename(name: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|\r\n]+"#).unwrap();
    let cleaned = re.replace_all(name, " ");
    let trimmed = cleaned.trim();
    let truncated: String = trimmed.chars().take(60).collect();
    if truncated.is_empty() {
        "video".to_string()
    } else {
        truncated
    }
}

// ============================================================
// 下载（平台无关）
// ============================================================

async fn try_download(
    client: &reqwest::Client,
    url: &str,
    use_pc_ua: bool,
) -> Result<reqwest::Response, String> {
    let ua = if use_pc_ua { PC_UA } else { MOBILE_UA };
    let resp = client
        .get(url)
        .header("User-Agent", ua)
        .header("Referer", "https://www.douyin.com/")
        .header("Accept", "video/mp4,video/*,*/*")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .header("Sec-Fetch-Dest", "video")
        .header("Sec-Fetch-Mode", "no-cors")
        .header("Sec-Fetch-Site", "cross-site")
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    Ok(resp)
}

/// 核心下载逻辑（可被单个下载和批量下载复用）
async fn do_download(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    play_url: &str,
    title: &str,
    aweme_id: &str,
    save_dir: &str,
) -> Result<String, String> {
    let mut candidates: Vec<(String, bool)> = Vec::new();
    candidates.push((play_url.to_string(), false));
    candidates.push((play_url.to_string(), true));

    let alt_url = play_url
        .replace("playwm", "play")
        .replace("aweme.snssdk.com", "www.douyin.com")
        .replace("api.amemv.com", "www.douyin.com");
    if alt_url != play_url {
        candidates.push((alt_url.clone(), true));
    }

    let ies_url = play_url
        .replace("aweme.snssdk.com", "www.iesdouyin.com")
        .replace("api.amemv.com", "www.iesdouyin.com");
    if ies_url != play_url && ies_url != alt_url {
        candidates.push((ies_url, true));
    }

    let mut last_err = String::new();
    let resp = 'outer: {
        for (url, use_pc_ua) in &candidates {
            match try_download(client, url, *use_pc_ua).await {
                Ok(r) => break 'outer Some(r),
                Err(e) => last_err = format!("{url} → {e}"),
            }
        }
        None
    };

    let resp = resp.ok_or_else(|| format!("所有下载候选均失败: {last_err}"))?;
    let total = resp.content_length().unwrap_or(0);

    let dir = PathBuf::from(save_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建保存目录失败: {e}"))?;
    let base = sanitize_filename(title);
    let mut path = dir.join(format!("{base}_{aweme_id}.mp4"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{base}_{aweme_id}({n}).mp4"));
        n += 1;
    }

    let mut file = std::fs::File::create(&path).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit("download-progress", DownloadProgress { downloaded, total });
    }
    Ok(path.to_string_lossy().to_string())
}

// ============================================================
// Tauri 命令
// ============================================================

#[tauri::command]
async fn parse_video(text: String) -> Result<VideoInfo, String> {
    let (info, _platform) = platforms::parse(&text).await?;
    Ok(info)
}

#[tauri::command]
async fn download_video(
    app: tauri::AppHandle,
    play_url: String,
    title: String,
    aweme_id: String,
    save_dir: String,
) -> Result<String, String> {
    let client = http_client()?;
    do_download(&app, &client, &play_url, &title, &aweme_id, &save_dir).await
}

#[tauri::command]
async fn fetch_user_posts(
    sec_user_id: String,
    a_bogus: String,
    max_cursor: Option<u64>,
) -> Result<PostListResult, String> {
    let ttwid = platforms::douyin::fetch_ttwid().await?;
    let cursor = max_cursor.unwrap_or(0).to_string();

    // 参数顺序必须和前端签名时一致
    let client = http_client()?;
    let resp = client
        .get("https://www.douyin.com/aweme/v1/web/aweme/post/")
        .query(&[
            ("device_platform", "webapp"),
            ("aid", "6383"),
            ("channel", "channel_pc_web"),
            ("sec_user_id", sec_user_id.as_str()),
            ("max_cursor", cursor.as_str()),
            ("count", "20"),
            ("a_bogus", a_bogus.as_str()),
        ])
        .header("Cookie", format!("ttwid={ttwid}"))
        .header(
            "Referer",
            format!("https://www.douyin.com/user/{sec_user_id}"),
        )
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {e}"))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 JSON 失败: {e}"))?;

    let aweme_list = data
        .get("aweme_list")
        .and_then(|v| v.as_array())
        .ok_or("未找到 aweme_list")?;

    let items: Vec<PostItem> = aweme_list
        .iter()
        .filter_map(|a| {
            let aweme_id = a.get("aweme_id")?.as_str()?.to_string();
            let desc = a
                .get("desc")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let author = a
                .get("author")
                .and_then(|a| a.get("nickname"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let duration_ms = a.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
            let cover = a
                .get("video")
                .and_then(|v| v.get("cover"))
                .and_then(|v| v.get("url_list"))
                .and_then(|v| v.as_array())
                .and_then(|v| v.first())
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let create_time = a.get("create_time").and_then(|v| v.as_u64()).unwrap_or(0);
            let stats = a.get("statistics").unwrap_or(&serde_json::Value::Null);
            let digg_count = stats.get("digg_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let comment_count = stats.get("comment_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let share_count = stats.get("share_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let collect_count = stats.get("collect_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let play_count = stats.get("play_count").and_then(|v| v.as_u64()).unwrap_or(0);

            Some(PostItem {
                aweme_id,
                desc,
                author,
                duration_ms,
                cover,
                create_time,
                digg_count,
                comment_count,
                share_count,
                collect_count,
                play_count,
            })
        })
        .collect();

    let has_more = data.get("has_more").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
    let max_cursor = data.get("max_cursor").and_then(|v| v.as_u64()).unwrap_or(0);

    Ok(PostListResult {
        items,
        has_more,
        max_cursor,
    })
}

#[tauri::command]
async fn batch_download(
    app: tauri::AppHandle,
    items: Vec<BatchDownloadItem>,
    save_dir: String,
) -> Result<Vec<String>, String> {
    let client = http_client()?;
    let total = items.len();
    let mut results = Vec::new();

    for (i, item) in items.iter().enumerate() {
        let _ = app.emit(
            "batch-progress",
            BatchProgress {
                current: i + 1,
                total,
                aweme_id: item.aweme_id.clone(),
                desc: item.desc.clone(),
                status: "downloading".to_string(),
                error: None,
            },
        );

        // 用 aweme_id 构造链接，复用现有解析逻辑
        let url = format!("https://www.douyin.com/video/{}", item.aweme_id);
        match platforms::parse(&url).await {
            Ok((info, _)) => {
                match do_download(
                    &app,
                    &client,
                    &info.play_url,
                    &info.title,
                    &info.aweme_id,
                    &save_dir,
                )
                .await
                {
                    Ok(path) => {
                        results.push(path.clone());
                        let _ = app.emit(
                            "batch-progress",
                            BatchProgress {
                                current: i + 1,
                                total,
                                aweme_id: item.aweme_id.clone(),
                                desc: item.desc.clone(),
                                status: "done".to_string(),
                                error: None,
                            },
                        );
                    }
                    Err(e) => {
                        let _ = app.emit(
                            "batch-progress",
                            BatchProgress {
                                current: i + 1,
                                total,
                                aweme_id: item.aweme_id.clone(),
                                desc: item.desc.clone(),
                                status: "error".to_string(),
                                error: Some(e),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let _ = app.emit(
                    "batch-progress",
                    BatchProgress {
                        current: i + 1,
                        total,
                        aweme_id: item.aweme_id.clone(),
                        desc: item.desc.clone(),
                        status: "error".to_string(),
                        error: Some(e),
                    },
                );
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn save_desc(desc: String, title: String, save_dir: String) -> Result<String, String> {
    let base = sanitize_filename(&title);
    let path = if base.is_empty() {
        PathBuf::from(&save_dir).join("video_desc.txt")
    } else {
        PathBuf::from(&save_dir).join(format!("{base}.txt"))
    };
    std::fs::write(&path, &desc).map_err(|e| format!("保存文案失败: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_default_dir(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .download_dir()
        .map_err(|e| format!("获取下载目录失败: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            parse_video,
            download_video,
            save_desc,
            get_default_dir,
            fetch_user_posts,
            batch_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
