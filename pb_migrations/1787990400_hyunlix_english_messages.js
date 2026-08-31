// Hyunlix 换皮：把已存在的垫场种子留言与中英混排用户留言统一为英文。
// 仅在新库已跑过旧中文种子迁移的环境执行一次。
migrate((app) => {
    const messages = app.findCollectionByNameOrId("messages");
    const ENGLISH_SEEDS = [
        { text: "Hyunjin looks so cute today", author: "STAY" },
        { text: "Felix lets go!", author: "Passerby" },
        { text: "Crashed on my first try lol", author: "Newbie" },
        { text: "Love these pastel pillars", author: "Cloud" },
        { text: "Who can hit 50 first!", author: "Rookie" },
        { text: "Tap Message to say hi ✿", author: "STAY" },
        { text: "Mirror bonus +5, go!", author: "Fan" },
        { text: "Happy flying today ♡", author: "Passerby" },
    ];

    const seeds = app.findRecordsByFilter("messages", "seed = true", "created", 500, 0);
    if (seeds.length === 0) return;

    // 已有英文种子则跳过（避免重复执行）
    const first = seeds[0].getString("text") || "";
    if (/^[A-Za-z]/.test(first.trim())) return;

    seeds.forEach((record) => app.delete(record));
    ENGLISH_SEEDS.forEach((seed) => {
        const record = new Record(messages);
        record.set("text", seed.text);
        record.set("author", seed.author);
        record.set("seed", true);
        app.save(record);
    });
}, () => {
    /* 不回滚：英文种子保留 */
});
