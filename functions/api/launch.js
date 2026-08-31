// 接收 FRAMECATCH 应用启动埋点：POST /api/launch，body 形如 { v, os, id }
//
// 首次部署需在 D1 数据库 db_framecatch 上执行一次建表 SQL：
// -- 事件表：每次启动一条，只做统计
// CREATE TABLE IF NOT EXISTS launch_events (
//     id         INTEGER PRIMARY KEY AUTOINCREMENT,
//     v          TEXT NOT NULL,
//     os         TEXT NOT NULL,
//     device_id  TEXT NOT NULL,
//     created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
// );
// CREATE INDEX IF NOT EXISTS idx_launch_device_id  ON launch_events(device_id);
// CREATE INDEX IF NOT EXISTS idx_launch_created_at ON launch_events(created_at);
//
// -- 设备表：一台设备一行，封禁状态存这里（gate 的判断依据）
// CREATE TABLE IF NOT EXISTS devices (
//     device_id    TEXT PRIMARY KEY,
//     is_banned    INTEGER NOT NULL DEFAULT 0,   -- 0=正常 1=禁用
//     ban_reason   TEXT,                          -- 封禁原因（gate 弹窗里展示）
//     banned_at    TEXT,                          -- 封禁时间
//     last_seen_at TEXT,                          -- 最近一次启动时间（看活跃度用）
//     created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
// );
// CREATE INDEX IF NOT EXISTS idx_devices_is_banned ON devices(is_banned);
//
// 旧版本迁移：如果之前给 launch_events 加过 is_banned/ban_reason/banned_at 字段，
// 新方案已不再读取它们（可忽略，不影响）。曾封禁过的设备可选迁移到 devices 表：
// INSERT INTO devices (device_id, is_banned, ban_reason, banned_at)
// SELECT device_id, 1, MAX(ban_reason), MAX(banned_at) FROM launch_events
// WHERE is_banned = 1 GROUP BY device_id;
//
// 封禁 / 解封用 functions/api/ban.js 管理接口，或直接在 D1 控制台操作 devices 表：
//   封禁：INSERT INTO devices (device_id, is_banned, ban_reason, banned_at)
//         VALUES ('<设备ID>', 1, '原因', datetime('now','localtime'))
//         ON CONFLICT(device_id) DO UPDATE SET is_banned=1, ban_reason=excluded.ban_reason, banned_at=excluded.banned_at;
//   解封：UPDATE devices SET is_banned=0, ban_reason=NULL, banned_at=NULL WHERE device_id='<设备ID>';
//
// 本接口每次启动同时写两张表（batch 原子提交）：
//   launch_events 记一条事件；devices 刷新 last_seen_at——
//   注意绝不覆盖 is_banned，封禁状态不会被用户再次启动冲掉。

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const { v, os, id } = body || {}

    if (
      typeof v !== 'string' ||
      v.length === 0 ||
      typeof os !== 'string' ||
      os.length === 0 ||
      typeof id !== 'string' ||
      id.length === 0
    ) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 匿名设备 ID 应为 UUID 格式，拒绝明显乱写的垃圾数据
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid device id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 同时写两张表（batch 原子提交）：
    // 1) launch_events 记一条启动事件（统计用）
    // 2) devices 刷新最近活跃时间；绝不覆盖 is_banned，封禁状态不被启动冲掉
    await env.db_framecatch.batch([
      env.db_framecatch
        .prepare('INSERT INTO launch_events (v, os, device_id) VALUES (?1, ?2, ?3)')
        .bind(v, os, id),
      env.db_framecatch
        .prepare(
          `INSERT INTO devices (device_id, last_seen_at, created_at)
           VALUES (?1, datetime('now','localtime'), datetime('now','localtime'))
           ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
        )
        .bind(id),
    ])

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
