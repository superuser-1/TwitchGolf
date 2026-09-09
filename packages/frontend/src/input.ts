import {
  ROUND_PHASE_OFFSET,
  fieldFromHole,
  resolvePhysics,
  simulateShot,
} from "@twitch-golf/shared/physics";
import { normaliseAngle } from "@twitch-golf/shared/protocol";
import type { Hole, Vec2 } from "@twitch-golf/shared";

/** Field units of pull-back that map to power 100. */
export const MAX_PULL = 60;
/** Drags shorter than this (field units) are treated as a tap / cancel. */
const MIN_PULL = 1.8;

export interface DragSwing {
  angle: number;
  power: number;
}

/**
 * Slingshot mapping: pull away from the ball, release. The ball flies the
 * *opposite* way you pulled; how far you pulled is the power.
 */
export function dragToSwing(ball: Vec2, release: Vec2, maxPull = MAX_PULL): DragSwing {
  const dx = ball.x - release.x; // launch direction = opposite the pull
  const dy = ball.y - release.y;
  const dist = Math.hypot(dx, dy);
  const angle = normaliseAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
  const power = Math.max(1, Math.min(100, Math.round((dist / maxPull) * 100)));
  return { angle, power };
}

export interface DragContext {
  phase: string;
  hasIdentity: boolean;
  allowDrag: boolean;
  hole: Hole | null;
  /** The player's ball's current resting spot, or the tee if they haven't swung. */
  myBall: Vec2 | null;
  roundNumber: number;
}

export interface DragAim {
  from: Vec2;
  to: Vec2;
  path: Vec2[];
  angle: number;
  power: number;
}

export interface DragInputDeps {
  getContext(): DragContext;
  toField(cssX: number, cssY: number): Vec2 | null;
  onAim(aim: DragAim | null): void;
  onSubmit(swing: DragSwing): void;
}

/** Wire slingshot drag input to a canvas. Returns a detach function. */
export function attachDragInput(canvas: HTMLCanvasElement, deps: DragInputDeps): () => void {
  let dragging = false;

  const pointToField = (e: PointerEvent): Vec2 | null => {
    const rect = canvas.getBoundingClientRect();
    return deps.toField(e.clientX - rect.left, e.clientY - rect.top);
  };

  // An identified viewer can drag even before they have a ball (aim from tee);
  // `isPlayer` is not required.
  const canDrag = (c: DragContext): c is DragContext & { hole: Hole; myBall: Vec2 } =>
    c.phase === "round-open" &&
    c.hasIdentity &&
    c.allowDrag &&
    c.hole !== null &&
    c.myBall !== null;

  const predict = (c: DragContext & { hole: Hole; myBall: Vec2 }, release: Vec2): DragAim => {
    const { angle, power } = dragToSwing(c.myBall, release);
    const shot = simulateShot(
      fieldFromHole(c.hole),
      { from: c.myBall, angle, power },
      resolvePhysics(c.hole.physics),
      { obstaclePhase: c.roundNumber * ROUND_PHASE_OFFSET },
    );
    return { from: c.myBall, to: release, path: shot.path, angle, power };
  };

  const onDown = (e: PointerEvent) => {
    const c = deps.getContext();
    if (!canDrag(c)) return;
    // During your turn, a press anywhere on the field starts an aim, always
    // anchored to your ball's current position.
    if (!pointToField(e)) return;
    dragging = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
    e.preventDefault();
    deps.onAim(predict(c, c.myBall));
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const c = deps.getContext();
    if (!canDrag(c)) {
      dragging = false;
      deps.onAim(null);
      return;
    }
    const release = pointToField(e);
    if (release) deps.onAim(predict(c, release));
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    deps.onAim(null);
    const c = deps.getContext();
    const release = pointToField(e);
    if (!canDrag(c) || !release) return;
    if (Math.hypot(c.myBall.x - release.x, c.myBall.y - release.y) < MIN_PULL) return;
    deps.onSubmit(dragToSwing(c.myBall, release));
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}
