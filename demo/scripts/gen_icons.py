# -*- coding: utf-8 -*-
"""生成应用图标：32x32.png / 128x128.png / 128x128@2x.png / icon.ico
纯标准库实现（无 PIL 依赖），圆角深色底 + 抖音风格播放三角。
用法: python gen_icons.py <输出目录>
"""
import os
import struct
import sys
import zlib

BG = (22, 24, 35)        # #161823
ACCENT = (254, 44, 85)   # #fe2c55
CYAN = (37, 244, 238)    # #25f4ee
RADIUS_RATIO = 0.22
SS = 4  # 4x 超采样抗锯齿


def in_triangle(px, py, v1, v2, v3):
    """重心坐标法判断点是否在三角形内"""
    d = (v2[1] - v3[1]) * (v1[0] - v3[0]) + (v3[0] - v2[0]) * (v1[1] - v3[1])
    if d == 0:
        return False
    a = ((v2[1] - v3[1]) * (px - v3[0]) + (v3[0] - v2[0]) * (py - v3[1])) / d
    b = ((v3[1] - v1[1]) * (px - v3[0]) + (v1[0] - v3[0]) * (py - v3[1])) / d
    c = 1 - a - b
    return a >= 0 and b >= 0 and c >= 0


def render(size):
    """渲染 RGBA 像素，返回 bytes"""
    big = size * SS
    radius = big * RADIUS_RATIO
    # 播放三角形顶点（相对中心，y 向下为正）
    tri = [
        (-0.13 * big, -0.20 * big),
        (0.22 * big, 0.0),
        (-0.13 * big, 0.20 * big),
    ]
    # 抖音错位重影效果：青色与红色三角轻微偏移
    offsets = [(CYAN, -0.015 * big, -0.015 * big), (ACCENT, 0.015 * big, 0.015 * big)]

    acc = [[0, 0, 0, 0] for _ in range(size * size)]
    for y in range(big):
        for x in range(big):
            # 圆角矩形裁剪
            cx = min(x, big - 1 - x) + 0.5
            cy = min(y, big - 1 - y) + 0.5
            inside = True
            if cx < RADIUS_RATIO * big and cy < RADIUS_RATIO * big:
                dx = RADIUS_RATIO * big - cx
                dy = RADIUS_RATIO * big - cy
                inside = dx * dx + dy * dy <= radius * radius
            if not inside:
                continue
            px, py = x - big / 2 + 0.5, y - big / 2 + 0.5
            color = None
            for c, ox, oy in offsets:
                shifted = [(vx + ox, vy + oy) for vx, vy in tri]
                if in_triangle(px, py, *shifted):
                    color = c
            r, g, b = color if color else BG
            sx, sy = x // SS, y // SS
            cell = acc[sy * size + sx]
            cell[0] += r
            cell[1] += g
            cell[2] += b
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


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)
    targets = [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")]
    png32 = None
    for size, name in targets:
        data = png_bytes(size, size, render(size))
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(data)
        print(f"written: {name} ({len(data)} bytes)")
        if size == 32:
            png32 = data
    with open(os.path.join(out_dir, "icon.ico"), "wb") as f:
        f.write(ico_bytes(png32))
    print("written: icon.ico")


if __name__ == "__main__":
    main()
