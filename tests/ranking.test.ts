import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// pb_hooks/shared.js 是 PocketBase 钩子回调间共享的 CommonJS 模块，
// vitest 直接加载同一份文件做单测。
//
// 高并发改造后排序由 SQLite 按 LEADERBOARD_SORTS 表达式完成（索引
// idx_players_*_rank），不再有 JS 排序函数。这里用一个「通用 sort 表达式
// 模拟器」验证排序语义没有在改造中丢失；名次一致性由后端集成测试覆盖。
const { LEADERBOARD_SORTS, leaderboardEntry } = createRequire(import.meta.url)('../pb_hooks/shared.js');

interface Seed {
    id: string;
    bestScore: number;
    totalScore: number;
    bestAchievedAt: string;
    created: string;
    [key: string]: string | number;
}

// 按 PocketBase 排序表达式（"-a,b,c"）逐字段比较，模拟 SQL ORDER BY
function sortBy(expression: string, rows: Seed[]): string[] {
    const keys = expression.split(',').map((part) => (
        part.startsWith('-') ? { field: part.slice(1), dir: -1 } : { field: part, dir: 1 }
    ));
    return [...rows].sort((a, b) => {
        for (const { field, dir } of keys) {
            if (a[field] < b[field]) return -dir;
            if (a[field] > b[field]) return dir;
        }
        return 0;
    }).map((row) => row.id);
}

const seeds: Seed[] = [
    { id: 'p1', bestScore: 10, totalScore: 30, bestAchievedAt: '2026-08-01 10:00:00.000Z', created: '2026-07-01 00:00:00.000Z' },
    { id: 'p2', bestScore: 10, totalScore: 10, bestAchievedAt: '2026-08-02 10:00:00.000Z', created: '2026-07-02 00:00:00.000Z' },
    { id: 'p3', bestScore: 5, totalScore: 30, bestAchievedAt: '2026-08-03 10:00:00.000Z', created: '2026-07-03 00:00:00.000Z' },
    { id: 'p4', bestScore: 7, totalScore: 20, bestAchievedAt: '2026-08-04 10:00:00.000Z', created: '2026-07-04 00:00:00.000Z' },
];

describe('leaderboard sort expressions（SQL 排序语义）', () => {
    it('best 榜：最高分降序，同分先达成者在前', () => {
        expect(sortBy(LEADERBOARD_SORTS.best, seeds)).toEqual(['p1', 'p2', 'p4', 'p3']);
    });

    it('total 榜：总分降序，同分时单局最高分高者在前', () => {
        expect(sortBy(LEADERBOARD_SORTS.total, seeds)).toEqual(['p1', 'p3', 'p4', 'p2']);
    });

    it('完全同分时先注册者（created 更早）在前', () => {
        const twinA: Seed = { id: 'a', bestScore: 3, totalScore: 3, bestAchievedAt: '2026-08-01 00:00:00.000Z', created: '2026-07-01 00:00:00.000Z' };
        const twinB: Seed = { ...twinA, id: 'b', created: '2026-07-02 00:00:00.000Z' };
        expect(sortBy(LEADERBOARD_SORTS.best, [twinB, twinA])).toEqual(['a', 'b']);
        expect(sortBy(LEADERBOARD_SORTS.total, [twinB, twinA])).toEqual(['a', 'b']);
    });
});

describe('leaderboardEntry（条目构造）', () => {
    const record = (fields: Record<string, string | number>) => ({
        id: String(fields.id),
        getString: (name: string) => String(fields[name] ?? ''),
        getInt: (name: string) => Number(fields[name] ?? 0),
    });

    it('按榜单类型取分，缺角色回退 nova', () => {
        const player = record({ id: 'p9', username: 'ada', characterId: '', bestScore: 12, totalScore: 99 });
        expect(leaderboardEntry(player, 3, 'best')).toEqual({ rank: 3, playerId: 'p9', username: 'ada', characterId: 'nova', score: 12 });
        expect(leaderboardEntry(player, 1, 'total').score).toBe(99);
    });

    it('保留自定义角色', () => {
        const player = record({ id: 'p8', username: 'bo', characterId: 'moss', bestScore: 7, totalScore: 7 });
        expect(leaderboardEntry(player, 2, 'best').characterId).toBe('moss');
    });
});
