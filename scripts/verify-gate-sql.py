"""本地模拟 D1 验证双表方案的 SQL 逻辑（launch / gate / ban 全链路）。"""
import sqlite3

DB = ":memory:"

# 与 launch.js 头注释一致的建表 SQL
SCHEMA = """
CREATE TABLE IF NOT EXISTS launch_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    v          TEXT NOT NULL,
    os         TEXT NOT NULL,
    device_id  TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_launch_device_id  ON launch_events(device_id);
CREATE INDEX IF NOT EXISTS idx_launch_created_at ON launch_events(created_at);

CREATE TABLE IF NOT EXISTS devices (
    device_id    TEXT PRIMARY KEY,
    is_banned    INTEGER NOT NULL DEFAULT 0,
    ban_reason   TEXT,
    banned_at    TEXT,
    last_seen_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_devices_is_banned ON devices(is_banned);
"""

DEV = "11111111-2222-3333-4444-555555555555"

con = sqlite3.connect(DB)
con.executescript(SCHEMA)


def run(title, sql, params=()):
    cur = con.execute(sql, params)
    con.commit()
    print(f"[OK] {title}")
    return cur


def query(sql, params=()):
    return con.execute(sql, params).fetchall()


# 1) launch 事件：batch 的两条语句
run("launch: 插入事件行", "INSERT INTO launch_events (v, os, device_id) VALUES (?, ?, ?)", ("0.1.0", "windows", DEV))
run("launch: devices 首次插入(带 last_seen_at)",
    "INSERT INTO devices (device_id, last_seen_at, created_at) VALUES (?1, datetime('now','localtime'), datetime('now','localtime')) ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at", (DEV,))

# 2) 启动 10 次，事件行累积、devices 仍只有一行
for i in range(9):
    run(f"launch: 第 {i+2} 次启动事件", "INSERT INTO launch_events (v, os, device_id) VALUES (?, ?, ?)", ("0.1.0", "windows", DEV))
    run("launch: devices upsert last_seen_at",
        "INSERT INTO devices (device_id, last_seen_at, created_at) VALUES (?1, datetime('now','localtime'), datetime('now','localtime')) ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at", (DEV,))

assert len(query("SELECT COUNT(*) FROM launch_events")) == 1 and query("SELECT COUNT(*) FROM launch_events")[0][0] == 10, "事件表应有 10 行"
assert query("SELECT COUNT(*) FROM devices")[0][0] == 1, "devices 应只有 1 行"
print(f"[OK] 事件表 {query('SELECT COUNT(*) FROM launch_events')[0][0]} 行 / devices {query('SELECT COUNT(*) FROM devices')[0][0]} 行")

# 3) gate 查询：未封禁 → 放行
row = query("SELECT is_banned, ban_reason FROM devices WHERE device_id = ?", (DEV,))
assert row and row[0][0] == 0, "未封禁应 is_banned=0"
print(f"[OK] gate 判定: is_banned={row[0][0]} → 放行")

# 4) ban 封禁（UPSERT，覆盖未上报过的新设备也能生效）
NEW_DEV = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
run("ban: 封禁 DEV（已存在，更新状态）",
    "INSERT INTO devices (device_id, is_banned, ban_reason, banned_at) VALUES (?1, 1, ?2, datetime('now','localtime')) ON CONFLICT(device_id) DO UPDATE SET is_banned = 1, ban_reason = excluded.ban_reason, banned_at = excluded.banned_at",
    (DEV, "违规使用"))
run("ban: 封禁 NEW_DEV（从未上报，直接建行）",
    "INSERT INTO devices (device_id, is_banned, ban_reason, banned_at) VALUES (?1, 1, ?2, datetime('now','localtime')) ON CONFLICT(device_id) DO UPDATE SET is_banned = 1, ban_reason = excluded.ban_reason, banned_at = excluded.banned_at",
    (NEW_DEV, "违规使用"))

# 5) gate 查询：DEV 已被封 → 拦截；正常设备 → 放行
row = query("SELECT is_banned, ban_reason FROM devices WHERE device_id = ?", (DEV,))
assert row and row[0][0] == 1, "封禁后 is_banned 应为 1"
print(f"[OK] gate 判定 DEV: is_banned={row[0][0]} reason={row[0][1]} → 403 拦截")
row = query("SELECT is_banned, ban_reason FROM devices WHERE device_id = ?", (NEW_DEV,))
assert row and row[0][0] == 1, "新设备封禁后 is_banned 应为 1"
print(f"[OK] gate 判定 NEW_DEV（未上报过）: is_banned={row[0][0]} → 403 拦截")
ok_dev = "ffffffff-0000-1111-2222-333333333333"
assert not query("SELECT is_banned FROM devices WHERE device_id = ?", (ok_dev,)), "查无记录应放行"
print("[OK] gate 判定未登记设备: 无记录 → 200 放行")

# 6) 封禁后再启动：launch 只刷 last_seen_at，不覆盖 is_banned
run("launch: 被封设备再次启动（事件+upsert）", "INSERT INTO launch_events (v, os, device_id) VALUES (?, ?, ?)", ("0.1.0", "windows", DEV))
run("launch: upsert（不应覆盖 is_banned）",
    "INSERT INTO devices (device_id, last_seen_at, created_at) VALUES (?1, datetime('now','localtime'), datetime('now','localtime')) ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at", (DEV,))
row = query("SELECT is_banned, last_seen_at FROM devices WHERE device_id = ?", (DEV,))
assert row[0][0] == 1, "启动不应冲掉封禁状态"
assert row[0][1], "last_seen_at 应已刷新"
print(f"[OK] 被封设备启动后 is_banned 仍为 {row[0][0]}，last_seen_at 已刷新")

# 7) 解封
run("ban: 解封 DEV",
    "UPDATE devices SET is_banned = 0, ban_reason = NULL, banned_at = NULL WHERE device_id = ?", (DEV,))
row = query("SELECT is_banned, ban_reason, banned_at FROM devices WHERE device_id = ?", (DEV,))
assert row[0] == (0, None, None), f"解封后应为 (0, None, None)，实际 {row[0]}"
print(f"[OK] 解封后 is_banned={row[0][0]} ban_reason={row[0][1]} banned_at={row[0][2]} → 恢复放行")

print("\n全部断言通过：双表方案逻辑正确")
