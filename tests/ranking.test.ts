import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// pb_hooks/shared.js 是 PocketBase 钩子回调间共享的 CommonJS 模块，
// vitest 直接加载同一份文件做单测。
const { rankEntries } = createRequire(import.meta.url)('../pb_hooks/shared.js');

interface Seed {
    id: string;
    username: string;
    characterId?: string;
    bestScore: number;
    totalScore: number;
    bestAchievedAt: string;
    created: string;
}

const seeds: Seed[] = [
    { id: 'p1', username: 'ada', bestScore: 10, totalScore: 30, bestAchievedAt: '2026-08-01 10:00:00.000Z', created: '2026-07-01 00:00:00.000Z' },
    { id: 'p2', username: 'bo', characterId: 'moss', bestScore: 10, totalScore: 10, bestAchievedAt: '2026-08-02 10:00:00.000Z', created: '2026-07-02 00:00:00.000Z' },
    { id: 'p3', username: 'cy', bestScore: 5, totalScore: 30, bestAchievedAt: '2026-08-03 10:00:00.000Z', created: '2026-07-03 00:00:00.000Z' },
    { id: 'p4', username: 'dee', bestScore: 7, totalScore: 20, bestAchievedAt: '2026-08-04 10:00:00.000Z', created: '2026-07-04 00:00:00.000Z' },
];

describe('leaderboard ranking', () => {
    it('ranks best board by best score, earlier achievement first', () => {
        const entries = rankEntries(seeds, 'best');
        expect(entries.map((entry) => entry.playerId)).toEqual(['p1', 'p2', 'p4', 'p3']);
        expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
        expect(entries.map((entry) => entry.score)).toEqual([10, 10, 7, 5]);
    });

    it('ranks total board by total score, then best score', () => {
        const entries = rankEntries(seeds, 'total');
        expect(entries.map((entry) => entry.playerId)).toEqual(['p1', 'p3', 'p4', 'p2']);
        expect(entries.map((entry) => entry.score)).toEqual([30, 30, 20, 10]);
    });

    it('breaks full ties by original order deterministically', () => {
        const twinA = { id: 'a', username: 'a', bestScore: 3, totalScore: 3, bestAchievedAt: '2026-08-01 00:00:00.000Z', created: '2026-07-01 00:00:00.000Z' };
        const twinB = { ...twinA, id: 'b', username: 'b' };
        expect(rankEntries([twinA, twinB], 'best').map((entry) => entry.playerId)).toEqual(['a', 'b']);
        expect(rankEntries([twinB, twinA], 'best').map((entry) => entry.playerId)).toEqual(['b', 'a']);
    });

    it('keeps player fields and falls back to nova character', () => {
        const [entry] = rankEntries(seeds, 'best');
        expect(entry).toMatchObject({ playerId: 'p1', username: 'ada', characterId: 'nova' });
        expect(rankEntries(seeds, 'best')[1].characterId).toBe('moss');
    });
});
