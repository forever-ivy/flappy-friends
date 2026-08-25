// 放宽账号规则：唯一的硬规则是用户名不与已有账号重复（唯一索引不变）。
// - username：1–24 个字符（原 3–16），字符种类由 pb_hooks 的宽松校验负责。
// - password：最短 1 位（PocketBase 密码字段允许的最小值就是 1，无法为 0），
//   上限 71 个字符为 bcrypt 的平台限制，不设任何复杂度要求。
migrate((app) => {
    const players = app.findCollectionByNameOrId("players");
    const username = players.fields.getByName("username");
    username.min = 1;
    username.max = 24;
    const password = players.fields.getByName("password");
    password.min = 1;
    password.max = 71;
    app.save(players);
}, (app) => {
    const players = app.findCollectionByNameOrId("players");
    const username = players.fields.getByName("username");
    username.min = 3;
    username.max = 16;
    const password = players.fields.getByName("password");
    password.min = 8;
    password.max = 0;
    app.save(players);
});
