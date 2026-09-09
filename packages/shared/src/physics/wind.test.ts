import { describe, expect, it } from "vitest";

import { DEFAULT_PHYSICS, resolvePhysics } from "./config";
import { simulateShot } from "./engine";
import type { SimField } from "./engine";

const k = DEFAULT_PHYSICS;
/** Big field, cup tucked away, so a straight shot just rolls and stops. */
const base: SimField = { w: 400, h: 400, cup: { x: 1, y: 399, radius: 1 } };
const from = { x: 200, y: 350 };

const dry = (power: number) => simulateShot(base, { from, angle: 0, power }, k).final;
const blown = (power: number, wind: { angle: number; power: number }) =>
  simulateShot({ ...base, wind }, { from, angle: 0, power }, k).final;

describe("wind", () => {
  it("a crosswind pushes the ball off the aim line", () => {
    const straight = dry(85);
    const drifted = blown(85, { angle: 90, power: 70 }); // wind blows toward +x
    expect(drifted.x).toBeGreaterThan(straight.x + 4);
    expect(drifted.x).toBeGreaterThan(from.x);
  });

  it("a headwind shortens the shot", () => {
    const straight = dry(70); // travels up (−y)
    const into = blown(70, { angle: 180, power: 70 }); // wind blows down (+y)
    expect(into.y).toBeGreaterThan(straight.y);
  });

  it("a tailwind lengthens the shot", () => {
    const straight = dry(70);
    const with_ = blown(70, { angle: 0, power: 70 }); // wind blows up (−y)
    expect(with_.y).toBeLessThan(straight.y);
  });

  it("affects long powerful shots far more than short weak ones", () => {
    const wind = { angle: 90, power: 70 };
    const bigDrift = blown(95, wind).x - dry(95).x;
    const smallDrift = blown(25, wind).x - dry(25).x;
    expect(bigDrift).toBeGreaterThan(smallDrift * 5);
    expect(smallDrift).toBeLessThan(1.5); // a putt barely notices
  });

  it("wind.power 0 is a no-op", () => {
    expect(blown(60, { angle: 90, power: 0 })).toEqual(dry(60));
  });

  it("a field without wind is byte-identical to before", () => {
    const a = simulateShot(base, { from, angle: 33, power: 66 }, k);
    const b = simulateShot({ ...base, wind: undefined }, { from, angle: 33, power: 66 }, k);
    expect(a).toEqual(b);
  });

  it("resolvePhysics applies a per-hole windScale override", () => {
    const wind = { angle: 90, power: 100 };
    const shot = (kk = k) =>
      simulateShot({ ...base, wind }, { from, angle: 0, power: 80 }, kk).final.x;
    expect(shot(resolvePhysics({ windScale: 8 }))).toBeGreaterThan(
      shot(resolvePhysics({ windScale: 0.5 })) + 10,
    );
  });

  it("is deterministic on re-run", () => {
    const wind = { angle: 140, power: 55 };
    const shot = { from, angle: 20, power: 77 };
    expect(simulateShot({ ...base, wind }, shot, k)).toEqual(
      simulateShot({ ...base, wind }, shot, k),
    );
  });
});
