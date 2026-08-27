import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

// pb_hooks/shared.js 是 PocketBase 钩子回调间共享的 CommonJS 模块，
// vitest 直接加载同一份文件做单测。
//
// 高并发改造后排序由 SQLite 按 LEADERBOARD_SORTS 表达式完成（索引
// idx_players_*_rank），不再有 JS 排序函数。这里用一个「通用 sort 表达式
// 模拟器」验证排序语义没有在改造中丢失；名次一致性由后端集成测试覆盖。
const {
    LEADERBOARD_SORTS, LEADERBOARD_TOP, leaderboardEntry,
    MECH_BEST_MIN_RANK, MECH_BEST_MAX_RANK,
    injectMechEntry, myRank, topEntriesRaw,
} = createRequire(import.meta.url)('../pb_hooks/shared.js');

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

// ============ 机制账号保榜（查询层影子分注入） ============
//
// shared.js 里注入逻辑分三层，分别在这里覆盖：
// - injectMechEntry：纯函数，验证剔除真实行、best 榜 3–7 活动区间与按日轮换、
//   唯一展示分（严格降序、与所有人不同分）、挤满退化、重编名次与截断
// - topEntriesRaw：验证 MECH_PLAYER_ID 环境开关（$os 全局由测试模拟）与降级
// - myRank：验证 COUNT 分支的 ±1 修正（机制号在展示榜上恒占一位）

interface Entry {
    rank: number;
    playerId: string;
    username: string;
    characterId: string;
    score: number;
}

const entryOf = (id: string, score: number): Entry => ({
    rank: 0, playerId: id, username: id, characterId: 'nova', score,
});

// best 榜目标名次按 UTC 日期轮换；单测用固定的 nowMs 控制「第几天」
const DAY = 24 * 60 * 60 * 1000;

// 模拟 PocketBase Record 的最小读接口（getString/getInt）
type Row = Record<string, string | number>;
const asRecord = (row: Row) => ({
    id: String(row.id),
    getString: (name: string) => String(row[name] ?? ''),
    getInt: (name: string) => Number(row[name] ?? 0),
});

// 模拟 PocketBase App 的最小接口：进程内 store、按排序表达式取前 N、按 id 查记录、
// COUNT 定向查询（myRank 用，直接返回预设值）
function fakeApp(rows: Row[], betterCount = 0) {
    const store = new Map<string, unknown>();
    return {
        store: () => ({
            get: (key: string) => store.get(key),
            set: (key: string, value: unknown) => store.set(key, value),
            remove: (key: string) => store.delete(key),
        }),
        findRecordsByFilter: (_collection: string, _filter: string, sort: string, limit: number) => {
            const keys = sort.split(',').map((part) => (
                part.startsWith('-') ? { field: part.slice(1), dir: -1 } : { field: part, dir: 1 }
            ));
            return rows
                .filter((row) => Number(row.gamesPlayed ?? 0) > 0)
                .sort((a, b) => {
                    for (const { field, dir } of keys) {
                        if (a[field] < b[field]) return -dir;
                        if (a[field] > b[field]) return dir;
                    }
                    return 0;
                })
                .slice(0, limit)
                .map(asRecord);
        },
        findRecordById: (_collection: string, id: string) => {
            const row = rows.find((candidate) => candidate.id === id);
            if (!row) throw new Error('not found');
            return asRecord(row);
        },
        countRecords: () => betterCount,
    };
}

const mechEnvOn = (id = 'mech') => {
    vi.stubGlobal('$os', { getenv: (name: string) => (name === 'MECH_PLAYER_ID' ? id : '') });
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('injectMechEntry（影子行注入纯函数）', () => {
    it('total 榜：剔除真实行、钉第 1，展示分为圆整到百位的「榜首 + margin」', () => {
        // margin = max(500, ceil(600×3%)=18) = 500 → 600+500=1100（已是整百）
        const entries = [entryOf('p1', 600), entryOf('p2', 400), entryOf('mech', 300)];
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 300), 'total');
        expect(result.map((item) => item.playerId)).toEqual(['mech', 'p1', 'p2']);
        expect(result[0]).toMatchObject({ rank: 1, score: 1100 });
        expect(result.filter((item) => item.playerId === 'mech')).toHaveLength(1);
        expect(result.map((item) => item.rank)).toEqual([1, 2, 3]);
    });

    it('total 榜：榜首分高时 margin 按 3% 放大并圆整到百位', () => {
        // margin = max(500, ceil(33334×3%)=1001) = 1001 → 34335 → 圆整 34400
        const result: Entry[] = injectMechEntry([entryOf('p1', 33334)], entryOf('mech', 0), 'total');
        expect(result[0]).toMatchObject({ playerId: 'mech', rank: 1, score: 34400 });
    });

    it('total 榜：机制号真实总分更高时直接用真实分', () => {
        const result: Entry[] = injectMechEntry([entryOf('p1', 600)], entryOf('mech', 99999), 'total');
        expect(result[0].score).toBe(99999);
    });

    it('total 榜：空榜时也保底注入（500 起步）', () => {
        const result: Entry[] = injectMechEntry([], entryOf('mech', 0), 'total');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ playerId: 'mech', rank: 1, score: 500 });
    });

    // 机制号展示分的两条硬约束：与榜上所有人不同分 + 全榜严格降序穿过机制位
    const assertMechScoreUnique = (result: Entry[]) => {
        const index = result.findIndex((item) => item.playerId === 'mech');
        expect(index).toBeGreaterThanOrEqual(0);
        const mechScore = result[index].score;
        expect(result.filter((item) => item.playerId !== 'mech').map((item) => item.score)).not.toContain(mechScore);
        if (index > 0) expect(result[index - 1].score).toBeGreaterThan(mechScore);
        if (index + 1 < result.length) expect(mechScore).toBeGreaterThan(result[index + 1].score);
        return index + 1; // 返回展示名次
    };

    it('best 榜：剔除真实行，名次落在 3–7 活动区间，展示分唯一且严格降序', () => {
        // mech 真实 best 60 本是第 1，剔除后克制地落到 3–7 区间
        for (let day = 0; day < 9; day += 1) {
            const entries = [entryOf('mech', 60), entryOf('p1', 50), entryOf('p2', 40), entryOf('p3', 30),
                entryOf('p4', 20), entryOf('p5', 12), entryOf('p6', 8), entryOf('p7', 4)];
            const result: Entry[] = injectMechEntry(entries, entryOf('mech', 60), 'best', day * DAY);
            const rank = assertMechScoreUnique(result);
            expect(rank).toBeGreaterThanOrEqual(MECH_BEST_MIN_RANK);
            expect(rank).toBeLessThanOrEqual(MECH_BEST_MAX_RANK);
            expect(result.map((item) => item.rank)).toEqual(result.map((_, i) => i + 1));
            expect(result.filter((item) => item.playerId === 'mech')).toHaveLength(1);
        }
    });

    it('best 榜：目标名次按 UTC 日期在 3–7 内轮换，不死钉一位，同日结果稳定', () => {
        const make = () => Array.from({ length: 8 }, (_, i) => entryOf(`p${i + 1}`, 100 - i * 10));
        const ranks = new Set<number>();
        for (let day = 0; day < 5; day += 1) {
            const result: Entry[] = injectMechEntry(make(), entryOf('mech', 0), 'best', day * DAY);
            const again: Entry[] = injectMechEntry(make(), entryOf('mech', 0), 'best', day * DAY + 12 * 60 * 60 * 1000);
            const rank = assertMechScoreUnique(result);
            expect(assertMechScoreUnique(again)).toBe(rank); // 同一 UTC 日内不漂移
            ranks.add(rank);
        }
        // 空隙充足时 5 天恰好遍历 3–7 全部名次
        expect([...ranks].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
    });

    it('best 榜：复刻线上同分事故场景（真实榜有并列 5886），机制分不与任何人相同', () => {
        for (let day = 0; day < 5; day += 1) {
            const entries = [entryOf('p1', 8000), entryOf('p2', 5886), entryOf('p3', 5886),
                entryOf('p4', 3000), entryOf('p5', 100), entryOf('p6', 50)];
            const result: Entry[] = injectMechEntry(entries, entryOf('mech', 0), 'best', day * DAY);
            const rank = assertMechScoreUnique(result);
            expect(rank).toBeGreaterThanOrEqual(MECH_BEST_MIN_RANK);
            expect(rank).toBeLessThanOrEqual(MECH_BEST_MAX_RANK);
        }
    });

    it('best 榜：目标位挤满（空隙 < 2）时在区间内就近找空隙', () => {
        // day 0 目标 index 2（第 3 名），但 p2/p3 间与 p3/p4 间空隙都是 1 →
        // 就近落到区间内更后面的空档
        const entries = [entryOf('p1', 100), entryOf('p2', 99), entryOf('p3', 98), entryOf('p4', 97),
            entryOf('p5', 50), entryOf('p6', 40), entryOf('p7', 30)];
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 0), 'best', 0);
        const rank = assertMechScoreUnique(result);
        expect(rank).toBeGreaterThanOrEqual(MECH_BEST_MIN_RANK);
        expect(rank).toBeLessThanOrEqual(MECH_BEST_MAX_RANK);
        expect(result[rank - 1]).toMatchObject({ playerId: 'mech', rank: 5, score: 73 }); // (97+50)/2 取整
    });

    it('best 榜：3–7 区间全挤满时退化到最近的合法位（向后优先）', () => {
        // 第 1–8 名分数连续无空隙，第 8/9 名之间才有空档 → 机制号落第 9
        const entries = [entryOf('p1', 100), entryOf('p2', 99), entryOf('p3', 98), entryOf('p4', 97),
            entryOf('p5', 96), entryOf('p6', 95), entryOf('p7', 94), entryOf('p8', 93), entryOf('p9', 50)];
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 0), 'best', 0);
        const rank = assertMechScoreUnique(result);
        expect(result[rank - 1]).toMatchObject({ playerId: 'mech', rank: 9, score: 71 }); // (93+50)/2 取整
    });

    it('best 榜：不足 3 人时退化到能保证唯一分的末位', () => {
        const two: Entry[] = injectMechEntry([entryOf('p1', 50), entryOf('p2', 40)], entryOf('mech', 5), 'best', 0);
        expect(two.map((item) => [item.playerId, item.score])).toEqual([['p1', 50], ['p2', 40], ['mech', 39]]);
        const one: Entry[] = injectMechEntry([entryOf('p1', 50)], entryOf('mech', 5), 'best', 0);
        expect(one.map((item) => [item.playerId, item.score])).toEqual([['p1', 50], ['mech', 49]]);
        const none: Entry[] = injectMechEntry([], entryOf('mech', 5), 'best', 0);
        expect(none).toHaveLength(1);
        expect(none[0]).toMatchObject({ rank: 1, score: 5 });
    });

    it('注入后截断回前 50，且名次连续', () => {
        // 分差取 2 保证区间内有空隙：day 0 目标第 3 名
        const entries = Array.from({ length: LEADERBOARD_TOP }, (_, index) => entryOf(`p${index + 1}`, 2000 - index * 2));
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 0), 'best', 0);
        expect(result).toHaveLength(LEADERBOARD_TOP);
        // 原第 50 名被挤出榜单，机制号落在 day 0 的目标位（第 3）
        expect(result.some((item) => item.playerId === `p${LEADERBOARD_TOP}`)).toBe(false);
        expect(result[2].playerId).toBe('mech');
        assertMechScoreUnique(result);
        expect(result.map((item) => item.rank)).toEqual(Array.from({ length: LEADERBOARD_TOP }, (_, index) => index + 1));
    });
});

describe('topEntriesRaw（MECH_PLAYER_ID 环境开关）', () => {
    const rows: Row[] = [
        { id: 'p1', username: 'p1', characterId: 'nova', bestScore: 50, totalScore: 600, gamesPlayed: 3, bestAchievedAt: '2026-08-01 10:00:00.000Z', created: '2026-07-01 00:00:00.000Z' },
        { id: 'p2', username: 'p2', characterId: 'moss', bestScore: 40, totalScore: 400, gamesPlayed: 2, bestAchievedAt: '2026-08-02 10:00:00.000Z', created: '2026-07-02 00:00:00.000Z' },
        { id: 'p3', username: 'p3', characterId: 'nova', bestScore: 30, totalScore: 300, gamesPlayed: 2, bestAchievedAt: '2026-08-03 10:00:00.000Z', created: '2026-07-03 00:00:00.000Z' },
        { id: 'mech', username: '官方号', characterId: 'nova', bestScore: 10, totalScore: 100, gamesPlayed: 1, bestAchievedAt: '2026-08-04 10:00:00.000Z', created: '2026-06-01 00:00:00.000Z' },
    ];

    it('未设置环境变量（$os 缺失）时特性关闭：机制号按真实分排', () => {
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'total'));
        expect(entries.map((item) => item.playerId)).toEqual(['p1', 'p2', 'p3', 'mech']);
    });

    it('设置后 total 榜注入影子行钉第 1', () => {
        mechEnvOn();
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'total'));
        expect(entries[0]).toMatchObject({ playerId: 'mech', username: '官方号', rank: 1, score: 1100 });
        expect(entries.filter((item) => item.playerId === 'mech')).toHaveLength(1);
    });

    it('设置后 best 榜影子行落在活动区间，展示分唯一（生产路径走 Date.now）', () => {
        mechEnvOn();
        // 3 个真实条目时可用区间为第 3–4 名；固定系统时间验证两天的轮换结果
        vi.useFakeTimers();
        vi.setSystemTime(0); // 第 0 天 → 目标第 3 名，分数取 40/30 的中间整数
        const dayZero: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'best'));
        expect(dayZero.map((item) => item.playerId)).toEqual(['p1', 'p2', 'mech', 'p3']);
        expect(dayZero[2]).toMatchObject({ rank: 3, score: 35 });

        vi.setSystemTime(DAY); // 第 1 天 → 目标第 4 名（榜尾下方），分数 30 - 1
        const dayOne: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'best'));
        expect(dayOne.map((item) => item.playerId)).toEqual(['p1', 'p2', 'p3', 'mech']);
        expect(dayOne[3]).toMatchObject({ rank: 4, score: 29 });

        // 两天的结果里机制分都与所有真实分不同
        for (const board of [dayZero, dayOne]) {
            const mechEntry = board.find((item) => item.playerId === 'mech')!;
            expect(board.filter((item) => item.playerId !== 'mech').map((item) => item.score)).not.toContain(mechEntry.score);
        }
    });

    it('id 配置错误（账号不存在）时静默降级为普通榜单', () => {
        mechEnvOn('no-such-player');
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'best'));
        expect(entries).toHaveLength(4);
    });
});

describe('myRank（机制号占位的 ±1 修正）', () => {
    // COUNT 分支需要 $dbx.exp 全局（真实环境由 PocketBase JSVM 注入）
    const stubDbx = () => vi.stubGlobal('$dbx', { exp: () => null });
    const me: Row = { id: 'me', username: 'me', characterId: 'nova', bestScore: 20, totalScore: 100, gamesPlayed: 5, bestAchievedAt: '2026-08-05 10:00:00.000Z', created: '2026-07-05 00:00:00.000Z' };
    const mech = (fields: Row): Row => ({ id: 'mech', username: '官方号', characterId: 'nova', ...fields });

    it('已在展示榜上时直接返回该条目', () => {
        stubDbx();
        const onBoard = { ...entryOf('me', 100), rank: 7 };
        expect(myRank(fakeApp([me], 99), 'me', 'total', [onBoard])).toBe(onBoard);
    });

    it('特性关闭时名次 = COUNT + 1', () => {
        stubDbx();
        expect(myRank(fakeApp([me], 10), 'me', 'total', []).rank).toBe(11);
    });

    it('机制号真实分赢过我时已计入 COUNT，不再修正', () => {
        stubDbx();
        mechEnvOn();
        const rows = [me, mech({ bestScore: 90, totalScore: 900, gamesPlayed: 9, bestAchievedAt: '2026-08-01 10:00:00.000Z', created: '2026-06-01 00:00:00.000Z' })];
        expect(myRank(fakeApp(rows, 10), 'me', 'total', []).rank).toBe(11);
        expect(myRank(fakeApp(rows, 10), 'me', 'best', []).rank).toBe(11);
    });

    it('机制号真实分没赢过我时，展示榜上它仍占一位 → 名次 +1', () => {
        stubDbx();
        mechEnvOn();
        const rows = [me, mech({ bestScore: 1, totalScore: 1, gamesPlayed: 1, bestAchievedAt: '2026-08-09 10:00:00.000Z', created: '2026-07-09 00:00:00.000Z' })];
        expect(myRank(fakeApp(rows, 10), 'me', 'total', []).rank).toBe(12);
        expect(myRank(fakeApp(rows, 10), 'me', 'best', []).rank).toBe(12);
    });

    it('机制号 gamesPlayed=0（从未进 COUNT）时同样 +1', () => {
        stubDbx();
        mechEnvOn();
        const rows = [me, mech({ bestScore: 0, totalScore: 0, gamesPlayed: 0, bestAchievedAt: '', created: '2026-06-01 00:00:00.000Z' })];
        expect(myRank(fakeApp(rows, 10), 'me', 'total', []).rank).toBe(12);
    });

    it('同分平局按与 SQL 一致的先后语义判定', () => {
        stubDbx();
        mechEnvOn();
        // best 同分：机制号更早达成 → 赢过我（已计入 COUNT），不修正
        const earlier = [me, mech({ bestScore: 20, totalScore: 50, gamesPlayed: 2, bestAchievedAt: '2026-08-01 10:00:00.000Z', created: '2026-07-09 00:00:00.000Z' })];
        expect(myRank(fakeApp(earlier, 10), 'me', 'best', []).rank).toBe(11);
        // best 同分：机制号更晚达成 → 没赢过我 → +1
        const later = [me, mech({ bestScore: 20, totalScore: 50, gamesPlayed: 2, bestAchievedAt: '2026-08-09 11:00:00.000Z', created: '2026-07-09 00:00:00.000Z' })];
        expect(myRank(fakeApp(later, 10), 'me', 'best', []).rank).toBe(12);
    });

    it('机制号账号不存在时不修正（榜单也未注入）', () => {
        stubDbx();
        mechEnvOn('no-such-player');
        expect(myRank(fakeApp([me], 10), 'me', 'total', []).rank).toBe(11);
    });
});
