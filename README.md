# Twitch Golf

A Twitch Extension (video component) that overlays a top-down golf course on a
live stream. Viewers play through chat in simultaneous timed rounds, trying to
sink the ball in as few swings as possible. Multi-hole courses, tournaments,
per-player stats and rankings.

Chat input: `!<degrees>°, <power>` — e.g. `!70°, 50` hits toward 70° at 50% power.
Compass: `0°` = up, `90°` = right, clockwise.

## Status

Phases 0–8 complete (see [`docs/ROADMAP.md`](docs/ROADMAP.md)). The whole loop
runs locally without Twitch. Phase 9 (register the real extension + real
PubSub + hosting) and Phase 10 (Bits / channel-points entry, polish) remain.

- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, game model, Twitch
  constraints, protocol, data formats, open decisions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build log.

## Packages

Node + TypeScript, npm-workspaces monorepo. `npm install`, then:

| Command                                                       | What                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm test`                                                    | all workspace test suites (175 tests)                               |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | CI gates                                                            |
| `npm run start -w @twitch-golf/ebs`                           | EBS + mock PubSub (`:8081` / ws `:8082`)                            |
| `npm run start -w @twitch-golf/ingest`                        | chat reader — type `alice: !70, 50` (or `mod: !golf start seaside`) |
| `npm run dev -w @twitch-golf/frontend`                        | overlay dev server (`:5180`)                                        |
| `npm run play -w @twitch-golf/course-preview -- practice-2`   | terminal physics play-test                                          |

| Package    | Role                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `shared`   | Deterministic sim + geometry + data model + chat grammar + course schema                 |
| `ebs`      | Authoritative game state, round scheduler, tournaments, JWT auth, stats store, broadcast |
| `ingest`   | Reads channel chat (anonymous `tmi.js`), forwards swings + `!golf` control to the EBS    |
| `frontend` | Twitch video-component overlay (Canvas) + config + dashboard pages                       |

Local dev launcher: open `packages/frontend/dist` via the dev server, or
`packages/frontend/public/index.html` for the link list. Overlay URL params:
`?channel=&ebs=&ws=&role=&user=&anon=1`.
