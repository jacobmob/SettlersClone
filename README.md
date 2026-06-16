# Catan (multiplayer)

A multiplayer web game of Settlers of Catan, built to grow into the full game
(all expansions, custom maps, a synced radio, rich profiles/stats) and to later
be packaged as an installable desktop app.

**This first milestone** is a solid, extensible foundation plus a fully playable
**base game** for up to 6 players, with real-time multiplayer, accounts, a game
settings panel, quality-of-life timers, and persistent stats. The codebase is
deliberately structured so the larger feature set layers in without rework — see
[Roadmap](#roadmap).

## What works today

- **Real-time multiplayer base game** (2–6 players): snake setup, dice rolling,
  resource production, robber + stealing, building roads/settlements/cities,
  development cards (knight, road building, year of plenty, monopoly, victory
  point), bank/port trading, player-to-player trades, longest road, largest
  army, and win detection. 5–6 player games include the special build phase.
- **Authoritative server.** All moves are validated server-side; each client
  only ever receives a redacted view (you never see opponents' hands).
- **Accounts & profiles.** Username/password login; change display name, piece
  color, and avatar. Wins/losses tracked per profile.
- **Game settings.** Map, max players, points-to-win, friendly robber, hide
  bank cards, random vs. balanced dice, adjustable roll timer and total-turn
  timer, and the 7-discard threshold.
- **Quality-of-life timers.** A roll timer and a total-turn timer with a live
  countdown; on expiry the server performs a safe auto-action.
- **End-game & profile stats.** Final scoreboard (VP, knights, roads,
  settlements, cities, dev cards), lifetime totals, a dice-roll histogram, and
  head-to-head records ("3 - 1") against players you've faced.

## Architecture

```
packages/shared   Pure, deterministic, fully-tested TypeScript game engine
                  (hex geometry, board gen, rules/reducer, scoring, view
                  redaction, settings, socket protocol types). No I/O.
apps/server       Express + Socket.IO. Authoritative game orchestration,
                  auth/stats REST, timers, Postgres persistence via Prisma.
apps/web          React + Vite client. SVG board, lobby, settings, profile.
```

The client sends *intents*; the server runs them through the shared
`applyAction` reducer and broadcasts a per-player redacted `GameView`. That
single redaction chokepoint (`redactStateForPlayer`) is also where fog of war
will hook in later.

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) 10+
- Docker (for local Postgres) — or any reachable PostgreSQL instance

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres (docker compose) — or point DATABASE_URL at your own
docker compose up -d

# 3. Configure the server
cp apps/server/.env.example apps/server/.env      # defaults match docker-compose
pnpm --filter @catan/server exec prisma migrate dev --name init
pnpm --filter @catan/server exec prisma generate

# 4. Run server + client together
pnpm dev
```

- Web client: http://localhost:5173
- API/socket server: http://localhost:3001

To try a multiplayer game, open the client in two browser windows (or an
incognito window), register two accounts, create a lobby in one and join it from
the other, ready up, and start.

## Useful scripts

```bash
pnpm dev          # server + web (concurrently)
pnpm test         # all unit/integration tests
pnpm typecheck    # type-check every package
pnpm lint         # eslint
pnpm build        # build shared, type-check server, build web
```

Per-package, e.g. `pnpm --filter @catan/shared test`.

## Testing

- `packages/shared` has the bulk of the coverage: hex geometry (the base board
  resolves to the canonical 19 tiles / 54 vertices / 72 edges), board
  generation, dice, resource distribution (incl. the bank-shortage rule),
  longest road with opponent-building interruption, largest army, and win
  detection.
- `apps/server` has a Socket.IO integration test that drives two clients through
  lobby → snake setup → first roll.
- `apps/web` unit-tests the client move helpers against a real generated board.

## Configuration notes

- **Auth** uses JWT bearer tokens (returned by `/api/auth/register` and
  `/api/auth/login`) sent in the `Authorization` header and the socket
  handshake. No cookies, which keeps cross-origin dev simple and is friendly to
  the future desktop build.
- `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `CLIENT_ORIGIN` are read from
  `apps/server/.env`. The client reads `VITE_SERVER_URL` (defaults to
  `http://localhost:3001`).
- Prisma makes the database swappable; bundling/embedding the DB for the
  installable build is a later concern.

## Roadmap (deferred, designed-for)

These are intentionally **not** in this milestone, but the data models and
game-logic seams are built to absorb them:

- **Expansions** (Cities & Knights, Seafarers, …) — `GameSettings.expansions[]`
  exists and the reducer already dispatches by action type.
- **Custom map editor + water/islands** — `MapDef` is a general tile-coordinate
  list consumed by `createBoard`; resources/numbers are randomized at game start.
- **Fog of war** — reuses `redactStateForPlayer`.
- **Synced radio** (upload/queue songs) — its own socket namespace + table; the
  lobby/game rooms already exist.
- **Uploaded avatars** and richer stats dashboards.
- **Installable desktop package** (Electron/Tauri wrapping the web client).
```
