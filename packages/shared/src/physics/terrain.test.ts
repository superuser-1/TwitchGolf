import { describe, expect, it } from "vitest";

import type { Obstacle, Surface } from "../course/schema";
import { windmillBlade } from "./obstacles";
import { slopeAccelAt, surfaceAt } from "./terrain";

describe("surfaceAt", () => {
  const surfaces: Surface[] = [
    { type: "sand", shape: { kind: "rect", x: 0, y: 0, w: 50, h: 50 } },
    { type: "water", shape: { kind: "rect", x: 20, y: 20, w: 50, h: 50 } },
  ];

  it("returns fairway with no surfaces", () => {
    expect(surfaceAt(undefined, 5, 5)).toBe("fairway");
    expect(surfaceAt([], 5, 5)).toBe("fairway");
  });
  it("returns the containing surface", () => {
    expect(surfaceAt(surfaces, 5, 5)).toBe("sand");
  });
  it("later region wins where they overlap", () => {
    expect(surfaceAt(surfaces, 30, 30)).toBe("water");
  });
  it("returns fairway outside every region", () => {
    expect(surfaceAt(surfaces, 90, 90)).toBe("fairway");
  });
});

describe("slopeAccelAt", () => {
  const surfaces: Surface[] = [
    { type: "slope", shape: { kind: "rect", x: 0, y: 0, w: 100, h: 100 }, accel: { x: 3, y: 0 } },
    { type: "slope", shape: { kind: "rect", x: 0, y: 0, w: 50, h: 50 }, accel: { x: 0, y: 4 } },
    { type: "sand", shape: { kind: "rect", x: 0, y: 0, w: 100, h: 100 } },
  ];

  it("is zero off any slope", () => {
    expect(slopeAccelAt(surfaces, 200, 200)).toEqual({ x: 0, y: 0 });
  });
  it("sums overlapping slope regions", () => {
    expect(slopeAccelAt(surfaces, 10, 10)).toEqual({ x: 3, y: 4 });
  });
  it("uses only the wider slope outside the overlap", () => {
    expect(slopeAccelAt(surfaces, 80, 80)).toEqual({ x: 3, y: 0 });
  });
});

describe("windmillBlade", () => {
  const o: Obstacle = { kind: "windmill", x: 0, y: 0, radius: 10, period: 4, phase: 0 };

  it("is a diameter segment through the centre", () => {
    const b = windmillBlade(o, 0, 0);
    expect((b.x1 + b.x2) / 2).toBeCloseTo(0, 6);
    expect((b.y1 + b.y2) / 2).toBeCloseTo(0, 6);
    expect(Math.hypot(b.x2 - b.x1, b.y2 - b.y1)).toBeCloseTo(20, 6);
  });

  it("rotates a quarter turn over a quarter period", () => {
    const b = windmillBlade(o, 1, 0); // t = period/4 -> +90°
    expect(b.x2 - b.x1).toBeCloseTo(0, 6);
    expect(Math.abs(b.y2 - b.y1)).toBeCloseTo(20, 6);
  });

  it("phase offset shifts the orientation", () => {
    const a = windmillBlade(o, 0, 0);
    const c = windmillBlade(o, 0, Math.PI / 2);
    expect(a.x1).not.toBeCloseTo(c.x1, 3);
  });
});
