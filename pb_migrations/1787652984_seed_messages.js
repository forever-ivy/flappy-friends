// 弹幕留言板垫场：给 messages 加 seed 布尔标记，并在集合还是空的时候
// 种一批可爱的假留言（署名走「路过的碗」一类游客口吻，不像系统公告）。
// 前端拿到列表后以真留言为主：真留言足够多时不再循环这些种子。
migrate((app) => {
    const messages = app.findCollectionByNameOrId("messages");
    messages.fields.add(new BoolField({ name: "seed" }));
    app.save(messages);

    // 只有空库才插种子，避免重复执行环境（如恢复备份后重放）刷出重复垫场
    const existing = app.findRecordsByFilter("messages", "id != ''", "", 1, 0);
    if (existing.length > 0) return;

    const SEEDS = [
        { text: "Hyunjin looks so cute today", author: "STAY" },
        { text: "Felix lets go!", author: "Passerby" },
        { text: "Crashed on my first try lol", author: "Newbie" },
        { text: "Love these pastel pillars", author: "Cloud" },
        { text: "Who can hit 50 first!", author: "Rookie" },
        { text: "Tap Message to say hi ✿", author: "STAY" },
        { text: "Mirror bonus +5, go!", author: "Fan" },
        { text: "Happy flying today ♡", author: "Passerby" },
    ];
    SEEDS.forEach((seed) => {
        const record = new Record(messages);
        record.set("text", seed.text);
        record.set("author", seed.author);
        record.set("seed", true);
        app.save(record);
    });
}, (app) => {
    try {
        app.findRecordsByFilter("messages", "seed = true", "", 500, 0)
            .forEach((record) => app.delete(record));
    } catch (_) { /* nothing seeded */ }
    try {
        const messages = app.findCollectionByNameOrId("messages");
        messages.fields.removeByName("seed");
        app.save(messages);
    } catch (_) { /* field already gone */ }
});
