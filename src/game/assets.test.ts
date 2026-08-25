import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BGM_SRC, BGM_VOLUME, CHARACTER_PORTRAIT_SIZE, CHARACTER_SPRITE_SIZE, CHARACTER_TEXTURE_SIZE, CHARACTERS, GAME_ASSETS, GAME_TITLE, GAME_TITLE_EN, getCharacter, OBSTACLE_VARIANTS, REWARD_BITMAP_SIZE, REWARD_TEXTURE_SIZE } from './assets';

const ASSET_ROOT = join(__dirname, '..', '..', 'public', 'assets');

// 读取 PNG IHDR 中的宽高（字节 16-24），保证清单与磁盘上的贴图尺寸一致
function pngSize(relativePath: string): { width: number; height: number } {
    const bytes = readFileSync(join(ASSET_ROOT, relativePath));
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// 最小 PNG 解码（仅支持生成脚本 Pillow 的输出格式：8-bit RGBA、非隔行），
// 供朝向回归测试读取真实像素，不引入额外依赖
function pngPixels(relativePath: string): { width: number; height: number; rgba: Uint8Array } {
    const bytes = readFileSync(join(ASSET_ROOT, relativePath));
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const bitDepth = bytes[24];
    const colorType = bytes[25];
    const interlace = bytes[28];
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`unsupported png layout in ${relativePath}: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
    }
    const idat: Buffer[] = [];
    for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    const rgba = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = y * stride;
        for (let x = 0; x < stride; x++) {
            const left = x >= 4 ? rgba[out + x - 4] : 0;
            const up = y > 0 ? rgba[out + x - stride] : 0;
            const upLeft = x >= 4 && y > 0 ? rgba[out + x - stride - 4] : 0;
            let value = row[x];
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += (left + up) >> 1;
            else if (filter === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left);
                const pb = Math.abs(p - up);
                const pc = Math.abs(p - upLeft);
                value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            }
            rgba[out + x] = value & 0xff;
        }
    }
    return { width, height, rgba };
}

// 朝向度量：肤色像素质心相对头发（深色）像素质心的水平偏移，按宽度归一化。
// 两位角色均为 3/4 侧脸，脸露在行进方向一侧：朝右时 margin 明显为正，朝左时为负。
// 当前四张贴图实测 margin ≥ +0.08，其水平镜像（朝左）为 ≤ -0.08。
function facingMargin(relativePath: string): number {
    const { width, height, rgba } = pngPixels(relativePath);
    let skinSum = 0;
    let skinCount = 0;
    let hairSum = 0;
    let hairCount = 0;
    for (let i = 0; i < width * height; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        if (rgba[i * 4 + 3] < 200) continue;
        const x = i % width;
        if (r > 230 && g > 170 && g < 232 && b > 150 && b < 225 && r > g && g > b) {
            skinSum += x;
            skinCount += 1;
        } else if (Math.max(r, g, b) < 130) {
            hairSum += x;
            hairCount += 1;
        }
    }
    expect(skinCount).toBeGreaterThan(100);
    expect(hairCount).toBeGreaterThan(1000);
    return (skinSum / skinCount - hairSum / hairCount) / width;
}

describe('obstacle variants manifest', () => {
    it('ships all five source slogans in cherry-blossom pink', () => {
        expect(OBSTACLE_VARIANTS).toHaveLength(5);
        expect(OBSTACLE_VARIANTS.map((variant) => variant.id)).toEqual(['me', 'cry', 'aim', 'wish', 'rain']);
        expect(OBSTACLE_VARIANTS.every((variant) => variant.palette === '樱花粉')).toBe(true);
    });

    it('has unique ids and texture keys', () => {
        const ids = OBSTACLE_VARIANTS.map((variant) => variant.id);
        const keys = OBSTACLE_VARIANTS.flatMap((variant) => [variant.bottomKey, variant.topKey]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('ships every pillar texture at 76x480 (physics contract)', () => {
        OBSTACLE_VARIANTS.forEach((variant) => {
            expect(pngSize(variant.bottomImage)).toEqual({ width: 76, height: 480 });
            expect(pngSize(variant.topImage)).toEqual({ width: 76, height: 480 });
        });
    });
});

describe('game assets manifest', () => {
    it('ships background and effect textures at the documented sizes', () => {
        expect(pngSize(GAME_ASSETS.sky)).toEqual({ width: 960, height: 640 });
        expect(pngSize(GAME_ASSETS.city)).toEqual({ width: 720, height: 640 });
        expect(pngSize(GAME_ASSETS.street)).toEqual({ width: 720, height: 180 });
        expect(pngSize(GAME_ASSETS.sparkle)).toEqual({ width: 24, height: 24 });
    });

    it('ships both reward textures as 144x144 HD bitmaps (displayed at logical 48)', () => {
        expect(pngSize(GAME_ASSETS.reward)).toEqual({ width: REWARD_BITMAP_SIZE, height: REWARD_BITMAP_SIZE });
        expect(pngSize(GAME_ASSETS.rewardMirror)).toEqual({ width: REWARD_BITMAP_SIZE, height: REWARD_BITMAP_SIZE });
        // 位图必须是逻辑尺寸的整数倍（当前 3x，匹配 renderScale 上限），缩放才不引入采样畸变
        expect(REWARD_BITMAP_SIZE % REWARD_TEXTURE_SIZE).toBe(0);
        expect(REWARD_BITMAP_SIZE / REWARD_TEXTURE_SIZE).toBeGreaterThanOrEqual(2);
    });

    it('ships the background music at the committed public path with a soft volume', () => {
        // BGM_SRC 相对 public/ 根（与 Phaser setPath('assets') 同层级），文件已入库不可缺失；
        // 上限 8MB：锁定「纯音频」瘦身成果（原文件是 17MB 的 MP4 视频容器，拖慢首次出声）
        const size = statSync(join(ASSET_ROOT, '..', BGM_SRC)).size;
        expect(size).toBeGreaterThan(1024 * 1024);
        expect(size).toBeLessThan(8 * 1024 * 1024);
        expect(BGM_SRC.endsWith('.mp3')).toBe(true);
        expect(BGM_VOLUME).toBeGreaterThan(0);
        expect(BGM_VOLUME).toBeLessThanOrEqual(0.5);
    });

    it('ships the background music as a real MP3 stream (not a video container)', () => {
        // ID3 标签或 MPEG 帧同步字（0xFFEx）开头才是真 MP3；MP4 容器（ftyp）会拖慢流式起播
        const head = readFileSync(join(ASSET_ROOT, '..', BGM_SRC)).subarray(0, 3);
        const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
        const isFrameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
        expect(isId3 || isFrameSync).toBe(true);
    });

    it('ships every in-game character sprite as a 216x216 HD bitmap (displayed at logical 72)', () => {
        CHARACTERS.forEach((character) => {
            expect(pngSize(character.image)).toEqual({ width: CHARACTER_SPRITE_SIZE, height: CHARACTER_SPRITE_SIZE });
            expect(character.collisionRadius).toBeGreaterThan(0);
            // 碰撞半径在逻辑 72 坐标系里定义，必须落在显示尺寸内
            expect(character.collisionRadius * 2).toBeLessThanOrEqual(CHARACTER_TEXTURE_SIZE);
        });
    });

    it('ships a dedicated 256x256 menu portrait per character (never the in-game sprite)', () => {
        CHARACTERS.forEach((character) => {
            expect(pngSize(character.portrait)).toEqual({ width: CHARACTER_PORTRAIT_SIZE, height: CHARACTER_PORTRAIT_SIZE });
            expect(character.portrait).not.toBe(character.image);
        });
    });
});

describe('character orientation (user-approved hand direction)', () => {
    // 直接解码入库 PNG，锁定用户按截图确认的水平朝向，避免再次误翻转。
    it('keeps every in-game sprite in the approved orientation', () => {
        CHARACTERS.forEach((character) => {
            expect(facingMargin(character.image)).toBeLessThan(-0.03);
        });
    });

    it('keeps every menu portrait in the same approved orientation', () => {
        CHARACTERS.forEach((character) => {
            expect(facingMargin(character.portrait)).toBeLessThan(-0.03);
        });
    });
});

describe('character roster', () => {
    it('keeps exactly the two original-art characters: nova and moss', () => {
        expect(CHARACTERS.map((character) => character.id)).toEqual(['nova', 'moss']);
    });

    // 品牌命名：菜单角色轨从左到右为 碗碗（nova）/ 盆盆（moss），卡片与无障碍标签都展示该名字
    it('names the roster 碗碗 (left) and 盆盆 (right)', () => {
        expect(CHARACTERS.map((character) => character.name)).toEqual(['碗碗', '盆盆']);
        expect(getCharacter('nova').name).toBe('碗碗');
        expect(getCharacter('moss').name).toBe('盆盆');
    });

    it('falls back to nova for retired ids (sol / violet) from old saves or the backend', () => {
        expect(getCharacter('moss').id).toBe('moss');
        expect(getCharacter('sol').id).toBe('nova');
        expect(getCharacter('violet').id).toBe('nova');
        expect(getCharacter('unknown').id).toBe('nova');
    });
});

describe('branding', () => {
    it('pairs the Chinese main title with the English subtitle', () => {
        expect(GAME_TITLE).toBe('飞天碗盆');
        expect(GAME_TITLE_EN).toBe('Flying Wanpen');
    });
});
