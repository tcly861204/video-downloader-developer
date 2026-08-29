import type { ParsedMeta } from '@/store/download'

const RULES: { host: string; platform: string; quality: string }[] = [
  { host: 'bilibili.com', platform: '哔哩哔哩', quality: '原画' },
  { host: 'youtube.com', platform: 'YouTube', quality: '1080P' },
  { host: 'douyin.com', platform: '抖音', quality: '原画' },
  { host: 'kuaishou.com', platform: '快手', quality: '720P' },
  { host: 'tiktok.com', platform: 'TikTok', quality: '原画' },
  { host: 'vimeo.com', platform: 'Vimeo', quality: '4K' },
  { host: 'twitter.com', platform: 'X · Twitter', quality: '原画' },
  { host: 'x.com', platform: 'X · Twitter', quality: '原画' },
  { host: 'iqiyi.com', platform: '爱奇艺', quality: '1080P' },
  { host: 'v.qq.com', platform: '腾讯视频', quality: '1080P' },
  { host: 'migu.cn', platform: '咪咕', quality: '原画' },
]

const MB = 1024 * 1024

/** 根据链接域名识别平台；暂无真实解析引擎，标题/体积为演示值 */
export function parseUrl(url: string): ParsedMeta {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* 非标准链接，按未知平台处理 */
  }
  const rule = RULES.find((r) => host.includes(r.host)) ?? { platform: '未知平台', quality: '原画' }
  const title = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '').slice(0, 48) || '未命名视频'
  const size = Math.round((1 + Math.random() * 3) * 1024) * MB
  return { title, platform: rule.platform, quality: rule.quality, size }
}
