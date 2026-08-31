import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BGM_SRC, BGM_VOLUME, BACKGROUNDS, CHARACTER_PORTRAIT_SIZE, CHARACTER_SPRITE_SIZE, CHARACTER_TEXTURE_SIZE, CHARACTERS, GAME_ASSETS, GAME_TITLE, GAME_TITLE_EN, getCharacter, OBSTACLE_PALETTES, OBSTACLE_VARIANTS, REWARD_BITMAP_SIZE, REWARD_TEXTURE_SIZE } from './assets';

const ASSET_ROOT = join(__dirname, '..', '..', 'public', 'assets');

// 读取 PNG IHDR 中的宽高（字节 16-24），保证清单与磁盘上的贴图尺寸一致
function pngSize(relativePath: string): { width: number; height: number } {
    const bytes = readFileSync(join(ASSET_ROOT, relativePath));
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// 最小 PNG 解码（仅支持生成脚本 Pillow 的输出格式：8-bit RGBA、非隔行），
// 供贴图像素抽检，不引入额外依赖
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

describe('obstacle variants manifest', () => {
    it('ships all ten Hyunlix obstacle slogans across eight pastel palettes', () => {
        expect(OBSTACLE_VARIANTS).toHaveLength(10);
        expect(OBSTACLE_VARIANTS.map((variant) => variant.id)).toEqual([
            'stay', 'one43', 'hyunlix', 'bbokari', 'dear', 'jiniret', 'lalala', 'lisgo', 'yongbok', 'withu',
        ]);
        expect(OBSTACLE_VARIANTS.every((variant) => OBSTACLE_PALETTES.includes(variant.palette as typeof OBSTACLE_PALETTES[number]))).toBe(true);
        expect(new Set(OBSTACLE_VARIANTS.map((variant) => variant.palette)).size).toBeGreaterThanOrEqual(6);
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
    it('ships three full-screen slideshow backgrounds at 960x640', () => {
        BACKGROUNDS.forEach((background) => {
            expect(pngSize(background.image)).toEqual({ width: 960, height: 640 });
        });
        expect(new Set(BACKGROUNDS.map((background) => background.textureKey)).size).toBe(BACKGROUNDS.length);
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
        // 上限 4MB：锁定 112kbps 重编码成果（2026-08-26 出口带宽打满事件后 5.3MB→3.1MB；
        // 原文件曾是 17MB 的 MP4 视频容器，拖慢首次出声）
        const size = statSync(join(ASSET_ROOT, '..', BGM_SRC)).size;
        expect(size).toBeGreaterThan(1024 * 1024);
        expect(size).toBeLessThan(4 * 1024 * 1024);
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

    it('ships every in-game character sprite as a 216x216 HD bitmap (displayed at logical size)', () => {
        CHARACTERS.forEach((character) => {
            expect(pngSize(character.image)).toEqual({ width: CHARACTER_SPRITE_SIZE, height: CHARACTER_SPRITE_SIZE });
            expect(character.collisionRadius).toBeGreaterThan(0);
            // 碰撞半径在逻辑显示坐标系里定义，必须落在显示尺寸内
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

describe('character sprites', () => {
    it('ships non-empty RGBA sprites for every roster member', () => {
        CHARACTERS.forEach((character) => {
            const { width, height, rgba } = pngPixels(character.image);
            expect(width).toBe(CHARACTER_SPRITE_SIZE);
            expect(height).toBe(CHARACTER_SPRITE_SIZE);
            let opaque = 0;
            for (let i = 0; i < rgba.length; i += 4) {
                if (rgba[i + 3] > 200) opaque += 1;
            }
            expect(opaque).toBeGreaterThan(500);
        });
    });
});

describe('character roster', () => {
    it('ships the three playable characters: snow, stripe, duo', () => {
        expect(CHARACTERS.map((character) => character.id)).toEqual(['snow', 'stripe', 'duo']);
    });

    it('names the roster Hyunjin / Felix / Hyunlix', () => {
        expect(CHARACTERS.map((character) => character.name)).toEqual(['Hyunjin', 'Felix', 'Hyunlix']);
        expect(getCharacter('snow').name).toBe('Hyunjin');
        expect(getCharacter('stripe').name).toBe('Felix');
        expect(getCharacter('duo').name).toBe('Hyunlix');
    });

    it('falls back to snow for retired ids (nova / moss / sol / violet) from old saves or the backend', () => {
        expect(getCharacter('stripe').id).toBe('stripe');
        expect(getCharacter('nova').id).toBe('snow');
        expect(getCharacter('moss').id).toBe('snow');
        expect(getCharacter('sol').id).toBe('snow');
        expect(getCharacter('violet').id).toBe('snow');
        expect(getCharacter('unknown').id).toBe('snow');
    });
});

describe('branding', () => {
    it('uses the Hyunjin × Felix title', () => {
        expect(GAME_TITLE).toBe('Hyunjin × Felix');
        expect(GAME_TITLE_EN).toBe('Hyunjin × Felix');
    });
});
