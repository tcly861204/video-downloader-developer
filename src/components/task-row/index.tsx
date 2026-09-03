import { useCallback, useState, type CSSProperties } from 'react'
import { Clapperboard, FolderOpen, Pause, Play, RotateCw, Trash2 } from 'lucide-react'
import type { DownloadTask, TaskStatus } from '@/store/download'
import { formatBytes, formatEta, formatSpeed, formatTime } from '@/utils/format'
import { getFileExtension } from '@/utils/util'
import { QualitySelect } from '@/components/quality-select'
import styles from './index.module.scss'
import Preview from 'lyfa-preview'
import 'lyfa-preview/dist/style.min.css'

const STATUS_TEXT: Record<TaskStatus, string> = {
  queued: '排队中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

const PLATFORM_COLORS: Record<string, string> = {
  '哔哩哔哩': '#fb7299',
  'YouTube': '#ff4d5a',
  '抖音': '#25f4ee',
  '快手': '#ff6b3d',
  '好看视频': '#2e7cf6',
  '微博': '#ff6a5c',
  'Pornhub': '#ff9000',
  'TikTok': '#69c9ff',
  'Vimeo': '#1ab7ea',
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
  onQuality,
}: {
  task: DownloadTask
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onOpen: (id: string) => void
  onQuality: (id: string, label: string) => void
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const pct = task.size > 0 ? Math.min(100, Math.round((task.downloaded / task.size) * 100)) : 0
  const remaining = Math.max(0, task.size - task.downloaded)
  const color = PLATFORM_COLORS[task.platform] || 'var(--amber)'
  const isActive = task.status === 'downloading'
  // 多档位平台展示清晰度下拉；否则显示静态标签
  const hasQuality = !!task.qualityOptions && task.qualityOptions.length > 0
  // 有封面且加载成功 → 显示封面；否则回退到占位图标
  const showCover = !!task.cover && !coverFailed
  const onPriview = useCallback(() => {
    if (showCover) {
      new Preview({
        list: [
          {
            ext: getFileExtension(task.cover!) || 'jpeg',
            name: task.title,
            src: task.cover!,
          },
        ],
      }).display(0)
    }
  }, [showCover, task])

  return (
    <article className={styles.row}>
      <div className={styles.thumb} onClick={onPriview} style={{ '--pc': color } as CSSProperties}>
        {showCover ? (
          <img
            className={styles.cover}
            src={task.cover}
            alt=''
            loading='lazy'
            referrerPolicy='no-referrer'
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <Clapperboard size={18} strokeWidth={1.6} />
        )}
        <i className={styles.pp} aria-hidden />
      </div>

      <div className={styles.body}>
        <div className={styles.titleLine}>
          <h3 className={styles.title} title={task.title}>
            {task.title}
          </h3>
          {hasQuality ? (
            <QualitySelect
              value={task.quality}
              options={task.qualityOptions!}
              disabled={isActive}
              onChange={(label) => onQuality(task.id, label)}
            />
          ) : (
            <span className='s-tag'>{task.quality}</span>
          )}
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

        {task.status === 'failed' && task.error && (
          <p className={styles.error} title={task.error}>
            {task.error}
          </p>
        )}
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
            <button
              className='s-btn s-btn--icon s-btn--primary'
              title={task.status === 'queued' ? '下载' : '继续'}
              onClick={() => onResume(task.id)}
            >
              <Play size={14} />
            </button>
          ) : task.status === 'failed' ? (
            <button className='s-btn s-btn--icon' title='重试' onClick={() => onRetry(task.id)}>
              <RotateCw size={14} />
            </button>
          ) : (
            <button
              className='s-btn s-btn--icon'
              title='打开所在文件夹'
              onClick={() => onOpen(task.id)}
            >
              <FolderOpen size={14} />
            </button>
          )}
          <button
            className='s-btn s-btn--icon s-btn--danger'
            title='删除任务'
            onClick={() => onRemove(task.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}
