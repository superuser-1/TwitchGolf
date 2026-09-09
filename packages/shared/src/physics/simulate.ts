import type { HolePhysics, Obstacle, Surface, Wall, Wind } from "../course/schema";
import type { BallId } from "../model/ids";
import type { Vec2 } from "../model/vec";
import type { PhysicsConstants } from "./config";
import { resolvePhysics } from "./config";
import { simulateShot } from "./engine";
import type { SimEvent, SimField } from "./engine";

/** Windmill phase (radians) added per round so hazards aren't identical every round. */
export const ROUND_PHASE_OFFSET = 0.7;

/** The subset of a hole the sim needs. A full `Hole` satisfies this. */
export interface SimHoleInput {
  size: { w: number; h: number };
  cup: { x: number; y: number; radius: number };
  physics?: HolePhysics;
  surfaces?: Surface[];
  walls?: Wall[];
  obstacles?: Obstacle[];
  wind?: Wind;
}

/** One ball's state entering a round. */
export interface RoundBallInput {
  id: BallId;
  /** Current resting position (tee for a new ball, else the previous final). */
  position: Vec2;
  /** True if the ball was already sunk on an earlier round of this hole. */
  sunk: boolean;
  /** The swing this player submitted, or omitted if they didn't submit one. */
  swing?: { angle: number; power: number };
}

export interface BallTrajectory {
  id: BallId;
  from: Vec2;
  /** Animation samples; not sent over the wire (the client re-sims from `from`). */
  path: Vec2[];
  final: Vec2;
  sunk: boolean;
  water: boolean;
  /** Strokes added this round (swing + any penalties). */
  strokesAdded: number;
  /** Penalty strokes included in `strokesAdded`. */
  penalty: number;
  events: SimEvent[];
}

export interface RoundSimResult {
  roundNumber: number;
  balls: BallTrajectory[];
}

export function fieldFromHole(hole: SimHoleInput): SimField {
  return {
    w: hole.size.w,
    h: hole.size.h,
    cup: { ...hole.cup },
    surfaces: hole.surfaces,
    walls: hole.walls,
    obstacles: hole.obstacles,
    wind: hole.wind,
  };
}

function passthrough(id: BallId, position: Vec2, sunk: boolean): BallTrajectory {
  const p: Vec2 = { x: position.x, y: position.y };
  return {
    id,
    from: p,
    path: [p],
    final: p,
    sunk,
    water: false,
    strokesAdded: 0,
    penalty: 0,
    events: [],
  };
}

/**
 * Resolve one simultaneous round: simulate every submitted swing independently
 * (balls do not collide) and return each ball's trajectory + final state.
 *
 * `inputs` order is preserved in the result; callers that need determinism
 * across processes should pass a stable order (e.g. sorted by ball id).
 */
export function simulateRound(
  hole: SimHoleInput,
  inputs: RoundBallInput[],
  roundNumber: number,
  physics?: PhysicsConstants,
): RoundSimResult {
  const k = physics ?? resolvePhysics(hole.physics);
  const field = fieldFromHole(hole);
  const obstaclePhase = roundNumber * ROUND_PHASE_OFFSET;

  const balls = inputs.map((input): BallTrajectory => {
    if (input.sunk) return passthrough(input.id, input.position, true);
    if (!input.swing) return passthrough(input.id, input.position, false);

    const shot = simulateShot(
      field,
      { from: input.position, angle: input.swing.angle, power: input.swing.power },
      k,
      { obstaclePhase },
    );
    return {
      id: input.id,
      from: shot.from,
      path: shot.path,
      final: shot.final,
      sunk: shot.sunk,
      water: shot.water,
      strokesAdded: 1 + shot.penalty,
      penalty: shot.penalty,
      events: shot.events,
    };
  });

  return { roundNumber, balls };
}
