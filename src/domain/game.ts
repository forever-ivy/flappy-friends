export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;
export const REWARD_POINTS = 5;
export const REWARD_CHANCE = 0.35;

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
