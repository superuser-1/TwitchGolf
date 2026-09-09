export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SegmentHit {
  /** Parameter along the first segment (0..1) where the intersection occurs. */
  t: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Intersection of segment A (a1->a2) with segment B (b1->b2), or null if they
 * don't cross (parallel/collinear included). Endpoints count as touching.
 */
export function segmentIntersection(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): SegmentHit | null {
  const rx = ax2 - ax1;
  const ry = ay2 - ay1;
  const sx = bx2 - bx1;
  const sy = by2 - by1;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const qpx = bx1 - ax1;
  const qpy = by1 - ay1;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, x: ax1 + t * rx, y: ay1 + t * ry };
}

export interface ClosestPoint {
  x: number;
  y: number;
  dist: number;
  /** Parameter along the segment (0..1). */
  t: number;
}

/** Closest point on segment (x1,y1)-(x2,y2) to the point (px,py). */
export function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ClosestPoint {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { x, y, dist: Math.hypot(px - x, py - y), t };
}

/** Unit normal of a segment (points to the segment's left in screen space). */
export function segmentNormal(seg: Segment): { nx: number; ny: number } {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}
