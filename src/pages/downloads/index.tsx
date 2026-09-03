import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, Download, Pause, Play, RotateCw, Sparkles, Trash2 } from 'lucide-react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useDownloadStore, type TaskStatus } from '@/store/download'
import { formatBytes } from '@/utils/format'
import { TaskRow } from '@/components/task-row'
import { Segmented } from '@/components/segmented'
import { PostGrid } from '@/components/post-grid'
import { useProfileBatch } from '@/hooks/use-profile-batch'
import styles from './index.module.scss'

type Tab = 'all' | 'active' | 'done' | 'failed'
type Mode = 'single' | 'batch'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
]

const ACTIVE_STATUS: TaskStatus[] = ['downloading', 'queued', 'paused']

const Downloads = () => {
  const tasks = useDownloadStore((s) => s.tasks)
  const actions = useDownloadStore.getState()
  const [tab, setTab] = useState<Tab>('all')
  const [mode, setMode] = useState<Mode>('single')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 批量模式：主页解析 / 勾选 / 入队，错误统一上抛到本页横幅
  const batch = useProfileBatch(setError)

  // 消费首页写入的待解析链接
  useEffect(() => {
    const store = useDownloadStore.getState()
    const url = store.pendingUrl
    if (url) {
      store.setPendingUrl(null)
      store.parseAndAdd(url).catch((e) => setError(typeof e === 'string' ? e : String(e)))
    }
  }, [])

  // 解析单个链接并入队
  const handleParse = async () => {
    const trimmed = link.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError('')
    try {
      await useDownloadStore.getState().parseAndAdd(trimmed)
      setLink('')
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 批量模式：解析主页链接 → 作品网格
  const handleParseProfile = async () => {
    if (await batch.parseProfile(link)) setLink('')
  }

  // 打开已完成任务所在文件夹
  const handleOpen = (id: string) => {
    const t = tasks.find((x) => x.id === id)
    if (t?.savePath) void revealItemInDir(t.savePath).catch(() => {})
  }

  const { active, failed, list, counts, activeCount, totalBytes } = useMemo(() => {
    const active = tasks.filter((t) => ACTIVE_STATUS.includes(t.status))
    const done = tasks.filter((t) => t.status === 'completed')
    const failed = tasks.filter((t) => t.status === 'failed')
    const map = { all: tasks, active, done, failed }
    const counts = {
      all: tasks.length,
      active: active.length,
      done: done.length,
      failed: failed.length,
    }
    return {
      active,
      done,
      failed,
      list: map[tab],
      counts,
      activeCount: active.length,
      totalBytes: tasks.reduce((sum, t) => sum + t.downloaded, 0),
    }
  }, [tasks, tab])

  return (
    <section className={`s-page ${styles.page}`}>
      {/* ===== 页头 ===== */}
      <header className={styles.head}>
        <div>
          <p className='s-kicker'>// DOWNLOAD QUEUE</p>
          <h1 className='s-title'>下载中心</h1>
        </div>
        <div className={styles.headRight}>
          <div className={styles.summary}>
            <span className='s-dot s-dot--amber' aria-hidden />
            <span>进行中 {activeCount}</span>
            <span className='s-dot s-dot--ok' aria-hidden />
            <span>已完成 {counts.done}</span>
            <span className={styles.summarySep} aria-hidden />
            <span>累计 {formatBytes(totalBytes)}</span>
          </div>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: '单个下载' },
              { value: 'batch', label: '批量下载' },
            ]}
          />
        </div>
      </header>

      {/* ===== 粘贴链接 ===== */}
      <section className={`s-panel ${styles.addBox}`}>
        <div className={styles.addHead}>
          <p className='s-kicker'>{mode === 'single' ? '// ADD NEW TASK' : '// BATCH TASKS'}</p>
          <div className={styles.chips}>
            {mode === 'single' ? (
              <>
                <span className='s-tag s-tag--on'>抖音</span>
                <span className='s-tag'>快手</span>
                <span className='s-tag'>哔哩哔哩</span>
                <span className='s-tag'>好看视频</span>
                <span className='s-tag'>微博</span>
              </>
            ) : (
              <>
                <span className='s-tag'>主页链接</span>
                <span className='s-tag'>分页加载</span>
              </>
            )}
          </div>
        </div>
        <textarea
          className={styles.addInput}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={
            mode === 'single'
              ? '粘贴分享文本或链接，例如：\n抖音：7.94 复制打开抖音… https://v.douyin.com/xxxx/\n快手：复制打开快手… https://v.kuaishou.com/xxxx/\n'
              : '粘贴用户主页链接，例如：\nhttps://www.douyin.com/user/MS4wLjABAAAA…'
          }
          rows={3}
          spellCheck={false}
          aria-label='粘贴视频链接'
        />
        <div className={styles.addActions}>
          <button
            className='s-btn s-btn--primary'
            disabled={!link.trim() || busy || batch.parsing}
            onClick={mode === 'single' ? handleParse : handleParseProfile}
          >
            <Sparkles size={14} />
            {busy || batch.parsing
              ? '解析中…'
              : mode === 'single'
                ? '解析并加入队列'
                : '解析主页作品'}
          </button>
        </div>
      </section>

      {/* ===== 错误提示 ===== */}
      {error && (
        <div className={`s-panel ${styles.errorBanner}`} role='alert'>
          <span className='s-kicker'>// ERROR</span>
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {/* ===== 批量模式：作品网格 ===== */}
      {mode === 'batch' && batch.posts.length > 0 && (
        <>
          <div className={styles.batchActions}>
            <button
              className='s-btn s-btn--primary'
              onClick={batch.downloadSelected}
              disabled={batch.selected.size === 0}
            >
              <Download size={14} />
              下载选中 ({batch.selected.size})
            </button>
            {batch.hasMore && (
              <button className='s-btn' onClick={batch.loadMore} disabled={batch.parsing}>
                {batch.parsing ? '加载中…' : '加载更多'}
              </button>
            )}
          </div>
          <PostGrid
            posts={batch.posts}
            selected={batch.selected}
            onToggle={batch.toggleSelect}
            onToggleAll={batch.toggleSelectAll}
          />
        </>
      )}

      {/* ===== 筛选 + 工具栏 ===== */}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role='tablist' aria-label='任务筛选'>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role='tab'
              aria-selected={tab === key}
              className={tab === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab(key)}
            >
              {label}
              <span className={styles.tabCount}>{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className={styles.batch}>
          <button className='s-btn' onClick={actions.resumeAll} disabled={counts.active === 0}>
            <Play size={14} />
            全部开始
          </button>
          <button
            className='s-btn'
            onClick={actions.pauseAll}
            disabled={active.filter((t) => t.status === 'downloading').length === 0}
          >
            <Pause size={14} />
            全部暂停
          </button>
          <button
            className='s-btn'
            onClick={() => failed.forEach((t) => actions.retry(t.id))}
            disabled={counts.failed === 0}
          >
            <RotateCw size={14} />
            重试失败
          </button>
          <button
            className='s-btn s-btn--danger'
            onClick={actions.clearCompleted}
            disabled={counts.done === 0}
          >
            <Trash2 size={14} />
            清空已完成
          </button>
        </div>
      </div>

      {/* ===== 任务列表 ===== */}
      <div className={styles.list}>
        {list.length === 0 ? (
          <div className={styles.empty}>
            <Clapperboard size={26} strokeWidth={1.5} />
            <p>NO TASKS IN THIS CHANNEL</p>
          </div>
        ) : (
          list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onPause={actions.pause}
              onResume={actions.resume}
              onRetry={actions.retry}
              onRemove={actions.remove}
              onOpen={handleOpen}
              onQuality={actions.setQuality}
            />
          ))
        )}
      </div>
    </section>
  )
}

export default Downloads
