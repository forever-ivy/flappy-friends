// 供 pb_hooks 各回调共享的常量与纯函数（CommonJS 模块）。
//
// PocketBase 会对每个钩子/路由回调做隔离执行，文件顶层作用域互不可见，
// 因此共享代码放在本模块，由回调内部 require(`${__hooks}/shared.js`) 加载
// （__hooks 是 PocketBase 注入的 pb_hooks 绝对路径全局）。

// 游戏内现役角色仅 nova / moss；sol / violet 为已下架的历史 id，
// 仍保留在白名单里以兼容旧存档与旧客户端（前端渲染时统一回退到 nova）。
var CHARACTER_IDS = ["nova", "moss", "sol", "violet"];

// 宽松账号规则：唯一的硬规则是用户名不与已有账号重复（由唯一索引保证）。
// 这里只做最基础检查：无首尾空格、1–24 个字符；中文、空格、符号均可，
// 不设“安全问题式”的格式要求。
var USERNAME_MAX = 24;
function isValidUsername(username) {
    return username === username.trim() && username.length >= 1 && username.length <= USERNAME_MAX;
}

// 弹幕留言板：正文最长 32 字，游客昵称沿用用户名上限（24），留空署名「路过的碗」
var MESSAGE_MAX = 32;
var GUEST_AUTHOR = "路过的碗";

// 规范化留言/昵称：去首尾空格、压缩连续空白；非字符串、空串或超长返回 null
function normalizeMessage(value, max) {
    if (typeof value !== "string") return null;
    const text = value.trim().replace(/\s+/g, " ");
    if (text.length < 1 || text.length > max) return null;
    return text;
}

function messagePayload(record) {
    return {
        id: record.id,
        text: record.getString("text"),
        author: record.getString("author"),
        // 服务端预置的垫场假留言标记；前端有足量真留言时不再循环种子
        seed: record.getBool("seed"),
        createdAt: record.getString("created"),
    };
}

function asNonNegativeInt(value, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > max) {
        throw new BadRequestError("Invalid game result");
    }
    return number;
}

function profile(record) {
    return {
        id: record.id,
        username: record.getString("username"),
        characterId: record.getString("characterId") || "nova",
        bestScore: record.getInt("bestScore"),
        totalScore: record.getInt("totalScore"),
        gamesPlayed: record.getInt("gamesPlayed"),
    };
}

// ============ 排行榜（高并发版） ============
//
// 排序规则（与索引 idx_players_*_rank 对齐，直接由 SQLite 排序 + LIMIT，
// 不再全表拉取后在 JS 里排序）：
// - best 榜：最高单局分降序；同分先达成者（bestAchievedAt 更早）在前；再同则先注册者在前。
// - total 榜：总积分降序；同分时最高单局分更高者在前；再同则先注册者在前。
// 日期均为 PocketBase 的 UTC 固定格式字符串，字典序即时间序。
var LEADERBOARD_TOP = 50;          // 榜单只取前 50（对外 limit 上限也是 50）
var LEADERBOARD_CACHE_MS = 3000;   // 匿名榜单短缓存；跑分写入时主动失效
var LEADERBOARD_SORTS = {
    best: "-bestScore,bestAchievedAt,created",
    total: "-totalScore,-bestScore,created",
};

function leaderboardEntry(record, rank, type) {
    return {
        rank: rank,
        playerId: record.id,
        username: record.getString("username"),
        characterId: record.getString("characterId") || "nova",
        score: type === "total" ? record.getInt("totalScore") : record.getInt("bestScore"),
    };
}

// 通用短缓存：结果数组以「预序列化 JSON 字符串」存进 $app.store()（进程级
// 并发安全，跨 JSVM 执行器共享）。热路径直接拼接返回该字符串，省掉每请求的
// JSON.parse/stringify；exp 与 raw 分两个键，失效时只删 exp。
function cachedRaw(app, key, ttlMs, producer) {
    const exp = app.store().get(key + ":exp");
    if (typeof exp === "number" && exp > Date.now()) {
        const raw = app.store().get(key + ":raw");
        if (typeof raw === "string") return raw;
    }
    const raw = JSON.stringify(producer());
    app.store().set(key + ":raw", raw);
    app.store().set(key + ":exp", Date.now() + ttlMs);
    return raw;
}

// 前 50 名：索引排序 + LIMIT 由 SQLite 完成，TTL 3 秒；跑分写入时主动失效，
// 因此测试与玩家都能读到写后的最新榜单，缓存只用来扛突发读洪峰。
function topEntriesRaw(app, type) {
    return cachedRaw(app, "lb:" + type, LEADERBOARD_CACHE_MS, () => {
        const records = app.findRecordsByFilter("players", "gamesPlayed > 0", LEADERBOARD_SORTS[type], LEADERBOARD_TOP, 0);
        return records.map((record, index) => leaderboardEntry(record, index + 1, type));
    });
}

function invalidateLeaderboards(app) {
    app.store().remove("lb:best:exp");
    app.store().remove("lb:total:exp");
}

// 个人名次：先在缓存的前 50 里找；不在榜上则用一条 COUNT 定向查询
// （比我名次高的人数 + 1），避免任何全表拉取。COUNT 的比较条件与
// LEADERBOARD_SORTS 的排序语义一一对应。
function myRank(app, playerId, type, topEntries) {
    for (const entry of topEntries) {
        if (entry.playerId === playerId) return entry;
    }
    let me = null;
    try { me = app.findRecordById("players", playerId); } catch (_) { return null; }
    if (me.getInt("gamesPlayed") <= 0) return null;
    let better;
    if (type === "total") {
        better = app.countRecords("players", $dbx.exp(
            "gamesPlayed > 0 AND (totalScore > {:total} OR (totalScore = {:total} AND bestScore > {:best}) OR (totalScore = {:total} AND bestScore = {:best} AND created < {:created}))",
            { total: me.getInt("totalScore"), best: me.getInt("bestScore"), created: me.getString("created") },
        ));
    } else {
        better = app.countRecords("players", $dbx.exp(
            "gamesPlayed > 0 AND (bestScore > {:best} OR (bestScore = {:best} AND bestAchievedAt < {:achieved}) OR (bestScore = {:best} AND bestAchievedAt = {:achieved} AND created < {:created}))",
            { best: me.getInt("bestScore"), achieved: me.getString("bestAchievedAt"), created: me.getString("created") },
        ));
    }
    return leaderboardEntry(me, Number(better) + 1, type);
}

// ============ 留言列表缓存 ============
// 公开热点读：最近 50 条以预序列化 JSON 缓存 5 秒，发表新留言时主动失效。
var MESSAGES_CACHE_MS = 5000;

function messagesRaw(app) {
    return cachedRaw(app, "msgs", MESSAGES_CACHE_MS, () => {
        const records = app.findRecordsByFilter("messages", "id != ''", "-created", 50, 0);
        return records.map(messagePayload);
    });
}

function invalidateMessages(app) {
    app.store().remove("msgs:exp");
}

module.exports = {
    CHARACTER_IDS: CHARACTER_IDS,
    USERNAME_MAX: USERNAME_MAX,
    MESSAGE_MAX: MESSAGE_MAX,
    GUEST_AUTHOR: GUEST_AUTHOR,
    isValidUsername: isValidUsername,
    normalizeMessage: normalizeMessage,
    messagePayload: messagePayload,
    asNonNegativeInt: asNonNegativeInt,
    profile: profile,
    LEADERBOARD_TOP: LEADERBOARD_TOP,
    LEADERBOARD_SORTS: LEADERBOARD_SORTS,
    leaderboardEntry: leaderboardEntry,
    topEntriesRaw: topEntriesRaw,
    invalidateLeaderboards: invalidateLeaderboards,
    myRank: myRank,
    messagesRaw: messagesRaw,
    invalidateMessages: invalidateMessages,
};
