// 高并发优化：
// 1) players 排行榜索引——排序 + LIMIT 50 直接走索引，替代旧的
//    「全表拉 5000 行再 JS 排序」。列顺序与 pb_hooks/shared.js 的
//    LEADERBOARD_SORTS 一一对应（含平分 tie-break）。
// 2) 启用 PocketBase 内置按 IP 限流：留言发表 12 次/分钟、注册 30 次/分钟、
//    登录 30 次/分钟。账号规则本身保持宽松，这里只防脚本刷接口/爆破。
//    （messages.created 与 runs(player, clientRunId) 唯一索引在早前迁移中已建）
migrate((app) => {
    const players = app.findCollectionByNameOrId("players");
    players.indexes.push(
        "CREATE INDEX idx_players_best_rank ON players (bestScore DESC, bestAchievedAt, created)",
        "CREATE INDEX idx_players_total_rank ON players (totalScore DESC, bestScore DESC, created)",
    );
    app.save(players);

    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
        { label: "POST /api/game/messages", maxRequests: 12, duration: 60 },
        { label: "players:create", maxRequests: 30, duration: 60 },
        { label: "*:auth", maxRequests: 30, duration: 60 },
    ];
    app.save(settings);
}, (app) => {
    try {
        const players = app.findCollectionByNameOrId("players");
        players.indexes = players.indexes.filter((index) => !index.includes("idx_players_best_rank") && !index.includes("idx_players_total_rank"));
        app.save(players);
    } catch (_) { /* collection already removed */ }
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    settings.rateLimits.rules = [];
    app.save(settings);
});
