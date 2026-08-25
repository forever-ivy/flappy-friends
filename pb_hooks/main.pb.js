// 游戏路由与记录钩子。
//
// 注意：PocketBase 对每个回调做隔离执行（无法访问文件顶层变量），
// 共享的常量与纯函数统一放在 shared.js，并在回调内部 require 加载。

onRecordCreateRequest((e) => {
    const shared = require(`${__hooks}/shared.js`);
    const username = e.record.getString("username");
    if (!shared.isValidUsername(username)) throw new BadRequestError("Invalid username");
    // Auth collections retain an internal email field; generate a random non-delivery
    // address so the player never provides or verifies email. Random (instead of
    // username-derived) because relaxed usernames may contain spaces/symbols that
    // would break the email format.
    if (e.record.getString("email") == "") {
        e.record.set("email", "player-" + $security.randomStringWithAlphabet(16, "abcdefghijklmnopqrstuvwxyz0123456789") + "@local.invalid");
    }
    e.record.set("bestScore", 0);
    e.record.set("totalScore", 0);
    e.record.set("gamesPlayed", 0);
    e.record.set("bestAchievedAt", "");
    if (!shared.CHARACTER_IDS.includes(e.record.getString("characterId"))) e.record.set("characterId", "nova");
    return e.next();
}, "players");

routerAdd("POST", "/api/game/runs", (e) => {
    const shared = require(`${__hooks}/shared.js`);
    const submittedRuns = e.requestInfo().body.runs;
    if (!Array.isArray(submittedRuns) || submittedRuns.length === 0 || submittedRuns.length > 50) {
        throw new BadRequestError("Expected 1 to 50 runs");
    }

    const syncedIds = [];
    let resultProfile = null;
    $app.runInTransaction((txApp) => {
        const player = txApp.findRecordById("players", e.auth.id);
        const runsCollection = txApp.findCollectionByNameOrId("runs");
        let bestScore = player.getInt("bestScore");
        let totalScore = player.getInt("totalScore");
        let gamesPlayed = player.getInt("gamesPlayed");

        for (const input of submittedRuns) {
            const clientRunId = String(input.clientRunId || "");
            if (!/^[a-zA-Z0-9-]{8,64}$/.test(clientRunId)) throw new BadRequestError("Invalid run id");
            if (!shared.CHARACTER_IDS.includes(input.characterId)) throw new BadRequestError("Invalid character");
            const pipeCount = shared.asNonNegativeInt(input.pipeCount, 1000000);
            const rewardCount = shared.asNonNegativeInt(input.rewardCount, 1000000);
            const durationMs = shared.asNonNegativeInt(input.durationMs, 2147483647);
            const total = pipeCount + rewardCount * 5;
            const clientCreatedAt = new Date(input.createdAt);
            if (Number.isNaN(clientCreatedAt.getTime())) throw new BadRequestError("Invalid creation date");

            let existing = null;
            try {
                existing = txApp.findFirstRecordByFilter(
                    "runs",
                    "player = {:player} && clientRunId = {:clientRunId}",
                    { player: player.id, clientRunId: clientRunId },
                );
            } catch (_) {
                existing = null;
            }

            if (!existing) {
                const run = new Record(runsCollection);
                run.set("clientRunId", clientRunId);
                run.set("player", player.id);
                run.set("characterId", input.characterId);
                run.set("pipeCount", pipeCount);
                run.set("rewardCount", rewardCount);
                run.set("totalScore", total);
                run.set("durationMs", durationMs);
                run.set("clientCreatedAt", clientCreatedAt.toISOString());
                txApp.save(run);
                totalScore += total;
                gamesPlayed += 1;
                if (total > bestScore) {
                    bestScore = total;
                    player.set("bestAchievedAt", new Date().toISOString());
                }
                player.set("characterId", input.characterId);
            }
            syncedIds.push(clientRunId);
        }

        player.set("bestScore", bestScore);
        player.set("totalScore", totalScore);
        player.set("gamesPlayed", gamesPlayed);
        txApp.save(player);
        resultProfile = shared.profile(player);
    });

    return e.json(200, { syncedIds, profile: resultProfile });
}, $apis.requireAuth("players"));

routerAdd("POST", "/api/game/profile", (e) => {
    const shared = require(`${__hooks}/shared.js`);
    const characterId = e.requestInfo().body.characterId;
    if (!shared.CHARACTER_IDS.includes(characterId)) throw new BadRequestError("Invalid character");
    const player = $app.findRecordById("players", e.auth.id);
    player.set("characterId", characterId);
    $app.save(player);
    return e.json(200, shared.profile(player));
}, $apis.requireAuth("players"));

// 弹幕留言板：公开读取最近 N 条（默认/上限 50），新留言在前，供菜单弹幕循环
routerAdd("GET", "/api/game/messages", (e) => {
    const shared = require(`${__hooks}/shared.js`);
    const query = e.request.url.query();
    const requestedLimit = Number(query.get("limit") || 50);
    const limit = Math.max(1, Math.min(50, Number.isInteger(requestedLimit) ? requestedLimit : 50));
    const records = $app.findRecordsByFilter("messages", "id != ''", "-created", limit, 0);
    return e.json(200, { messages: records.map(shared.messagePayload) });
});

// 发表留言：与账号完全解绑——署名只来自请求里的可选昵称，留空署「路过的碗」，
// 是否登录不影响署名，也不要求登录。正文 1–32 字，除空串/超长外不设其他门槛。
routerAdd("POST", "/api/game/messages", (e) => {
    const shared = require(`${__hooks}/shared.js`);
    const body = e.requestInfo().body;
    const text = shared.normalizeMessage(body.text, shared.MESSAGE_MAX);
    if (!text) throw new BadRequestError("Invalid message");
    const author = shared.normalizeMessage(body.nickname, shared.USERNAME_MAX) || shared.GUEST_AUTHOR;
    const record = new Record($app.findCollectionByNameOrId("messages"));
    record.set("text", text);
    record.set("author", author);
    $app.save(record);
    return e.json(200, shared.messagePayload(record));
});

routerAdd("GET", "/api/game/leaderboards", (e) => {
    const shared = require(`${__hooks}/shared.js`);
    const query = e.request.url.query();
    const type = query.get("type") === "total" ? "total" : "best";
    const requestedLimit = Number(query.get("limit") || 50);
    const limit = Math.max(1, Math.min(50, Number.isInteger(requestedLimit) ? requestedLimit : 50));
    const records = $app.findRecordsByFilter("players", "gamesPlayed > 0", "bestScore,totalScore,bestAchievedAt,created", 5000, 0);
    const players = records.map((record) => ({
        id: record.id,
        username: record.getString("username"),
        characterId: record.getString("characterId") || "nova",
        bestScore: record.getInt("bestScore"),
        totalScore: record.getInt("totalScore"),
        bestAchievedAt: record.getString("bestAchievedAt"),
        created: record.getString("created"),
    }));
    const allEntries = shared.rankEntries(players, type);
    const me = e.auth ? allEntries.find((entry) => entry.playerId === e.auth.id) || null : null;
    return e.json(200, { type, entries: allEntries.slice(0, limit), me });
});
