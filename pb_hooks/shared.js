// 供 pb_hooks 各回调共享的常量与纯函数（CommonJS 模块）。
//
// PocketBase 会对每个钩子/路由回调做隔离执行，文件顶层作用域互不可见，
// 因此共享代码放在本模块，由回调内部 require(`${__hooks}/shared.js`) 加载
// （__hooks 是 PocketBase 注入的 pb_hooks 绝对路径全局）。

// 游戏内现役角色 snow / stripe / duo；nova / moss / sol / violet 为历史 id，
// 仍保留在白名单里以兼容旧存档与旧客户端（前端渲染时统一回退到 snow）。
var CHARACTER_IDS = ["snow", "stripe", "duo", "nova", "moss", "sol", "violet"];

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
        characterId: record.getString("characterId") || "snow",
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
        characterId: record.getString("characterId") || "snow",
        score: type === "total" ? record.getInt("totalScore") : record.getInt("bestScore"),
    };
}

// ============ 机制账号保榜（查询层影子分注入，不写库） ============
//
// 运营机制号由环境变量 MECH_PLAYER_ID 指定（账号 id，不在代码里写死用户名），
// 需要稳定出现在两个榜单上，但绝不写库抬分——加成只发生在查询层的展示结果里：
// - total 榜：钉在第 1 名，展示分 = max(真实总分, 圆整到百位的「真实第 1 名 + margin」)，
//   margin = max(500, ceil(第 1 名 × 3%))，恒严格大于真实榜首，既稳定领先又不显夸张。
// - best 榜：名次在 3–7 区间内活动（目标名次按 UTC 日期稳定轮换，不死钉一位），
//   展示分取上下两名之间的中间整数，恒满足「上一名 > 机制分 > 下一名」的严格
//   降序，因此与榜上任何真实玩家都不同分；目标位分数挤满（空隙 < 2）时先在
//   区间内就近找空隙，区间全满再向后退化，实在无处可放才升到第 2 乃至第 1。
//   姿态克制，不抢真实玩家的单局第一荣誉。
// 注入前先从 SQL 结果剔除机制号自己的真实行，注入后重编名次并截断回前 50。
// 未设置 MECH_PLAYER_ID 时特性完全关闭；id 配置错误（账号不存在）时静默降级。
var MECH_MIN_MARGIN = 500;      // total 榜领先真实第 1 名的最小分差
var MECH_MARGIN_RATE = 0.03;    // 领先分差随榜首分数按 3% 放大
var MECH_BEST_MIN_RANK = 3;     // best 榜活动区间下界（名次 3，index 2）
var MECH_BEST_MAX_RANK = 7;     // best 榜活动区间上界（名次 7，index 6）
var MECH_BEST_ROTATE_MS = 24 * 60 * 60 * 1000; // 目标名次按 UTC 日期轮换

function mechPlayerId() {
    // $os 由 PocketBase JSVM 注入；node 单测环境无该全局时视为特性关闭
    if (typeof $os === "undefined" || typeof $os.getenv !== "function") return "";
    return $os.getenv("MECH_PLAYER_ID") || "";
}

// best 榜：影子行插到降序榜单 rest 的 index 位时可用的唯一展示分。
// 必须满足严格降序「上一名 > 展示分 > 下一名」——更高名次的分数都 ≥ 上一名、
// 更低名次的都 ≤ 下一名，因此该分与榜上所有条目都不同。放不下返回 null。
function mechBestScoreAt(rest, index) {
    const above = index > 0 ? rest[index - 1].score : null;
    const below = index < rest.length ? rest[index].score : null;
    if (above === null && below === null) return null;
    if (above === null) return below + 1;                       // 插到榜首上方
    if (below === null) return above >= 1 ? above - 1 : null;   // 插到榜尾下方
    if (above - below < 2) return null;                         // 空隙不足，放不下唯一分
    return Math.floor((above + below) / 2);                     // 有空档取中间整数
}

// best 榜插入位选择：目标名次按 UTC 日期在 3–7 区间内稳定轮换；目标位分数
// 挤满（空隙 < 2）时先在区间内按距离就近找有空隙的槽；区间全挤满再向后
// （第 8、第 9……但不越出前 50）退化；实在无处可放才升到第 2 乃至第 1
// （榜首 + 1 永远放得下，作为最终兜底）。
function pickMechBestIndex(rest, nowMs) {
    const lo = MECH_BEST_MIN_RANK - 1;
    const hi = Math.min(MECH_BEST_MAX_RANK - 1, rest.length);
    const candidates = [];
    if (hi >= lo) {
        const target = lo + (Math.floor(nowMs / MECH_BEST_ROTATE_MS) % (hi - lo + 1));
        candidates.push(target);
        for (let step = 1; step <= hi - lo; step += 1) {
            if (target + step <= hi) candidates.push(target + step);
            if (target - step >= lo) candidates.push(target - step);
        }
    }
    for (let i = Math.max(hi + 1, lo); i <= Math.min(rest.length, LEADERBOARD_TOP - 1); i += 1) candidates.push(i);
    for (let i = Math.min(lo, rest.length + 1) - 1; i >= 0; i -= 1) candidates.push(i);
    for (const index of candidates) {
        if (mechBestScoreAt(rest, index) !== null) return index;
    }
    return 0; // rest 非空时不可达（index 0 永远可行），仅为满足返回值
}

// 纯函数：把机制号影子行注入真实榜单。entries 为 SQL 排序后的真实条目
// （可能含机制号自己的真实行，会被剔除），mech 为机制号真实条目（score 为真实分）。
// nowMs 仅供测试注入固定时间；生产路径取 Date.now()（best 榜目标位按日轮换）。
// 返回的新数组里所有条目的 rank 会按注入后的位置重写。
function injectMechEntry(entries, mech, type, nowMs) {
    const rest = entries.filter((entry) => entry.playerId !== mech.playerId);
    // 故意不加任何特殊字段：机制号在榜单上必须与普通玩家外观完全一致
    const shadow = {
        rank: 0,
        playerId: mech.playerId,
        username: mech.username,
        characterId: mech.characterId,
        score: mech.score,
    };
    if (type === "total") {
        const topScore = rest.length > 0 ? rest[0].score : 0;
        const margin = Math.max(MECH_MIN_MARGIN, Math.ceil(topScore * MECH_MARGIN_RATE));
        // 圆整到百位：整百的展示分更像运营号的正常高分，而非公式逐次算出的值；
        // target ≥ 榜首 + 500，因此展示分恒严格大于真实第 2 名，total 榜不会同分
        const target = Math.ceil((topScore + margin) / 100) * 100;
        shadow.score = Math.max(mech.score, target);
        rest.unshift(shadow);
    } else if (rest.length > 0) {
        const index = pickMechBestIndex(rest, typeof nowMs === "number" ? nowMs : Date.now());
        const score = mechBestScoreAt(rest, index);
        if (score !== null) shadow.score = score;
        rest.splice(index, 0, shadow);
    } else {
        rest.push(shadow); // 空榜保底：以真实分独占榜单
    }
    const top = rest.slice(0, LEADERBOARD_TOP);
    for (let i = 0; i < top.length; i += 1) top[i].rank = i + 1;
    return top;
}

// 机制号的真实行是否按排序语义赢过我（即已被 myRank 的 COUNT 计入）。
// 比较条件与 myRank 里的 SQL 表达式一一对应；机制号 gamesPlayed = 0 时
// 不满足 COUNT 的过滤条件，视为没赢过。
function mechRealWinsOver(mech, me, type) {
    if (mech.getInt("gamesPlayed") <= 0) return false;
    if (type === "total") {
        if (mech.getInt("totalScore") !== me.getInt("totalScore")) return mech.getInt("totalScore") > me.getInt("totalScore");
        if (mech.getInt("bestScore") !== me.getInt("bestScore")) return mech.getInt("bestScore") > me.getInt("bestScore");
        return mech.getString("created") < me.getString("created");
    }
    if (mech.getInt("bestScore") !== me.getInt("bestScore")) return mech.getInt("bestScore") > me.getInt("bestScore");
    if (mech.getString("bestAchievedAt") !== me.getString("bestAchievedAt")) return mech.getString("bestAchievedAt") < me.getString("bestAchievedAt");
    return mech.getString("created") < me.getString("created");
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
// 配置了 MECH_PLAYER_ID 时在缓存 producer 里完成机制号影子行注入（见上）。
function topEntriesRaw(app, type) {
    return cachedRaw(app, "lb:" + type, LEADERBOARD_CACHE_MS, () => {
        const records = app.findRecordsByFilter("players", "gamesPlayed > 0", LEADERBOARD_SORTS[type], LEADERBOARD_TOP, 0);
        const entries = records.map((record, index) => leaderboardEntry(record, index + 1, type));
        const mechId = mechPlayerId();
        if (!mechId) return entries;
        let mech = null;
        try { mech = app.findRecordById("players", mechId); } catch (_) { return entries; }
        return injectMechEntry(entries, leaderboardEntry(mech, 0, type), type);
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
    let rank = Number(better) + 1;
    // 机制号修正：特性开启时展示榜上机制号恒占一位（total 第 1 / best 3–7 区间），
    // 而我不在前 50、机制号必在我之上。若其真实行赢过我，COUNT 已把它算进
    // better，无需调整；若没赢过（真实分低或 gamesPlayed=0），COUNT 里没有它，
    // 展示名次需 +1 才与注入后的榜单一致。
    const mechId = mechPlayerId();
    if (mechId && mechId !== playerId) {
        try {
            const mech = app.findRecordById("players", mechId);
            if (!mechRealWinsOver(mech, me, type)) rank += 1;
        } catch (_) {
            // 机制号不存在时榜单未注入，无需修正
        }
    }
    return leaderboardEntry(me, rank, type);
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
    mechPlayerId: mechPlayerId,
    MECH_BEST_MIN_RANK: MECH_BEST_MIN_RANK,
    MECH_BEST_MAX_RANK: MECH_BEST_MAX_RANK,
    injectMechEntry: injectMechEntry,
    mechRealWinsOver: mechRealWinsOver,
    topEntriesRaw: topEntriesRaw,
    invalidateLeaderboards: invalidateLeaderboards,
    myRank: myRank,
    messagesRaw: messagesRaw,
    invalidateMessages: invalidateMessages,
};
