import { useState } from 'react'
import { Check, Clapperboard, Heart, MessageCircle } from 'lucide-react'
import type { PostItem } from '@/api/video'
import styles from './index.module.scss'

/** 毫秒 → m:ss */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return ''
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** 数量缩写：1.2万 / 3456 */
function compact(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** 封面图：加载失败或缺失时回退到占位图标 */
function CoverImg({ cover }: { cover: string }) {
  const [failed, setFailed] = useState(false)
  if (!cover || failed) return <Clapperboard size={22} strokeWidth={1.5} />
  return (
    <img
      src={cover}
      alt=''
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={() => setFailed(true)}
    />
  )
}

/**
 * 主页作品网格：封面 + 时长 + 标题 + 数据 + 勾选。
 * 纯展示组件，勾选状态由父级持有。
 */
export function PostGrid({
  posts,
  selected,
  onToggle,
  onToggleAll,
}: {
  posts: PostItem[]
  selected: ReadonlySet<string>
  onToggle: (awemeId: string) => void
  onToggleAll: () => void
}) {
  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.awemeId))

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <p className='s-kicker'>// POSTS · {posts.length}</p>
        <button className='s-btn s-btn--ghost' onClick={onToggleAll}>
          <Check size={14} />
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>

      <div className={styles.grid}>
        {posts.map((p) => {
          const isSel = selected.has(p.awemeId)
          return (
            <button
              key={p.awemeId}
              type='button'
              aria-pressed={isSel}
              className={isSel ? `${styles.card} ${styles.cardSel}` : styles.card}
              onClick={() => onToggle(p.awemeId)}
            >
              <div className={styles.thumb}>
                <CoverImg cover={p.cover} />
                <i className={styles.dur}>{formatDuration(p.durationMs)}</i>
                <i className={styles.ring} aria-hidden />
                {isSel && (
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                )}
              </div>
              <h4 className={styles.title}>{p.desc || '抖音视频'}</h4>
              <div className={styles.stats}>
                <span>
                  <Heart size={11} />
                  {compact(p.diggCount)}
                </span>
                <span>
                  <MessageCircle size={11} />
                  {compact(p.commentCount)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
