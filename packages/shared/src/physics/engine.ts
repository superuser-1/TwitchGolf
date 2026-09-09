import type { Obstacle, Surface, SurfaceType, Wall, Wind } from "../course/schema";
import { closestPointOnSegment, segmentIntersection, segmentNormal } from "../geom/segments";
import type { Segment } from "../geom/segments";
import type { Vec2 } from "../model/vec";
import type { PhysicsConstants } from "./config";
import { obstacleSegments } from "./obstacles";
import { slopeAccelAt, surfaceAt } from "./terrain";

export type SimEventType = "bounce" | "wall" | "obstacle" | "sink" | "lip-out" | "rest";

export interface SimEvent {
  type: SimEventType;
  at: Vec2;
  /** Simulation step index at which the event occurred. */
  step: number;
}

export interface SimField {
  w: number;
  h: number;
  cup: { x: number; y: number; radius: number };
  surfaces?: Surface[];
  walls?: Wall[];
  obstacles?: Obstacle[];
  wind?: Wind;
}

export interface ShotInput {
  from: Vec2;
  /** Degrees, clockwise from up (0 = up, 90 = right). Expected in [0, 360). */
  angle: number;
  /** (0, 100]. */
  power: number;
}

export interface ShotOptions {
  /** Extra phase (radians) added to every obstacle; usually round-number derived. */
  obstaclePhase?: number;
}

export interface ShotResult {
  from: Vec2;
  /** Sampled points for animation, including the start and the resting point. */
  path: Vec2[];
  /** Where the ball ends up for scoring — the drop point if it finished in water. */
  final: Vec2;
  sunk: boolean;
  /** True if the ball came to rest in a water hazard. */
  water: boolean;
  /** Penalty strokes incurred this shot (water = 1). */
  penalty: number;
  events: SimEvent[];
  /** Steps simulated. */
  steps: number;
}

const DEG2RAD = Math.PI / 180;
const SKIN = 0.01;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function decelFor(surface: SurfaceType, k: PhysicsConstants): number {
  switch (surface) {
    case "sand":
      return k.decel.sand;
    case "green":
      return k.decel.green;
    case "water":
      return k.decel.water;
    case "fairway":
    case "slope":
      return k.decel.fairway;
  }
}

/**
 * Initial velocity for a swing. This is the only place `Math.sin`/`Math.cos`
 * touch a ball's path (windmill blades aside); the rest of the sim is
 * +,-,*,/,sqrt, which is IEEE-754 identical across platforms.
 */
export function initialVelocity(angle: number, power: number, k: PhysicsConstants): Vec2 {
  const rad = angle * DEG2RAD;
  const v0 = (k.powerScale * power) / 100;
  return { x: Math.sin(rad) * v0, y: -Math.cos(rad) * v0 };
}

/** Shortest distance from point (px,py) to the segment (ax,ay)-(bx,by). */
export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return closestPointOnSegment(px, py, ax, ay, bx, by).dist;
}

interface BarrierContact {
  t: number;
  nx: number;
  ny: number;
  x: number;
  y: number;
  kind: "wall" | "obstacle";
}

/** Reflect a ball crossing / grazing one of `barriers`; nearest contact wins. */
function resolveBarriers(
  px: number,
  py: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  barriers: { seg: Segment; kind: "wall" | "obstacle" }[],
  r: number,
  restitution: number,
): { x: number; y: number; vx: number; vy: number; hit: BarrierContact | null } {
  let best: BarrierContact | null = null;

  for (const { seg, kind } of barriers) {
    const cross = segmentIntersection(px, py, x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (cross) {
      const n = segmentNormal(seg);
      if (!best || cross.t < best.t) {
        best = { t: cross.t, nx: n.nx, ny: n.ny, x: cross.x, y: cross.y, kind };
      }
      continue;
    }
    const cp = closestPointOnSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (cp.dist < r && (!best || best.t > 0)) {
      const len = cp.dist === 0 ? 1 : cp.dist;
      best = { t: 0, nx: (x - cp.x) / len, ny: (y - cp.y) / len, x: cp.x, y: cp.y, kind };
    }
  }

  if (!best) return { x, y, vx, vy, hit: null };

  let nx = best.nx;
  let ny = best.ny;
  if (vx * nx + vy * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const dot = vx * nx + vy * ny;
  return {
    x: best.x + nx * (r + SKIN),
    y: best.y + ny * (r + SKIN),
    vx: (vx - 2 * dot * nx) * restitution,
    vy: (vy - 2 * dot * ny) * restitution,
    hit: best,
  };
}

/** Simulate a single ball from `shot.from` until it rests or is sunk. Pure. */
export function simulateShot(
  field: SimField,
  shot: ShotInput,
  k: PhysicsConstants,
  opts: ShotOptions = {},
): ShotResult {
  const from: Vec2 = { x: shot.from.x, y: shot.from.y };
  let x = from.x;
  let y = from.y;
  const v = initialVelocity(shot.angle, shot.power, k);
  let vx = v.x;
  let vy = v.y;

  const r = k.ballRadius;
  const minX = r;
  const minY = r;
  const maxX = field.w - r;
  const maxY = field.h - r;

  const wallBarriers = (field.walls ?? []).map((seg) => ({ seg, kind: "wall" as const }));
  const hasObstacles = (field.obstacles?.length ?? 0) > 0;
  const obstaclePhase = opts.obstaclePhase ?? 0;

  // Wind acceleration vector — the only other place trig touches a ball's path;
  // computed once so the per-step loop stays IEEE-754 portable.
  let windAx = 0;
  let windAy = 0;
  if (field.wind && field.wind.power > 0) {
    const wRad = field.wind.angle * DEG2RAD;
    const wMag = (k.windScale * field.wind.power) / 100;
    windAx = Math.sin(wRad) * wMag;
    windAy = -Math.cos(wRad) * wMag;
  }
  const hasWind = windAx !== 0 || windAy !== 0;

  const path: Vec2[] = [{ x, y }];
  const events: SimEvent[] = [];
  let sunk = false;
  let step = 0;
  let stuckOnSlope = 0;

  for (; step < k.maxSteps; step++) {
    const slope = slopeAccelAt(field.surfaces, x, y);
    const onSlope = slope.x !== 0 || slope.y !== 0;
    if (onSlope) {
      vx += slope.x * k.dt;
      vy += slope.y * k.dt;
    }

    let speed = Math.hypot(vx, vy);
    if (speed <= k.restSpeed) {
      if (!onSlope) break;
      if (++stuckOnSlope > 12) break;
    } else {
      stuckOnSlope = 0;
    }

    // Wind pushes the ball while it is in motion (not a ball at rest); constant
    // per step, so total drift scales with how long the ball travels.
    if (hasWind) {
      vx += windAx * k.dt;
      vy += windAy * k.dt;
      speed = Math.hypot(vx, vy);
    }

    if (speed > 0) {
      const surface = surfaceAt(field.surfaces, x, y);
      const newSpeed = Math.max(0, speed - decelFor(surface, k) * k.dt);
      const fr = newSpeed / speed;
      vx *= fr;
      vy *= fr;
    }

    const px = x;
    const py = y;
    x += vx * k.dt;
    y += vy * k.dt;

    // Walls + moving obstacles.
    if (wallBarriers.length > 0 || hasObstacles) {
      const barriers = hasObstacles
        ? [
            ...wallBarriers,
            ...obstacleSegments(field.obstacles, step * k.dt, obstaclePhase).map((seg) => ({
              seg,
              kind: "obstacle" as const,
            })),
          ]
        : wallBarriers;
      const b = resolveBarriers(px, py, x, y, vx, vy, barriers, r, k.restitution);
      if (b.hit) {
        x = clamp(b.x, minX, maxX);
        y = clamp(b.y, minY, maxY);
        vx = b.vx;
        vy = b.vy;
        events.push({ type: b.hit.kind, at: { x, y }, step });
      }
    }

    // Field-edge bounce.
    let bounced = false;
    if (x < minX) {
      x = minX + (minX - x);
      vx = -vx * k.restitution;
      bounced = true;
    } else if (x > maxX) {
      x = maxX - (x - maxX);
      vx = -vx * k.restitution;
      bounced = true;
    }
    if (y < minY) {
      y = minY + (minY - y);
      vy = -vy * k.restitution;
      bounced = true;
    } else if (y > maxY) {
      y = maxY - (y - maxY);
      vy = -vy * k.restitution;
      bounced = true;
    }
    if (bounced) {
      x = clamp(x, minX, maxX);
      y = clamp(y, minY, maxY);
      events.push({ type: "bounce", at: { x, y }, step });
    }

    // Cup: check the travelled segment so a fast ball can't tunnel past it.
    if (pointSegmentDistance(field.cup.x, field.cup.y, px, py, x, y) <= field.cup.radius) {
      if (Math.hypot(vx, vy) <= k.captureSpeed) {
        x = field.cup.x;
        y = field.cup.y;
        vx = 0;
        vy = 0;
        sunk = true;
        events.push({ type: "sink", at: { x, y }, step });
        path.push({ x, y });
        step++;
        break;
      }
      vx *= k.lipOutDamping;
      vy *= k.lipOutDamping;
      events.push({ type: "lip-out", at: { x, y }, step });
    }

    if (step % k.pathSampleEvery === 0) path.push({ x, y });
  }

  const restPoint: Vec2 = { x, y };
  if (!sunk) events.push({ type: "rest", at: restPoint, step });

  const last = path[path.length - 1];
  if (!last || last.x !== restPoint.x || last.y !== restPoint.y) path.push({ ...restPoint });

  let water = false;
  let penalty = 0;
  let final: Vec2 = restPoint;
  if (!sunk && surfaceAt(field.surfaces, restPoint.x, restPoint.y) === "water") {
    water = true;
    penalty = 1;
    final = { x: from.x, y: from.y };
  }

  return { from, path, final, sunk, water, penalty, events, steps: step };
}
