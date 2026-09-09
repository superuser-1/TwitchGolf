import { describe, expect, it } from "vitest";

import { MAX_PULL, dragToSwing } from "../src/input";

const ball = { x: 50, y: 50 };

describe("dragToSwing (slingshot)", () => {
  it("launches opposite the pull: pull down -> shoot up (0°)", () => {
    expect(dragToSwing(ball, { x: 50, y: 80 }).angle).toBeCloseTo(0, 5);
  });

  it("pull left -> shoot right (90°)", () => {
    expect(dragToSwing(ball, { x: 20, y: 50 }).angle).toBeCloseTo(90, 5);
  });

  it("pull up -> shoot down (180°)", () => {
    expect(dragToSwing(ball, { x: 50, y: 20 }).angle).toBeCloseTo(180, 5);
  });

  it("pull down-right -> shoot up-left (315°)", () => {
    expect(dragToSwing(ball, { x: 80, y: 80 }).angle).toBeCloseTo(315, 5);
  });

  it("power is the pull distance mapped to 0..100 at MAX_PULL", () => {
    expect(dragToSwing(ball, { x: 50, y: 50 + MAX_PULL / 2 }).power).toBe(50);
    expect(dragToSwing(ball, { x: 50, y: 50 + MAX_PULL }).power).toBe(100);
  });

  it("clamps a huge pull to 100 and a tiny pull to >= 1", () => {
    expect(dragToSwing(ball, { x: 50, y: 400 }).power).toBe(100);
    expect(dragToSwing(ball, { x: 50, y: 50.4 }).power).toBeGreaterThanOrEqual(1);
    expect(dragToSwing(ball, { x: 50, y: 50.4 }).power).toBeLessThan(3);
  });

  it("angle is always normalised to [0, 360)", () => {
    for (let a = 0; a < 360; a += 17) {
      const rad = (a * Math.PI) / 180;
      const release = { x: ball.x - Math.sin(rad) * 20, y: ball.y + Math.cos(rad) * 20 };
      const { angle } = dragToSwing(ball, release);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
      expect(angle).toBeCloseTo(a % 360, 4);
    }
  });
});
