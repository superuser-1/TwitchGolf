# Twitch Golf Game — Design & Architecture

Status: **planning**. Last updated 2026-09-09.

A Twitch Extension (video component) that overlays a top-down golf course on a
live stream. Viewers play through chat, in simultaneous timed rounds, trying to
sink the ball in as few swings as possible. Supports multi-hole courses,
tournaments, per-player stats and rankings.

Source of truth for the original brief:
`OneDrive/Dokumente/FH/Twitch Golf Game/Twitch Golf Game ExtensionDesign Document.md`.

---

## 1. Product summary

- **Where it runs:** Twitch Extension of type **Video Component** — a
  broadcaster-positioned, resizable box drawn over the video. Field is a logical
  portrait rectangle (~2:3), matching the mockup.
- **Who plays:** any viewer in chat. A round-based game; anyone can join an open
  game by taking a swing.
- **Input:** chat command `!<degrees>°, <power>` — e.g. `!70°, 50` = hit toward
  70°, at 50% power. Degree symbol optional; separators flexible (see §6).
- **Compass:** `0°/360°` = up (−Y), `90°` = right (+X), `180°` = down, `270°` =
  left. Clockwise from north. → `vx = sin θ`, `vy = −cos θ`.
- **Physics feel:** ball rolls and decelerates, bounces off field edges and
  walls, is slowed by sand, penalised by water, pushed by slopes. Sinks when it
  reaches the hole slowly enough (else it "lips out").
- **Views:**
  - _Player_ (has a ball in the active game, identity granted): sees **only their
    own ball**, an aim compass centred on it, their stroke count.
  - _Spectator_ (no ball / identity not granted): sees **all balls + names** and
    the leaderboard.
  - After each hole completes, all balls are revealed to everyone briefly.
- **Progression:** choose a course (set of holes), play tournaments (ordered list
  of courses) with a locked roster, live standings, and persistent per-player
  stats.
- **Monetization:** _deferred_. Designed behind an `EntryGate` seam so Bits /
  channel-point entry can be added without reworking game or persistence code.
  For now, only the broadcaster and mods start games.

---

## 2. Twitch platform constraints (why the architecture looks like this)

| Constraint                                                                                                                                              | Consequence for us                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensions **cannot read chat**.                                                                                                                        | Separate **ingest** service connects to chat (anonymous `tmi.js`, no token) and forwards commands to the EBS.                                                                                     |
| Frontend gets only an **opaque per-user id** unless the viewer grants identity (`Twitch.ext.actions.requestIdShare()`).                                 | "See only your own ball" and matching a chat user to an extension view **requires identity grant**. Non-granters get spectator view.                                                              |
| Twitch is the JWT signer; EBS verifies with the shared **Extension secret**. JWT carries `channel_id`, `user_id` (if linked), `role`, `opaque_user_id`. | EBS trusts the JWT for auth; ingest-supplied commands are matched to players by Twitch `user_id`.                                                                                                 |
| **PubSub broadcast**: message ≤ **5 KB**, ~**1 msg/sec** per channel.                                                                                   | We send **one compact round-result packet per round**, not per animation frame. Clients animate locally.                                                                                          |
| PubSub `whisper-<opaque_id>` exists but is also rate-limited and needs opaque ids.                                                                      | We **don't** do per-viewer messaging. Personalised view (which ball is "mine", aim guide) is derived **client-side** from the broadcast + the viewer's own identity.                              |
| Channel Points are **not** available to extensions directly.                                                                                            | Requires EventSub `channel.channel_points_custom_reward_redemption.add` with a **broadcaster OAuth token** — part of the deferred monetization phase, with an onboarding flow on the config page. |
| Bits-in-Extensions **is** native (`Twitch.ext.bits.useBits`).                                                                                           | `BitsGate` is a frontend action + EBS transaction verification. Deferred but low-friction.                                                                                                        |

### Local development without Twitch

Every layer has an offline path so the full loop runs on one machine:

- **Mock PubSub:** EBS with `TWITCH_MOCK=1` serves "broadcasts" over a local
  WebSocket; the frontend subscribes to that when not running inside Twitch.
- **Mock chat:** `ingest` accepts a local source (stdin / a tiny web form) so you
  can drive real EBS + frontend by typing commands.
- **Course preview tool** (`tools/course-preview`): loads a course JSON, lets you
  fire shots from a text box, renders the sim. Uses the same `shared` engine.
- Later: Twitch **Developer Rig** / `twitch-cli` for real extension testing.

---

## 3. Components

```
┌────────────┐   chat msgs    ┌──────────┐   HTTP /command    ┌───────────────┐
│  Twitch    │ ─────────────▶ │  ingest  │ ─────────────────▶ │      EBS       │
│  chat IRC  │  (anon tmi.js) │          │                    │  (authoritative│
└────────────┘                └──────────┘                    │   game state,  │
                                                              │   round sched, │
┌────────────┐   JWT + WS/PubSub subscribe                    │   physics,     │
│  Extension │ ◀──────────────────────────────────────────────│   SQLite)      │
│  frontend  │        round-result packets (broadcast)        └───────┬───────┘
│  (Canvas)  │ ─────────────────────────────────────────────▶         │
└────────────┘   HTTP: identity, config, dashboard controls    Twitch Helix
                                                               (PubSub publish,
                                                                later: Bits)
```

### 3.1 `packages/shared` — the deterministic core (TS library)

Imported by **both** `ebs` and `frontend`. One implementation of the rules.

- `model/` — `Game`, `Hole`, `Course`, `Player`, `Ball`, `Round`, `Tournament`,
  `Standing` types and small pure helpers.
- `physics/` — fixed-timestep engine: integration, per-surface deceleration,
  wall/edge reflection with restitution, hole capture + lip-out, water penalty,
  slope acceleration, deterministic moving obstacles. Pure functions,
  `simulateRound(state, swings) -> { trajectories, finalStates, events }`.
- `shapes/` — `circle | rect | polygon` with `contains(point)` and
  `segmentIntersect(a, b)`; used by surfaces, walls, hole.
- `protocol/` — PubSub message types (versioned), and the chat-command grammar +
  parser + normaliser (§6).
- `course/` — course JSON schema (zod), loader, validator.

**Determinism contract:** given the same course + same ordered swing inputs +
same round number, `simulateRound` produces byte-identical output in Node and in
the browser. Enforced by a cross-env test. The EBS's resting positions are still
the **canonical** result; the client re-sims only to animate and then snaps.

### 3.2 `packages/ebs` — authoritative backend (Node + Fastify)

- `http/` — Fastify routes:
  - `POST /command` (from ingest): `{ channelId, userId, login, angle, power, ts }`.
  - `GET /session` (from frontend, JWT): returns view role + current game snapshot.
  - `POST /control` (broadcaster/mod, JWT role check): start / stop / skip round /
    kick / pick course / pick tournament.
  - `GET/PUT /config` (config page, JWT): channel defaults.
- `game/` — `GameManager` per channel: holds the authoritative state machine,
  owns the **round scheduler** (§5), calls `shared/physics`, emits broadcasts.
- `twitch/` — JWT verify, PubSub publish (real or mock), later Bits verification.
- `store/` — SQLite (`better-sqlite3`): players, stats, tournaments, finished
  games, and an **(initially empty) paid-entry ledger**.
- `entry/` — `EntryGate` interface. `FreeGate` (broadcaster/mods only) now;
  `BitsGate`, `ChannelPointsGate` later.

### 3.3 `packages/ingest` — chat command reader (Node)

- Connects to the broadcaster's chat with **anonymous `tmi.js`** (read-only, no
  OAuth). Auto-reconnect with backoff.
- Filters to `!`-prefixed messages, parses with `shared/protocol`, **dedupes**
  (one pending swing per user per round; last valid wins), rate-limits per user,
  forwards valid swings to `EBS POST /command`.
- Pluggable source: `twitch` (default) or `local` (stdin / small form) for
  offline dev.
- v1 sends **no chat replies** — all feedback is visual in the overlay. A bot
  OAuth token (for "❌ bad command" / confirmations) is an optional later add.

### 3.4 `packages/frontend` — Twitch Extension views (Canvas, bundled static)

- `video_component` — the game overlay:
  - Canvas renderer: field, surface regions, walls, hole + flag, ball(s), name
    labels (spectator), aim **compass overlay** centred on the player's ball,
    HUD (hole #, par, your strokes, round countdown), scorecard / mini-standings.
  - Consumes round-result packets, replays the deterministic sim for smooth
    animation, snaps to canonical finals.
  - Identity: prompt `requestIdShare()`; player vs spectator view switch.
- `config` — broadcaster setup: default course, round length, max strokes per
  hole, tournament presets. (Later: monetization onboarding.)
- `dashboard` (live config) — broadcaster/mod in-stream controls: start/stop,
  skip round, kick player, switch course.

---

## 4. Coordinate system, units, tuning

- Field is logical units, e.g. `w = 100`, `h = 150`. Renderer scales to the
  component's pixel size; sim never sees pixels.
- Angle → velocity: `vx = sin(θ_rad)`, `vy = −cos(θ_rad)` (θ clockwise from up).
- Power `0..100` → initial speed `v0 = POWER_SCALE * power / 100`. Tune
  `POWER_SCALE` so 100% on fairway travels ~80% of field length.
- Fixed timestep `dt = 1/60 s`. Sim runs to rest each round (bounded by a max
  step count as a safety net).
- Per-surface **constant deceleration** (feels more golf-like than exponential
  friction and gives predictable distance):
  `decel.fairway` (baseline), `decel.green` (low), `decel.sand` (high).
- Wall/edge collision: reflect velocity across the surface normal, multiply by
  restitution `e ≈ 0.7`.
- Rest threshold: `|v| < V_EPS` → ball stopped.
- Hole: if the ball's path passes within `hole.radius` of the centre **and**
  speed there `< CAPTURE_SPEED` → sunk. Otherwise it passes over (lip-out).
- Water: ball coming to rest inside a water shape → **+1 stroke penalty**, drop
  at the last on-land resting position (standard casual rule).
- Slope: while the ball is over a slope shape, add its `accel` vector each step.
- Moving obstacles: position is a pure function of round number + phase (e.g.
  windmill blade angle `= 2π * (round * roundDuration + t) / period + phase`), so
  client re-sim matches server exactly.
- **No ball-to-ball collision.** Balls are ghosts to each other. Matches the
  "see only your own ball" rule and removes ordering/ fairness problems in
  simultaneous rounds.

All constants live in one `physics/config.ts` (with per-course overrides in the
course JSON) so tuning is a single file.

---

## 5. Round lifecycle (simultaneous, timed)

State machine per hole:

1. **RoundOpen** `{ holeIndex, roundNumber, durationSec }` broadcast. Overlay
   shows a countdown and "submit your swing in chat".
2. **Collect.** Players type commands. Ingest forwards valid swings. EBS keeps
   **one** pending swing per player — **last valid submission before close
   wins**. A player with no ball yet is added with a ball on the tee and their
   swing applies from there.
3. **Resolve.** On timer expiry EBS locks submissions and calls
   `simulateRound`. Produces per-ball trajectory + final state + stroke delta +
   `sunk` + `penalty` + events.
4. **RoundResult** broadcast: `[{ ballId, angle, power, finalX, finalY, sunk,
strokes, penalty }]`. Clients animate ~1.5–3 s, then snap to `finalX/finalY`,
   update scorecards.
5. **No submission** from a player → **no stroke**, ball stays. (Not penalised;
   just misses the round.)
6. **Advance.** When every remaining player has sunk, or the **per-hole round
   cap** (default 8) is hit, the hole ends. Players who didn't sink by the cap
   are scored `cap + 1` (or `par + fixed`) so an AFK player can't stall the
   table. Next `RoundOpen` for the next hole.
7. **Course end** → course-results screen. If inside a tournament, aggregate into
   standings and continue to the next course.

Timers, caps and the round duration are channel config with sane defaults.

---

## 6. Chat command grammar

Accepted (case-insensitive, leading `!`, flexible whitespace):

```
!70°, 50      !70, 50      !70 50      !70°50      !dir 70 pow 50 (nice-to-have)
```

- **direction**: number, degrees. Normalised `mod 360` (so `-20` → `340`,
  `370` → `10`). Reject non-numeric.
- **power**: number `0..100`. Clamp to range; reject non-numeric. `0` allowed
  (a no-op tap — still burns the round if submitted? → **no**, treat `power=0`
  as "no swing").
- Parser returns `{ ok: true, angle, power }` or `{ ok: false, reason }`.
- Extra tokens ignored. Multiple commands from one user in a round → last valid
  one is kept.
- Non-command chat and other bots' `!` commands are ignored (unknown verbs after
  `!` that aren't a bare `!<number>...` are dropped).

Fuzz tests cover: spacing, unicode degree sign, sign handling, out-of-range,
garbage, duplicate submissions, submissions after close.

---

## 7. Course & tournament data

### 7.1 Hole JSON (`courses/holes/*.json`)

```jsonc
{
  "id": "seaside-1",
  "name": "Seaside — 1",
  "size": { "w": 100, "h": 150 },
  "par": 3,
  "tee": { "x": 50, "y": 135 },
  "cup": { "x": 50, "y": 20, "radius": 2.2 },
  "surfaces": [
    { "type": "sand", "shape": { "kind": "circle", "x": 40, "y": 70, "r": 12 } },
    { "type": "water", "shape": { "kind": "rect", "x": 0, "y": 44, "w": 34, "h": 10 } },
    {
      "type": "slope",
      "shape": { "kind": "rect", "x": 60, "y": 60, "w": 40, "h": 30 },
      "accel": { "x": -4, "y": 0 },
    },
  ],
  "walls": [
    { "x1": 8, "y1": 8, "x2": 8, "y2": 142 },
    { "x1": 92, "y1": 8, "x2": 92, "y2": 142 },
  ],
  "obstacles": [{ "kind": "windmill", "x": 50, "y": 55, "radius": 10, "period": 4.0, "phase": 0 }],
  "physics": { "restitution": 0.7, "decel": { "fairway": 22, "green": 12, "sand": 70 } },
}
```

- Everywhere is `fairway` unless a surface region overrides it. Field edges are
  implicit bounce walls. The cup is the `cup` object (`x`, `y`, `radius`).
- Shapes: `circle {x,y,r}`, `rect {x,y,w,h}`, `polygon {points:[[x,y],...]}`.

### 7.2 Course JSON (`courses/*.json`)

```jsonc
{ "id": "seaside", "name": "Seaside Links", "holes": ["seaside-1", "seaside-2", "seaside-3"] }
```

### 7.3 Tournament

```jsonc
{
  "id": "weekly-open",
  "name": "Weekly Open",
  "courses": ["seaside", "seaside"], // e.g. two rounds of the same course
  "join": "locked-at-start", // or "rolling-between-courses"
  "scoring": "stroke-play",
}
```

- **Stroke play**: total strokes, low wins. (Stableford optional later.)
- Roster locked at start by default.
- Live standings: rank, name, **thru** (holes done), **to-par**, total.

### 7.4 Persistent stats (SQLite, key = `channel_id` + `user_id`)

games played, holes played, total strokes, avg strokes/hole, best hole (to-par),
holes-in-one, water hazards hit, tournaments played, tournament wins, longest
single putt distance.

---

## 8. Network protocol (frontend ⇄ EBS)

**EBS → frontend (broadcast, versioned `v`):**

- `round-open` `{ v, holeIndex, roundNumber, durationSec, serverTime }`
- `round-result` `{ v, roundNumber, balls: [{ id, name?, angle, power, fromX,
fromY, finalX, finalY, sunk, strokes, penalty }] }` — `name` only included for
  spectator packets / post-hole reveal.
- `hole-complete` `{ v, holeIndex, results: [{ id, name, strokes, toPar }] }`
- `standings` `{ v, rows: [{ rank, id, name, thru, toPar, total }] }`
- `game-state` `{ v, phase, course, holeIndex, roundNumber }` (join/snapshot)

Keep packets small: ids are short ints; omit `name` in the player-facing stream;
round trajectories are **not** sent (client re-sims from `fromX/Y, angle, power`).

**frontend → EBS (HTTP, JWT):** `GET /session`, `GET/PUT /config`,
`POST /control`.

**ingest → EBS (HTTP, shared secret):** `POST /command`.

---

## 9. Repo layout

```
golf-game/
├─ package.json                 # npm workspaces
├─ tsconfig.base.json
├─ packages/
│  ├─ shared/     model/ physics/ shapes/ protocol/ course/   (+ tests)
│  ├─ ebs/        http/ game/ twitch/ store/ entry/            (+ tests)
│  ├─ ingest/     src/ (twitch source, local source)          (+ tests)
│  └─ frontend/   video_component.* config.* dashboard.*
│                 src/render/ src/net/ src/state/
├─ courses/       *.json + holes/*.json
├─ tools/
│  └─ course-preview/     # local play-test harness (reuses shared + render)
└─ docs/          DESIGN.md  ROADMAP.md
```

`shared` is built first and consumed by the others via workspace references.

---

## 10. Testing strategy

- **Parser fuzz** — every accepted/rejected form in §6.
- **Shapes** — `contains` / `segmentIntersect` for circle/rect/polygon incl.
  edge cases.
- **Single-ball sim scenarios** — flat distance vs power curve, wall-bounce
  angle, sand stop distance, water penalty + drop, hole capture, lip-out at
  speed, slope drift.
- **Golden trajectories** — snapshot a handful of shots; fail on drift.
- **Determinism** — same inputs twice = identical; Node vs jsdom = identical.
- **Round scheduler** — post-close submissions ignored; last-write-wins;
  no-submit handling; hole advance on all-sunk and on cap; AFK can't stall.
- **Protocol size** — `round-result` for 200 balls serialises < 5 KB.
- **Load sketch** — 200-ball round simulates within a few ms.

---

## 11. Deferred, but designed for

- **Monetization** via `EntryGate.authorizeStart(ctx): Promise<Result>`:
  - `FreeGate` (now) — allow only `broadcaster` / `moderator`.
  - `BitsGate` — frontend `Twitch.ext.bits.useBits(sku)`, EBS verifies the Bits
    transaction JWT / PubSub `bits-transaction`.
  - `ChannelPointsGate` — EBS EventSub
    `channel.channel_points_custom_reward_redemption.add` with a broadcaster
    OAuth token; config page hosts the onboarding/consent flow.
  - `paid_entry` ledger table exists from day 1 (empty under `FreeGate`) so
    finished-game records don't need a migration later.
- **Bot replies in chat** — optional OAuth bot token in `ingest` for
  confirmations / error messages.
- **Course editor** — a config-page tool or standalone HTML built on
  `course-preview`.
- **Mobile extension view.**
- **Alt scoring** (Stableford, match play), skins, closest-to-pin side games.

---

## 12. Open decisions (defaults chosen — change here if wrong)

| #   | Decision                  | Default                                                                                    |
| --- | ------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Extension type            | Video Component, portrait ~2:3 field                                                       |
| 2   | Chat read                 | Anonymous `tmi.js`, read-only, no bot token in v1                                          |
| 3   | "Only your own ball"      | Requires identity grant; others get spectator view; reveal-all after each hole             |
| 4   | Round resolution          | Last valid submission before close wins; no-submit = skip; per-hole cap ~8 then auto-score |
| 5   | Ball-to-ball collision    | None (ghost balls)                                                                         |
| 6   | Friction model            | Constant per-surface deceleration; wall restitution ~0.7                                   |
| 7   | Water rule                | +1 stroke, drop at last on-land rest                                                       |
| 8   | Client animation          | Re-sim `shared` engine; server resting positions canonical                                 |
| 9   | Store                     | SQLite (`better-sqlite3`)                                                                  |
| 10  | Game-start authority (v1) | Broadcaster + mods, via command or dashboard, behind `EntryGate`                           |
| 11  | Language / stack          | Node + TypeScript everywhere; frontend vanilla + Canvas (no framework)                     |
