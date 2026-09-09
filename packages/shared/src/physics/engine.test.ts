import { describe, expect, it } from "vitest";

import { DEFAULT_PHYSICS } from "./config";
import { initialVelocity, pointSegmentDistance, simulateShot } from "./engine";
import type { SimField } from "./engine";

const k = DEFAULT_PHYSICS;

/** Big field with the cup tucked in a corner, for isolating one behaviour. */
const openField: SimField = { w: 400, h: 400, cup: { x: 1, y: 399, radius: 1 } };

/** practice-1 geometry. */
const practiceField: SimField = { w: 100, h: 150, cup: { x: 50, y: 20, radius: 2.2 } };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("initialVelocity", () => {
  it("0° points up (−y)", () => {
    const v = initialVelocity(0, 100, k);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(-k.powerScale, 6);
  });
  it("90° points right (+x)", () => {
    const v = initialVelocity(90, 100, k);
    expect(v.x).toBeCloseTo(k.powerScale, 6);
    expect(v.y).toBeCloseTo(0, 6);
  });
  it("180° points down (+y)", () => {
    const v = initialVelocity(180, 50, k);
    expect(v.y).toBeCloseTo(k.powerScale * 0.5, 6);
  });
  it("power scales the magnitude linearly", () => {
    expect(Math.hypot(...Object.values(initialVelocity(37, 40, k)))).toBeCloseTo(
      k.powerScale * 0.4,
      6,
    );
  });
});

describe("pointSegmentDistance", () => {
  it("perpendicular distance to a segment", () => {
    expect(pointSegmentDistance(0, 5, -10, 0, 10, 0)).toBeCloseTo(5, 6);
  });
  it("clamps to the nearest endpoint", () => {
    expect(pointSegmentDistance(20, 0, -10, 0, 10, 0)).toBeCloseTo(10, 6);
  });
  it("degenerate segment falls back to point distance", () => {
    expect(pointSegmentDistance(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 6);
  });
});

describe("simulateShot — rolling and rest", () => {
  it("a straight shot stays on its axis and stops roughly where physics predicts", () => {
    const from = { x: 50, y: 350 };
    const res = simulateShot(openField, { from, angle: 0, power: 40 }, k);
    const v0 = (k.powerScale * 40) / 100;
    const predicted = (v0 * v0) / (2 * k.decel.fairway); // ≈ 18.8 units

    expect(res.sunk).toBe(false);
    expect(res.final.x).toBeCloseTo(50, 3); // no sideways drift
    expect(res.final.y).toBeLessThan(from.y); // travelled "up"
    expect(dist(from, res.final)).toBeGreaterThan(predicted * 0.85);
    expect(dist(from, res.final)).toBeLessThan(predicted * 1.05);
    expect(res.events.at(-1)?.type).toBe("rest");
  });

  it("more power travels further", () => {
    const from = { x: 50, y: 380 };
    const shorter = simulateShot(openField, { from, angle: 0, power: 30 }, k);
    const longer = simulateShot(openField, { from, angle: 0, power: 60 }, k);
    expect(dist(from, longer.final)).toBeGreaterThan(dist(from, shorter.final));
  });

  it("direction: 90° goes +x, 270° goes −x, 180° goes +y", () => {
    const from = { x: 50, y: 200 };
    expect(simulateShot(openField, { from, angle: 90, power: 30 }, k).final.x).toBeGreaterThan(50);
    expect(simulateShot(openField, { from, angle: 270, power: 30 }, k).final.x).toBeLessThan(50);
    expect(simulateShot(openField, { from, angle: 180, power: 30 }, k).final.y).toBeGreaterThan(
      200,
    );
  });

  it("path starts at `from` and ends at `final`", () => {
    const from = { x: 20, y: 300 };
    const res = simulateShot(openField, { from, angle: 25, power: 55 }, k);
    expect(res.path[0]).toEqual(from);
    expect(res.path.at(-1)).toEqual(res.final);
  });
});

describe("simulateShot — edge bounce", () => {
  it("bounces off a wall and ends in bounds, with a bounce event", () => {
    const from = { x: 50, y: 75 };
    const res = simulateShot(practiceField, { from, angle: 90, power: 100 }, k);
    expect(res.events.some((e) => e.type === "bounce")).toBe(true);
    expect(res.final.x).toBeGreaterThanOrEqual(k.ballRadius);
    expect(res.final.x).toBeLessThanOrEqual(practiceField.w - k.ballRadius);
    expect(res.final.y).toBeGreaterThanOrEqual(k.ballRadius);
    expect(res.final.y).toBeLessThanOrEqual(practiceField.h - k.ballRadius);
  });

  it("restitution removes energy: a bounced shot travels less total distance than an unobstructed one", () => {
    const from = { x: 50, y: 75 };
    const bounced = simulateShot(practiceField, { from, angle: 90, power: 80 }, k);
    const free = simulateShot(openField, { from, angle: 90, power: 80 }, k);
    expect(dist(from, bounced.final)).toBeLessThan(dist(from, free.final));
  });
});

describe("simulateShot — the cup", () => {
  it("a well-judged putt drops", () => {
    const res = simulateShot(practiceField, { from: { x: 50, y: 28 }, angle: 0, power: 32 }, k);
    expect(res.sunk).toBe(true);
    expect(res.final.x).toBeCloseTo(50, 6);
    expect(res.final.y).toBeCloseTo(20, 6);
    expect(res.events.at(-1)?.type).toBe("sink");
  });

  it("a screamer over the cup lips out and keeps going", () => {
    const res = simulateShot(practiceField, { from: { x: 50, y: 40 }, angle: 0, power: 100 }, k);
    expect(res.sunk).toBe(false);
    expect(res.events.some((e) => e.type === "lip-out")).toBe(true);
  });

  it("a tap-in from inside the cup radius drops", () => {
    const res = simulateShot(practiceField, { from: { x: 51, y: 21 }, angle: 225, power: 3 }, k);
    expect(res.sunk).toBe(true);
  });
});

describe("simulateShot — determinism", () => {
  it("identical inputs produce identical output", () => {
    const shot = { from: { x: 33, y: 120 }, angle: 71, power: 64 };
    expect(simulateShot(practiceField, shot, k)).toEqual(simulateShot(practiceField, shot, k));
  });

  it("terminates within the step cap for a max-power shot", () => {
    const res = simulateShot(practiceField, { from: { x: 50, y: 140 }, angle: 33, power: 100 }, k);
    expect(res.steps).toBeLessThan(k.maxSteps);
  });
});
