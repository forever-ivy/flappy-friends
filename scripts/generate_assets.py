#!/usr/bin/env python3
"""从 pictures/ 高清源素材生成 public/assets/game/ 下的全部游戏资产。

用法：python3 scripts/generate_assets.py
依赖：Pillow（pip install pillow）

高清源（pictures/，透明底 PNG）：
  IMG_5246.PNG      2048x2048  藏青条纹衫男孩飞行姿态 -> nova（诺娃）
  IMG_5247.PNG      2048x2048  浅蓝番茄衫男孩飞行姿态 -> moss（莫斯）
  IMG_5248.PNG      2048x2048  蝴蝶结叉子 -> reward.png（主奖励）
  IMG_5245.PNG      2048x2048  蝴蝶结镜子 -> reward-mirror.png（副奖励）
  IMG_5250.PNG      1080x1920  樱花树秋千场景 -> 三层视差背景的调色与花瓣裁切来源
  IMG_3452.PNG       746x2172  标语柱「一起命中十环」-> 障碍变体文字源
  IMG_3453(1).PNG   1100x3140  标语柱「做你想做的」  -> 障碍变体文字源
  IMG_3454.PNG      1094x3160  标语柱「一起等雨停」  -> 障碍变体文字源
经典柱身文字仍取自 resource/barrier.jpg 与 resource/barrier2.jpg（按 HD 奇比风格重绘柱体）。

产物（除角色外均为逻辑 1x 尺寸；角色按 3x 位图交付以保证高分屏清晰，物理参数零改动）：
  character-{nova,moss}.png             216x216 局内精灵 3x 位图（逻辑 72，Phaser setDisplaySize 缩放），透明背景，头朝右
  portrait-{nova,moss}.png              192x192 菜单角色卡 / 排行榜头像专用高清立绘，透明背景，头朝右
  obstacle[-{wish,rain,aim}][-top].png  76x480  四套少女梦幻粉彩障碍变体（底柱 / 顶柱，文字均正向可读）
  reward.png / reward-mirror.png        48x48   蝴蝶结叉子 / 蝴蝶结镜子
  fx-sparkle.png                        24x24   四角星光（白色基底，游戏内随机着粉彩色）
  background-sky.png                    960x640 静态天空层（梦幻粉紫渐变 + 光斑 + 星光）
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

# ---- 障碍变体粉彩配色（少女梦幻主题：樱花粉 / 薰衣草 / 晴空蓝 / 蜜桃橘） ----
PILLAR_PALETTES = {
    'sakura': dict(body=(255, 188, 222), deep=(250, 158, 205), hi=(255, 214, 235),
                   outline=(153, 77, 77), ink=(153, 77, 77), blossom=(255, 176, 202)),
    'lavender': dict(body=(223, 202, 255), deep=(199, 168, 246), hi=(238, 226, 255),
                     outline=(122, 84, 150), ink=(122, 84, 150), blossom=(238, 198, 255)),
    'skyblue': dict(body=(187, 221, 255), deep=(151, 196, 250), hi=(221, 239, 255),
                    outline=(84, 116, 168), ink=(84, 116, 168), blossom=(206, 228, 255)),
    'peach': dict(body=(255, 216, 191), deep=(250, 187, 152), hi=(255, 234, 220),
                  outline=(178, 104, 66), ink=(178, 104, 66), blossom=(255, 200, 178)),
}


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
    # 智能裁切：按 alpha bbox 取本体（不整张缩放导致角色变小点），源图朝左，翻转为规范要求的头朝右。
    # 只保留两位 HD 原色角色：nova 藏青条纹衫 / moss 浅蓝番茄衫。
    navy = Image.open(os.path.join(PIC, 'IMG_5246.PNG')).convert('RGBA')
    blue = Image.open(os.path.join(PIC, 'IMG_5247.PNG')).convert('RGBA')
    mapping = {
        'nova': navy.crop(alpha_bbox(navy)).transpose(Image.FLIP_LEFT_RIGHT),
        'moss': blue.crop(alpha_bbox(blue)).transpose(Image.FLIP_LEFT_RIGHT),
    }
    for cid, art in mapping.items():
        # 局内精灵：逻辑 72 的 3x 位图（216x216，本体 180，四周 ≥18px 透明边距 = 逻辑 6px）
        fit_square(art, 216, 180).save(os.path.join(OUT, f'character-{cid}.png'))
        # 菜单头像：192x192 独立高清立绘，本体占比更大以便在卡片里看清五官与衣服
        fit_square(art, 192, 176).save(os.path.join(OUT, f'portrait-{cid}.png'))
        print('character', cid, 'ok (sprite 216 + portrait 192)')


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
    """从对联柱源图（resource/*.jpg）提取中间的书法文字（L 模式 alpha 蒙版）。"""
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
    return glyph.crop(box)


def extract_text_hd(path: str) -> Image.Image:
    """从 pictures/ 高清标语柱（RGBA 透明底，上下带横匾）提取柱身书法文字（L 模式 alpha 蒙版）。
    横匾行的不透明宽度明显大于柱身行，用逐行占比自动定位柱身区间。"""
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    solid = img.getchannel('A').point(lambda v: 255 if v > 128 else 0)
    # BOX 缩到 1 列后每行像素值 = 该行不透明占比
    rowfill = solid.resize((1, h), Image.BOX)
    fills = [rowfill.getpixel((0, y)) for y in range(h)]
    peak = max(fills)
    cap_rows = [y for y, v in enumerate(fills) if v > peak * 0.86]
    mid = h // 2
    top_cap_end = max(y for y in cap_rows if y < mid)
    bottom_cap_start = min(y for y in cap_rows if y > mid)
    # 柱身横向范围取中线行，再向内收缩 12% 跳过描边与阴影条
    row_box = solid.crop((0, mid, w, mid + 1)).getbbox()
    assert row_box is not None
    x0, x1 = row_box[0], row_box[2]
    inset = round((x1 - x0) * 0.12)
    pad = round(h * 0.015)
    region = img.crop((x0 + inset, top_cap_end + pad, x1 - inset, bottom_cap_start - pad))
    # 合成到白底后按亮度取字形（粉底亮度 ~216，字色亮度 ~87）
    base = Image.new('RGB', region.size, (255, 255, 255))
    base.paste(region, mask=region.getchannel('A'))
    glyph = base.convert('L').point(lambda v: max(0, min(255, (190 - v) * 4)))
    box = glyph.getbbox()
    assert box is not None
    return glyph.crop(box)


def build_pillar(mask: Image.Image, mouth: str, palette: dict, ss: int = 6) -> Image.Image:
    """绘制 76x480 对联柱（HD 奇比风格：粉彩底、深色描边、圆角横匾）。
    mouth='top' 用于底柱（管口朝上），'bottom' 用于顶柱；palette 见 PILLAR_PALETTES。"""
    W, H = 76 * ss, 480 * ss
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ow = 3 * ss  # 描边宽

    cap_h = 30 * ss
    shaft_w = 58 * ss
    sx0 = (W - shaft_w) // 2
    # 统一按 mouth='top' 画，最后按需翻转（文字单独按正向贴）
    d.rounded_rectangle([sx0, cap_h - ss, sx0 + shaft_w, H + ow * 2], radius=5 * ss,
                        fill=palette['body'], outline=palette['outline'], width=ow)
    # 右侧阴影条与左侧高光条（HD 素材的柔和体积感）
    d.rectangle([sx0 + shaft_w - ow - 6 * ss, cap_h + 2 * ss, sx0 + shaft_w - ow, H], fill=palette['deep'])
    d.rectangle([sx0 + ow, cap_h + 2 * ss, sx0 + ow + 3 * ss, H], fill=palette['hi'])
    # 管口横匾
    d.rounded_rectangle([ow // 2, ow // 2, W - ow // 2, cap_h], radius=7 * ss,
                        fill=palette['body'], outline=palette['outline'], width=ow)
    d.rectangle([ow, cap_h - 4 * ss, W - ow, cap_h - ow], fill=palette['deep'])

    if mouth == 'bottom':
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

    # 文字：竖排自上而下，靠近管口一端，正向可读；字色随配色使用同系深色
    tw = 40 * ss
    th = round(mask.height * tw / mask.width)
    glyphs = Image.new('RGBA', (tw, th), (*palette['ink'], 0))
    glyphs.putalpha(mask.resize((tw, th), Image.LANCZOS))
    tx = (W - tw) // 2
    ty = cap_h + 14 * ss if mouth == 'top' else H - cap_h - 14 * ss - th
    img.paste(glyphs, (tx, ty), glyphs)

    # 文字外侧点缀一朵樱花
    fy = ty + th + 18 * ss if mouth == 'top' else ty - 18 * ss
    draw_blossom(ImageDraw.Draw(img), W // 2, fy, 8 * ss,
                 fill=palette['blossom'], outline=palette['outline'], ow=2 * ss)

    return img.resize((76, 480), Image.LANCZOS)


def build_obstacles() -> None:
    """四套障碍变体（与 src/game/assets.ts 的 OBSTACLE_VARIANTS 一一对应）：
    classic 樱花粉、wish 薰衣草、rain 晴空蓝、aim 蜜桃橘；同一对内底柱 / 顶柱文字不同。"""
    text_me = extract_text(os.path.join(RES, 'barrier.jpg'))           # 世界上另一个我
    text_cry = extract_text(os.path.join(RES, 'barrier2.jpg'))         # 你在哭鼻子吗
    text_aim = extract_text_hd(os.path.join(PIC, 'IMG_3452.PNG'))      # 一起命中十环
    text_wish = extract_text_hd(os.path.join(PIC, 'IMG_3453(1).PNG'))  # 做你想做的
    text_rain = extract_text_hd(os.path.join(PIC, 'IMG_3454.PNG'))     # 一起等雨停

    variants = [
        # (文件后缀, 底柱文字, 顶柱文字, 配色)
        ('', text_me, text_cry, 'sakura'),        # classic：世界上另一个我 / 你在哭鼻子吗
        ('-wish', text_wish, text_aim, 'lavender'),  # wish：做你想做的 / 一起命中十环
        ('-rain', text_rain, text_cry, 'skyblue'),   # rain：一起等雨停 / 你在哭鼻子吗
        ('-aim', text_aim, text_me, 'peach'),        # aim：一起命中十环 / 世界上另一个我
    ]
    for suffix, bottom_text, top_text, palette_name in variants:
        palette = PILLAR_PALETTES[palette_name]
        build_pillar(bottom_text, mouth='top', palette=palette).save(os.path.join(OUT, f'obstacle{suffix}.png'))
        build_pillar(top_text, mouth='bottom', palette=palette).save(os.path.join(OUT, f'obstacle{suffix}-top.png'))
        print('obstacle variant', suffix or '-classic', palette_name, 'ok')


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

def draw_star(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill) -> None:
    """四角星光（细长凹菱形，少女梦幻感的标志性点缀）。"""
    q = r * 0.24
    d.polygon([(cx, cy - r), (cx + q, cy - q), (cx + r, cy), (cx + q, cy + q),
               (cx, cy + r), (cx - q, cy + q), (cx - r, cy), (cx - q, cy - q)], fill=fill)


def build_sky(ss: int = 2) -> None:
    # 梦幻渐变：天顶蓝 -> 薰衣草 -> 樱粉地平线（少女梦幻主题的基调层）
    W, H = 960 * ss, 640 * ss
    img = vertical_gradient(W, H, [(0.0, (176, 209, 252)), (0.45, (205, 228, 255)),
                                   (0.72, (232, 223, 250)), (1.0, (252, 226, 241))]).convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, cy, s, a in ((150, 96, 42, 165), (405, 170, 30, 130), (700, 80, 50, 170),
                         (880, 210, 26, 120), (270, 300, 36, 110), (585, 330, 26, 95),
                         (60, 430, 30, 100), (830, 430, 34, 105)):
        draw_cloud(d, cx * ss, cy * ss, s * ss, a)
    layer = layer.filter(ImageFilter.GaussianBlur(3 * ss))
    img.alpha_composite(layer)
    # 梦幻光斑（bokeh）：粉 / 紫 / 白软焦圆，重度模糊后叠加
    bokeh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bokeh)
    for cx, cy, r, color, a in ((90, 190, 30, (255, 214, 236), 88), (340, 250, 22, (224, 208, 255), 96),
                                (520, 130, 34, (255, 255, 255), 72), (760, 250, 26, (255, 214, 236), 84),
                                (910, 120, 20, (224, 208, 255), 92), (200, 420, 24, (255, 224, 240), 78),
                                (640, 400, 30, (228, 214, 255), 72), (450, 480, 20, (255, 255, 255), 64)):
        bd.ellipse([cx * ss - r * ss, cy * ss - r * ss, cx * ss + r * ss, cy * ss + r * ss], fill=(*color, a))
    img.alpha_composite(bokeh.filter(ImageFilter.GaussianBlur(7 * ss)))
    # 静态星光：小四角星散布高处（与游戏内漂浮星光呼应）
    stars = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for cx, cy, r, a in ((70, 90, 7, 190), (250, 200, 5, 150), (430, 60, 8, 200), (560, 280, 5, 140),
                         (660, 160, 6, 175), (820, 70, 7, 190), (930, 300, 5, 150), (150, 330, 5, 135),
                         (360, 380, 6, 150), (720, 460, 5, 130), (880, 500, 6, 145), (40, 520, 5, 125)):
        draw_star(sd, cx * ss, cy * ss, r * ss, (255, 252, 244, a))
    img.alpha_composite(stars.filter(ImageFilter.GaussianBlur(round(0.4 * ss))))
    # 飘落的花瓣：直接取自 IMG_5250 的 HD 裁切
    petals = hd_petals()
    spots = ((120, 150, 15, 24), (300, 90, 12, 200), (480, 210, 14, 320), (628, 120, 12, 90),
             (795, 175, 15, 0), (215, 380, 12, 150), (540, 420, 13, 260), (900, 330, 12, 40),
             (60, 260, 10, 300), (720, 300, 10, 130), (390, 500, 12, 70), (860, 520, 10, 220))
    for i, (x, y, s, ang) in enumerate(spots):
        paste_petal(img, petals[i % len(petals)], x * ss, y * ss, s * ss, ang)
    img.convert('RGB').resize((960, 640), Image.LANCZOS).save(os.path.join(OUT, 'background-sky.png'))
    print('sky ok')


# ---------------------------------------------------------------- 星光贴图

def build_fx(ss: int = 8) -> None:
    """fx-sparkle.png：24x24 四角星光。白色基底 + 柔光晕，游戏内用 tint 着粉彩色。"""
    S = 24 * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([S * 0.22, S * 0.22, S * 0.78, S * 0.78], fill=(255, 244, 250, 150))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(2.2 * ss)))
    d = ImageDraw.Draw(img)
    draw_star(d, S / 2, S / 2, S * 0.46, (255, 255, 255, 235))
    draw_star(d, S / 2, S / 2, S * 0.2, (255, 255, 255, 255))
    img.resize((24, 24), Image.LANCZOS).save(os.path.join(OUT, 'fx-sparkle.png'))
    print('fx ok')


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
    """拼一张 960×640 的模拟游戏画面（四套障碍变体并排）用于快速目检。"""
    sky = Image.open(os.path.join(OUT, 'background-sky.png')).convert('RGBA')
    city = Image.open(os.path.join(OUT, 'background-city.png')).convert('RGBA')
    street = Image.open(os.path.join(OUT, 'background-street.png')).convert('RGBA')
    reward = Image.open(os.path.join(OUT, 'reward.png')).convert('RGBA')
    # 局内精灵是 3x 位图，预览按逻辑 72 回缩（模拟 Phaser setDisplaySize）
    char = Image.open(os.path.join(OUT, 'character-nova.png')).convert('RGBA').resize((72, 72), Image.LANCZOS)
    sparkle = Image.open(os.path.join(OUT, 'fx-sparkle.png')).convert('RGBA')

    frame = Image.new('RGBA', (960, 640))
    frame.paste(sky)
    frame.alpha_composite(city.crop((0, 0, 720, 640)))
    frame.alpha_composite(city.crop((0, 0, 240, 640)), (720, 0))
    frame.alpha_composite(street.crop((0, 0, 720, 165)), (0, 475))
    frame.alpha_composite(street.crop((0, 0, 240, 165)), (720, 475))
    for sx, sy in ((60, 120), (170, 340), (330, 80), (520, 420), (700, 180), (900, 360)):
        frame.alpha_composite(sparkle, (sx, sy))
    gaps = ((240, 260, ''), (430, 330, '-wish'), (620, 240, '-rain'), (830, 350, '-aim'))
    for x, center, suffix in gaps:
        ob = Image.open(os.path.join(OUT, f'obstacle{suffix}.png')).convert('RGBA')
        ot = Image.open(os.path.join(OUT, f'obstacle{suffix}-top.png')).convert('RGBA')
        gap = 175
        frame.alpha_composite(ot, (x - 38, center - gap // 2 - 480))
        frame.alpha_composite(ob, (x - 38, center + gap // 2))
    frame.alpha_composite(reward, (430 - 24, 330 - 24))
    frame.alpha_composite(char, (110 - 36, 300 - 36))
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
    build_fx()
    build_sky()
    build_city()
    build_street()
    build_preview()


if __name__ == '__main__':
    main()
