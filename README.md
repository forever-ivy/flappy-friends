# 天际跳跳（Skyline Hop）

「天际跳跳」是一款移动端优先的 Flappy 类小游戏，基于官方 Phaser React TypeScript 模板构建。游戏循环与物理由 Phaser 4 驱动，菜单与账户界面用 React 实现，用户名登录、进度保存与排行榜由 PocketBase 提供。

游戏内共有两位可选角色：**诺娃**（藏青条纹衫）与 **莫斯**（浅蓝番茄衫）。旧存档或后端中已下架的角色 id（sol / violet）读取时会自动回退到诺娃。

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:8080`. Visitors can play without an account. A player only needs to register when they want to save runs and appear on the leaderboards.

## Desktop Support

The playfield height stays at 640 logical pixels while the width adapts to the viewport aspect ratio between 360 and 960; ultrawide monitors get letterboxed bars. Keyboard controls: `Space` / `↑` / `W` to flap, `Space` or `Enter` to start from the menu, `Enter` to replay after a run. On touch devices the game plays exactly as before (360-wide portrait view).

## Checks

```bash
npm test
npm run build
```

The backend integration suite needs a running PocketBase instance:

```bash
PB_URL=http://127.0.0.1:8090 npm run test:backend
```

It covers username-only registration, server-side score calculation, duplicate run idempotency, permissions, character sync, and both leaderboards.

## Deployment

The Docker image builds the Vite bundle and serves it from PocketBase on the same origin as the API.

```bash
cp .env.example .env
# set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD in .env
docker compose up -d --build
```

Put the service behind the existing Nginx/Caddy HTTPS reverse proxy. Keep the `pb_data` volume backed up. The PocketBase dashboard is available at `/_/`; restrict it to an administrator network or IP in the reverse proxy.

## 游戏规则

- 每穿过一对障碍柱得 1 分。
- 障碍柱统一樱花粉标语柱；配色仅是视觉，碰撞体完全一致。
- 35% 的障碍柱之间会出现可收集奖励，每个 5 分；其中蝴蝶结叉子为主奖励（70%），蝴蝶结镜子为稀有款（30%），两种计分相同。
- 达到 10、25、50 分时滚动速度加快、缺口收窄。
- 最高分与累计分是两个独立的排行榜。
- 菜单有弹幕留言板：点面板右上角「留言」写一句话（1–32 字），它会像弹幕一样飘过天空。留言与账号无关：登录与否都只看弹窗里的可选昵称，留空署「路过的碗」。空库时服务端预置了几条可爱的垫场弹幕，真实留言够多（≥6 条）后只循环真留言。
- 账号规则宽松：用户名不与他人重复即可（1–24 个字符，中文、空格、符号都行），密码最短 1 位、不设复杂度要求。
- 账户不收集邮箱，因此有意不提供密码找回。

## Art Assets

All replaceable placeholder art lives in [`public/assets/game`](public/assets/game). The contract for dimensions, anchors, collision-safe margins, and seamless background tiling is documented in [`ART_ASSET_SPEC.md`](ART_ASSET_SPEC.md). Update [`src/game/assets.ts`](src/game/assets.ts) when adding a character or changing a file path; the game logic does not need to change.

## Repository Layout

- `src/game`: Phaser scenes, asset manifest, and synthesized sound effects.
- `src/domain`: deterministic game rules and unit tests.
- `src/state`: local guest progress and pending-run queue.
- `src/services`: PocketBase client and API types.
- `pb_migrations`: `players` and `runs` collections.
- `pb_hooks`: score submission, profile, and leaderboard routes.
- `tests/backend`: real PocketBase API integration test.
