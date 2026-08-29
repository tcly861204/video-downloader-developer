import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Clapperboard, FolderOpen, Pause, Play, RotateCw, Trash2 } from 'lucide-react'
import { useDownloadStore, type TaskStatus } from '@/store/download'
import { formatBytes, formatEta, formatSpeed, formatTime } from '@/utils/format'

type Tab = 'all' | 'active' | 'done' | 'failed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
]

const ACTIVE_STATUS: TaskStatus[] = ['downloading', 'queued', 'paused']

const STATUS_TEXT: Record<TaskStatus, string> = {
  queued: '排队中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

const PLATFORM_COLORS: Record<string, string> = {
  哔哩哔哩: '#fb7299',
  YouTube: '#ff4d5a',
  抖音: '#25f4ee',
  快手: '#ff6b3d',
  TikTok: '#69c9ff',
  Vimeo: '#1ab7ea',
  'X · Twitter': '#7aa2ff',
}

const statusDot = (status: TaskStatus) => {
  switch (status) {
    case 'downloading':
      return 's-dot s-dot--amber dl-pulse'
    case 'completed':
      return 's-dot s-dot--ok'
    case 'failed':
      return 's-dot s-dot--red'
    default:
      return 's-dot s-dot--muted'
  }
}

const Downloads = () => {
  const tasks = useDownloadStore((s) => s.tasks)
  const actions = useDownloadStore.getState()
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    const store = useDownloadStore.getState()
    if (store.tasks.length === 0) store.seed()
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
    <div className='s-page dl-page'>
      {/* ===== 页头 ===== */}
      <header className='dl-head'>
        <div>
          <p className='s-kicker'>// DOWNLOAD QUEUE</p>
          <h1 className='s-title'>下载中心</h1>
        </div>
        <div className='dl-summary'>
          <span className='s-dot s-dot--amber' aria-hidden />
          <span>进行中 {activeCount}</span>
          <span className='s-dot s-dot--ok' aria-hidden />
          <span>已完成 {counts.done}</span>
          <span className='dl-summary-sep' aria-hidden />
          <span>累计 {formatBytes(totalBytes)}</span>
        </div>
      </header>

      {/* ===== 筛选 + 工具栏 ===== */}
      <div className='dl-toolbar'>
        <div className='dl-tabs' role='tablist' aria-label='任务筛选'>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role='tab'
              aria-selected={tab === key}
              className={tab === key ? 'dl-tab dl-tab-active' : 'dl-tab'}
              onClick={() => setTab(key)}
            >
              {label}
              <span className='dl-tab-count'>{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className='dl-batch'>
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
      <div className='dl-list'>
        {list.length === 0 ? (
          <div className='dl-empty'>
            <Clapperboard size={26} strokeWidth={1.5} />
            <p>NO TASKS IN THIS CHANNEL</p>
          </div>
        ) : (
          list.map((t) => {
            const pct = t.size > 0 ? Math.min(100, Math.round((t.downloaded / t.size) * 100)) : 0
            const remaining = Math.max(0, t.size - t.downloaded)
            const color = PLATFORM_COLORS[t.platform] || 'var(--amber)'
            const isActive = t.status === 'downloading'
            return (
              <article className='dl-row' key={t.id}>
                <div className='dl-thumb' style={{ '--pc': color } as CSSProperties}>
                  <Clapperboard size={18} strokeWidth={1.6} />
                  <i className='dl-pp' aria-hidden />
                </div>

                <div className='dl-body'>
                  <div className='dl-title-line'>
                    <h3 className='dl-title' title={t.title}>
                      {t.title}
                    </h3>
                    <span className='s-tag'>{t.quality}</span>
                  </div>

                  <div className='dl-progress'>
                    <div className='dl-bar' aria-hidden>
                      <div className={isActive ? 'dl-bar-fill dl-bar-live' : 'dl-bar-fill'} style={{ width: `${pct}%` }} />
                    </div>
                    <span className='dl-pct'>{pct}%</span>
                  </div>

                  <div className='dl-meta'>
                    <span>{t.platform}</span>
                    <span>{formatTime(t.createdAt)}</span>
                    <span>
                      {formatBytes(t.downloaded)} / {formatBytes(t.size)}
                    </span>
                    {isActive && (
                      <span className='dl-meta-live'>
                        {formatSpeed(t.speed)} · 剩余 {formatEta(remaining, t.speed)}
                      </span>
                    )}
                  </div>
                </div>

                <div className='dl-side'>
                  <div className='dl-status'>
                    <span className={statusDot(t.status)} aria-hidden />
                    <span>{STATUS_TEXT[t.status]}</span>
                  </div>
                  <div className='dl-actions'>
                    {t.status === 'downloading' ? (
                      <button className='s-btn s-btn--icon' title='暂停' onClick={() => actions.pause(t.id)}>
                        <Pause size={14} />
                      </button>
                    ) : t.status === 'paused' || t.status === 'queued' ? (
                      <button className='s-btn s-btn--icon s-btn--primary' title='继续' onClick={() => actions.resume(t.id)}>
                        <Play size={14} />
                      </button>
                    ) : t.status === 'failed' ? (
                      <button className='s-btn s-btn--icon' title='重试' onClick={() => actions.retry(t.id)}>
                        <RotateCw size={14} />
                      </button>
                    ) : (
                      <button className='s-btn s-btn--icon' title='打开所在文件夹' onClick={() => {}}>
                        <FolderOpen size={14} />
                      </button>
                    )}
                    <button className='s-btn s-btn--icon s-btn--danger' title='删除任务' onClick={() => actions.remove(t.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

    </div>
  )
}

export default Downloads
