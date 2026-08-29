const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  const n = Math.max(0, bytes || 0)
  if (n === 0) return '0 B'
  let value = n
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatEta(bytes: number, bytesPerSec: number): string {
  if (bytes <= 0 || bytesPerSec <= 0) return '--:--'
  const secs = Math.round(bytes / bytesPerSec)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (v: number) => v.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
