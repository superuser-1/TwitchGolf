import type { Obstacle } from "../course/schema";
import type { Segment } from "../geom/segments";

/**
 * The blade of a windmill is a diameter segment that rotates at a constant
 * rate. Its orientation is a pure function of simulation time and the per-round
 * phase offset, so the client re-sim matches the server exactly.
 */
export function windmillBlade(obstacle: Obstacle, t: number, phaseOffset: number): Segment {
  const angle = obstacle.phase + phaseOffset + (2 * Math.PI * t) / obstacle.period;
  const dx = Math.cos(angle) * obstacle.radius;
  const dy = Math.sin(angle) * obstacle.radius;
  return { x1: obstacle.x - dx, y1: obstacle.y - dy, x2: obstacle.x + dx, y2: obstacle.y + dy };
}

/** Barrier segments contributed by every obstacle at simulation time `t`. */
export function obstacleSegments(
  obstacles: Obstacle[] | undefined,
  t: number,
  phaseOffset: number,
): Segment[] {
  if (!obstacles) return [];
  return obstacles.map((o) => windmillBlade(o, t, phaseOffset));
}
