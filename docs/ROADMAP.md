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

## Phase 2 — Terrain

- ☐ `shared/shapes`: circle / rect / polygon `contains` + `segmentIntersect`.
- ☐ Surfaces: sand (high decel), water (+1 stroke, drop at last land rest),
  slope (accel vector).
- ☐ Static walls (arbitrary segments) with restitution.
- ☐ Deterministic moving obstacle (windmill) as a function of round number.
- ☐ Per-surface / per-course physics overrides from course JSON.
- ☐ Tests per surface + obstacle.

**Done when:** `course-preview` can play a hole with sand, water, a slope, a
wall and a windmill.

## Phase 3 — EBS core

- ☐ Fastify app; Twitch JWT verify middleware (shared Extension secret).
- ☐ `GameManager` per channel + authoritative state machine.
- ☐ Round scheduler: `round-open` → collect (last-valid-wins) → resolve →
  `round-result`; per-hole cap + auto-score; AFK-safe advance.
- ☐ `POST /command` (from ingest, shared-secret auth).
- ☐ `GET /session`, `POST /control` (start/stop/skip; role check).
- ☐ Mock PubSub: `TWITCH_MOCK=1` broadcasts over a local WebSocket.
- ☐ Scheduler tests (post-close ignored, no-submit, cap, all-sunk).

**Done when:** a scripted set of `/command` calls drives a full single hole and
emits correct broadcasts over the mock WS.

## Phase 4 — Ingest

- ☐ Anonymous `tmi.js` reader + reconnect/backoff.
- ☐ Filter `!` messages, parse via `shared`, dedupe per user/round, per-user
  rate limit, forward to `EBS /command`.
- ☐ Pluggable source: `twitch` | `local` (stdin / tiny form).
- ☐ Integration test: local chat lines → EBS → mock WS.

**Done when:** typing `!70, 50` in the local source moves a ball in the mock
broadcast.

## Phase 5 — Frontend viewer

- ☐ Bundler (esbuild) → static `video_component` bundle.
- ☐ Canvas renderer: field, surface regions, walls, hole + flag, ball(s), name
  labels (spectator).
- ☐ Aim **compass overlay** centred on the player's ball.
- ☐ Animation: replay deterministic sim from `round-result`, snap to canonical
  finals.
- ☐ HUD: hole #, par, your strokes, round countdown.
- ☐ Identity grant flow; player vs spectator view switch; post-hole reveal-all.
- ☐ Net layer: Twitch `listen` for broadcast in prod, mock WS in dev; `GET
/session` snapshot on load.

**Done when:** the full loop runs locally — chat command → EBS → broadcast →
animated ball in the browser, with correct player/spectator views.

## Phase 6 — Multi-hole courses + scorecard

- ☐ Course sequencing in `GameManager`; per-hole stroke tracking.
- ☐ Hole-advance rules end to end; `hole-complete` packet.
- ☐ Course-results screen in frontend.
- ☐ Ship **2 handmade courses** (3–9 holes each) in `courses/`.

**Done when:** a full multi-hole course can be played start to finish locally.

## Phase 7 — Tournaments + stats

- ☐ Tournament model: roster lock, ordered courses, stroke-play aggregation.
- ☐ SQLite store (`better-sqlite3`): players, stats, tournaments, finished
  games, empty `paid_entry` ledger.
- ☐ Stats accumulation on hole/game/tournament completion.
- ☐ `standings` packet + live standings panel; per-player stats view.

**Done when:** a 2-course tournament produces correct live standings and
persisted stats.

## Phase 8 — Broadcaster surfaces

- ☐ `config.html`: default course, round length, max strokes, tournament
  presets; `GET/PUT /config`.
- ☐ `dashboard.html`: start/stop, skip round, kick player, switch course.
- ☐ `EntryGate` interface + `FreeGate` (broadcaster/mods) wired to `/control`
  and to `!golf start` mod command.

**Done when:** a broadcaster can configure and run games without touching code.

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
