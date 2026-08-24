export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;
// 大屏适配：画布高度恒定，宽度按视口比例在 [GAME_WIDTH, MAX_GAME_WIDTH] 内自适应
export const MAX_GAME_WIDTH = 960;

// 障碍生成几何：触发线与生成点都相对画布右缘，360 宽时与旧硬编码完全一致（180 / 420 / 480），
// 任意宽度下相邻障碍中心距恒为 (SPAWN_OFFSCREEN_X + SPAWN_TRIGGER_FROM_RIGHT) = 240
export const SPAWN_TRIGGER_FROM_RIGHT = 180;
export const SPAWN_OFFSCREEN_X = 60;
export const FIRST_PIPE_EXTRA = 120;

// 玩家横向锚点：随画布等比右移，限制桌面端的前瞻视野倍数（360→88，960→235）
export const PLAYER_BASE_X = 88;
export const PLAYER_MAX_X = 240;

export const REWARD_POINTS = 5;
export const REWARD_CHANCE = 0.35;

// Canvas 渲染倍率：打断「canvas 逻辑 72px → CSS/浏览器位图放大」的糊化链条。
// canvas 后备像素 = 逻辑尺寸 × 倍率（相机 setZoom 同倍率，逻辑坐标不变），
// 倍率 = 画布实际显示所需的设备像素高 / 逻辑高（640）向上取整，clamp 到 [1, 3]。
// 同时覆盖两类放大源：高 DPR 屏（dpr≥2）与桌面大窗口（640 逻辑高被 CSS 拉伸到 ~1000px）。
export const MAX_RENDER_SCALE = 3;

export function computeRenderScale(devicePixelRatio: number, viewportHeight: number): number {
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const cssHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : GAME_HEIGHT;
    const devicePixelHeight = cssHeight * dpr;
    return Math.min(MAX_RENDER_SCALE, Math.max(1, Math.ceil(devicePixelHeight / GAME_HEIGHT)));
}

export function computeGameWidth(viewportWidth: number, viewportHeight: number): number {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
        || viewportWidth <= 0 || viewportHeight <= 0) return GAME_WIDTH;
    return Math.max(GAME_WIDTH, Math.min(MAX_GAME_WIDTH, Math.round((viewportWidth / viewportHeight) * GAME_HEIGHT)));
}

export function computePlayerX(width: number): number {
    return Math.min(PLAYER_MAX_X, Math.max(PLAYER_BASE_X, Math.round((width * PLAYER_BASE_X) / GAME_WIDTH)));
}

// 角色中心点越过这两条线（顶部 / 底部）即判定本局结束
export const KILL_TOP = 18;
export const KILL_BOTTOM = GAME_HEIGHT - 36;

export interface DifficultyTier {
    minScore: number;
    speed: number;
    gap: number;
}

export const DIFFICULTY_TIERS: readonly DifficultyTier[] = [
    { minScore: 0, speed: 150, gap: 190 },
    { minScore: 10, speed: 165, gap: 175 },
    { minScore: 25, speed: 180, gap: 165 },
    { minScore: 50, speed: 195, gap: 155 },
];

export interface RunResult {
    clientRunId: string;
    characterId: string;
    pipeCount: number;
    rewardCount: number;
    totalScore: number;
    durationMs: number;
    createdAt: string;
}

export function calculateScore(pipeCount: number, rewardCount: number): number {
    return Math.max(0, Math.floor(pipeCount)) + Math.max(0, Math.floor(rewardCount)) * REWARD_POINTS;
}

export function getDifficulty(score: number): DifficultyTier {
    for (let index = DIFFICULTY_TIERS.length - 1; index >= 0; index -= 1) {
        if (score >= DIFFICULTY_TIERS[index].minScore) return DIFFICULTY_TIERS[index];
    }
    return DIFFICULTY_TIERS[0];
}

export function shouldSpawnReward(randomValue: number): boolean {
    return randomValue >= 0 && randomValue < REWARD_CHANCE;
}

export function isOutOfBounds(y: number): boolean {
    return y < KILL_TOP || y > KILL_BOTTOM;
}

export function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
