import { describe, expect, it } from "vitest";

import { courseSchema, holeSchema } from "./schema";

const baseHole = {
  id: "t1",
  name: "Test 1",
  size: { w: 100, h: 150 },
  par: 3,
  tee: { x: 50, y: 130 },
  cup: { x: 50, y: 20, radius: 2 },
};

describe("holeSchema", () => {
  it("accepts a minimal hole and fills array defaults", () => {
    const hole = holeSchema.parse(baseHole);
    expect(hole.surfaces).toEqual([]);
    expect(hole.walls).toEqual([]);
    expect(hole.obstacles).toEqual([]);
  });

  it("rejects a tee outside the field", () => {
    expect(() => holeSchema.parse({ ...baseHole, tee: { x: -5, y: 10 } })).toThrow(/tee/);
  });

  it("rejects a cup outside the field", () => {
    expect(() => holeSchema.parse({ ...baseHole, cup: { x: 200, y: 20, radius: 2 } })).toThrow(
      /cup/,
    );
  });

  it("rejects a cup radius <= 0", () => {
    expect(() => holeSchema.parse({ ...baseHole, cup: { x: 1, y: 1, radius: 0 } })).toThrow();
  });

  it("requires accel on a slope surface", () => {
    expect(() =>
      holeSchema.parse({
        ...baseHole,
        surfaces: [{ type: "slope", shape: { kind: "rect", x: 0, y: 0, w: 10, h: 10 } }],
      }),
    ).toThrow(/accel/);
  });

  it("accepts a slope surface with accel", () => {
    const hole = holeSchema.parse({
      ...baseHole,
      surfaces: [
        { type: "slope", shape: { kind: "rect", x: 0, y: 0, w: 10, h: 10 }, accel: { x: 1, y: 0 } },
      ],
    });
    expect(hole.surfaces[0]?.type).toBe("slope");
  });

  it("accepts circle, rect and polygon shapes", () => {
    const hole = holeSchema.parse({
      ...baseHole,
      surfaces: [
        { type: "sand", shape: { kind: "circle", x: 5, y: 5, r: 3 } },
        { type: "water", shape: { kind: "rect", x: 0, y: 0, w: 4, h: 4 } },
        {
          type: "green",
          shape: {
            kind: "polygon",
            points: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          },
        },
      ],
    });
    expect(hole.surfaces).toHaveLength(3);
  });

  it("rejects a polygon with fewer than 3 points", () => {
    expect(() =>
      holeSchema.parse({
        ...baseHole,
        surfaces: [
          {
            type: "green",
            shape: {
              kind: "polygon",
              points: [
                [0, 0],
                [1, 1],
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a non-integer par", () => {
    expect(() => holeSchema.parse({ ...baseHole, par: 3.5 })).toThrow();
  });
});

describe("courseSchema", () => {
  it("accepts a course that references hole ids", () => {
    expect(courseSchema.parse({ id: "c", name: "C", holes: ["a", "b"] }).holes).toEqual(["a", "b"]);
  });

  it("rejects an empty hole list", () => {
    expect(() => courseSchema.parse({ id: "c", name: "C", holes: [] })).toThrow();
  });
});
