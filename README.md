# Skyline Hop

Skyline Hop is a mobile-first Flappy-style game built from the official Phaser React TypeScript template. It uses Phaser 4 for the game loop and physics, React for the menu and account UI, and PocketBase for username authentication, saved progress, and leaderboards.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:8080`. Visitors can play without an account. A player only needs to register when they want to save runs and appear on the leaderboards.

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

## Game Rules

- Passing an obstacle pair gives 1 point.
- 35% of pairs contain a collectible reward worth 5 points.
- Scroll speed increases and the gap narrows at 10, 25, and 50 points.
- The best-score and total-score leaderboards are separate.
- Password recovery is intentionally not provided because accounts do not collect email addresses.

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
