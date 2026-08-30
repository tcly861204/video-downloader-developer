import { useState } from 'react'
import { fetchUserPosts, type PostItem, type PostListResult } from '@/api/video'
import { sign_datail } from '@/lib/abogus'
import { useDownloadStore } from '@/store/download'

/** 与后端 http.rs 的 PC_UA 保持一致，a_bogus 签名依赖它 */
const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** 用 abogus 对主页 API 的 query 签名并请求一页作品 */
async function fetchProfilePage(id: string, cursor: number | null): Promise<PostListResult> {
  const params = `device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=${id}&max_cursor=${cursor ?? 0}&count=20`
  const aBogus = sign_datail(params, PC_UA)
  return fetchUserPosts(id, aBogus, cursor)
}

/**
 * 抖音主页批量下载逻辑：解析主页 → 作品网格 → 勾选 / 分页 → 批量入队下载。
 * 纯逻辑，UI 由调用方渲染，错误通过 onError 上抛（统一展示在错误横幅）。
 */
export function useProfileBatch(onError: (msg: string) => void) {
  const [posts, setPosts] = useState<PostItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [maxCursor, setMaxCursor] = useState(0)
  const [secUserId, setSecUserId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [parsing, setParsing] = useState(false)

  /** 解析主页链接 → 作品列表；成功返回 true（调用方据此清空输入框） */
  const parseProfile = async (link: string): Promise<boolean> => {
    const trimmed = link.trim()
    if (!trimmed || parsing) return false
    const m = trimmed.match(/\/user\/([A-Za-z0-9_-]+)/)
    if (!m) {
      onError('未能识别主页链接，请粘贴形如 https://www.douyin.com/user/xxxx 的主页地址')
      return false
    }
    setParsing(true)
    onError('')
    try {
      const result = await fetchProfilePage(m[1], null)
      setPosts(result.items)
      setHasMore(result.hasMore)
      setMaxCursor(result.maxCursor)
      setSecUserId(m[1])
      setSelected(new Set(result.items.map((p) => p.awemeId)))
      return true
    } catch (e) {
      onError(typeof e === 'string' ? e : String(e))
      return false
    } finally {
      setParsing(false)
    }
  }

  /** 加载下一页作品 */
  const loadMore = async () => {
    if (!secUserId || !hasMore || parsing) return
    setParsing(true)
    onError('')
    try {
      const result = await fetchProfilePage(secUserId, maxCursor)
      setPosts((prev) => [...prev, ...result.items])
      setHasMore(result.hasMore)
      setMaxCursor(result.maxCursor)
      // 新加载的作品默认一并勾选
      setSelected((prev) => new Set([...prev, ...result.items.map((p) => p.awemeId)]))
    } catch (e) {
      onError(typeof e === 'string' ? e : String(e))
    } finally {
      setParsing(false)
    }
  }

  /** 勾选 / 取消勾选单个作品 */
  const toggleSelect = (awemeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(awemeId)) next.delete(awemeId)
      else next.add(awemeId)
      return next
    })
  }

  /** 全选 / 取消全选 */
  const toggleSelectAll = () => {
    const allOn = posts.length > 0 && posts.every((p) => selected.has(p.awemeId))
    setSelected(allOn ? new Set() : new Set(posts.map((p) => p.awemeId)))
  }

  /** 勾选的作品 → 下载中心任务队列（并发由 store 的 kickArmed 排队） */
  const downloadSelected = () => {
    const chosen = posts.filter((p) => selected.has(p.awemeId))
    if (chosen.length === 0) {
      onError('请先勾选要下载的作品')
      return
    }
    const store = useDownloadStore.getState()
    const ids = store.enqueueBatch(chosen)
    ids.forEach((id) => void store.start(id))
    setSelected(new Set())
  }

  return {
    posts,
    hasMore,
    selected,
    parsing,
    parseProfile,
    loadMore,
    toggleSelect,
    toggleSelectAll,
    downloadSelected,
  }
}
