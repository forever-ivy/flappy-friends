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

// 143 分彩蛋：Hyunjin「I love you」暗号，每局至多触发一次
export const EASTER_EGG_143_SCORE = 143;

export function shouldTrigger143EasterEgg(previousScore: number, nextScore: number, alreadyTriggered: boolean): boolean {
    if (alreadyTriggered) return false;
    return previousScore < EASTER_EGG_143_SCORE && nextScore >= EASTER_EGG_143_SCORE;
}

export const EASTER_EGG_143_DANMAKU_MS = 5200;
export const EASTER_EGG_143_DANMAKU_SPAWN_MS = 85;
export const EASTER_EGG_143_DANMAKU_BURST = 4;
export const EASTER_EGG_143_DANMAKU_BURST_LITE = 2;

export const EASTER_EGG_143_DANMAKU_MESSAGES = [
    '143 ♡', 'I love you', 'Hyunlix', 'STAY', '143', '현릭스', 'Fly high together!',
    'Hyunjin × Felix', 'WITH U', 'LISGO', '♡ 143 ♡', 'You got this!', '143 forever',
] as const;

// 角色自动 emoji：仅过柱触发 + 长冷却；停留期间跟随角色
export const EMOJI_MIN_COOLDOWN_MS = 5200;
export const EMOJI_HOLD_MS = 2000;
export const EMOJI_FADE_MS = 900;
export const EMOJI_PIPE_INTERVAL_MIN = 6;
export const EMOJI_PIPE_INTERVAL_MAX = 9;
export const EMOJI_MAX_ACTIVE = 1;

export const PLAYER_EMOJIS = [
    '♡', '💜', '✨', '🌸', '💫', '🎀', '⭐', '🪽', '💕', '🥰', '💙', '💛',
] as const;

export interface EmojiTriggerState {
    pipesSinceLast: number;
    cooldownMs: number;
    pipeInterval: number;
}

function clampUnit(randomValue: number): number {
    if (!Number.isFinite(randomValue)) return 0;
    return Math.max(0, Math.min(0.999999, randomValue));
}

export function pickRandomEmoji(randomValue: number): string {
    return PLAYER_EMOJIS[Math.floor(clampUnit(randomValue) * PLAYER_EMOJIS.length)]!;
}

export function pickEmojiPipeInterval(randomValue: number): number {
    const span = EMOJI_PIPE_INTERVAL_MAX - EMOJI_PIPE_INTERVAL_MIN + 1;
    return EMOJI_PIPE_INTERVAL_MIN + Math.floor(clampUnit(randomValue) * span);
}

export function createEmojiTriggerState(randomValue: number): EmojiTriggerState {
    return {
        pipesSinceLast: 0,
        cooldownMs: EMOJI_MIN_COOLDOWN_MS,
        pipeInterval: pickEmojiPipeInterval(randomValue),
    };
}

export function advanceEmojiTriggerState(state: EmojiTriggerState, deltaMs: number): EmojiTriggerState {
    return {
        ...state,
        cooldownMs: Math.max(0, state.cooldownMs - deltaMs),
    };
}

export function shouldEmitPlayerEmoji(state: EmojiTriggerState, activeCount: number): boolean {
    if (activeCount >= EMOJI_MAX_ACTIVE) return false;
    if (state.cooldownMs > 0) return false;
    return state.pipesSinceLast >= state.pipeInterval;
}

export function resetEmojiTriggerAfterEmit(state: EmojiTriggerState, randomPipe: number): EmojiTriggerState {
    return {
        pipesSinceLast: 0,
        cooldownMs: EMOJI_MIN_COOLDOWN_MS,
        pipeInterval: pickEmojiPipeInterval(randomPipe),
    };
}

// 两种奖励贴图的刷新概率不同（不再严格交替）：蝴蝶结叉子为主奖励（70%），
// 蝴蝶结镜子为稀有款（30%）。仅贴图差异，碰撞与计分完全一致。
export const REWARD_MIRROR_CHANCE = 0.3;

export type RewardKind = 'fork' | 'mirror';

export function pickRewardKind(randomValue: number): RewardKind {
    return randomValue >= 0 && randomValue < REWARD_MIRROR_CHANCE ? 'mirror' : 'fork';
}

// Canvas 渲染倍率：打断「canvas 逻辑 72px → CSS/浏览器位图放大」的糊化链条。
// canvas 后备像素 = 逻辑尺寸 × 倍率（相机 setZoom 同倍率，逻辑坐标不变），
// 倍率 = 画布实际显示所需的设备像素高 / 逻辑高（640）向上取整，clamp 到 [1, 3]。
// 同时覆盖两类放大源：高 DPR 屏（dpr≥2）与桌面大窗口（640 逻辑高被 CSS 拉伸到 ~1000px）。
export const MAX_RENDER_SCALE = 3;

// 设备能力线索（全部来自只读的 navigator/matchMedia，取不到时留空）
export interface DeviceHints {
    coarsePointer: boolean;
    deviceMemory?: number;
    hardwareConcurrency?: number;
}

// 渲染倍率上限按设备收敛（手机掉帧的主因是超采样后备像素过大）：
// - 桌面（细指针）：3，Retina 大窗口仍锐利；
// - 移动端（粗指针）：2 —— DPR3 手机若放开到 3x，后备像素达 1080×2400（约 260 万），
//   中低端 GPU 明显掉帧；2x 已消除大部分糊化且像素量降到约 44%；
// - 明确弱机（内存 ≤2GB 或逻辑核 ≤3）：1，流畅优先。
export function computeRenderScaleCap(hints: DeviceHints): number {
    const memory = hints.deviceMemory;
    const cores = hints.hardwareConcurrency;
    const weak = (typeof memory === 'number' && memory > 0 && memory <= 2)
        || (typeof cores === 'number' && cores > 0 && cores <= 3);
    if (weak) return 1;
    if (hints.coarsePointer) return 2;
    return MAX_RENDER_SCALE;
}

// 特效档位：移动端与弱机走 lite（减星光数量、去障碍缺口闪点、弹幕降密），
// 桌面 full 保持原有观感。判定与渲染倍率上限共用同一套设备线索。
export type EffectQuality = 'full' | 'lite';

export function computeEffectQuality(hints: DeviceHints): EffectQuality {
    return computeRenderScaleCap(hints) < MAX_RENDER_SCALE ? 'lite' : 'full';
}

export function computeRenderScale(devicePixelRatio: number, viewportHeight: number, cap = MAX_RENDER_SCALE): number {
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const cssHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : GAME_HEIGHT;
    const safeCap = Number.isFinite(cap) ? Math.min(MAX_RENDER_SCALE, Math.max(1, cap)) : MAX_RENDER_SCALE;
    const devicePixelHeight = cssHeight * dpr;
    return Math.min(safeCap, Math.max(1, Math.ceil(devicePixelHeight / GAME_HEIGHT)));
}

export function computeGameWidth(viewportWidth: number, viewportHeight: number): number {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
        || viewportWidth <= 0 || viewportHeight <= 0) return GAME_WIDTH;
    return Math.max(GAME_WIDTH, Math.min(MAX_GAME_WIDTH, Math.round((viewportWidth / viewportHeight) * GAME_HEIGHT)));
}

// 竖屏消除上下 letterbox：视口窄于 9:16 时画布逻辑高度向“天空方向”出血扩展（玩法区仍是底部对齐的
// width×640，物理/难度/碰撞零改动），使 canvas 铺满视口、角色冲顶时头顶不再被画布上缘裁切。
// 上限 800（20:9 手机恰好铺满）：出血 ≤160 时顶部障碍贴图（至少延伸到 y≈-189）仍盖满可视区，
// 柱子不会在半空“断头”；更极端的细长视口由 CSS 同色系梦幻背景兜底。
export const MAX_STAGE_HEIGHT = 800;

export function computeStageHeight(viewportWidth: number, viewportHeight: number): number {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
        || viewportWidth <= 0 || viewportHeight <= 0) return GAME_HEIGHT;
    const width = computeGameWidth(viewportWidth, viewportHeight);
    return Math.max(GAME_HEIGHT, Math.min(MAX_STAGE_HEIGHT, Math.round((viewportHeight / viewportWidth) * width)));
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

// crypto.randomUUID 只存在于安全上下文（HTTPS / localhost）。线上以 http://IP 访问时
// 它是 undefined，直接调用会在碰撞回调里抛 TypeError，打断 Phaser 帧循环且
// game:over 永远发不出去——表现为“死亡后卡死在对局画面，不出结算”。
// 这里按可用性降级：randomUUID → getRandomValues 手组 UUIDv4 → Math.random 兜底。
interface CryptoLike {
    randomUUID?: () => string;
    getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

export function createRunId(cryptoLike: CryptoLike | undefined = globalThis.crypto): string {
    if (typeof cryptoLike?.randomUUID === 'function') return cryptoLike.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof cryptoLike?.getRandomValues === 'function') {
        cryptoLike.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    // RFC 4122 v4 的版本位与 variant 位，输出格式与 crypto.randomUUID 一致
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
