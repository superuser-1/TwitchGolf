# Roadmap

Phased build order. Each phase ends with something runnable/testable. See
`DESIGN.md` for the why.

Legend: ☐ todo · ◐ in progress · ☑ done

---

## Phase 0 — Foundations ☑

- ☑ npm workspaces monorepo, `tsconfig.base.json`, ESLint + Prettier, CI
  (`.github/workflows/ci.yml`).
- ☑ `packages/shared` skeleton: `model/` types (`Game`, `Player`, `Ball`,
  `Round`, `Tournament`, `Standing`, `Vec2`, ids) + `protocol/messages.ts`.
- ☑ Course JSON schema (zod) + loader + validator in `shared/course`
  (`schema.ts` browser-safe, `loader.ts` node-only via `@twitch-golf/shared/node`).
- ☑ Chat-command grammar + parser + normaliser in `shared/protocol/command.ts`
  with table-driven + 5000-case fuzz tests.
- ☑ Sample data: `courses/practice.json` + `courses/holes/practice-{1,2}.json`.

**Done:** `npm run format:check && npm run lint && npm run typecheck && npm test`
all green — 49 tests.

## Phase 1 — Deterministic sim (flat) ☑

- ☑ Fixed-timestep engine in `shared/physics/engine.ts`: `simulateShot` —
  constant fairway deceleration, rest threshold, `Math.sin/cos` only for the
  initial velocity (rest of the sim is IEEE-754-portable).
- ☑ Field-edge bounce with restitution (+ clamp guard against tunnelling).
- ☑ Cup capture (segment-distance test) + lip-out with `lipOutDamping` hook.
- ☑ `simulateRound(hole, inputs, roundNumber, physics?)` pure API in
  `physics/simulate.ts` — independent balls, input order preserved, sunk /
  no-swing pass-through.
- ☑ `physics/config.ts`: `DEFAULT_PHYSICS` + `resolvePhysics()` merging per-hole
  course overrides.
- ☑ Scenario tests (rolling, direction, power scaling, bounce, restitution,
  cup drop, lip-out, tap-in) + 5 committed golden trajectory snapshots +
  repeatability tests. 80 tests total.
- ☑ `tools/course-preview` (terminal REPL, `tsx`): load a hole, type swing
  commands, ASCII board render. `npm run play -w @twitch-golf/course-preview -- practice-2`

**Done:** flat holes are play-testable locally; sim output is deterministic and
snapshot-pinned.

> Note: the browser canvas play-test surface is folded into Phase 5 (needs the
> frontend bundler); the terminal REPL covers Phase 1 physics tuning.

## Phase 2 — Terrain ☑

- ☑ `shared/geom`: `shapeContains` (circle/rect/polygon, even-odd raycast),
  `segmentIntersection`, `closestPointOnSegment`, `segmentNormal`.
- ☑ `physics/terrain.ts`: `surfaceAt` (later region wins), `slopeAccelAt`
  (summed over overlapping slopes).
- ☑ Surfaces in the sim: sand/green/water deceleration, water = +1 stroke and
  drop at the shot origin, slope = per-step acceleration (with a slope-stuck
  break guard).
- ☑ Interior walls: nearest-contact reflection with restitution, crossing +
  ball-radius proximity tests, skin offset.
- ☑ `physics/obstacles.ts`: `windmillBlade` — a rotating diameter segment that
  reflects like a wall; orientation is a pure function of sim time + a
  per-round phase offset (`ROUND_PHASE_OFFSET`).
- ☑ `water` added to per-hole `decel` overrides in the course schema + config.
- ☑ Tests: geom units, `surfaceAt`/`slopeAccelAt`/`windmillBlade`, and
  integrated sand / water / slope / wall / windmill sim behaviour. 113 total.

**Done:** the sim resolves every terrain type; `course-preview` can play
`practice-2` (sand + water + slope + walls + windmill).

## Phase 3 — EBS core ☑

- ☑ `packages/ebs` (Fastify 5). `GET /health`, `GET /courses`, `GET /session`
  (JWT), `POST /control` (JWT + broadcaster/mod role), `POST /command`
  (`x-ingest-secret`).
- ☑ `twitch/jwt.ts`: `verifyExtensionJwt` (base64 HS256) + dev-token fallback in
  mock mode; `makeDevToken` for local testing.
- ☑ `GameManager` (one `GolfGame` per channel) + course registry loaded from
  `courses/`.
- ☑ `GolfGame` state machine + scheduler: `idle → hole-intro → round-open →
round-resolving → hole-complete → course-complete`. Last-valid-swing wins,
  no-submit = no stroke, per-hole round cap with cap-scoring, AFK-safe advance,
  empty-game re-open with a limit, live standings.
- ☑ `clock.ts`: `Clock` interface + `systemClock` + `ManualClock` (tests drive
  time deterministically).
- ☑ `twitch/pubsub.ts`: `Broadcaster` interface, `MockPubSub` (ws server the
  frontend connects to, `?channel=` filter), `NoopBroadcaster`.
- ☑ Tests: 12 scheduler cases (lifecycle, last-wins, post-close ignore, cap,
  AFK, skip, empty game, full 2-hole course + standings) + 10 HTTP cases via
  `fastify.inject`. EBS boots in mock mode and serves `/health` + `/courses`.

**Done:** a scripted round drives a full hole and emits the correct broadcast
sequence; HTTP surface enforces auth + roles.

## Phase 4 — Ingest ☑

- ☑ `packages/ingest`. `ChatSource` interface with two implementations:
  `TwitchChatSource` (anonymous `tmi.js`, `reconnect: true`) and
  `LocalChatSource` (stdin, `alice: !70, 50` line format, `feed()` for tests).
- ☑ `CommandPipeline`: `parseChatCommand` → per-user rate limit
  (`USER_RATE_MS`) → forward. Returns a typed outcome
  (`forwarded` / `ignored:*`).
- ☑ `ebs-client.ts`: `POST /command` with `x-ingest-secret`; 404/409 treated as
  expected noise, other errors surfaced via `onError`.
- ☑ Ambient `tmi.js` shim (the package ships no types).
- ☑ Tests: 6 pipeline units (forward, parse-reject, per-user rate limit) + 3
  integration (`LocalChatSource` → pipeline → real EBS via `fastify.inject` →
  player registered; garbage dropped; rate-limited repeats never reach EBS).

**Done:** a local chat line drives a swing all the way into EBS game state.

## Phase 5 — Frontend viewer ☑

- ☑ `packages/frontend` + `build.mjs` (esbuild): `video_component` / `config` /
  `dashboard` bundles, `--serve` dev server. `video_component.js` ~30 KB (shared
  imported via `/physics` subpath to keep zod out of the bundle).
- ☑ `render/canvas.ts`: letterboxed field, surface regions, walls, cup + flag,
  balls, spectator name labels, aim compass, HUD (hole/par/strokes/countdown
  bar), standings panel.
- ☑ `anim.ts`: re-runs the deterministic sim from each `round-result` shot,
  tweens the ball along the path, snaps to the server's canonical final.
- ☑ `state.ts`: pure reducer — `applySession` / `applyMessage` (returns
  `needsSession` on hole change) + `visibleBalls` / `showNames` view rules
  (solo view while playing, reveal-all for 5 s after a hole).
- ☑ `net.ts`: `Twitch.ext.listen("broadcast")` in production, reconnecting mock
  WS in dev; `GET /session` on load and hole changes.
- ☑ `twitch.ts`: `onAuthorized` + `requestIdShare` in production; dev builds a
  local token (matches EBS `makeDevToken`) from query params.
- ☑ EBS: `/session` now returns current hole geometry, `myBallId`, ball
  positions; permissive CORS for the cross-origin overlay.
- ☑ 9 `state.ts` tests. **Verified in a real browser**: `alice/bob/carol`
  chat swings → EBS → mock WS → three balls animate up the fairway with labels,
  HUD + standings render.

**Done:** chat command → EBS → broadcast → animated ball in the browser, with
player vs spectator views.

## Phase 6 — Multi-hole courses + scorecard ☑

- ☑ Course sequencing + per-hole stroke tracking + hole-advance rules + the
  `hole-complete` packet (built in phase 3; exercised here end to end).
- ☑ Two 4-hole courses shipped: `courses/seaside.json` (water, bunkers, a
  walled dogleg, a slope) and `courses/dunes.json` (bunkers, a windmill, a
  water bridge, a slope). `practice` kept for quick testing.
- ☑ Frontend: `state.ts` accumulates a `scorecard` from `hole-complete`;
  `canvas.ts` draws a "Course complete" results panel (final order + totals +
  to-par) on `course-complete`.
- ☑ `courses/loader.test.ts` validates every shipped course; new EBS
  `course.test.ts` plays all four holes of Seaside via `ManualClock` and
  asserts `course-complete`, four `hole-complete` packets, and per-player
  final standings (`thru === holeCount`).

**Done:** a full multi-hole course plays start to finish; results screen renders.

## Phase 7 — Tournaments + stats ☑

- ☑ `game/tournament.ts` — `TournamentRunner`: runs an ordered list of courses,
  aggregates each course's per-player totals, broadcasts cumulative `standings`
  after every course, then a final `standings` + `game-state:course-complete`.
- ☑ `tournaments/*.json` (`weekly-open`, `practice-cup`) + `tournaments.ts`
  registry; `GameManager.startTournament` + `POST /control {action:
"start-tournament"}`.
- ☑ `store/`: `Store` interface + `FileStore` (one JSON file, or in-memory when
  no path) with `players` / `games` / `tournaments` / **`paidEntry`** (empty
  ledger, ready for phase 10). `STORE_PATH` env. Note: swapped the SQLite dep
  for a JSON file to avoid a native build; `Store` is the seam if SQLite is
  wanted later.
- ☑ `GolfGame` tracks aces + water hits and exposes `finalResults()`; the
  manager records every finished game (standalone or tournament leg) to the
  store; `TournamentRunner` records the tournament result (participation +
  win).
- ☑ `GET /stats` (self or `?user=`), `GET /leaderboard` (by strokes/hole),
  `GET /tournaments`. Frontend shows a career line for identified players.
- ☑ Tests: 4 `store` units + a full `practice-cup` tournament run via
  `ManualClock` (aggregated standings `thru === 4`, `gamesPlayed === 2` per
  player, one recorded tournament win, channel free afterwards). 159 total.

**Done:** a 2-course tournament produces correct cumulative standings and
persisted per-player stats.

## Phase 8 — Broadcaster surfaces ☑

- ☑ `entry/gate.ts`: `EntryGate` interface + `FreeGate` (broadcaster/mods only).
  Wired into `POST /control` and `POST /chat-control` (replaces the inline role
  check); the seam for `BitsGate` / `ChannelPointsGate` in phase 10.
- ☑ `GET/PUT /config` — per-channel `{ defaultCourseId, roundSeconds,
maxRoundsPerHole }` persisted via `Store.get/setChannelConfig`; `GameManager`
  applies the channel's round timing to new games/tournaments.
- ☑ `POST /chat-control` (`x-ingest-secret`): ingest recognises `!golf
start|stop|skip|tournament` from mods/broadcaster (`ControlPipeline`, tmi.js
  badge/`mod` tags; local source infers from the login) and forwards them.
- ☑ Real `config.html` (course picker + round length + cap, load/save) and
  `dashboard.html` (start course / start tournament / skip / stop + live phase
  poll). CORS widened to allow `PUT`.
- ☑ Tests: 3 `FreeGate` + 8 `/config` & `/chat-control` (persist round-trip,
  role gates, ingest-secret) + 5 `ControlPipeline` units. 175 total.
  **Verified in a browser**: dashboard starts a game; config saves and persists.

**Done:** a broadcaster runs and configures games from the extension UI or from
chat, no code needed.

## Post-v1 gameplay additions ☑

Requested after Phase 8, layered on the existing engine:

- ☑ **Drag-to-aim (slingshot)** on the overlay — `frontend/src/input.ts`
  (`dragToSwing` pure helper + `attachDragInput`). Pull away from the ball,
  release; launch is opposite the pull, drag distance = power. Live predicted
  arc via `simulateShot` (curves with wind/terrain). Submits over the viewer's
  JWT to `POST /swing` (identity required, 400 ms per-user rate limit) — same
  authoritative round as chat, last-wins. Broadcaster toggle `allowDragInput`
  (default on) in `ChannelConfig` + `/config` + config page + `/session`.
  Tee-hint marker for players who haven't swung yet.
- ☑ **Wind** — per-hole `wind: { angle, power }` in the course schema.
  Constant acceleration while the ball moves, `windScale` (default 3) in
  `physics/config.ts`, per-hole `physics.windScale` override. Drift ~`power²`,
  so long shots are pushed far more than putts. On-overlay wind indicator
  (arrow + strength). Added to `dunes-1`, `seaside-1`, `practice-2`.
- ☑ Tests: 8 `wind` (crosswind/head/tail, power scaling, no-op, determinism,
  override) + 7 `dragToSwing` units + 6 EBS `/swing` route + config
  round-trip. **Verified in a browser**: drag shows a curving arc, releases,
  ball drifts downwind on resolve. 195 total.

## Phase 9 — Real Twitch integration

- ☐ Register the extension; wire real Extension secret + client id.
- ☐ Real PubSub publish via Helix; verify < 5 KB and ≤ 1 msg/sec in practice.
- ☐ Host frontend assets per Twitch requirements (HTTPS, CSP, asset list).
- ☐ Test on a live channel with the Twitch **Developer Rig** / `twitch-cli`.
- ☐ Extension review checklist (permissions, identity copy, data use).

**Done when:** the extension runs on a real channel in dev/hosted-test.

## Phase 10 — Polish & monetization

- ☐ `BitsGate` (`useBits` + transaction verify).
- ☐ `ChannelPointsGate` (EventSub redemptions) + broadcaster OAuth onboarding on
  config page.
- ☐ Optional bot OAuth token in ingest for chat confirmations / errors.
- ☐ Sound, particles, trajectory trails, better flag/terrain art.
- ☐ Mobile view.
- ☐ Course editor tool (built on `course-preview`).
- ☐ Optional alt scoring (Stableford / match play), side games.

---

## Immediate next actions

1. Confirm the open decisions in `DESIGN.md` §12.
2. `git init` the project.
3. Start **Phase 0**: scaffold the monorepo + `shared` skeleton + parser tests.
