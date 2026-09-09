import type { Vec2 } from "../model/vec";
import type { PhysicsConstants } from "./config";

export type SimEventType = "bounce" | "sink" | "lip-out" | "rest";

export interface SimEvent {
  type: SimEventType;
  at: Vec2;
  /** Simulation step index at which the event occurred. */
  step: number;
}

/** Flat rectangular field with a cup. Phase 1: no interior walls / terrain. */
export interface SimField {
  w: number;
  h: number;
  cup: { x: number; y: number; radius: number };
}

export interface ShotInput {
  from: Vec2;
  /** Degrees, clockwise from up (0 = up, 90 = right). Expected in [0, 360). */
  angle: number;
  /** (0, 100]. */
  power: number;
}

export interface ShotResult {
  from: Vec2;
  /** Sampled points for animation, including the start and the resting point. */
  path: Vec2[];
  final: Vec2;
  sunk: boolean;
  events: SimEvent[];
  /** Steps simulated. */
  steps: number;
}

const DEG2RAD = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Initial velocity for a swing. This is the only place `Math.sin`/`Math.cos`
 * are used; the rest of the sim is +,-,*,/,sqrt, which is IEEE-754 identical
 * across platforms. See the determinism note in `docs/DESIGN.md` §3.1.
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
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Simulate a single ball from `shot.from` until it rests or is sunk. Pure. */
export function simulateShot(field: SimField, shot: ShotInput, k: PhysicsConstants): ShotResult {
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

  const path: Vec2[] = [{ x, y }];
  const events: SimEvent[] = [];
  let sunk = false;
  let step = 0;

  for (; step < k.maxSteps; step++) {
    const speed = Math.hypot(vx, vy);
    if (speed <= k.restSpeed) break;

    // Constant deceleration (fairway everywhere in phase 1).
    const newSpeed = Math.max(0, speed - k.decel.fairway * k.dt);
    const fr = newSpeed / speed;
    vx *= fr;
    vy *= fr;

    const px = x;
    const py = y;
    x += vx * k.dt;
    y += vy * k.dt;

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

  if (!sunk) events.push({ type: "rest", at: { x, y }, step });

  const final: Vec2 = { x, y };
  const last = path[path.length - 1];
  if (!last || last.x !== final.x || last.y !== final.y) path.push({ x, y });

  return { from, path, final, sunk, events, steps: step };
}
