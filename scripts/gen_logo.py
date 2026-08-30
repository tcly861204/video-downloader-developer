# -*- coding: utf-8 -*-
"""生成 拾帧 · FRAMECATCH 品牌 logo（纯标准库，无 PIL 依赖）。

输出：
- src/assets/logo.png              256x256，头部 26x26 <img> 使用（高分屏清晰）
- src-tauri/icons/32x32.png        应用 bundle 图标
- src-tauri/icons/128x128.png
- src-tauri/icons/128x128@2x.png   256x256
- src-tauri/icons/icon.ico         32x32（PNG-in-ICO）
- src-tauri/icons/icon.icns        128 + 256（PNG chunks，macOS 打包用）

设计：深墨蓝圆角底 + 琥珀播放三角 + 高亮琥珀错位重影 + 取景框内环 + 暗角，
延续「深墨蓝 + 琥珀」HUD 广播台风格，与 src/styles/theme.scss 变量同源。

用法: python scripts/gen_logo.py
"""
import math
import os
import struct
import zlib

# ---------- 品牌色（对齐 theme.scss） ----------
BG = (20, 26, 43)          # 深墨蓝 #141a2b
AMBER = (255, 176, 58)     # --amber   #ffb03a  主三角
AMBER2 = (255, 203, 122)   # --amber-2 #ffcb7a  高亮重影

RADIUS_RATIO = 0.22
SS = 4  # 4x 超采样抗锯齿


def sd_round_rect(px, py, hw, hh, r):
    """到圆角矩形轮廓的有符号距离（负值在内部）。px/py 相对中心。"""
    qx = abs(px) - (hw - r)
    qy = abs(py) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    d = math.hypot(ax, ay)
    return d + min(max(qx, qy), 0.0) - r


def in_triangle(px, py, v1, v2, v3):
    """重心坐标法判断点是否在三角形内"""
    d = (v2[1] - v3[1]) * (v1[0] - v3[0]) + (v3[0] - v2[0]) * (v1[1] - v3[1])
    if d == 0:
        return False
    a = ((v2[1] - v3[1]) * (px - v3[0]) + (v3[0] - v2[0]) * (py - v3[1])) / d
    b = ((v3[1] - v1[1]) * (px - v3[0]) + (v1[0] - v3[0]) * (py - v3[1])) / d
    c = 1 - a - b
    return a >= 0 and b >= 0 and c >= 0


def lerp(c, target, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c, target))


def render(size):
    """渲染 RGBA 像素，返回 bytes"""
    big = size * SS
    hw = big * 0.44                     # 圆角矩形半宽（四周留 6% 内缩）
    hh = big * 0.44
    radius = big * RADIUS_RATIO
    # 播放三角顶点（相对中心，y 向下为正）
    tri = [
        (-0.15 * big, -0.22 * big),
        (0.24 * big, 0.0),
        (-0.15 * big, 0.22 * big),
    ]
    ghost = (0.025 * big, 0.025 * big)  # 高亮琥珀重影偏移
    ring = big * 0.012                  # 取景框内环描边宽度

    acc = [[0, 0, 0, 0] for _ in range(size * size)]
    for y in range(big):
        for x in range(big):
            # 圆角矩形裁剪（超采样点硬裁切，靠 SS 抗锯齿）
            cx = min(x, big - 1 - x) + 0.5
            cy = min(y, big - 1 - y) + 0.5
            if cx < radius and cy < radius:
                dx = radius - cx
                dy = radius - cy
                if dx * dx + dy * dy > radius * radius:
                    continue
            px, py = x - big / 2 + 0.5, y - big / 2 + 0.5

            color = BG
            # 重影（高亮琥珀）先画，主三角盖在其上 → 错位叠影效果
            if in_triangle(px - ghost[0], py - ghost[1], *tri):
                color = AMBER2
            if in_triangle(px, py, *tri):
                color = AMBER
            # 取景框内环：距圆角矩形轮廓半描边宽度内，琥珀混色
            if abs(sd_round_rect(px, py, hw, hh, radius)) < ring / 2:
                color = lerp(color, AMBER, 0.45)
            # 暗角：边缘轻微压暗，增加纵深
            v = math.hypot(px, py) / (big * 0.5)
            f = 1.0 - 0.15 * v * v
            color = tuple(int(round(c * f)) for c in color)

            sx, sy = x // SS, y // SS
            cell = acc[sy * size + sx]
            cell[0] += color[0]
            cell[1] += color[1]
            cell[2] += color[2]
            cell[3] += 255

    n = SS * SS
    out = bytearray()
    for r, g, b, a in acc:
        out += bytes((r // n, g // n, b // n, a // n))
    return bytes(out)


def png_bytes(w, h, rgba):
    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico_bytes(png32):
    """把 32x32 PNG 包装成 .ico（Vista+ 支持 PNG-in-ICO）"""
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(png32), 6 + 16)
    return header + entry + png32


def icns_bytes(chunks):
    """把 (type, png) 列表包装成 .icns（PNG chunks，macOS 10.7+ 支持）"""
    data = b"".join(struct.pack(">4sI", t, len(png) + 8) + png for t, png in chunks)
    return b"icns" + struct.pack(">I", len(data) + 8) + data


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets = os.path.join(root, "src", "assets")
    icons = os.path.join(root, "src-tauri", "icons")
    os.makedirs(assets, exist_ok=True)
    os.makedirs(icons, exist_ok=True)

    png32 = png_bytes(32, 32, render(32))
    png128 = png_bytes(128, 128, render(128))
    png256 = png_bytes(256, 256, render(256))

    targets = [
        (os.path.join(assets, "logo.png"), png256),
        (os.path.join(icons, "32x32.png"), png32),
        (os.path.join(icons, "128x128.png"), png128),
        (os.path.join(icons, "128x128@2x.png"), png256),
    ]
    for path, data in targets:
        with open(path, "wb") as f:
            f.write(data)
        print(f"written: {path} ({len(data)} bytes)")

    with open(os.path.join(icons, "icon.ico"), "wb") as f:
        f.write(ico_bytes(png32))
    print("written: icon.ico")

    with open(os.path.join(icons, "icon.icns"), "wb") as f:
        f.write(icns_bytes([(b"ic07", png128), (b"ic08", png256)]))
    print("written: icon.icns")


if __name__ == "__main__":
    main()
