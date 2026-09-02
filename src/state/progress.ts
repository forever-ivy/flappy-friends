import { RunResult } from '../domain/game';
import { DEFAULT_REVIVE_STATE, normalizeReviveState, ReviveProgressState } from '../domain/revive';
import { getCharacter } from '../game/assets';

const STORAGE_KEY = 'skyline-hop-progress-v1';

export interface Progress {
    selectedCharacter: string;
    bestScore: number;
    totalScore: number;
    gamesPlayed: number;
    pendingRuns: RunResult[];
    /** 死亡转发复活的节奏状态（冷却/每日上限/保底计数），跨会话生效 */
    revive: ReviveProgressState;
}

export const DEFAULT_PROGRESS: Progress = {
    selectedCharacter: 'snow', bestScore: 0, totalScore: 0, gamesPlayed: 0, pendingRuns: [],
    revive: { ...DEFAULT_REVIVE_STATE },
};

export function loadProgress(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Progress {
    if (!storage) return { ...DEFAULT_PROGRESS };
    try {
        const value = storage.getItem(STORAGE_KEY);
        if (!value) return { ...DEFAULT_PROGRESS };
        const parsed = JSON.parse(value) as Partial<Progress>;
        return {
            // 旧存档可能保存已不存在的角色 id，统一回退到默认角色
            selectedCharacter: getCharacter(typeof parsed.selectedCharacter === 'string' ? parsed.selectedCharacter : DEFAULT_PROGRESS.selectedCharacter).id,
            bestScore: Number.isFinite(parsed.bestScore) ? Math.max(0, parsed.bestScore!) : 0,
            totalScore: Number.isFinite(parsed.totalScore) ? Math.max(0, parsed.totalScore!) : 0,
            gamesPlayed: Number.isFinite(parsed.gamesPlayed) ? Math.max(0, parsed.gamesPlayed!) : 0,
            pendingRuns: Array.isArray(parsed.pendingRuns) ? parsed.pendingRuns.slice(-50) : [],
            revive: normalizeReviveState(parsed.revive),
        };
    } catch {
        return { ...DEFAULT_PROGRESS };
    }
}

export function saveProgress(progress: Progress, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): Progress {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
    return progress;
}

export function selectCharacter(progress: Progress, characterId: string): Progress {
    return { ...progress, selectedCharacter: characterId };
}

export function recordRun(progress: Progress, run: RunResult): Progress {
    if (progress.pendingRuns.some((candidate) => candidate.clientRunId === run.clientRunId)) return progress;
    return {
        ...progress,
        bestScore: Math.max(progress.bestScore, run.totalScore),
        totalScore: progress.totalScore + run.totalScore,
        gamesPlayed: progress.gamesPlayed + 1,
        pendingRuns: [...progress.pendingRuns, run].slice(-50),
    };
}

export function removeSyncedRuns(progress: Progress, syncedIds: string[]): Progress {
    const synced = new Set(syncedIds);
    return { ...progress, pendingRuns: progress.pendingRuns.filter((run) => !synced.has(run.clientRunId)) };
}
