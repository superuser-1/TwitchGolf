import { describe, expect, it } from "vitest";

import { DEFAULT_PHYSICS } from "./config";
import { simulateShot } from "./engine";
import type { SimField } from "./engine";
import { simulateRound } from "./simulate";
import type { RoundBallInput } from "./simulate";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const roundPt = (p: { x: number; y: number }) => ({ x: round3(p.x), y: round3(p.y) });

const field: SimField = { w: 100, h: 150, cup: { x: 50, y: 20, radius: 2.2 } };
const hole = { size: { w: 100, h: 150 }, cup: { x: 50, y: 20, radius: 2.2 } } as const;

/**
 * Golden trajectories. The snapshot file is committed; a change to the sim that
 * moves any ball is a deliberate, reviewable diff. Coordinates are rounded to
 * 3dp so last-ULP `Math.sin`/`Math.cos` differences between JS engines don't
 * cause flakes (see `docs/DESIGN.md` §3.1).
 */
describe("golden trajectories", () => {
  const shots = [
    { name: "gentle putt that drops", from: { x: 50, y: 30 }, angle: 0, power: 30 },
    { name: "mid-power drive", from: { x: 50, y: 140 }, angle: 0, power: 70 },
    { name: "angled shot off a wall", from: { x: 20, y: 120 }, angle: 55, power: 85 },
    { name: "screamer that lips out", from: { x: 50, y: 45 }, angle: 0, power: 100 },
    { name: "bank shot", from: { x: 12, y: 100 }, angle: 300, power: 60 },
  ];

  for (const shot of shots) {
    it(shot.name, () => {
      const res = simulateShot(field, shot, DEFAULT_PHYSICS);
      expect({
        final: roundPt(res.final),
        sunk: res.sunk,
        steps: res.steps,
        events: res.events.map((e) => e.type),
        pathPoints: res.path.length,
        pathTail: res.path.slice(-3).map(roundPt),
      }).toMatchSnapshot();
    });
  }
});

describe("repeatability", () => {
  it("simulateShot is bit-identical on re-run", () => {
    const shot = { from: { x: 27, y: 133 }, angle: 148, power: 77 };
    expect(simulateShot(field, shot, DEFAULT_PHYSICS)).toEqual(
      simulateShot(field, shot, DEFAULT_PHYSICS),
    );
  });

  it("simulateRound is order-stable and bit-identical on re-run", () => {
    const inputs: RoundBallInput[] = [
      { id: 1, position: { x: 40, y: 120 }, sunk: false, swing: { angle: 5, power: 55 } },
      { id: 2, position: { x: 55, y: 95 }, sunk: false, swing: { angle: 190, power: 40 } },
      { id: 3, position: { x: 50, y: 20 }, sunk: true },
    ];
    const a = simulateRound(hole, inputs, 3);
    const b = simulateRound(hole, inputs, 3);
    expect(a).toEqual(b);
  });
});
