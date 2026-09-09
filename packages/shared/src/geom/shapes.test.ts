import { describe, expect, it } from "vitest";

import type { Shape } from "../course/schema";
import { pointInPolygon, shapeContains } from "./shapes";

describe("shapeContains — circle", () => {
  const c: Shape = { kind: "circle", x: 10, y: 10, r: 5 };
  it("inside", () => expect(shapeContains(c, 12, 12)).toBe(true));
  it("on the boundary", () => expect(shapeContains(c, 15, 10)).toBe(true));
  it("outside", () => expect(shapeContains(c, 16, 10)).toBe(false));
});

describe("shapeContains — rect", () => {
  const r: Shape = { kind: "rect", x: 0, y: 0, w: 10, h: 4 };
  it("inside", () => expect(shapeContains(r, 5, 2)).toBe(true));
  it("on an edge", () => expect(shapeContains(r, 10, 4)).toBe(true));
  it("outside", () => expect(shapeContains(r, 5, 5)).toBe(false));
});

describe("shapeContains / pointInPolygon", () => {
  // Concave arrow-ish polygon.
  const poly = [
    [0, 0],
    [10, 0],
    [10, 10],
    [5, 5],
    [0, 10],
  ] as [number, number][];
  const s: Shape = { kind: "polygon", points: poly };

  it("inside the solid part", () => expect(shapeContains(s, 5, 2)).toBe(true));
  it("inside the concave notch is outside the polygon", () => {
    expect(pointInPolygon(poly, 5, 8)).toBe(false);
  });
  it("well outside", () => expect(pointInPolygon(poly, 20, 20)).toBe(false));
});
