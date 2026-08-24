import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, GAME_ASSETS, OBSTACLE_VARIANTS } from './assets';

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

    it('ships every character texture at 72x72 with a collision circle inside it', () => {
        CHARACTERS.forEach((character) => {
            expect(pngSize(character.image)).toEqual({ width: 72, height: 72 });
            expect(character.collisionRadius).toBeGreaterThan(0);
            expect(character.collisionRadius * 2).toBeLessThanOrEqual(72);
        });
    });
});
