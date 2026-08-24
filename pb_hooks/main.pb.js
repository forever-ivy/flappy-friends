// 游戏路由与记录钩子。
//
// 注意：PocketBase 对每个回调做隔离执行（无法访问文件顶层变量），
// 共享的常量与纯函数统一放在 shared.js，并在回调内部 require 加载。

onRecordCreateRequest((e) => {
    const shared = require(`${__hooks}/shared.js`);
    const username = e.record.getString("username");
    if (!shared.USERNAME_PATTERN.test(username)) throw new BadRequestError("Invalid username");
    // Auth collections retain an internal email field; generate a non-delivery address
    // so the player never has to provide or verify email.
    if (e.record.getString("email") == "") e.record.set("email", username.toLowerCase() + "@local.invalid");
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
