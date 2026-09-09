import type { Shape } from "../course/schema";

/** True if point (x, y) lies inside (or on the boundary of) `shape`. */
export function shapeContains(shape: Shape, x: number, y: number): boolean {
  switch (shape.kind) {
    case "circle": {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= shape.r * shape.r;
    }
    case "rect":
      return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
    case "polygon":
      return pointInPolygon(shape.points, x, y);
  }
}

/** Even-odd ray-cast point-in-polygon test. */
export function pointInPolygon(
  points: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const xi = pi[0];
    const yi = pi[1];
    const xj = pj[0];
    const yj = pj[1];
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
