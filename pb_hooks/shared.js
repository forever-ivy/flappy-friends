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

// 排行榜排序规则：
// - best 榜：最高单局分降序；同分时先达成者（bestAchievedAt 更早）在前。
// - total 榜：总积分降序；同分时最高单局分更高者在前。
// 日期均为 PocketBase 的 UTC 固定格式字符串，字典序即时间序。
function rankEntries(players, type) {
    const byBest = (a, b) => {
        if (a.bestScore !== b.bestScore) return b.bestScore - a.bestScore;
        if (a.bestAchievedAt !== b.bestAchievedAt) return a.bestAchievedAt < b.bestAchievedAt ? -1 : 1;
        return 0;
    };
    const byTotal = (a, b) => {
        if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
        if (a.bestScore !== b.bestScore) return b.bestScore - a.bestScore;
        return 0;
    };
    const compare = type === "total" ? byTotal : byBest;
    return players
        .map((player, index) => ({ player, index }))
        .sort((x, y) => compare(x.player, y.player) || x.index - y.index)
        .map((entry, position) => ({
            rank: position + 1,
            playerId: entry.player.id,
            username: entry.player.username,
            characterId: entry.player.characterId || "nova",
            score: type === "total" ? entry.player.totalScore : entry.player.bestScore,
        }));
}

module.exports = {
    CHARACTER_IDS: CHARACTER_IDS,
    USERNAME_MAX: USERNAME_MAX,
    isValidUsername: isValidUsername,
    asNonNegativeInt: asNonNegativeInt,
    profile: profile,
    rankEntries: rankEntries,
};
