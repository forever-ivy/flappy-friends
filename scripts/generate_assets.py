#!/usr/bin/env python3
"""从 pictures/ 高清源素材生成 public/assets/game/ 下的全部游戏资产。

用法：python3 scripts/generate_assets.py
依赖：Pillow（pip install pillow）

高清源（pictures/，透明底 PNG）：
  IMG_5246.PNG  2048x2048  藏青条纹衫男孩飞行姿态 -> nova（violet 为其紫色变体）
  IMG_5247.PNG  2048x2048  浅蓝番茄衫男孩飞行姿态 -> moss（sol 为其青绿变体）
  IMG_5248.PNG  2048x2048  蝴蝶结叉子 -> reward.png（主奖励）
  IMG_5245.PNG  2048x2048  蝴蝶结镜子 -> reward-mirror.png（副奖励）
  IMG_5250.PNG  1080x1920  樱花树秋千场景 -> 三层视差背景的调色与花瓣裁切来源
障碍柱身文字取自 pictures/ 下的三张障碍源图（IMG_3452.PNG / IMG_3453(1).PNG / IMG_3454.PNG），
分别生成多套柱体贴图变体（底柱 obstacle-* / 顶柱 obstacle-top-*）。

产物（逻辑 1x 尺寸，与画布渲染分辨率一致，物理参数零改动）：
  character-{nova,moss,sol,violet}.png  72x72   透明背景，头朝右
  obstacle.png / obstacle-top.png       76x480  底柱 / 顶柱（兼容别名，等价于 i=0）
  obstacle-{i}.png / obstacle-top-{i}.png  76x480  底柱 / 顶柱（i=0..2）
  reward.png / reward-mirror.png        48x48   蝴蝶结叉子 / 蝴蝶结镜子
  background-sky.png                    960x640 静态天空层
  background-city.png                   720x640 中景视差层（无缝平铺）
  background-street.png                 720x180 街面层（无缝平铺，24/9/111/36 四段结构）
"""
from __future__ import annotations

import math
import os
import sys
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIC = os.path.join(ROOT, 'pictures')
RES = os.path.join(ROOT, 'resource')
OUT = os.path.join(ROOT, 'public', 'assets', 'game')

# ---- 调色板（均采样自 pictures/*.PNG 高清素材） ----
SKY_TOP = (185, 226, 255)
SKY_LOW = (219, 242, 255)
GRASS_MID = (183, 255, 142)
GRASS_EDGE = (128, 198, 92)
GRASS_MARK = (110, 152, 96)
HILL_FAR = (213, 255, 185)
HILL_FAR_EDGE = (162, 220, 124)
CANOPY = (255, 216, 230)
CANOPY_LOW = (253, 199, 218)
CANOPY_HI = (255, 233, 241)
CANOPY_OUTLINE = (204, 112, 118)
FLOWER = (255, 176, 202)
FLOWER_CORE = (233, 118, 148)
TRUNK = (161, 112, 93)
TRUNK_OUTLINE = (118, 76, 60)
PETAL = (253, 198, 216)
PETAL_OUTLINE = (211, 124, 131)
CLOUD = (255, 255, 255)
BARRIER_PINK = (255, 188, 222)
BARRIER_PINK_DEEP = (250, 158, 205)
BARRIER_OUTLINE = (153, 77, 77)
BUSH = (200, 255, 169)
BUSH_OUTLINE = (117, 172, 92)
HEDGE = (172, 242, 132)
DIVIDER = (112, 160, 90)
PATH = (252, 240, 229)
PATH_EDGE = (211, 176, 155)
PEBBLE = (238, 219, 202)
FENCE = (255, 250, 252)
FENCE_OUTLINE = (211, 124, 131)
SEAT = (216, 180, 166)
ROPE = (196, 116, 112)


# ---------------------------------------------------------------- 工具

def alpha_bbox(img: Image.Image, thr: int = 12) -> tuple[int, int, int, int]:
    mask = img.getchannel('A').point(lambda v: 255 if v > thr else 0)
    box = mask.getbbox()
    assert box is not None, 'empty alpha'
    return box


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


def shift_blue_hue(img: Image.Image, delta: int) -> Image.Image:
    """把画面中蓝色系（衣服 / 牛仔裤）的色相整体旋转 delta（HSV 的 0-255 标度），
    肤色 / 头发 / 腮红等低饱和或暖色像素不受影响。用于从两张 HD 角色图派生清晰变体。"""
    rgba = img.convert('RGBA')
    alpha = rgba.getchannel('A')
    hsv = rgba.convert('RGB').convert('HSV')
    h, s, v = hsv.split()
    # 蓝色系：hue 130-200（青蓝到蓝紫），且饱和度足够（排除灰发与白色高光）
    in_range = h.point(lambda x: 255 if 130 <= x <= 200 else 0)
    saturated = s.point(lambda x: 255 if x >= 24 else 0)
    mask = ImageChops.multiply(in_range, saturated)
    shifted = h.point(lambda x: (x + delta) % 256)
    h2 = Image.composite(shifted, h, mask)
    out = Image.merge('HSV', (h2, s, v)).convert('RGB').convert('RGBA')
    out.putalpha(alpha)
    return out


def extract_pink(img: Image.Image) -> Image.Image:
    """从场景裁片中分离粉色花瓣（背景为天空蓝或草绿：R 通道均不占优）。"""
    rgb = img.convert('RGB')
    w, h = rgb.size
    r, g, b = rgb.split()
    m1 = ImageChops.subtract(r, b, 1, 6).point(lambda x: 255 if x > 0 else 0)
    m2 = ImageChops.subtract(r, g, 1, 6).point(lambda x: 255 if x > 0 else 0)
    mask = ImageChops.multiply(m1, m2).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    out = rgb.convert('RGBA')
    out.putalpha(mask.filter(ImageFilter.GaussianBlur(0.8)))
    return out


# ---------------------------------------------------------------- 角色

def build_characters() -> None:
    # 智能裁切：按 alpha bbox 取本体（不整张缩放），源图朝左，翻转为规范要求的头朝右
    navy = Image.open(os.path.join(PIC, 'IMG_5246.PNG')).convert('RGBA')
    blue = Image.open(os.path.join(PIC, 'IMG_5247.PNG')).convert('RGBA')
    navy = navy.crop(alpha_bbox(navy)).transpose(Image.FLIP_LEFT_RIGHT)
    blue = blue.crop(alpha_bbox(blue)).transpose(Image.FLIP_LEFT_RIGHT)

    mapping = {
        'nova': navy,                        # 藏青条纹衫（HD 原色）
        'moss': blue,                        # 浅蓝番茄衫（HD 原色）
        'sol': shift_blue_hue(blue, -52),    # 浅蓝 -> 青绿变体
        'violet': shift_blue_hue(navy, 38),  # 藏青 -> 蓝紫变体
    }
    for cid, art in mapping.items():
        sprite = fit_square(art, 72, 60)  # 四周 ≥6px 透明边距
        sprite.save(os.path.join(OUT, f'character-{cid}.png'))
        print('character', cid, 'ok')


# ---------------------------------------------------------------- 奖励

def build_rewards() -> None:
    # 主奖励：蝴蝶结叉子（HD 透明底，摆正后适配 48x48）
    fork = Image.open(os.path.join(PIC, 'IMG_5248.PNG')).convert('RGBA')
    fork = fork.crop(alpha_bbox(fork)).rotate(-9, expand=True, resample=Image.BICUBIC)
    fit_square(fork, 48, 42).save(os.path.join(OUT, 'reward.png'))
    # 副奖励：蝴蝶结镜子（源图斜置约 45°，转正为镜面朝上）
    mirror = Image.open(os.path.join(PIC, 'IMG_5245.PNG')).convert('RGBA')
    mirror = mirror.crop(alpha_bbox(mirror)).rotate(48, expand=True, resample=Image.BICUBIC)
    fit_square(mirror, 48, 42).save(os.path.join(OUT, 'reward-mirror.png'))
    print('rewards ok')


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
            # 粉底亮度 ~207，字色亮度 ~105
            a = max(0, min(255, (195 - lum) * 4))
            gpx[x, y] = a
    box = glyph.getbbox()
    assert box is not None
    glyph = glyph.crop(box)
    out = Image.new('RGBA', glyph.size, (*BARRIER_OUTLINE, 0))
    out.putalpha(glyph)
    return out


def build_pillar(text: Image.Image, mouth: str, ss: int = 6) -> Image.Image:
    """绘制 76x480 对联柱（HD 奇比风格：粉底、红棕描边、圆角横匾）。
    mouth='top' 用于底柱（管口朝上），'bottom' 用于顶柱。"""
    W, H = 76 * ss, 480 * ss
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ow = 3 * ss  # 描边宽

    cap_h = 30 * ss
    shaft_w = 58 * ss
    sx0 = (W - shaft_w) // 2
    # 统一按 mouth='top' 画，最后按需翻转（文字单独按正向贴）
    d.rounded_rectangle([sx0, cap_h - ss, sx0 + shaft_w, H + ow * 2], radius=5 * ss,
                        fill=BARRIER_PINK, outline=BARRIER_OUTLINE, width=ow)
    # 右侧阴影条与左侧高光条（HD 素材的柔和体积感）
    d.rectangle([sx0 + shaft_w - ow - 6 * ss, cap_h + 2 * ss, sx0 + shaft_w - ow, H], fill=BARRIER_PINK_DEEP)
    d.rectangle([sx0 + ow, cap_h + 2 * ss, sx0 + ow + 3 * ss, H], fill=(255, 214, 235))
    # 管口横匾
    d.rounded_rectangle([ow // 2, ow // 2, W - ow // 2, cap_h], radius=7 * ss,
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

    # 文字外侧点缀一朵樱花
    fy = ty + th + 18 * ss if mouth == 'top' else ty - 18 * ss
    draw_blossom(ImageDraw.Draw(img), W // 2, fy, 8 * ss, ow=2 * ss)

    return img.resize((76, 480), Image.LANCZOS)


def build_obstacles() -> None:
    sources = [
        'IMG_3452.PNG',
        'IMG_3453(1).PNG',
        'IMG_3454.PNG',
    ]

    for i, src in enumerate(sources):
        text = extract_text(os.path.join(PIC, src))
        build_pillar(text, mouth='top').save(os.path.join(OUT, f'obstacle-{i}.png'))
        build_pillar(text, mouth='bottom').save(os.path.join(OUT, f'obstacle-top-{i}.png'))

        # 兼容旧 key：i=0 作为 obstacle.png / obstacle-top.png
        if i == 0:
            build_pillar(text, mouth='top').save(os.path.join(OUT, 'obstacle.png'))
            build_pillar(text, mouth='bottom').save(os.path.join(OUT, 'obstacle-top.png'))

    print('obstacles ok (variants 0..2)')


# ---------------------------------------------------------------- 背景公共

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


def hd_petals() -> list[Image.Image]:
    """从 IMG_5250 直接裁切三枚心形/瓣形花瓣（HD 元素直接入图）。"""
    scene = Image.open(os.path.join(PIC, 'IMG_5250.PNG')).convert('RGB')
    crops = [
        scene.crop((560, 80, 720, 200)),      # 天空中的心形花瓣
        scene.crop((560, 1540, 720, 1680)),   # 草地上的花瓣 1
        scene.crop((380, 1740, 500, 1870)),   # 草地上的花瓣 2
    ]
    petals = []
    for c in crops:
        p = extract_pink(c)
        box = p.getchannel('A').getbbox()
        if box:
            petals.append(p.crop(box))
    return petals


def paste_petal(img: Image.Image, petal: Image.Image, cx: int, cy: int, height: int,
                ang: float, W: int | None = None) -> None:
    scale = height / petal.height
    p = petal.resize((max(1, round(petal.width * scale)), height), Image.LANCZOS)
    p = p.rotate(ang, expand=True, resample=Image.BICUBIC)
    offs = (-W, 0, W) if W else (0,)
    for off in offs:
        img.alpha_composite(p, (cx + off - p.width // 2, cy - p.height // 2))


def draw_cloud(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float, alpha: int) -> None:
    for dx, dy, r in ((-1.5, 0.15, 0.62), (-0.6, -0.28, 0.85), (0.5, -0.1, 0.95), (1.5, 0.2, 0.6), (0.0, 0.34, 0.8)):
        d.ellipse([cx + dx * s - r * s, cy + dy * s - r * s * 0.62,
                   cx + dx * s + r * s, cy + dy * s + r * s * 0.62], fill=(*CLOUD, alpha))


def draw_blossom(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float,
                 fill=FLOWER, outline=CANOPY_OUTLINE, ow: int = 3) -> None:
    """HD 风格五瓣樱花：五个圆瓣 + 中心细枝痕（对齐 IMG_5250 树冠上的花簇画法）。"""
    for i in range(5):
        ang = -math.pi / 2 + i * 2 * math.pi / 5
        px_, py_ = cx + math.cos(ang) * r, cy + math.sin(ang) * r
        d.ellipse([px_ - r * 0.74, py_ - r * 0.74, px_ + r * 0.74, py_ + r * 0.74],
                  fill=fill, outline=outline, width=ow)
    d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=fill)
    for k in range(3):
        a = -math.pi / 2 + (k - 1) * 0.85
        d.line([cx, cy, cx + math.cos(a) * r * 0.4, cy + math.sin(a) * r * 0.4],
               fill=FLOWER_CORE, width=max(1, ow // 2))


# ---------------------------------------------------------------- 天空层

def build_sky(ss: int = 2) -> None:
    W, H = 960 * ss, 640 * ss
    img = vertical_gradient(W, H, [(0.0, SKY_TOP), (0.62, (203, 234, 255)), (1.0, SKY_LOW)]).convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, cy, s, a in ((150, 96, 42, 165), (405, 170, 30, 130), (700, 80, 50, 170),
                         (880, 210, 26, 120), (270, 300, 36, 110), (585, 330, 26, 95),
                         (60, 430, 30, 100), (830, 430, 34, 105)):
        draw_cloud(d, cx * ss, cy * ss, s * ss, a)
    layer = layer.filter(ImageFilter.GaussianBlur(3 * ss))
    img.alpha_composite(layer)
    # 飘落的花瓣：直接取自 IMG_5250 的 HD 裁切
    petals = hd_petals()
    spots = ((120, 150, 15, 24), (300, 90, 12, 200), (480, 210, 14, 320), (628, 120, 12, 90),
             (795, 175, 15, 0), (215, 380, 12, 150), (540, 420, 13, 260), (900, 330, 12, 40),
             (60, 260, 10, 300), (720, 300, 10, 130), (390, 500, 12, 70), (860, 520, 10, 220))
    for i, (x, y, s, ang) in enumerate(spots):
        paste_petal(img, petals[i % len(petals)], x * ss, y * ss, s * ss, ang)
    img.convert('RGB').resize((960, 640), Image.LANCZOS).save(os.path.join(OUT, 'background-sky.png'))
    print('sky ok')


# ---------------------------------------------------------------- 中景层

def wrap_offsets(w: int) -> tuple[int, int, int]:
    return (-w, 0, w)


def draw_hill_band(d: ImageDraw.ImageDraw, W: int, top: int, H: int, fill, edge, bumps, ss: int) -> None:
    d.rectangle([0, top + 20 * ss, W, H], fill=fill)
    for cx, r in bumps:
        for off in wrap_offsets(W):
            d.ellipse([cx * ss + off - r * ss, top - r * ss // 3, cx * ss + off + r * ss, top + r * ss], fill=fill)
    for cx, r in bumps:
        for off in wrap_offsets(W):
            d.arc([cx * ss + off - r * ss, top - r * ss // 3, cx * ss + off + r * ss, top + r * ss],
                  180, 360, fill=edge, width=2 * ss)


def draw_tree(img: Image.Image, cx: int, cy: int, r: int, ground: int, ss: int,
              W: int, with_swing: bool = False, flowers: int = 3) -> None:
    """HD 奇比樱花树：扇贝形粉冠 + 红棕描边 + 花簇，对齐 IMG_5250 的树形画法。"""
    d = ImageDraw.Draw(img)
    for off in wrap_offsets(W):
        x = cx + off
        # 树干（上细下宽，微弯）
        tw = max(5 * ss, r // 4)
        d.polygon([(x - tw, cy), (x + tw, cy), (x + round(tw * 1.7), ground), (x - round(tw * 1.7), ground)],
                  fill=TRUNK, outline=TRUNK_OUTLINE, width=2 * ss)
        # 树冠（圆簇 + 统一描边，圆簇错落形成扇贝轮廓）
        blobs = [(0, -0.2, 0.92), (-0.82, 0.14, 0.62), (0.82, 0.14, 0.62), (-0.46, -0.66, 0.56),
                 (0.46, -0.66, 0.56), (-0.3, 0.4, 0.66), (0.34, 0.42, 0.62), (-1.05, -0.32, 0.4), (1.05, -0.32, 0.4)]
        for bx, by, br in blobs:
            rr = br * r + 4 * ss
            d.ellipse([x + bx * r - rr, cy + by * r - rr, x + bx * r + rr, cy + by * r + rr], fill=CANOPY_OUTLINE)
        for bx, by, br in blobs:
            rr = br * r
            d.ellipse([x + bx * r - rr, cy + by * r - rr, x + bx * r + rr, cy + by * r + rr], fill=CANOPY)
        # 下部加深、上部高光（还原 HD 树冠的上浅下深渐变）
        d.ellipse([x - r * 0.9, cy + r * 0.1, x + r * 0.9, cy + r * 0.95], fill=CANOPY_LOW)
        d.ellipse([x - r * 0.66, cy - r * 0.84, x - r * 0.12, cy - r * 0.36], fill=CANOPY_HI)
        # 树冠上的花簇
        spots = [(-0.55, -0.35), (0.35, -0.55), (0.6, 0.15), (-0.15, 0.35), (-0.9, 0.05)]
        for i in range(flowers):
            fx, fy = spots[i % len(spots)]
            draw_blossom(d, x + fx * r, cy + fy * r, max(4 * ss, r // 6), ow=2 * ss)
        if with_swing:
            # 秋千：木纹座椅 + 玫瑰色吊绳（对齐 IMG_5250 的秋千画法）
            sy = min(cy + round(r * 1.5), 460 * ss)
            for k in (-1, 1):
                d.line([x + k * r * 0.5, cy + r * 0.66, x + k * r * 0.42, sy - 10 * ss],
                       fill=ROPE, width=3 * ss)
            seat = [x - r * 0.56, sy - 11 * ss, x + r * 0.5, sy]
            d.rounded_rectangle(seat, radius=3 * ss, fill=SEAT, outline=(172, 90, 90), width=2 * ss)
            for i in range(1, 3):
                ly = sy - 11 * ss + i * (11 * ss) // 3
                d.line([seat[0] + 3 * ss, ly, seat[2] - 3 * ss, ly], fill=(198, 156, 142), width=ss)


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
    """草地上的橄榄绿波浪记号（IMG_5250 草地的标志性笔触）。"""
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
    for tx, ty, tr in ((372, 425, 30), (592, 438, 24)):
        draw_tree(img, tx * ss, ty * ss, tr * ss, 470 * ss, ss, W, flowers=0)
    d = ImageDraw.Draw(img)
    draw_hill_band(d, W, 486 * ss, H, GRASS_MID, GRASS_EDGE,
                   [(0, 130), (215, 100), (420, 140), (620, 95)], ss)

    # 主体樱花树：带秋千的大树（IMG_5250 场景主角）+ 一棵中树
    draw_tree(img, 168 * ss, 340 * ss, 78 * ss, 528 * ss, ss, W, with_swing=True, flowers=4)
    draw_tree(img, 520 * ss, 386 * ss, 54 * ss, 540 * ss, ss, W, flowers=3)
    draw_bush(img, 350 * ss, 528 * ss, 26 * ss, ss, W)
    draw_bush(img, 660 * ss, 545 * ss, 22 * ss, ss, W)

    d = ImageDraw.Draw(img)
    for gx, gy, s in ((60, 560, 7), (250, 585, 8), (430, 555, 7), (585, 592, 8), (700, 566, 6)):
        draw_grass_mark(d, gx * ss, gy * ss, s * ss, ss, W)
    # 飘落的 HD 花瓣（无缝平铺：靠近边缘的花瓣做环绕复制）
    petals = hd_petals()
    for i, (px_, py_, s, ang) in enumerate(((110, 470, 12, 70), (300, 452, 10, 20), (470, 500, 12, 140), (640, 470, 10, 100))):
        paste_petal(img, petals[i % len(petals)], px_ * ss, py_ * ss, s * ss, ang, W=W)

    img.resize((720, 640), Image.LANCZOS).save(os.path.join(OUT, 'background-city.png'))
    print('city ok')


# ---------------------------------------------------------------- 街面层

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

    # 路面上的 HD 花瓣与小石子
    petals = hd_petals()
    for i, (px_, py_, s, ang) in enumerate(((60, 162, 9, 40), (200, 168, 10, 190), (340, 158, 9, 110),
                                            (480, 166, 10, 20), (620, 160, 9, 250))):
        paste_petal(img, petals[i % len(petals)], px_ * ss, py_ * ss, s * ss, ang, W=W)
    d = ImageDraw.Draw(img)
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
    ob = Image.open(os.path.join(OUT, 'obstacle-0.png')).convert('RGBA')
    ot = Image.open(os.path.join(OUT, 'obstacle-top-0.png')).convert('RGBA')
    reward = Image.open(os.path.join(OUT, 'reward.png')).convert('RGBA')
    mirror = Image.open(os.path.join(OUT, 'reward-mirror.png')).convert('RGBA')
    char = Image.open(os.path.join(OUT, 'character-nova.png')).convert('RGBA')

    frame = Image.new('RGBA', (360, 640))
    frame.paste(sky.crop((300, 0, 660, 640)))
    frame.alpha_composite(city.crop((100, 0, 460, 640)))
    frame.alpha_composite(street.crop((0, 0, 360, 165)), (0, 475))
    gap, center, x = 175, 300, 250
    frame.alpha_composite(ot, (x - 38, center - gap // 2 - 480))
    frame.alpha_composite(ob, (x - 38, center + gap // 2))
    frame.alpha_composite(reward, (x - 24 + 4, center - 24))
    frame.alpha_composite(mirror, (30, 120))
    frame.alpha_composite(char, (88 - 36, 300 - 36))
    frame.convert('RGB').save('/tmp/preview-game.png')
    print('preview ok -> /tmp/preview-game.png')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    if '--obstacles-only' in sys.argv:
        build_obstacles()
        return

    build_characters()
    build_rewards()
    build_obstacles()
    build_sky()
    build_city()
    build_street()
    build_preview()


if __name__ == '__main__':
    main()
