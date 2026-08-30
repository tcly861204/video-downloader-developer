import type { CSSProperties } from 'react'
import { Clapperboard, FolderOpen, Pause, Play, RotateCw, Trash2 } from 'lucide-react'
import type { DownloadTask, TaskStatus } from '@/store/download'
import { formatBytes, formatEta, formatSpeed, formatTime } from '@/utils/format'
import styles from './index.module.scss'

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
      return `s-dot s-dot--amber ${styles.pulse}`
    case 'completed':
      return 's-dot s-dot--ok'
    case 'failed':
      return 's-dot s-dot--red'
    default:
      return 's-dot s-dot--muted'
  }
}

export function TaskRow({
  task,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpen,
}: {
  task: DownloadTask
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onOpen: (id: string) => void
}) {
  const pct = task.size > 0 ? Math.min(100, Math.round((task.downloaded / task.size) * 100)) : 0
  const remaining = Math.max(0, task.size - task.downloaded)
  const color = PLATFORM_COLORS[task.platform] || 'var(--amber)'
  const isActive = task.status === 'downloading'

  return (
    <article className={styles.row}>
      <div className={styles.thumb} style={{ '--pc': color } as CSSProperties}>
        <Clapperboard size={18} strokeWidth={1.6} />
        <i className={styles.pp} aria-hidden />
      </div>

      <div className={styles.body}>
        <div className={styles.titleLine}>
          <h3 className={styles.title} title={task.title}>
            {task.title}
          </h3>
          <span className='s-tag'>{task.quality}</span>
        </div>

        <div className={styles.progress}>
          <div className={styles.bar} aria-hidden>
            <div
              className={isActive ? `${styles.barFill} ${styles.barLive}` : styles.barFill}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={styles.pct}>{pct}%</span>
        </div>

        <div className={styles.meta}>
          <span>{task.platform}</span>
          <span>{formatTime(task.createdAt)}</span>
          <span>
            {formatBytes(task.downloaded)} / {formatBytes(task.size)}
          </span>
          {isActive && (
            <span className={styles.metaLive}>
              {formatSpeed(task.speed)} · 剩余 {formatEta(remaining, task.speed)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.side}>
        <div className={styles.status}>
          <span className={statusDot(task.status)} aria-hidden />
          <span>{STATUS_TEXT[task.status]}</span>
        </div>
        <div className={styles.actions}>
          {task.status === 'downloading' ? (
            <button className='s-btn s-btn--icon' title='暂停' onClick={() => onPause(task.id)}>
              <Pause size={14} />
            </button>
          ) : task.status === 'paused' || task.status === 'queued' ? (
            <button className='s-btn s-btn--icon s-btn--primary' title='继续' onClick={() => onResume(task.id)}>
              <Play size={14} />
            </button>
          ) : task.status === 'failed' ? (
            <button className='s-btn s-btn--icon' title='重试' onClick={() => onRetry(task.id)}>
              <RotateCw size={14} />
            </button>
          ) : (
            <button className='s-btn s-btn--icon' title='打开所在文件夹' onClick={() => onOpen(task.id)}>
              <FolderOpen size={14} />
            </button>
          )}
          <button className='s-btn s-btn--icon s-btn--danger' title='删除任务' onClick={() => onRemove(task.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}
