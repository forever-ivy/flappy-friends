import { describe, expect, it } from 'vitest';
import {
    calculateScore, computeGameWidth, computePlayerX, createSeededRandom,
    FIRST_PIPE_EXTRA, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds,
    KILL_BOTTOM, KILL_TOP, MAX_GAME_WIDTH, PLAYER_BASE_X, PLAYER_MAX_X,
    shouldSpawnReward, SPAWN_OFFSCREEN_X, SPAWN_TRIGGER_FROM_RIGHT,
} from './game';

describe('game rules', () => {
    it('calculates pipe and reward points', () => {
        expect(calculateScore(7, 2)).toBe(17);
        expect(calculateScore(-1, 1.9)).toBe(5);
    });

    it('selects difficulty at score boundaries', () => {
        expect(getDifficulty(9)).toEqual({ minScore: 0, speed: 150, gap: 190 });
        expect(getDifficulty(10)).toEqual({ minScore: 10, speed: 165, gap: 175 });
        expect(getDifficulty(25)).toEqual({ minScore: 25, speed: 180, gap: 165 });
        expect(getDifficulty(50)).toEqual({ minScore: 50, speed: 195, gap: 155 });
    });

    it('uses an exclusive 35 percent reward threshold', () => {
        expect(shouldSpawnReward(0)).toBe(true);
        expect(shouldSpawnReward(0.3499)).toBe(true);
        expect(shouldSpawnReward(0.35)).toBe(false);
    });

    it('ends the run only outside the vertical kill bounds', () => {
        expect(isOutOfBounds(KILL_TOP - 0.1)).toBe(true);
        expect(isOutOfBounds(KILL_TOP)).toBe(false);
        expect(isOutOfBounds(KILL_TOP + 1)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM - 1)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM)).toBe(false);
        expect(isOutOfBounds(KILL_BOTTOM + 0.1)).toBe(true);
    });

    it('produces a deterministic random sequence', () => {
        const first = createSeededRandom(42);
        const second = createSeededRandom(42);
        expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    });
});

describe('adaptive game width', () => {
    it('keeps phone-portrait viewports at the 360 design width', () => {
        expect(computeGameWidth(390, 844)).toBe(360);
        expect(computeGameWidth(375, 667)).toBe(360);
        expect(computeGameWidth(360, 780)).toBe(360);
    });

    it('scales the width with the viewport aspect ratio', () => {
        expect(computeGameWidth(768, 1024)).toBe(480);
        expect(computeGameWidth(1024, 768)).toBe(853);
    });

    it('caps ultrawide viewports at the maximum width', () => {
        expect(computeGameWidth(1366, 768)).toBe(MAX_GAME_WIDTH);
        expect(computeGameWidth(1920, 1080)).toBe(MAX_GAME_WIDTH);
        expect(MAX_GAME_WIDTH).toBe(960);
    });

    it('guards against degenerate viewport sizes', () => {
        expect(computeGameWidth(0, 500)).toBe(GAME_WIDTH);
        expect(computeGameWidth(500, 0)).toBe(GAME_WIDTH);
        expect(computeGameWidth(Number.NaN, 500)).toBe(GAME_WIDTH);
    });

    it('anchors the player proportionally with fixed bounds', () => {
        expect(computePlayerX(360)).toBe(PLAYER_BASE_X);
        expect(computePlayerX(960)).toBe(235);
        expect(computePlayerX(200)).toBe(PLAYER_BASE_X);
        expect(computePlayerX(4000)).toBe(PLAYER_MAX_X);
    });

    it('reproduces the legacy hardcoded geometry at the 360 design width', () => {
        expect(GAME_WIDTH - SPAWN_TRIGGER_FROM_RIGHT).toBe(180);
        expect(GAME_WIDTH + SPAWN_OFFSCREEN_X).toBe(420);
        expect(GAME_WIDTH + FIRST_PIPE_EXTRA).toBe(GAME_HEIGHT - 160); // 480，旧首管生成点
        expect(SPAWN_OFFSCREEN_X + SPAWN_TRIGGER_FROM_RIGHT).toBe(240); // 障碍中心距恒定
    });
});
