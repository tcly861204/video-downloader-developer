// 接收 FRAMECATCH 应用启动埋点：POST /api/launch，body 形如 { v, os, id }
//
// 首次部署需在 D1 数据库 db_framecatch 上执行一次建表 SQL：
// CREATE TABLE IF NOT EXISTS launch_events (
//     id         INTEGER PRIMARY KEY AUTOINCREMENT,
//     v          TEXT NOT NULL,
//     os         TEXT NOT NULL,
//     device_id  TEXT NOT NULL,
//     created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
// );
// CREATE INDEX IF NOT EXISTS idx_launch_device_id  ON launch_events(device_id);
// CREATE INDEX IF NOT EXISTS idx_launch_created_at ON launch_events(created_at);

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
