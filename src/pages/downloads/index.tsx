import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, Pause, Play, RotateCw, Trash2 } from 'lucide-react'
import { useDownloadStore, type TaskStatus } from '@/store/download'
import { formatBytes } from '@/utils/format'
import { parseUrl } from '@/utils/parse'
import { TaskRow } from '@/components/task-row'
import styles from './index.module.scss'

type Tab = 'all' | 'active' | 'done' | 'failed'

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

  useEffect(() => {
    const store = useDownloadStore.getState()
    if (store.tasks.length === 0) store.seed()
    const url = store.pendingUrl
    if (url) {
      store.setPendingUrl(null)
      store.addParsed(parseUrl(url))
    }
    const id = setInterval(() => useDownloadStore.getState().tick(), 1000)
    return () => clearInterval(id)
  }, [])

  const { active, failed, list, counts, activeCount, totalBytes } = useMemo(() => {
    const active = tasks.filter((t) => ACTIVE_STATUS.includes(t.status))
    const done = tasks.filter((t) => t.status === 'completed')
    const failed = tasks.filter((t) => t.status === 'failed')
    const map = { all: tasks, active, done, failed }
    const counts = { all: tasks.length, active: active.length, done: done.length, failed: failed.length }
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
        <div className={styles.summary}>
          <span className='s-dot s-dot--amber' aria-hidden />
          <span>进行中 {activeCount}</span>
          <span className='s-dot s-dot--ok' aria-hidden />
          <span>已完成 {counts.done}</span>
          <span className={styles.summarySep} aria-hidden />
          <span>累计 {formatBytes(totalBytes)}</span>
        </div>
      </header>

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
          <button className='s-btn' onClick={actions.pauseAll} disabled={active.filter((t) => t.status === 'downloading').length === 0}>
            <Pause size={14} />
            全部暂停
          </button>
          <button className='s-btn' onClick={() => failed.forEach((t) => actions.retry(t.id))} disabled={counts.failed === 0}>
            <RotateCw size={14} />
            重试失败
          </button>
          <button className='s-btn s-btn--danger' onClick={actions.clearCompleted} disabled={counts.done === 0}>
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
              onOpen={() => {}}
            />
          ))
        )}
      </div>
    </section>
  )
}

export default Downloads
