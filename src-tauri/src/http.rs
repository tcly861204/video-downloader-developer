//! HTTP 客户端工厂
//!
//! 统一负责创建带合理默认头 / 超时 / 代理的 reqwest Client，
//! 供「解析」「下载」「获取 ttwid」各处复用，避免各自拼 UA 与头。

/// 移动端 UA：部分抖音分享页 / 资源地址需要用移动端 UA 才能拿到数据
pub(crate) const MOBILE_UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/// PC 端 UA：默认请求头
pub(crate) const PC_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// 代理配置，来自设置里的「网络 → 使用代理 / 代理地址」
#[derive(Debug, Clone)]
pub struct ProxyCfg {
    pub enabled: bool,
    pub host: String,
    pub port: String,
}

impl ProxyCfg {
    /// 转成 reqwest::Proxy；未启用或 host 为空时返回 None
    pub fn to_reqwest(&self) -> Option<reqwest::Proxy> {
        if !self.enabled || self.host.trim().is_empty() {
            return None;
        }
        let url = format!("http://{}:{}", self.host.trim(), self.port.trim());
        reqwest::Proxy::all(&url).ok()
    }
}

/// 创建一个带默认行为 + 可选代理的 HTTP 客户端
pub fn http_client(proxy: &ProxyCfg) -> Result<reqwest::Client, String> {
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

    let mut builder = reqwest::Client::builder()
        .user_agent(PC_UA)
        .default_headers(headers)
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120));

    // 设置页开启了代理才挂代理
    if let Some(proxy) = proxy.to_reqwest() {
        builder = builder.proxy(proxy);
    }

    builder.build().map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}
