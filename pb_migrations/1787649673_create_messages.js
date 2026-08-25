// 弹幕留言板集合：菜单里飘过的玩家短留言。
// 所有直读直写规则关死（null），统一走 pb_hooks 的 /api/game/messages 路由
// （公开读取最近 N 条 + 发表时服务端定署名），与 runs 集合同一思路。
migrate((app) => {
    const messages = new Collection({
        type: "base",
        name: "messages",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            // 留言正文：1–32 个字符（与前端/hooks 的 MESSAGE_MAX 一致）
            { type: "text", name: "text", required: true, min: 1, max: 32 },
            // 署名：登录用户为用户名，游客为昵称或「路过的碗」，上限与用户名一致
            { type: "text", name: "author", required: true, min: 1, max: 24 },
            { type: "autodate", name: "created", onCreate: true },
            { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes: [
            "CREATE INDEX idx_messages_created ON messages (created)",
        ],
    });
    app.save(messages);
}, (app) => {
    try { app.delete(app.findCollectionByNameOrId("messages")); } catch (_) { /* already removed */ }
});
