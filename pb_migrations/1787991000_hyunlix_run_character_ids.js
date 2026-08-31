// Hyunlix 换皮使用 snow / stripe / duo 角色 id，而 runs.characterId 仍是
// 主站时代的 select（nova / moss / sol / violet）。同步成绩时 PocketBase
// 会在落库前校验 select 值，导致 POST /api/game/runs 400、前端静默失败、
// 排行榜永远为空。
migrate((app) => {
    const runs = app.findCollectionByNameOrId("runs");
    const characterId = runs.fields.getByName("characterId");
    characterId.values = ["snow", "stripe", "duo", "nova", "moss", "sol", "violet"];
    app.save(runs);
}, (app) => {
    const runs = app.findCollectionByNameOrId("runs");
    const characterId = runs.fields.getByName("characterId");
    characterId.values = ["nova", "moss", "sol", "violet"];
    app.save(runs);
});
