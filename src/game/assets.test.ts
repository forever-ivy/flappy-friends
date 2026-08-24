import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    CHARACTER_BITMAP_SIZE, CHARACTER_PORTRAIT_SIZE, CHARACTER_TEXTURE_SIZE,
    CHARACTERS, GAME_ASSETS, getCharacter, OBSTACLE_VARIANTS,
} from './assets';

const ASSET_ROOT = join(__dirname, '..', '..', 'public', 'assets');

// 读取 PNG IHDR 中的宽高（字节 16-24），保证清单与磁盘上的贴图尺寸一致
function pngSize(relativePath: string): { width: number; height: number } {
    const bytes = readFileSync(join(ASSET_ROOT, relativePath));
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('obstacle variants manifest', () => {
    it('provides at least four pastel variants', () => {
        expect(OBSTACLE_VARIANTS.length).toBeGreaterThanOrEqual(4);
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
        expect(pngSize(GAME_ASSETS.reward)).toEqual({ width: 48, height: 48 });
        expect(pngSize(GAME_ASSETS.rewardMirror)).toEqual({ width: 48, height: 48 });
        expect(pngSize(GAME_ASSETS.sparkle)).toEqual({ width: 24, height: 24 });
    });

    it('ships every in-game character sprite as a 3x bitmap (216x216 for logical 72)', () => {
        expect(CHARACTER_BITMAP_SIZE).toBe(CHARACTER_TEXTURE_SIZE * 3);
        CHARACTERS.forEach((character) => {
            expect(pngSize(character.image)).toEqual({ width: CHARACTER_BITMAP_SIZE, height: CHARACTER_BITMAP_SIZE });
            expect(character.collisionRadius).toBeGreaterThan(0);
            // 碰撞圆按逻辑 72px 空间定义，必须能放进逻辑贴图内
            expect(character.collisionRadius * 2).toBeLessThanOrEqual(CHARACTER_TEXTURE_SIZE);
        });
    });

    it('ships a dedicated hi-res menu portrait for every character', () => {
        CHARACTERS.forEach((character) => {
            expect(character.portrait).not.toBe(character.image);
            expect(pngSize(character.portrait)).toEqual({ width: CHARACTER_PORTRAIT_SIZE, height: CHARACTER_PORTRAIT_SIZE });
        });
    });
});

describe('character roster', () => {
    it('keeps exactly the two HD characters: nova and moss', () => {
        expect(CHARACTERS.map((character) => character.id)).toEqual(['nova', 'moss']);
    });

    it('falls back to nova for retired ids from old saves or the backend', () => {
        expect(getCharacter('sol').id).toBe('nova');
        expect(getCharacter('violet').id).toBe('nova');
        expect(getCharacter('unknown').id).toBe('nova');
        expect(getCharacter('moss').id).toBe('moss');
    });
});
