import { describe, expect, it } from 'vitest';
import {
    calculateScore, computeEffectQuality, computeGameWidth, computePlayerX, computeRenderScale, computeRenderScaleCap,
    computeStageHeight, createRunId, createSeededRandom,
    FIRST_PIPE_EXTRA, GAME_HEIGHT, GAME_WIDTH, getDifficulty, isOutOfBounds,
    KILL_BOTTOM, KILL_TOP, MAX_GAME_WIDTH, MAX_RENDER_SCALE, MAX_STAGE_HEIGHT, PLAYER_BASE_X, PLAYER_MAX_X,
    pickRewardKind, REWARD_MIRROR_CHANCE, shouldSpawnReward, SPAWN_OFFSCREEN_X, SPAWN_TRIGGER_FROM_RIGHT,
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

    it('spawns the two reward kinds at different rates (fork common, mirror rare)', () => {
        // 概率必须不同：镜子为稀有款（<50%），叉子为主奖励
        expect(REWARD_MIRROR_CHANCE).toBeGreaterThan(0);
        expect(REWARD_MIRROR_CHANCE).toBeLessThan(0.5);
        expect(pickRewardKind(0)).toBe('mirror');
        expect(pickRewardKind(REWARD_MIRROR_CHANCE - 0.0001)).toBe('mirror');
        expect(pickRewardKind(REWARD_MIRROR_CHANCE)).toBe('fork');
        expect(pickRewardKind(0.9999)).toBe('fork');
        // 非法输入回退到主奖励
        expect(pickRewardKind(-0.1)).toBe('fork');
    });

    it('keeps the seeded reward-kind distribution near the configured 70/30 split', () => {
        const random = createSeededRandom(2026);
        let mirrors = 0;
        const draws = 2000;
        for (let index = 0; index < draws; index += 1) {
            if (pickRewardKind(random()) === 'mirror') mirrors += 1;
        }
        expect(mirrors / draws).toBeGreaterThan(REWARD_MIRROR_CHANCE - 0.05);
        expect(mirrors / draws).toBeLessThan(REWARD_MIRROR_CHANCE + 0.05);
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

describe('createRunId（结算标识必须在非安全上下文可用）', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('优先使用 crypto.randomUUID（安全上下文）', () => {
        expect(createRunId({ randomUUID: () => 'from-random-uuid' })).toBe('from-random-uuid');
    });

    it('http://IP 场景（无 randomUUID、有 getRandomValues）不抛异常且输出 UUIDv4 格式', () => {
        const cryptoLike = {
            getRandomValues: <T extends ArrayBufferView>(array: T): T => {
                new Uint8Array(array.buffer).fill(0xab);
                return array;
            },
        };
        const id = createRunId(cryptoLike);
        expect(id).toMatch(UUID_V4);
    });

    it('完全没有 crypto 时退回 Math.random，仍是 UUIDv4 格式且互不相同', () => {
        const first = createRunId(undefined);
        const second = createRunId(undefined);
        expect(first).toMatch(UUID_V4);
        expect(second).toMatch(UUID_V4);
        expect(first).not.toBe(second);
    });
});

describe('设备分档（渲染倍率上限 / 特效档位）', () => {
    it('桌面细指针保持 3x 上限与 full 特效', () => {
        const desktop = { coarsePointer: false, deviceMemory: 8, hardwareConcurrency: 8 };
        expect(computeRenderScaleCap(desktop)).toBe(MAX_RENDER_SCALE);
        expect(computeEffectQuality(desktop)).toBe('full');
    });

    it('移动端（粗指针）上限收敛到 2x 并走 lite 特效', () => {
        const phone = { coarsePointer: true, hardwareConcurrency: 6 };
        expect(computeRenderScaleCap(phone)).toBe(2);
        expect(computeEffectQuality(phone)).toBe('lite');
        // iPhone：无 deviceMemory 也按移动端处理
        expect(computeRenderScaleCap({ coarsePointer: true })).toBe(2);
    });

    it('明确弱机（≤2GB 内存或 ≤3 核）上限 1x，流畅优先', () => {
        expect(computeRenderScaleCap({ coarsePointer: true, deviceMemory: 2 })).toBe(1);
        expect(computeRenderScaleCap({ coarsePointer: false, hardwareConcurrency: 2 })).toBe(1);
        expect(computeEffectQuality({ coarsePointer: true, deviceMemory: 1 })).toBe('lite');
    });

    it('渲染倍率遵守传入的上限（DPR3 手机从 3x 收敛到 2x）', () => {
        expect(computeRenderScale(3, 844, 2)).toBe(2);
        expect(computeRenderScale(3, 844, 1)).toBe(1);
        // 上限缺省 / 非法时仍按 MAX_RENDER_SCALE 处理
        expect(computeRenderScale(3, 844, Number.NaN)).toBe(MAX_RENDER_SCALE);
        // 上限不影响低需求场景：dpr1 小窗口本来就是 1x
        expect(computeRenderScale(1, 640, 2)).toBe(1);
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

    it('extends the stage upward on tall phone viewports so the canvas fills the screen', () => {
        // iPhone 14/15 类（390×844）：宽 360，高按视口比例延伸到 779（出血 139 全在天空一侧）
        expect(computeStageHeight(390, 844)).toBe(779);
        // 20:9 安卓（360×800）恰好到达上限
        expect(computeStageHeight(360, 800)).toBe(MAX_STAGE_HEIGHT);
        expect(MAX_STAGE_HEIGHT).toBe(800);
    });

    it('keeps the 640 design height when the viewport is 9:16 or wider', () => {
        expect(computeStageHeight(360, 640)).toBe(GAME_HEIGHT);
        // 3:4 平板：宽度自适应到 480 后画布正好铺满，无需纵向出血
        expect(computeStageHeight(768, 1024)).toBe(GAME_HEIGHT);
        // 桌面宽屏：两侧留白交给 CSS 梦幻背景，高度保持 640
        expect(computeStageHeight(1920, 1080)).toBe(GAME_HEIGHT);
        expect(computeStageHeight(1600, 900)).toBe(GAME_HEIGHT);
    });

    it('caps the sky bleed so obstacle art still covers the visible top edge', () => {
        expect(computeStageHeight(320, 2000)).toBe(MAX_STAGE_HEIGHT);
        // 出血上限 160 < 顶部柱子最少向上延伸量（约 189），柱子不会在可视区内“断头”
        expect(MAX_STAGE_HEIGHT - GAME_HEIGHT).toBeLessThanOrEqual(160);
    });

    it('guards stage height against degenerate viewport sizes', () => {
        expect(computeStageHeight(0, 500)).toBe(GAME_HEIGHT);
        expect(computeStageHeight(500, 0)).toBe(GAME_HEIGHT);
        expect(computeStageHeight(Number.NaN, 500)).toBe(GAME_HEIGHT);
    });

    it('scales the canvas backing store for high-DPR screens and large windows', () => {
        // 高 DPR 手机：iPhone（dpr 3, 844css）需要 844*3/640≈3.96 → clamp 到 3
        expect(computeRenderScale(3, 844)).toBe(MAX_RENDER_SCALE);
        // Retina 笔记本：dpr 2, 800css → ceil(2.5) = 3
        expect(computeRenderScale(2, 800)).toBe(3);
        // 桌面 1080p（dpr 1）：640 逻辑高被 CSS 拉伸到 ~950px → 需要 2x
        expect(computeRenderScale(1, 950)).toBe(2);
        // 小窗口 dpr 1：显示高不超过逻辑高，无需超采样
        expect(computeRenderScale(1, 640)).toBe(1);
        expect(computeRenderScale(1, 480)).toBe(1);
    });

    it('guards render scale against degenerate inputs', () => {
        expect(computeRenderScale(Number.NaN, 900)).toBe(2);
        expect(computeRenderScale(0, 900)).toBe(2);
        expect(computeRenderScale(2, Number.NaN)).toBe(2);
        expect(computeRenderScale(2, 0)).toBe(2);
        expect(computeRenderScale(10, 3000)).toBe(MAX_RENDER_SCALE);
    });

    it('reproduces the legacy hardcoded geometry at the 360 design width', () => {
        expect(GAME_WIDTH - SPAWN_TRIGGER_FROM_RIGHT).toBe(180);
        expect(GAME_WIDTH + SPAWN_OFFSCREEN_X).toBe(420);
        expect(GAME_WIDTH + FIRST_PIPE_EXTRA).toBe(GAME_HEIGHT - 160); // 480，旧首管生成点
        expect(SPAWN_OFFSCREEN_X + SPAWN_TRIGGER_FROM_RIGHT).toBe(240); // 障碍中心距恒定
    });
});
