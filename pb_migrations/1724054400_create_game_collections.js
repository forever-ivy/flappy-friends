migrate((app) => {
    const players = new Collection({
        type: "auth",
        name: "players",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: "",
        updateRule: null,
        deleteRule: null,
        fields: [
            { type: "text", name: "username", required: true, min: 3, max: 16, presentable: true },
            { type: "email", name: "email", required: false },
            { type: "text", name: "characterId", required: true, min: 2, max: 20 },
            // required 数字字段在 PocketBase 中无法为 0，而新玩家统计从 0 开始，
            // 因此统计字段全部允许为空、由服务端写入
            { type: "number", name: "bestScore", required: false, min: 0, onlyInt: true },
            { type: "number", name: "totalScore", required: false, min: 0, onlyInt: true },
            { type: "number", name: "gamesPlayed", required: false, min: 0, onlyInt: true },
            { type: "date", name: "bestAchievedAt" },
            { type: "autodate", name: "created", onCreate: true },
            { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        passwordAuth: {
            enabled: true,
            identityFields: ["username"],
        },
        indexes: [
            "CREATE UNIQUE INDEX idx_players_username ON players (username COLLATE NOCASE)",
        ],
    });
    app.save(players);

    const runs = new Collection({
        type: "base",
        name: "runs",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            { type: "text", name: "clientRunId", required: true, min: 8, max: 64 },
            { type: "relation", name: "player", required: true, maxSelect: 1, collectionId: players.id, cascadeDelete: true },
            { type: "select", name: "characterId", required: true, maxSelect: 1, values: ["nova", "moss", "sol", "violet"] },
            // 数字字段允许为空（0 会被 PocketBase 判为 blank），由服务端事务写入
            { type: "number", name: "pipeCount", required: false, min: 0, max: 1000000, onlyInt: true },
            { type: "number", name: "rewardCount", required: false, min: 0, max: 1000000, onlyInt: true },
            { type: "number", name: "totalScore", required: false, min: 0, max: 6000000, onlyInt: true },
            { type: "number", name: "durationMs", required: false, min: 0, max: 2147483647, onlyInt: true },
            { type: "date", name: "clientCreatedAt", required: true },
            { type: "autodate", name: "created", onCreate: true },
            { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes: [
            "CREATE UNIQUE INDEX idx_runs_player_client ON runs (player, clientRunId)",
        ],
    });
    app.save(runs);
}, (app) => {
    try { app.delete(app.findCollectionByNameOrId("runs")); } catch (_) { /* already removed */ }
    try { app.delete(app.findCollectionByNameOrId("players")); } catch (_) { /* already removed */ }
});
