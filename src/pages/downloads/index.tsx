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

      <style>{`
        .dl-page { display: flex; flex-direction: column; }

        .dl-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--line);
        }
        .dl-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--ff-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--muted);
          padding-bottom: 4px;
        }
        .dl-summary-sep { width: 1px; height: 12px; background: rgba(148, 163, 190, 0.3); margin: 0 4px; }

        /* ---------- 工具栏 ---------- */
        .dl-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin: 18px 0 14px;
        }
        .dl-tabs {
          display: flex;
          gap: 4px;
          padding: 3px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(8, 12, 20, 0.4);
        }
        .dl-tab {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          font-size: 13px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: color 0.18s, background 0.18s;
        }
        .dl-tab:hover { color: var(--text); }
        .dl-tab-active { background: rgba(255, 176, 58, 0.12); color: var(--amber); }
        .dl-tab:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }
        .dl-tab-count {
          min-width: 18px;
          padding: 1px 5px;
          border-radius: 6px;
          font-family: var(--ff-mono);
          font-size: 10px;
          background: rgba(148, 163, 190, 0.12);
          color: var(--faint);
        }
        .dl-tab-active .dl-tab-count { background: rgba(255, 176, 58, 0.18); color: var(--amber); }

        .dl-batch { display: flex; gap: 8px; flex-wrap: wrap; }

        /* ---------- 列表 ---------- */
        .dl-list { display: flex; flex-direction: column; gap: 10px; }

        .dl-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 16px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .dl-row:hover { border-color: rgba(255, 176, 58, 0.3); }

        .dl-thumb {
          position: relative;
          flex: none;
          width: 52px;
          height: 68px;
          display: grid;
          place-items: center;
          border: 1px solid var(--line);
          border-radius: 8px;
          background:
            linear-gradient(160deg, color-mix(in srgb, var(--pc) 14%, transparent), transparent 60%),
            rgba(10, 14, 22, 0.7);
          color: var(--pc);
        }
        .dl-pp {
          position: absolute;
          right: -3px;
          bottom: -3px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--pc);
          box-shadow: 0 0 8px color-mix(in srgb, var(--pc) 70%, transparent);
          border: 2px solid #0d1320;
        }

        .dl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }

        .dl-title-line { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dl-title {
          flex: 1;
          min-width: 0;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--text);
        }

        .dl-progress { display: flex; align-items: center; gap: 12px; }
        .dl-bar {
          flex: 1;
          height: 5px;
          border-radius: 3px;
          background: rgba(148, 163, 190, 0.14);
          overflow: hidden;
        }
        .dl-bar-fill {
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, var(--amber-2), var(--amber));
          transition: width 0.6s ease;
        }
        .dl-bar-live { box-shadow: 0 0 10px rgba(255, 176, 58, 0.45); }
        .dl-pct {
          flex: none;
          width: 42px;
          text-align: right;
          font-family: var(--ff-mono);
          font-size: 11px;
          color: var(--amber);
        }

        .dl-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          font-family: var(--ff-mono);
          font-size: 10.5px;
          letter-spacing: 0.04em;
          color: var(--faint);
        }
        .dl-meta-live { color: var(--muted); }

        .dl-side {
          flex: none;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 9px;
        }
        .dl-status {
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: var(--ff-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--muted);
        }
        .dl-pulse { animation: dl-blink 1.4s ease-in-out infinite; }
        @keyframes dl-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .dl-actions { display: flex; gap: 6px; }

        .dl-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 60px 0;
          color: var(--faint);
        }
        .dl-empty p {
          margin: 0;
          font-family: var(--ff-mono);
          font-size: 11px;
          letter-spacing: 0.3em;
        }

        @media (max-width: 640px) {
          .dl-summary { display: none; }
          .dl-row { flex-wrap: wrap; }
          .dl-side { flex-direction: row; align-items: center; width: 100%; justify-content: space-between; }
        }
      `}</style>
    </div>
  )
}

export default Downloads
