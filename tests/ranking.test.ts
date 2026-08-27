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
// - injectMechEntry：纯函数，验证剔除真实行、钉位、展示分算法、重编名次与截断
// - topEntriesRaw：验证 MECH_PLAYER_ID 环境开关（$os 全局由测试模拟）与降级
// - myRank：验证 COUNT 分支的 ±1 修正（机制号在展示榜上恒占一位）

interface Entry {
    rank: number;
    playerId: string;
    username: string;
    characterId: string;
    score: number;
    official?: boolean;
}

const entryOf = (id: string, score: number): Entry => ({
    rank: 0, playerId: id, username: id, characterId: 'nova', score,
});

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

afterEach(() => vi.unstubAllGlobals());

describe('injectMechEntry（影子行注入纯函数）', () => {
    it('total 榜：剔除真实行、钉第 1，展示分为圆整到百位的「榜首 + margin」', () => {
        // margin = max(500, ceil(600×3%)=18) = 500 → 600+500=1100（已是整百）
        const entries = [entryOf('p1', 600), entryOf('p2', 400), entryOf('mech', 300)];
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 300), 'total');
        expect(result.map((item) => item.playerId)).toEqual(['mech', 'p1', 'p2']);
        expect(result[0]).toMatchObject({ rank: 1, score: 1100, official: true });
        expect(result.filter((item) => item.playerId === 'mech')).toHaveLength(1);
        expect(result.slice(1).every((item) => item.official === undefined)).toBe(true);
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
        expect(result[0]).toMatchObject({ playerId: 'mech', rank: 1, score: 500, official: true });
    });

    it('best 榜：剔除真实行、钉第 3，展示分对齐真实第 3 名', () => {
        // mech 真实 best 60 本是第 1，剔除后按第 3 名（30 分）克制展示
        const entries = [entryOf('mech', 60), entryOf('p1', 50), entryOf('p2', 40), entryOf('p3', 30), entryOf('p4', 20)];
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 60), 'best');
        expect(result.map((item) => item.playerId)).toEqual(['p1', 'p2', 'mech', 'p3', 'p4']);
        expect(result[2]).toMatchObject({ rank: 3, score: 30, official: true });
        expect(result.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it('best 榜：不足 3 人时取末位分并排在末尾', () => {
        const two: Entry[] = injectMechEntry([entryOf('p1', 50), entryOf('p2', 40)], entryOf('mech', 5), 'best');
        expect(two.map((item) => [item.playerId, item.score])).toEqual([['p1', 50], ['p2', 40], ['mech', 40]]);
        const one: Entry[] = injectMechEntry([entryOf('p1', 50)], entryOf('mech', 5), 'best');
        expect(one.map((item) => [item.playerId, item.score])).toEqual([['p1', 50], ['mech', 50]]);
        const none: Entry[] = injectMechEntry([], entryOf('mech', 5), 'best');
        expect(none).toHaveLength(1);
        expect(none[0]).toMatchObject({ rank: 1, score: 5, official: true });
    });

    it('注入后截断回前 50，且名次连续', () => {
        const entries = Array.from({ length: LEADERBOARD_TOP }, (_, index) => entryOf(`p${index + 1}`, 1000 - index));
        const result: Entry[] = injectMechEntry(entries, entryOf('mech', 0), 'best');
        expect(result).toHaveLength(LEADERBOARD_TOP);
        // 原第 50 名被挤出榜单，机制号钉在第 3
        expect(result.some((item) => item.playerId === `p${LEADERBOARD_TOP}`)).toBe(false);
        expect(result[2].playerId).toBe('mech');
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

    it('未设置环境变量（$os 缺失）时特性关闭：机制号按真实分排、无 official 字段', () => {
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'total'));
        expect(entries.map((item) => item.playerId)).toEqual(['p1', 'p2', 'p3', 'mech']);
        expect(entries.every((item) => item.official === undefined)).toBe(true);
    });

    it('设置后 total 榜注入影子行钉第 1', () => {
        mechEnvOn();
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'total'));
        expect(entries[0]).toMatchObject({ playerId: 'mech', username: '官方号', rank: 1, score: 1100, official: true });
        expect(entries.filter((item) => item.playerId === 'mech')).toHaveLength(1);
    });

    it('设置后 best 榜影子行钉第 3、分数对齐真实第 3 名', () => {
        mechEnvOn();
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'best'));
        expect(entries.map((item) => item.playerId)).toEqual(['p1', 'p2', 'mech', 'p3']);
        expect(entries[2]).toMatchObject({ rank: 3, score: 30, official: true });
    });

    it('id 配置错误（账号不存在）时静默降级为普通榜单', () => {
        mechEnvOn('no-such-player');
        const entries: Entry[] = JSON.parse(topEntriesRaw(fakeApp(rows), 'best'));
        expect(entries.every((item) => item.official === undefined)).toBe(true);
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
