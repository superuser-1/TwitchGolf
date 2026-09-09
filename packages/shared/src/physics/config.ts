import type { HolePhysics } from "../course/schema";

/**
 * Tunable constants for the deterministic sim. All distances are in logical
 * field units; all times in seconds. See `docs/DESIGN.md` §4.
 */
export interface PhysicsConstants {
  /** Fixed simulation timestep. */
  dt: number;
  /** Initial ball speed (units/s) at power = 100. */
  powerScale: number;
  /** Ball radius (edge-bounce and cup geometry). */
  ballRadius: number;
  /** Speed at or below which a ball is considered at rest. */
  restSpeed: number;
  /** Maximum speed at the cup for the ball to drop; above this it lips out. */
  captureSpeed: number;
  /** Fraction of velocity retained after bouncing off a wall / edge (0..1). */
  restitution: number;
  /** Speed multiplier applied when a ball lips out of the cup (1 = no effect). */
  lipOutDamping: number;
  /** Constant deceleration per surface (units/s^2). Phase 1 uses `fairway` only. */
  decel: { fairway: number; green: number; sand: number };
  /** Safety cap on simulation steps per shot. */
  maxSteps: number;
  /** Record a path sample every N steps (first, last and event points always kept). */
  pathSampleEvery: number;
}

export const DEFAULT_PHYSICS: PhysicsConstants = Object.freeze({
  dt: 1 / 60,
  powerScale: 72,
  ballRadius: 1,
  restSpeed: 0.6,
  captureSpeed: 20,
  restitution: 0.7,
  lipOutDamping: 1,
  decel: Object.freeze({ fairway: 22, green: 12, sand: 70 }),
  maxSteps: 60 * 30,
  pathSampleEvery: 2,
}) as PhysicsConstants;

/** Merge per-hole physics overrides from a course file onto the defaults. */
export function resolvePhysics(overrides?: HolePhysics): PhysicsConstants {
  if (!overrides) return DEFAULT_PHYSICS;
  return {
    ...DEFAULT_PHYSICS,
    restitution: overrides.restitution ?? DEFAULT_PHYSICS.restitution,
    decel: {
      fairway: overrides.decel?.fairway ?? DEFAULT_PHYSICS.decel.fairway,
      green: overrides.decel?.green ?? DEFAULT_PHYSICS.decel.green,
      sand: overrides.decel?.sand ?? DEFAULT_PHYSICS.decel.sand,
    },
  };
}
