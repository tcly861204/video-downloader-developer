import {
  AtSign,
  Clapperboard,
  Film,
  MonitorPlay,
  Music2,
  Play,
  Radio,
  Tv,
  Video,
  type LucideIcon,
} from 'lucide-react'

export interface PlatformMeta {
  /** 唯一标识 */
  key: string
  /** 中文名 */
  name: string
  /** 英文代号 */
  en: string
  /** 品牌色（HUD 信号色） */
  color: string
  /** locked=已支持 / scanning=规划中 */
  status: 'locked' | 'scanning'
  icon: LucideIcon
  /** 一句话定位 */
  desc: string
  /** 能力要点 */
  caps: string[]
}

export const PLATFORMS: PlatformMeta[] = [
  {
    key: 'douyin',
    name: '抖音',
    en: 'DOUYIN',
    color: '#25f4ee',
    status: 'locked',
    icon: Clapperboard,
    desc: '短视频 · 主页可批量',
    caps: ['分享文本 / 链接解析', '无水印直链', '主页作品批量下载'],
  },
  {
    key: 'kuaishou',
    name: '快手',
    en: 'KUAISHOU',
    color: '#ff6b3d',
    status: 'locked',
    icon: Play,
    desc: '国民短视频社区',
    caps: ['分享短链解析', '无水印直链'],
  },
  {
    key: 'bilibili',
    name: '哔哩哔哩',
    en: 'BILIBILI',
    color: '#fb7299',
    status: 'locked',
    icon: Tv,
    desc: '中长视频弹幕社区',
    caps: ['BV / av 号解析', 'HTML5 单文件直链'],
  },
  {
    key: 'haokan',
    name: '好看视频',
    en: 'HAOKAN',
    color: '#2e7cf6',
    status: 'locked',
    icon: MonitorPlay,
    desc: '百度旗下短视频',
    caps: ['分享链接解析', '多清晰度直链'],
  },
  {
    key: 'weibo',
    name: '微博',
    en: 'WEIBO',
    color: '#ff6a5c',
    status: 'locked',
    icon: Radio,
    desc: '社交平台视频内容',
    caps: ['分享文本 / 短链解析', '多清晰度直链'],
  },
  // {
  //   key: 'pornhub',
  //   name: 'Pornhub',
  //   en: 'PORNHUB',
  //   color: '#ff9000',
  //   status: 'locked',
  //   icon: Play,
  //   desc: '成人视频平台',
  //   caps: ['viewkey 链接解析', 'MP4 直链下载', '需代理访问'],
  // },
  {
    key: 'youtube',
    name: 'YouTube',
    en: 'YOUTUBE',
    color: '#ff4d5a',
    status: 'scanning',
    icon: Film,
    desc: '全球最大视频平台',
    caps: ['PO token 接入中'],
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    en: 'TIKTOK',
    color: '#69c9ff',
    status: 'scanning',
    icon: Music2,
    desc: '海外版抖音',
    caps: ['与抖音同源，适配中'],
  },
  {
    key: 'vimeo',
    name: 'Vimeo',
    en: 'VIMEO',
    color: '#1ab7ea',
    status: 'scanning',
    icon: Video,
    desc: '高清创作者社区',
    caps: ['oEmbed 直链接入中'],
  },
  {
    key: 'xtwitter',
    name: 'X · Twitter',
    en: 'X · TWITTER',
    color: '#7aa2ff',
    status: 'scanning',
    icon: AtSign,
    desc: '社交平台视频',
    caps: ['直链解析规划中'],
  },
]

export const SUPPORTED = PLATFORMS.filter((p) => p.status === 'locked')
export const SCANNING = PLATFORMS.filter((p) => p.status === 'scanning')
