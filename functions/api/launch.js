// 接收 FRAMECATCH 应用启动埋点：POST /api/launch，body 形如 { v, os, id }
//
// 首次部署需在 D1 数据库 db_framecatch 上执行一次建表 SQL：
// CREATE TABLE IF NOT EXISTS launch_events (
//     id         INTEGER PRIMARY KEY AUTOINCREMENT,
//     v          TEXT NOT NULL,
//     os         TEXT NOT NULL,
//     device_id  TEXT NOT NULL,
//     is_banned  INTEGER NOT NULL DEFAULT 0,   -- 封禁标记：0=正常，1=禁用
//     ban_reason TEXT,                          -- 封禁原因（gate 弹窗里展示）
//     banned_at  TEXT,                          -- 封禁时间
//     created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
// );
// CREATE INDEX IF NOT EXISTS idx_launch_device_id  ON launch_events(device_id);
// CREATE INDEX IF NOT EXISTS idx_launch_created_at ON launch_events(created_at);
//
// 如果是已建好的旧表，只需执行一次迁移（加三个字段）：
// ALTER TABLE launch_events ADD COLUMN is_banned  INTEGER NOT NULL DEFAULT 0;
// ALTER TABLE launch_events ADD COLUMN ban_reason TEXT;
// ALTER TABLE launch_events ADD COLUMN banned_at  TEXT;
//
// 封禁 / 解封不要手工改代码，用 functions/api/ban.js 管理接口，或在 D1 控制台执行：
//   封禁：UPDATE launch_events SET is_banned=1, ban_reason='原因', banned_at=datetime('now','localtime') WHERE device_id='<设备ID>';
//   解封：UPDATE launch_events SET is_banned=0, ban_reason=NULL, banned_at=NULL WHERE device_id='<设备ID>';
//
// 注意：本表是事件表，每次启动插一行。封禁判定在 gate 接口里按「该设备存在任一
// is_banned=1 的行」判断，所以这里新插入的行默认 is_banned=0 是安全的。

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

    await env.db_framecatch
      .prepare('INSERT INTO launch_events (v, os, device_id) VALUES (?1, ?2, ?3)')
      .bind(v, os, id)
      .run()

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
