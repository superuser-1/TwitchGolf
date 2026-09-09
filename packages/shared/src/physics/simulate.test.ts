import { describe, expect, it } from "vitest";

import { simulateRound } from "./simulate";
import type { RoundBallInput } from "./simulate";

const hole = {
  size: { w: 100, h: 150 },
  cup: { x: 50, y: 20, radius: 2.2 },
} as const;

describe("simulateRound", () => {
  it("echoes the round number", () => {
    expect(simulateRound(hole, [], 7).roundNumber).toBe(7);
  });

  it("a submitted swing adds one stroke and moves the ball", () => {
    const inputs: RoundBallInput[] = [
      { id: 1, position: { x: 50, y: 135 }, sunk: false, swing: { angle: 0, power: 40 } },
    ];
    const [ball] = simulateRound(hole, inputs, 1).balls;
    expect(ball?.strokesAdded).toBe(1);
    expect(ball?.from).toEqual({ x: 50, y: 135 });
    expect(ball?.final.y).toBeLessThan(135);
  });

  it("no swing means no stroke and no movement", () => {
    const inputs: RoundBallInput[] = [{ id: 2, position: { x: 10, y: 20 }, sunk: false }];
    const [ball] = simulateRound(hole, inputs, 1).balls;
    expect(ball?.strokesAdded).toBe(0);
    expect(ball?.final).toEqual({ x: 10, y: 20 });
    expect(ball?.path).toHaveLength(1);
  });

  it("an already-sunk ball is passed through untouched", () => {
    const inputs: RoundBallInput[] = [
      { id: 3, position: { x: 50, y: 20 }, sunk: true, swing: { angle: 90, power: 90 } },
    ];
    const [ball] = simulateRound(hole, inputs, 4).balls;
    expect(ball?.sunk).toBe(true);
    expect(ball?.strokesAdded).toBe(0);
    expect(ball?.final).toEqual({ x: 50, y: 20 });
  });

  it("balls are independent and preserve input order", () => {
    const inputs: RoundBallInput[] = [
      { id: 9, position: { x: 30, y: 120 }, sunk: false, swing: { angle: 10, power: 50 } },
      { id: 4, position: { x: 70, y: 120 }, sunk: false, swing: { angle: 350, power: 50 } },
    ];
    const { balls } = simulateRound(hole, inputs, 1);
    expect(balls.map((b) => b.id)).toEqual([9, 4]);
    expect(balls[0]?.final.x).not.toBe(balls[1]?.final.x);
  });

  it("is deterministic across repeated calls", () => {
    const inputs: RoundBallInput[] = [
      { id: 1, position: { x: 33, y: 118 }, sunk: false, swing: { angle: 71, power: 64 } },
      { id: 2, position: { x: 61, y: 90 }, sunk: false, swing: { angle: 200, power: 22 } },
    ];
    expect(simulateRound(hole, inputs, 2)).toEqual(simulateRound(hole, inputs, 2));
  });
});
