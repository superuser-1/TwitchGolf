import type { Surface, SurfaceType } from "../course/schema";
import { shapeContains } from "../geom/shapes";
import type { Vec2 } from "../model/vec";

/**
 * Surface under a point. Everywhere is `fairway` unless a region overrides it;
 * when regions overlap, the one listed later in the array wins (author paints
 * top to bottom).
 */
export function surfaceAt(surfaces: Surface[] | undefined, x: number, y: number): SurfaceType {
  let result: SurfaceType = "fairway";
  if (!surfaces) return result;
  for (const s of surfaces) {
    if (shapeContains(s.shape, x, y)) result = s.type;
  }
  return result;
}

/** Summed acceleration vector from every slope region containing the point. */
export function slopeAccelAt(surfaces: Surface[] | undefined, x: number, y: number): Vec2 {
  const acc: Vec2 = { x: 0, y: 0 };
  if (!surfaces) return acc;
  for (const s of surfaces) {
    if (s.type === "slope" && s.accel && shapeContains(s.shape, x, y)) {
      acc.x += s.accel.x;
      acc.y += s.accel.y;
    }
  }
  return acc;
}
