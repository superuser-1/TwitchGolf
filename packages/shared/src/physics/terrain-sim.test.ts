import { describe, expect, it } from "vitest";

import { DEFAULT_PHYSICS } from "./config";
import { simulateShot } from "./engine";
import type { SimField } from "./engine";
import { simulateRound } from "./simulate";
import type { RoundBallInput, SimHoleInput } from "./simulate";

const k = DEFAULT_PHYSICS;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("sand", () => {
  it("stops a ball sooner than fairway", () => {
    const from = { x: 50, y: 90 };
    const bare: SimField = { w: 100, h: 200, cup: { x: 1, y: 1, radius: 1 } };
    const sandy: SimField = {
      ...bare,
      surfaces: [{ type: "sand", shape: { kind: "rect", x: 0, y: 0, w: 100, h: 80 } }],
    };
    const open = simulateShot(bare, { from, angle: 0, power: 55 }, k);
    const inSand = simulateShot(sandy, { from, angle: 0, power: 55 }, k);
    expect(dist(from, inSand.final)).toBeLessThan(dist(from, open.final) * 0.7);
  });
});

describe("water", () => {
  const hole: SimHoleInput = {
    size: { w: 100, h: 150 },
    cup: { x: 50, y: 5, radius: 2 },
    surfaces: [{ type: "water", shape: { kind: "rect", x: 0, y: 40, w: 100, h: 20 } }],
  };

  it("resting in water: penalty stroke and drop back at the start", () => {
    const from = { x: 50, y: 68 };
    const res = simulateShot(
      { w: 100, h: 150, cup: hole.cup, surfaces: hole.surfaces },
      { from, angle: 0, power: 40 },
      k,
    );
    expect(res.water).toBe(true);
    expect(res.penalty).toBe(1);
    expect(res.final).toEqual(from);
    // the path still shows the ball travelling into the hazard before the drop
    expect(res.path.at(-1)?.y).toBeLessThan(from.y);
  });

  it("simulateRound rolls the penalty into strokesAdded", () => {
    const inputs: RoundBallInput[] = [
      { id: 1, position: { x: 50, y: 68 }, sunk: false, swing: { angle: 0, power: 40 } },
    ];
    const [ball] = simulateRound(hole, inputs, 1).balls;
    expect(ball?.penalty).toBe(1);
    expect(ball?.strokesAdded).toBe(2);
    expect(ball?.final).toEqual({ x: 50, y: 68 });
  });
});

describe("slope", () => {
  it("pushes a straight shot sideways", () => {
    const field: SimField = {
      w: 100,
      h: 150,
      cup: { x: 1, y: 1, radius: 1 },
      surfaces: [
        {
          type: "slope",
          shape: { kind: "rect", x: 0, y: 40, w: 100, h: 40 },
          accel: { x: 12, y: 0 },
        },
      ],
    };
    const from = { x: 40, y: 95 };
    const res = simulateShot(field, { from, angle: 0, power: 60 }, k);
    expect(res.final.x).toBeGreaterThan(from.x + 3);
  });
});

describe("walls", () => {
  it("a ball reflects off an interior wall and stays on the near side", () => {
    const field: SimField = {
      w: 100,
      h: 150,
      cup: { x: 1, y: 1, radius: 1 },
      walls: [{ x1: 10, y1: 100, x2: 90, y2: 100 }],
    };
    const from = { x: 50, y: 140 };
    const res = simulateShot(field, { from, angle: 0, power: 70 }, k);
    expect(res.events.some((e) => e.type === "wall")).toBe(true);
    expect(res.final.y).toBeGreaterThan(100); // bounced back toward the tee side
  });
});

describe("windmill obstacle", () => {
  const hole: SimHoleInput = {
    size: { w: 100, h: 150 },
    cup: { x: 50, y: 5, radius: 2 },
    obstacles: [{ kind: "windmill", x: 50, y: 80, radius: 14, period: 3, phase: 0 }],
  };
  const inputs: RoundBallInput[] = [
    { id: 1, position: { x: 50, y: 140 }, sunk: false, swing: { angle: 0, power: 95 } },
  ];

  it("is deterministic within a round but differs between rounds", () => {
    const r1a = simulateRound(hole, inputs, 1);
    const r1b = simulateRound(hole, inputs, 1);
    const r2 = simulateRound(hole, inputs, 2);
    expect(r1a).toEqual(r1b);
    expect(r1a.balls[0]?.final).not.toEqual(r2.balls[0]?.final);
  });

  it("the blade deflects the ball (obstacle event fires)", () => {
    const { balls } = simulateRound(hole, inputs, 1);
    expect(balls[0]?.events.some((e) => e.type === "obstacle")).toBe(true);
  });
});
