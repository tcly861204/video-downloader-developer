// Cloudflare Pages Function: /api/gate
// 客户端封禁检查接口。部署路径：functions/api/gate.js
//
// 客户端启动后和每 10 分钟 POST 一次：{ id, v, os }
//   id = 机器稳定 ID（Windows MachineGuid / macOS 硬件 UUID / Linux machine-id）
//
// 封禁状态存在 D1 数据库 db_framecatch 的 devices 表（一台设备一行）：
//   - is_banned = 1  → 该设备被禁用，返回 403，客户端弹窗后退出
//   - 查不到该设备记录 → 放行（从未上报或从未被封）
//
// 返回：
//   200 {"status":"ok"}                          → 放行
//   403 {"status":"blocked","reason":"..."}      → 封禁（客户端弹窗后退出）
//
// 封禁 / 解封：调用 functions/api/ban.js 管理接口（需配置 BAN_SECRET），
// 或在 D1 控制台操作 devices 表（SQL 见 launch.js 头注释）。

// 可选应急兜底：正常名单走数据库；这里可以再留几个"永久拉黑"的 ID，
// 即使 D1 查询出问题也能兜住。留空即可。
const BLOCKED = new Set([]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 解析客户端上报的设备 ID
  let id = null;
  try {
    const body = await request.json();
    id = typeof body?.id === "string" ? body.id : null;
  } catch (_) {
    // 请求体不是合法 JSON：按未知设备放行，避免误伤
  }

  // 1) 应急兜底集合
  if (id && BLOCKED.has(id)) {
    return blockedResponse("该设备已被禁止使用本软件，如有疑问请联系开发者。");
  }

  // 2) 数据库查询：devices 表该设备 is_banned=1 即封禁
  //    查询失败时放行（fail-open），避免服务器抖动误伤正常用户
  if (id && env.db_framecatch) {
    try {
      const row = await env.db_framecatch
        .prepare(
          `SELECT is_banned, ban_reason FROM devices
           WHERE device_id = ?1`
        )
        .bind(id)
        .first();
      if (row && row.is_banned === 1) {
        return blockedResponse(
          row.ban_reason || "该设备已被禁止使用本软件，如有疑问请联系开发者。"
        );
      }
    } catch (err) {
      console.error("gate: db query failed, fail-open:", err);
    }
  }

  return Response.json({ status: "ok" }, { headers: CORS_HEADERS });

  function blockedResponse(reason) {
    return Response.json(
      { status: "blocked", reason },
      { status: 403, headers: CORS_HEADERS }
    );
  }
}
