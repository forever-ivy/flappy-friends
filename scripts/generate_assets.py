#!/usr/bin/env python3
"""从 resource/ 源素材生成 public/assets/game/ 下的全部游戏资产。

用法：python3 scripts/generate_assets.py
依赖：Pillow（pip install pillow）

产物（逻辑 1x 尺寸，与画布渲染分辨率一致，物理参数零改动）：
  character-{nova,moss,sol,violet}.png  72x72   透明背景，头朝右
  obstacle.png / obstacle-top.png       76x480  底柱 / 顶柱（文字均正向可读）
  reward.png                            48x48   蝴蝶结叉子
  background-sky.png                    960x640 静态天空层
  background-city.png                   720x640 中景视差层（无缝平铺）
  background-street.png                 720x180 街面层（无缝平铺，24/9/111/36 四段结构）
"""
from __future__ import annotations

import math
import os
from collections import deque

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'resource')
OUT = os.path.join(ROOT, 'public', 'assets', 'game')

# ---- 调色板（均采样自 resource/*.jpg） ----
SKY_TOP = (172, 223, 255)
SKY_MID = (205, 238, 255)
SKY_LOW = (224, 246, 255)
GRASS_LIGHT = (198, 255, 152)
GRASS_MID = (177, 250, 116)
GRASS_EDGE = (126, 200, 86)
GRASS_MARK = (120, 192, 80)
HILL_FAR = (208, 244, 164)
HILL_FAR_EDGE = (166, 218, 122)
CANOPY = (252, 218, 234)
CANOPY_HI = (255, 233, 243)
CANOPY_OUTLINE = (198, 112, 122)
FLOWER = (255, 184, 208)
FLOWER_CORE = (236, 128, 166)
TRUNK = (174, 118, 90)
TRUNK_OUTLINE = (126, 72, 52)
PETAL = (254, 201, 222)
PETAL_OUTLINE = (216, 132, 152)
CLOUD = (255, 255, 255)
BARRIER_PINK = (255, 183, 220)
BARRIER_PINK_DEEP = (247, 162, 206)
BARRIER_OUTLINE = (162, 76, 74)
BUSH = (166, 240, 122)
BUSH_OUTLINE = (116, 188, 80)
HEDGE = (158, 232, 116)
DIVIDER = (108, 158, 88)
PATH = (251, 238, 224)
PATH_EDGE = (208, 174, 152)
PEBBLE = (236, 216, 198)
FENCE = (255, 250, 252)
FENCE_OUTLINE = (214, 158, 172)


# ---------------------------------------------------------------- 工具

def flood_alpha(img: Image.Image, tol: int = 42) -> Image.Image:
    """把与边框连通的近白背景变透明（jpg 白底抠图）。"""
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    visited = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    def near_white(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return r > 255 - tol and g > 255 - tol and b > 255 - tol

    for x in range(w):
        for y in (0, h - 1):
            if near_white(x, y) and not visited[y * w + x]:
                visited[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(x, y) and not visited[y * w + x]:
                visited[y * w + x] = 1
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and near_white(nx, ny):
                visited[ny * w + nx] = 1
                queue.append((nx, ny))

    alpha = Image.new('L', (w, h), 255)
    alpha.putdata([0 if visited[i] else 255 for i in range(w * h)])
    # 吃掉白边并柔化边缘
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out


def largest_component(img: Image.Image) -> Image.Image:
    """只保留 alpha 最大的连通块（去掉裁切残片）。1/4 分辨率标记以提速。"""
    w, h = img.size
    sw, sh = max(1, w // 4), max(1, h // 4)
    small = img.getchannel('A').resize((sw, sh), Image.BILINEAR)
    px = small.load()
    labels = [0] * (sw * sh)
    best_label, best_size, next_label = 0, 0, 0
    for sy in range(sh):
        for sx in range(sw):
            if px[sx, sy] > 16 and not labels[sy * sw + sx]:
                next_label += 1
                size = 0
                queue = deque([(sx, sy)])
                labels[sy * sw + sx] = next_label
                while queue:
                    x, y = queue.popleft()
                    size += 1
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        if 0 <= nx < sw and 0 <= ny < sh and px[nx, ny] > 16 and not labels[ny * sw + nx]:
                            labels[ny * sw + nx] = next_label
                            queue.append((nx, ny))
                if size > best_size:
                    best_size, best_label = size, next_label
    mask_small = Image.new('L', (sw, sh), 0)
    mask_small.putdata([255 if v == best_label else 0 for v in labels])
    mask = mask_small.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.NEAREST)
    alpha = Image.composite(img.getchannel('A'), Image.new('L', (w, h), 0), mask)
    out = img.copy()
    out.putalpha(alpha)
    return out


def alpha_bbox(img: Image.Image, thr: int = 12) -> tuple[int, int, int, int]:
    mask = img.getchannel('A').point(lambda v: 255 if v > thr else 0)
    box = mask.getbbox()
    assert box is not None, 'empty alpha'
    return box


def split_pair(img: Image.Image) -> tuple[Image.Image, Image.Image]:
    """双人图从人物间 alpha 最薄的一列切开。"""
    w, h = img.size
    alpha = img.getchannel('A')
    data = list(alpha.getdata())
    sums = [sum(data[y * w + x] for y in range(0, h, 2)) for x in range(w)]
    lo, hi = int(w * 0.32), int(w * 0.68)
    cut = min(range(lo, hi), key=lambda x: sums[x])
    left = largest_component(img.crop((0, 0, cut, h)))
    right = largest_component(img.crop((cut, 0, w, h)))
    return left, right


def fit_square(img: Image.Image, canvas: int, content: int) -> Image.Image:
    """裁到 bbox 后按最长边 content 等比缩放，居中放进 canvas×canvas。"""
    box = alpha_bbox(img)
    fig = img.crop(box)
    scale = content / max(fig.size)
    size = (max(1, round(fig.width * scale)), max(1, round(fig.height * scale)))
    fig = fig.resize(size, Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.paste(fig, ((canvas - size[0]) // 2, (canvas - size[1]) // 2), fig)
    return out


# ---------------------------------------------------------------- 角色

def build_characters() -> None:
    pair = largest_component(flood_alpha(Image.open(os.path.join(RES, 'role3.jpg'))))
    # role3 左右人物中间会被判为同一连通块（发梢相接），先按列切
    pair_raw = flood_alpha(Image.open(os.path.join(RES, 'role3.jpg')))
    fork_boy, mirror_boy = split_pair(pair_raw)
    solo_blue = largest_component(flood_alpha(Image.open(os.path.join(RES, 'role4.jpg'))))
    solo_navy = largest_component(flood_alpha(Image.open(os.path.join(RES, 'role5.jpg'))))

    # 源图人物均朝左飞行，翻转为规范要求的头朝右
    mapping = {
        'nova': fork_boy.transpose(Image.FLIP_LEFT_RIGHT),
        'moss': mirror_boy.transpose(Image.FLIP_LEFT_RIGHT),
        'sol': solo_blue.transpose(Image.FLIP_LEFT_RIGHT),
        'violet': solo_navy.transpose(Image.FLIP_LEFT_RIGHT),
    }
    for cid, art in mapping.items():
        sprite = fit_square(art, 72, 60)  # 四周 ≥6px 透明边距
        sprite.save(os.path.join(OUT, f'character-{cid}.png'))
        print('character', cid, 'ok')
    _ = pair


# ---------------------------------------------------------------- 障碍

def extract_text(path: str) -> Image.Image:
    """从对联柱源图提取中间的书法文字（RGBA 字形）。"""
    img = Image.open(path).convert('RGB')
    w, h = img.size
    region = img.crop((int(w * 0.28), int(h * 0.20), int(w * 0.78), int(h * 0.82)))
    rw, rh = region.size
    px = region.load()
    glyph = Image.new('L', (rw, rh), 0)
    gpx = glyph.load()
    for y in range(rh):
        for x in range(rw):
            r, g, b = px[x, y]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            # 粉底 (255,183,220) 亮度 ~207，字色 (170,75,75) 亮度 ~105
            a = max(0, min(255, (195 - lum) * 4))
            gpx[x, y] = a
    box = glyph.getbbox()
    assert box is not None
    glyph = glyph.crop(box)
    out = Image.new('RGBA', glyph.size, (*BARRIER_OUTLINE, 0))
    out.putalpha(glyph)
    return out


def build_pillar(text: Image.Image, mouth: str, ss: int = 4) -> Image.Image:
    """绘制 76x480 对联柱。mouth='top' 用于底柱（管口朝上），'bottom' 用于顶柱。"""
    W, H = 76 * ss, 480 * ss
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ow = 3 * ss  # 描边宽

    cap_h = 30 * ss
    shaft_w = 58 * ss
    sx0 = (W - shaft_w) // 2
    # 统一按 mouth='top' 画，最后按需翻转（文字单独按正向贴）
    d.rounded_rectangle([sx0, cap_h - ss, sx0 + shaft_w, H + ow * 2], radius=4 * ss,
                        fill=BARRIER_PINK, outline=BARRIER_OUTLINE, width=ow)
    # 右侧阴影条
    d.rectangle([sx0 + shaft_w - ow - 5 * ss, cap_h + 2 * ss, sx0 + shaft_w - ow, H], fill=BARRIER_PINK_DEEP)
    # 管口横匾
    d.rounded_rectangle([ow // 2, ow // 2, W - ow // 2, cap_h], radius=5 * ss,
                        fill=BARRIER_PINK, outline=BARRIER_OUTLINE, width=ow)
    d.rectangle([ow, cap_h - 4 * ss, W - ow, cap_h - ow], fill=BARRIER_PINK_DEEP)

    if mouth == 'bottom':
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

    # 文字：竖排自上而下，靠近管口一端，正向可读
    tw = 40 * ss
    th = round(text.height * tw / text.width)
    glyphs = text.resize((tw, th), Image.LANCZOS)
    tx = (W - tw) // 2
    ty = cap_h + 14 * ss if mouth == 'top' else H - cap_h - 14 * ss - th
    img.paste(glyphs, (tx, ty), glyphs)

    # 文字下方点缀一朵樱花
    fy = ty + th + 16 * ss if mouth == 'top' else ty - 16 * ss
    draw_blossom(ImageDraw.Draw(img), W // 2, fy, 7 * ss)

    return img.resize((76, 480), Image.LANCZOS)


def draw_blossom(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float,
                 fill=FLOWER, core=FLOWER_CORE, outline=CANOPY_OUTLINE, ow: int = 3) -> None:
    for i in range(5):
        ang = -math.pi / 2 + i * 2 * math.pi / 5
        px_, py_ = cx + math.cos(ang) * r, cy + math.sin(ang) * r
        d.ellipse([px_ - r * 0.72, py_ - r * 0.72, px_ + r * 0.72, py_ + r * 0.72],
                  fill=fill, outline=outline, width=ow)
    d.ellipse([cx - r * 0.42, cy - r * 0.42, cx + r * 0.42, cy + r * 0.42], fill=core)


def build_obstacles() -> None:
    text_a = extract_text(os.path.join(RES, 'barrier.jpg'))    # 世界上另一个我
    text_b = extract_text(os.path.join(RES, 'barrier2.jpg'))   # 你在哭鼻子吗
    build_pillar(text_a, mouth='top').save(os.path.join(OUT, 'obstacle.png'))
    build_pillar(text_b, mouth='bottom').save(os.path.join(OUT, 'obstacle-top.png'))
    print('obstacles ok')


# ---------------------------------------------------------------- 奖励

def build_reward() -> None:
    fork = largest_component(flood_alpha(Image.open(os.path.join(RES, 'award1.jpg'))))
    box = alpha_bbox(fork)
    fig = fork.crop(box)
    # 摆正一点（源图叉子斜置），旋转后再裁 bbox
    fig = fig.rotate(-18, expand=True, resample=Image.BICUBIC)
    sprite = fit_square(fig, 48, 42)
    sprite.save(os.path.join(OUT, 'reward.png'))
    print('reward ok')


# ---------------------------------------------------------------- 背景

def vertical_gradient(w: int, h: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    img = Image.new('RGB', (1, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                px[0, y] = tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
                break
    return img.resize((w, h))


def draw_cloud(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, alpha: int) -> None:
    for dx, dy, r in ((-1.5, 0.15, 0.62), (-0.6, -0.28, 0.85), (0.5, -0.1, 0.95), (1.5, 0.2, 0.6), (0.0, 0.34, 0.8)):
        d.ellipse([cx + dx * s - r * s, cy + dy * s - r * s * 0.62,
                   cx + dx * s + r * s, cy + dy * s + r * s * 0.62], fill=(*CLOUD, alpha))


def draw_petal(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, ang: float, ow: int) -> None:
    pts = []
    for i in range(24):
        t = i / 24 * 2 * math.pi
        x = math.cos(t) * s
        y = math.sin(t) * s * 0.62 * (1 + 0.35 * math.cos(t))
        rx = x * math.cos(ang) - y * math.sin(ang)
        ry = x * math.sin(ang) + y * math.cos(ang)
        pts.append((cx + rx, cy + ry))
    d.polygon(pts, fill=PETAL, outline=PETAL_OUTLINE, width=ow)


def build_sky(ss: int = 2) -> None:
    W, H = 960 * ss, 640 * ss
    img = vertical_gradient(W, H, [(0.0, SKY_TOP), (0.62, SKY_MID), (1.0, SKY_LOW)]).convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, cy, s, a in ((150, 96, 42, 165), (405, 170, 30, 130), (700, 80, 50, 170),
                         (880, 210, 26, 120), (270, 300, 36, 110), (585, 330, 26, 95),
                         (60, 430, 30, 100), (830, 430, 34, 105)):
        draw_cloud(d, cx * ss, cy * ss, s * ss, a)
    layer = layer.filter(ImageFilter.GaussianBlur(3 * ss))
    img.alpha_composite(layer)
    # 飘落的花瓣
    pd = ImageDraw.Draw(img)
    petals = ((120, 150, 9, 0.5), (300, 90, 7, 2.2), (480, 210, 8, 1.1), (628, 120, 7, 2.8),
              (795, 175, 9, 0.2), (215, 380, 7, 1.7), (540, 420, 8, 2.5), (900, 330, 7, 0.9),
              (60, 260, 6, 2.0), (720, 300, 6, 1.4), (390, 500, 7, 0.7), (860, 520, 6, 2.9))
    for x, y, s, ang in petals:
        draw_petal(pd, x * ss, y * ss, s * ss, ang, 2 * ss)
    img.convert('RGB').resize((960, 640), Image.LANCZOS).save(os.path.join(OUT, 'background-sky.png'))
    print('sky ok')


def wrap_offsets(w: int) -> tuple[int, int, int]:
    return (-w, 0, w)


def draw_hill_band(d: ImageDraw.ImageDraw, W: int, top: int, H: int, fill, edge, bumps, ss: int) -> None:
    d.rectangle([0, top + 20 * ss, W, H], fill=fill)
    for cx, r in bumps:
        for off in wrap_offsets(W):
            d.ellipse([cx * ss + off - r * ss, top - r * ss // 3, cx * ss + off + r * ss, top + r * ss], fill=fill)
    # 顶缘描边：再画一遍小半径同心弧
    for cx, r in bumps:
        for off in wrap_offsets(W):
            d.arc([cx * ss + off - r * ss, top - r * ss // 3, cx * ss + off + r * ss, top + r * ss],
                  180, 360, fill=edge, width=2 * ss)


def draw_tree(img: Image.Image, cx: int, cy: int, r: int, ground: int, ss: int,
              W: int, with_swing: bool = False, flowers: int = 3) -> None:
    d = ImageDraw.Draw(img)
    for off in wrap_offsets(W):
        x = cx + off
        # 树干
        tw = max(5 * ss, r // 4)
        d.polygon([(x - tw, cy), (x + tw, cy), (x + round(tw * 1.6), ground), (x - round(tw * 1.6), ground)],
                  fill=TRUNK, outline=TRUNK_OUTLINE, width=2 * ss)
        # 树冠（圆簇 + 统一描边，圆簇错落形成波浪轮廓）
        blobs = [(0, -0.2, 0.92), (-0.82, 0.14, 0.62), (0.82, 0.14, 0.62), (-0.46, -0.66, 0.56),
                 (0.46, -0.66, 0.56), (-0.3, 0.4, 0.66), (0.34, 0.42, 0.62), (-1.05, -0.32, 0.4), (1.05, -0.32, 0.4)]
        for bx, by, br in blobs:
            rr = br * r + 4 * ss
            d.ellipse([x + bx * r - rr, cy + by * r - rr, x + bx * r + rr, cy + by * r + rr], fill=CANOPY_OUTLINE)
        for bx, by, br in blobs:
            rr = br * r
            d.ellipse([x + bx * r - rr, cy + by * r - rr, x + bx * r + rr, cy + by * r + rr], fill=CANOPY)
        # 高光
        d.ellipse([x - r * 0.66, cy - r * 0.84, x - r * 0.12, cy - r * 0.36], fill=CANOPY_HI)
        # 树冠上的花
        spots = [(-0.55, -0.35), (0.35, -0.55), (0.6, 0.15), (-0.15, 0.35), (-0.9, 0.05)]
        for i in range(flowers):
            fx, fy = spots[i % len(spots)]
            draw_blossom(d, x + fx * r, cy + fy * r, max(4 * ss, r // 7), ow=2 * ss)
        if with_swing:
            # 秋千挂在树冠下方、街面层上缘之上，保证可见
            sy = min(cy + round(r * 1.55), 468 * ss)
            for k in (-1, 1):
                d.line([x + k * r * 0.46, cy + r * 0.72, x + k * r * 0.38, sy - 6 * ss],
                       fill=(192, 114, 104), width=2 * ss)
            d.rounded_rectangle([x - r * 0.5, sy - 7 * ss, x + r * 0.44, sy], radius=2 * ss,
                                fill=(228, 158, 138), outline=TRUNK_OUTLINE, width=2 * ss)


def draw_bush(img: Image.Image, cx: int, cy: int, s: int, ss: int, W: int) -> None:
    d = ImageDraw.Draw(img)
    for off in wrap_offsets(W):
        x = cx + off
        blobs = [(-0.9, 0.1, 0.62), (0, -0.2, 0.9), (0.9, 0.12, 0.6)]
        for bx, by, br in blobs:
            rr = br * s + 2 * ss
            d.ellipse([x + bx * s - rr, cy + by * s - rr, x + bx * s + rr, cy + by * s + rr], fill=BUSH_OUTLINE)
        for bx, by, br in blobs:
            rr = br * s
            d.ellipse([x + bx * s - rr, cy + by * s - rr, x + bx * s + rr, cy + by * s + rr], fill=BUSH)


def draw_grass_mark(d: ImageDraw.ImageDraw, x: int, y: int, s: int, ss: int, W: int, color=GRASS_MARK) -> None:
    for off in wrap_offsets(W):
        for k in (-1, 0, 1):
            d.arc([x + off + k * s - s, y - s // 2, x + off + k * s + s, y + s], 200, 340, fill=color, width=2 * ss)


def build_city(ss: int = 2) -> None:
    W, H = 720 * ss, 640 * ss
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 远丘（浅绿）与近丘（草绿）
    draw_hill_band(d, W, 442 * ss, H, HILL_FAR, HILL_FAR_EDGE,
                   [(80, 95), (270, 120), (480, 90), (650, 110)], ss)
    # 远处小樱花树（无花，淡色）
    for tx, ty, tr in ((372, 425, 30), (592, 438, 24)):
        draw_tree(img, tx * ss, ty * ss, tr * ss, 470 * ss, ss, W, flowers=0)
    d = ImageDraw.Draw(img)
    draw_hill_band(d, W, 486 * ss, H, GRASS_MID, GRASS_EDGE,
                   [(0, 130), (215, 100), (420, 140), (620, 95)], ss)

    # 主体樱花树：一棵带秋千的大树 + 一棵中树
    draw_tree(img, 168 * ss, 340 * ss, 78 * ss, 528 * ss, ss, W, with_swing=True, flowers=4)
    draw_tree(img, 520 * ss, 386 * ss, 54 * ss, 540 * ss, ss, W, flowers=3)
    draw_bush(img, 350 * ss, 528 * ss, 26 * ss, ss, W)
    draw_bush(img, 660 * ss, 545 * ss, 22 * ss, ss, W)

    d = ImageDraw.Draw(img)
    for gx, gy, s in ((60, 560, 7), (250, 585, 8), (430, 555, 7), (585, 592, 8), (700, 566, 6)):
        draw_grass_mark(d, gx * ss, gy * ss, s * ss, ss, W)
    for px_, py_, s, ang in ((110, 470, 6, 1.2), (300, 452, 5, 0.4), (470, 500, 6, 2.4), (640, 470, 5, 1.8)):
        draw_petal(d, px_ * ss, py_ * ss, s * ss, ang, 2 * ss)

    img.resize((720, 640), Image.LANCZOS).save(os.path.join(OUT, 'background-city.png'))
    print('city ok')


def build_street(ss: int = 2) -> None:
    # 结构（规范硬性要求）：路缘 24 → 深色分隔 9 → 立面 111 → 路面 36
    W, H = 720 * ss, 180 * ss
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 立面带（花园树篱）
    d.rectangle([0, 33 * ss, W, 144 * ss], fill=HEDGE)
    # 路缘草带
    d.rectangle([0, 0, W, 24 * ss], fill=GRASS_MID)
    d.rectangle([0, 0, W, 2 * ss], fill=GRASS_EDGE)
    # 深色分隔
    d.rectangle([0, 24 * ss, W, 33 * ss], fill=DIVIDER)
    # 路面
    d.rectangle([0, 144 * ss, W, H], fill=PATH)
    d.rectangle([0, 144 * ss, W, 146 * ss], fill=PATH_EDGE)

    # 树篱丛
    for bx, by, s in ((45, 70, 26), (150, 82, 30), (255, 66, 24), (360, 80, 30),
                      (465, 68, 26), (575, 82, 30), (675, 66, 24)):
        draw_bush(img, bx * ss, by * ss, s * ss, ss, W)
    d = ImageDraw.Draw(img)
    # 树篱上的花
    for fx, fy, r in ((45, 58, 5), (150, 74, 6), (255, 56, 5), (360, 70, 6),
                      (465, 58, 5), (575, 72, 6), (675, 55, 5)):
        for off in wrap_offsets(W):
            draw_blossom(d, fx * ss + off, fy * ss, r * ss, ow=2 * ss)

    # 白色栅栏（立面带下缘）
    rail_y = 116 * ss
    d.rectangle([0, rail_y, W, rail_y + 5 * ss], fill=FENCE, outline=FENCE_OUTLINE, width=ss)
    d.rectangle([0, rail_y + 14 * ss, W, rail_y + 19 * ss], fill=FENCE, outline=FENCE_OUTLINE, width=ss)
    for x in range(0, 720, 48):
        for off in wrap_offsets(W):
            px_ = x * ss + off
            d.rounded_rectangle([px_, 104 * ss, px_ + 7 * ss, 143 * ss], radius=3 * ss,
                                fill=FENCE, outline=FENCE_OUTLINE, width=ss)

    # 路缘草叶与小花
    for gx, s in ((30, 6), (120, 7), (210, 6), (330, 7), (450, 6), (540, 7), (640, 6)):
        draw_grass_mark(d, gx * ss, 13 * ss, s * ss, ss, W)
    for fx in (85, 285, 500, 690):
        for off in wrap_offsets(W):
            draw_blossom(d, fx * ss + off, 12 * ss, 4 * ss, ow=ss)

    # 路面花瓣与小石子
    for px_, py_, s, ang in ((60, 162, 5, 0.8), (200, 168, 6, 2.1), (340, 158, 5, 1.5),
                             (480, 166, 6, 0.3), (620, 160, 5, 2.6)):
        for off in wrap_offsets(W):
            draw_petal(d, px_ * ss + off, py_ * ss, s * ss, ang, ss)
    for sx_, sy_, r in ((130, 172, 4), (410, 174, 5), (560, 171, 4), (700, 175, 5)):
        for off in wrap_offsets(W):
            d.ellipse([sx_ * ss + off - r * ss, sy_ * ss - r * ss // 2, sx_ * ss + off + r * ss, sy_ * ss + r * ss // 2],
                      fill=PEBBLE)

    img.resize((720, 180), Image.LANCZOS).save(os.path.join(OUT, 'background-street.png'))
    print('street ok')


# ---------------------------------------------------------------- 预览

def build_preview() -> None:
    """拼一张 360×640 的模拟游戏画面用于快速目检。"""
    sky = Image.open(os.path.join(OUT, 'background-sky.png')).convert('RGBA')
    city = Image.open(os.path.join(OUT, 'background-city.png')).convert('RGBA')
    street = Image.open(os.path.join(OUT, 'background-street.png')).convert('RGBA')
    ob = Image.open(os.path.join(OUT, 'obstacle.png')).convert('RGBA')
    ot = Image.open(os.path.join(OUT, 'obstacle-top.png')).convert('RGBA')
    reward = Image.open(os.path.join(OUT, 'reward.png')).convert('RGBA')
    char = Image.open(os.path.join(OUT, 'character-nova.png')).convert('RGBA')

    frame = Image.new('RGBA', (360, 640))
    frame.paste(sky.crop((300, 0, 660, 640)))
    frame.alpha_composite(city.crop((100, 0, 460, 640)))
    frame.alpha_composite(street.crop((0, 0, 360, 165)), (0, 475))
    gap, center, x = 175, 300, 250
    frame.alpha_composite(ot, (x - 38, center - gap // 2 - 480))
    frame.alpha_composite(ob, (x - 38, center + gap // 2))
    frame.alpha_composite(reward, (x - 24 + 4, center - 24))
    frame.alpha_composite(char, (88 - 36, 300 - 36))
    frame.convert('RGB').save('/tmp/preview-game.png')
    print('preview ok -> /tmp/preview-game.png')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    build_characters()
    build_obstacles()
    build_reward()
    build_sky()
    build_city()
    build_street()
    build_preview()


if __name__ == '__main__':
    main()
