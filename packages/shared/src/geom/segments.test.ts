import { describe, expect, it } from "vitest";

import { closestPointOnSegment, segmentIntersection, segmentNormal } from "./segments";

describe("segmentIntersection", () => {
  it("crossing segments return the intersection point and parameter", () => {
    const hit = segmentIntersection(-5, 0, 5, 0, 0, -5, 0, 5);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBeCloseTo(0, 6);
    expect(hit?.y).toBeCloseTo(0, 6);
    expect(hit?.t).toBeCloseTo(0.5, 6);
  });

  it("non-crossing segments return null", () => {
    expect(segmentIntersection(0, 0, 1, 0, 2, 1, 3, 1)).toBeNull();
  });

  it("parallel segments return null", () => {
    expect(segmentIntersection(0, 0, 10, 0, 0, 1, 10, 1)).toBeNull();
  });

  it("a T-junction touch counts", () => {
    const hit = segmentIntersection(0, 0, 10, 0, 5, 0, 5, 5);
    expect(hit?.x).toBeCloseTo(5, 6);
    expect(hit?.y).toBeCloseTo(0, 6);
  });
});

describe("closestPointOnSegment", () => {
  it("perpendicular foot inside the segment", () => {
    const cp = closestPointOnSegment(5, 3, 0, 0, 10, 0);
    expect(cp.x).toBeCloseTo(5, 6);
    expect(cp.y).toBeCloseTo(0, 6);
    expect(cp.dist).toBeCloseTo(3, 6);
    expect(cp.t).toBeCloseTo(0.5, 6);
  });
  it("clamps past the end", () => {
    const cp = closestPointOnSegment(20, 0, 0, 0, 10, 0);
    expect(cp.x).toBeCloseTo(10, 6);
    expect(cp.dist).toBeCloseTo(10, 6);
    expect(cp.t).toBe(1);
  });
});

describe("segmentNormal", () => {
  it("is unit length and perpendicular", () => {
    const n = segmentNormal({ x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(Math.hypot(n.nx, n.ny)).toBeCloseTo(1, 6);
    expect(n.nx * 10 + n.ny * 0).toBeCloseTo(0, 6);
  });
});
