/**
 * Terminal play-test harness for the shared golf sim.
 *
 *   npm run play -w @twitch-golf/course-preview            # practice-1
 *   npm run play -w @twitch-golf/course-preview -- practice-2
 *   npm run play -w @twitch-golf/course-preview -- ./path/to/hole.json
 *
 * Then type swing commands (`!70, 50`, `!dir 120 pow 30`, ...). `r` resets the
 * ball to the tee, `q` quits.
 */
import { createInterface } from "node:readline";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fieldFromHole, parseChatCommand, resolvePhysics, simulateShot } from "@twitch-golf/shared";
import type { SimEvent } from "@twitch-golf/shared";
import { loadHoleFile } from "@twitch-golf/shared/node";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const COLS = 50;
const ROWS = 30;

interface Pt {
  x: number;
  y: number;
}

function resolveHolePath(arg: string | undefined): string {
  const target = arg ?? "practice-1";
  if (target.endsWith(".json")) return isAbsolute(target) ? target : resolve(process.cwd(), target);
  return resolve(repoRoot, "courses/holes", `${target}.json`);
}

function render(
  field: { w: number; h: number; cup: { x: number; y: number } },
  tee: Pt,
  ball: Pt,
  path: Pt[],
): string {
  const grid: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLS).fill(" "));
  const gx = (x: number) => Math.round((x / field.w) * (COLS - 1));
  const gy = (y: number) => Math.round((y / field.h) * (ROWS - 1));
  const put = (x: number, y: number, ch: string) => {
    const cx = gx(x);
    const cy = gy(y);
    if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) grid[cy]![cx] = ch;
  };

  for (const p of path) put(p.x, p.y, "·");
  put(field.cup.x, field.cup.y, "O");
  put(tee.x, tee.y, "T");
  put(ball.x, ball.y, "@");

  const top = `┌${"─".repeat(COLS)}┐`;
  const bottom = `└${"─".repeat(COLS)}┘`;
  const body = grid.map((row) => `│${row.join("")}│`).join("\n");
  return `${top}\n${body}\n${bottom}`;
}

function summarise(events: SimEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return [...counts].map(([type, n]) => (n > 1 ? `${type}×${n}` : type)).join(", ") || "—";
}

async function main(): Promise<void> {
  const holePath = resolveHolePath(process.argv[2]);
  const hole = await loadHoleFile(holePath);
  const k = resolvePhysics(hole.physics);
  const field = fieldFromHole(hole);

  let pos: Pt = { x: hole.tee.x, y: hole.tee.y };
  let strokes = 0;

  const banner = () => {
    console.log(`\n${hole.name}  ·  par ${hole.par}  ·  field ${field.w}×${field.h}`);
    console.log(render(field, hole.tee, pos, [pos]));
    console.log(`strokes: ${strokes}   ball: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    console.log(`commands: !<deg>, <power>   r = reset   q = quit`);
  };

  banner();

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "golf> " });
  rl.prompt();

  rl.on("line", (raw) => {
    const line = raw.trim();
    if (line === "q" || line === "quit") return rl.close();
    if (line === "r" || line === "reset") {
      pos = { x: hole.tee.x, y: hole.tee.y };
      strokes = 0;
      banner();
      return rl.prompt();
    }

    const parsed = parseChatCommand(line);
    if (!parsed.ok) {
      console.log(`  ✗ ${parsed.reason}`);
      return rl.prompt();
    }

    const shot = simulateShot(field, { from: pos, angle: parsed.angle, power: parsed.power }, k);
    strokes += 1;
    pos = shot.final;

    console.log(render(field, hole.tee, pos, shot.path));
    console.log(
      `  ${parsed.angle}° @ ${parsed.power}  →  (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})` +
        `   steps ${shot.steps}   events: ${summarise(shot.events)}`,
    );

    if (shot.sunk) {
      console.log(`\n  ⛳  SUNK in ${strokes} (par ${hole.par}) — resetting.\n`);
      pos = { x: hole.tee.x, y: hole.tee.y };
      strokes = 0;
    } else {
      console.log(`  strokes: ${strokes}`);
    }
    rl.prompt();
  });

  rl.on("close", () => process.exit(0));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
