/** 2D vector in logical field units (never pixels). */
export interface Vec2 {
  x: number;
  y: number;
}

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function cloneVec(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}
