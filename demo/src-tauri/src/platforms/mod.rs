pub mod douyin;
pub mod kuaishou;
pub mod sph;

/// 按顺序尝试所有平台解析，返回视频信息与平台名称
pub async fn parse(text: &str) -> Result<(super::VideoInfo, &'static str), String> {
    let client = super::http_client()?;

    // 先判断平台归属
    if douyin::can_handle(text) {
        match douyin::parse(&client, text).await {
            Ok(info) => return Ok((info, "douyin")),
            Err(_e) => {
                // 抖音失败时尝试快手（URL 可能混淆）
            }
        }
    }

    if kuaishou::can_handle(text) {
        match kuaishou::parse(&client, text).await {
            Ok(info) => return Ok((info, "kuaishou")),
            Err(e) => return Err(e),
        }
    }

    if sph::can_handle(text) {
        match sph::parse(&client, text).await {
            Ok(info) => return Ok((info, "sph")),
            Err(e) => return Err(e),
        }
    }

    Err("未识别的链接，目前支持抖音、快手和视频号".into())
}
