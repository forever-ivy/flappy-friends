// 死亡转发复活：不每局都弹，用「硬性闸门 → 保底 → 概率」三层算法决定是否给出复活卡。
// 全部为纯函数（时间/随机数由调用方注入），状态由 App 持久化进 localStorage 的 Progress，
// 使冷却与每日上限跨会话生效——玩家换局、关页面都躲不掉节奏控制。

// 闸门一：低分局不值得救（0–4 分往往是开局失误，重开比重活更顺）
export const REVIVE_MIN_SCORE = 5;
// 闸门二：两次复活卡之间至少间隔的冷却时间，防止连续死亡时每局都弹
export const REVIVE_COOLDOWN_MS = 3 * 60_000;
// 闸门三：每天（本地日历日）最多弹出的次数，重度玩家也不被刷屏
export const REVIVE_MAX_PER_DAY = 3;
// 保底：距上次弹窗累计 N 次「真死亡」（未弹卡或放弃）后必弹，保证功能能被发现
export const REVIVE_PITY_DEATHS = 6;

// 概率层：基础概率较低，分数越接近个人最佳越可能弹——
// 「眼看要破纪录却死了」是分享意愿最强的时刻，破/平纪录直接给高概率。
export const REVIVE_BASE_CHANCE = 0.2;
export const REVIVE_NEAR_BEST_RATIO = 0.7;
export const REVIVE_NEAR_BEST_CHANCE = 0.45;
export const REVIVE_NEW_BEST_CHANCE = 0.85;
export const REVIVE_MAX_CHANCE = 0.9;

export interface ReviveProgressState {
    /** 上一次弹出复活卡的时间戳（0 = 从未弹过） */
    lastOfferAt: number;
    /** offersToday 所属的本地日历日（YYYY-MM-DD），跨天自动清零 */
    offersDay: string;
    /** 今天已弹出的次数 */
    offersToday: number;
    /** 距上次弹出累计的真死亡次数（保底计数） */
    deathsSinceOffer: number;
}

export const DEFAULT_REVIVE_STATE: ReviveProgressState = {
    lastOfferAt: 0, offersDay: '', offersToday: 0, deathsSinceOffer: 0,
};

export function reviveDayKey(now: number): string {
    const day = new Date(now);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function clampCount(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    return Math.floor(value);
}

// 旧存档/手工改写 localStorage 时兜底，字段缺失或非法都回默认值
export function normalizeReviveState(value: unknown): ReviveProgressState {
    if (!value || typeof value !== 'object') return { ...DEFAULT_REVIVE_STATE };
    const parsed = value as Partial<ReviveProgressState>;
    return {
        lastOfferAt: clampCount(parsed.lastOfferAt),
        offersDay: typeof parsed.offersDay === 'string' ? parsed.offersDay : '',
        offersToday: clampCount(parsed.offersToday),
        deathsSinceOffer: clampCount(parsed.deathsSinceOffer),
    };
}

export function reviveChanceFor(score: number, bestScore: number): number {
    if (bestScore <= 0) return REVIVE_BASE_CHANCE;
    if (score >= bestScore) return REVIVE_NEW_BEST_CHANCE;
    if (score >= bestScore * REVIVE_NEAR_BEST_RATIO) return REVIVE_NEAR_BEST_CHANCE;
    return REVIVE_BASE_CHANCE;
}

export interface ReviveDecisionInput {
    /** 本局死亡时的分数 */
    score: number;
    /** 玩家历史最佳（0 = 还没有记录） */
    bestScore: number;
    /** 本局是否已经复活过：一局只给一次机会 */
    reviveUsedThisRun: boolean;
    /** 持久化的复活节奏状态 */
    state: ReviveProgressState;
    /** 当前时间戳（注入以便测试） */
    now: number;
    /** 0..1 随机数（注入以便测试） */
    randomValue: number;
}

/**
 * 判定本次死亡是否弹出「转发复活」卡：
 * 1. 本局已用过复活、分数太低、今日超量、冷却中 → 不弹（按此顺序短路）；
 * 2. 保底计数已满 → 必弹；
 * 3. 否则按分数与个人最佳的距离给概率。
 */
export function shouldOfferShareRevive(input: ReviveDecisionInput): boolean {
    const { score, bestScore, reviveUsedThisRun, state, now, randomValue } = input;
    if (reviveUsedThisRun) return false;
    if (score < REVIVE_MIN_SCORE) return false;
    const offersToday = state.offersDay === reviveDayKey(now) ? state.offersToday : 0;
    if (offersToday >= REVIVE_MAX_PER_DAY) return false;
    if (now - state.lastOfferAt < REVIVE_COOLDOWN_MS) return false;
    if (state.deathsSinceOffer >= REVIVE_PITY_DEATHS) return true;
    return randomValue >= 0 && randomValue < Math.min(REVIVE_MAX_CHANCE, reviveChanceFor(score, bestScore));
}

/** 弹出复活卡时记录节奏：冷却起点归零、当日计数 +1、保底计数清零 */
export function noteReviveOfferShown(state: ReviveProgressState, now: number): ReviveProgressState {
    const today = reviveDayKey(now);
    const offersToday = (state.offersDay === today ? state.offersToday : 0) + 1;
    return { lastOfferAt: now, offersDay: today, offersToday, deathsSinceOffer: 0 };
}

/** 真死亡（没弹卡或玩家放弃）时累计保底计数 */
export function noteTrueDeath(state: ReviveProgressState): ReviveProgressState {
    return { ...state, deathsSinceOffer: Math.min(state.deathsSinceOffer + 1, REVIVE_PITY_DEATHS) };
}
