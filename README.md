# Twitch Golf Game

A Twitch Extension (video component) that overlays a top-down golf course on a
live stream. Viewers play through chat in simultaneous timed rounds, trying to
sink the ball in as few swings as possible. Multi-hole courses, tournaments,
per-player stats and rankings.

Chat input: `!<degrees>°, <power>` — e.g. `!70°, 50` hits toward 70° at 50% power.
Compass: `0°` = up, `90°` = right, clockwise.

## Status

Planning. See:

- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, game model, Twitch
  constraints, protocol, data formats, open decisions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build order.

## Planned stack

Node + TypeScript throughout. npm-workspaces monorepo:

| Package    | Role                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `shared`   | Deterministic physics sim + data model + chat grammar + course schema |
| `ebs`      | Authoritative game state, round scheduler, JWT verify, PubSub, SQLite |
| `ingest`   | Reads channel chat (anonymous `tmi.js`), forwards commands to the EBS |
| `frontend` | Twitch video-component overlay (Canvas), config page, dashboard       |

Everything has an offline path (mock PubSub, mock chat, local course-preview
tool) so the full loop runs without Twitch.
