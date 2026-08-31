// Cloudflare Pages Function: /api/ban
// 管理接口：封禁 / 解封某台设备。部署路径：functions/api/ban.js
//
// 先决条件：在 Cloudflare 控制台给该 Pages 项目配置环境变量 BAN_SECRET（管理密码）。
//
// 请求：
//   POST /api/ban
//   Content-Type: application/json
//   {
//     "secret": "<BAN_SECRET>",
//     "id":     "<设备ID>",
//     "action": "ban" | "unban",
//     "reason": "违规使用"        // 可选，仅 ban 时需要，会显示在对方弹窗里
//   }
//
// 示例：
//   curl -X POST https://<你的域名>/api/ban \
//     -H "Content-Type: application/json" \
//     -d '{"secret":"mypassword","id":"3f2a8c5e-6d4b-4a9f-9e0d-2c1b7a8f4e6d","action":"ban","reason":"未授权使用"}'
//
// 效果：
//   ban    → 对方下次启动或 10 分钟内被弹窗踢出
//   unban  → 恢复正常使用
//
// 说明：封禁状态存在 launch_events 表的 is_banned 字段（见 launch.js 头注释）。
// 若该设备从未上报过埋点（查无此人），会自动插入一条占位记录，保证封禁立即生效。

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    body = null;
  }
  const { secret, id, action, reason } = body || {};

  // 校验管理密码
  if (!env.BAN_SECRET) {
    return Response.json(
      { success: false, error: "BAN_SECRET 未配置，请在 Cloudflare 控制台为该 Pages 项目添加环境变量" },
      { status: 500 }
    );
  }
  if (secret !== env.BAN_SECRET) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // 校验参数
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    (action !== "ban" && action !== "unban")
  ) {
    return Response.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const db = env.db_framecatch;
  if (!db) {
    return Response.json(
      { success: false, error: "D1 数据库绑定 db_framecatch 未配置" },
      { status: 500 }
    );
  }

  const banReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;

  if (action === "ban") {
    // 封禁：该设备所有历史行都标记为 1（gate 判定"存在任一封禁行"即拦截）
    const info = await db
      .prepare(
        `UPDATE launch_events
         SET is_banned = 1, ban_reason = ?2, banned_at = datetime('now','localtime')
         WHERE device_id = ?1`
      )
      .bind(id, banReason)
      .run();

    // 该设备从未上报过 → 插入一条占位记录，保证封禁立即生效
    if (info.meta.changes === 0) {
      await db
        .prepare(
          `INSERT INTO launch_events (v, os, device_id, is_banned, ban_reason, banned_at)
           VALUES ('0.0.0', 'manual', ?1, 1, ?2, datetime('now','localtime'))`
        )
        .bind(id, banReason)
        .run();
    }
  } else {
    // 解封：所有行置 0
    await db
      .prepare(
        `UPDATE launch_events
         SET is_banned = 0, ban_reason = NULL, banned_at = NULL
         WHERE device_id = ?1`
      )
      .bind(id)
      .run();
  }

  return Response.json({ success: true, action, id });
}
