// 本地 mock 服务器，用于开发环境测试封禁/埋点链路，不依赖线上服务。
//
// 用法：
//   1. 启动 mock：  node scripts/mock-gate.js
//      - POST /api/launch → 200（模拟埋点接收，打印 v/os/id）
//      - POST /api/gate   → 默认 403 blocked（方便直接看弹窗效果）；
//        设置 MOCK_MODE=ok 则放行：MOCK_MODE=ok node scripts/mock-gate.js
//      换端口：PORT=9000 node scripts/mock-gate.js
//   2. 另开一个终端启动 Tauri dev（Windows 示例，PowerShell）：
//      $env:FRAMECATCH_GATE_ENABLE="1"
//      $env:FRAMECATCH_GATE_URL="http://127.0.0.1:8787/api/gate"
//      $env:FRAMECATCH_ANALYTICS_ENABLE="1"
//      $env:FRAMECATCH_TRACKING_URL="http://127.0.0.1:8787/api/launch"
//      $env:FRAMECATCH_GATE_DEBUG="1"
//      $env:FRAMECATCH_ANALYTICS_DEBUG="1"
//      npm run tauri dev
//   3. 应用启动后 mock 终端会打印两次请求（launch + gate），
//      约 1 秒后弹出"访问受限"对话框，确认后退出 → 封禁链路生效
//
// 提示：device_id 会在 mock 终端打印出来，可直接拿去测试线上 ban 接口。

import http from "node:http";

const port = Number(process.env.PORT || 8787);
const mode = process.env.MOCK_MODE || "blocked"; // blocked | ok

function readJson(req, cb) {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    try {
      cb(JSON.parse(raw));
    } catch {
      cb(null);
    }
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (req.method === "POST" && urlPath === "/api/launch") {
    readJson(req, (body) => {
      const { v = "?", os = "?", id = "?" } = body || {};
      console.log(`[mock-gate] POST /api/launch v=${v} os=${os} id=${id} -> ok`);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/gate") {
    readJson(req, (body) => {
      const id = body?.id || "?";
      console.log(`[mock-gate] POST /api/gate id=${id} -> ${mode}`);
      res.writeHead(mode === "blocked" ? 403 : 200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        mode === "blocked"
          ? JSON.stringify({
              status: "blocked",
              reason: "开发环境测试：模拟该设备已被禁用",
            })
          : JSON.stringify({ status: "ok" }),
      );
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-gate listening on http://127.0.0.1:${port} (mode=${mode})`);
  console.log("  /api/gate   封禁检查  /api/launch  埋点上报");
  console.log("按 Ctrl+C 停止");
});
