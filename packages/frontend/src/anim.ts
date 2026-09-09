import {
  ROUND_PHASE_OFFSET,
  fieldFromHole,
  resolvePhysics,
  simulateShot,
} from "@twitch-golf/shared/physics";
import type { Hole, RoundResultMsg, Vec2 } from "@twitch-golf/shared";

interface Track {
  id: number;
  path: Vec2[];
  final: Vec2;
}

const MAX_MS = 2600;
const MIN_MS = 700;

/** Replays a round's shots by re-running the deterministic sim, then snaps to finals. */
export class Animator {
  private raf = 0;
  private running = false;

  constructor(
    private readonly onFrame: (positions: Map<number, Vec2>) => void,
    private readonly onDone: () => void,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
  }

  play(result: RoundResultMsg, hole: Hole): void {
    this.cancel();
    const field = fieldFromHole(hole);
    const k = resolvePhysics(hole.physics);
    const obstaclePhase = result.roundNumber * ROUND_PHASE_OFFSET;

    const tracks: Track[] = result.balls
      .filter((b) => b.power > 0)
      .map((b) => {
        const shot = simulateShot(field, { from: b.from, angle: b.angle, power: b.power }, k, {
          obstaclePhase,
        });
        return { id: b.id, path: shot.path.length ? shot.path : [b.from, b.final], final: b.final };
      });

    if (tracks.length === 0) {
      this.onDone();
      return;
    }

    const longest = Math.max(...tracks.map((t) => t.path.length));
    const durMs = Math.max(MIN_MS, Math.min(MAX_MS, longest * 16));
    const start = now();
    this.running = true;

    const step = () => {
      const t = Math.min(1, (now() - start) / durMs);
      const positions = new Map<number, Vec2>();
      for (const track of tracks) {
        positions.set(track.id, t >= 1 ? track.final : sampleAt(track.path, t));
      }
      this.onFrame(positions);
      if (t >= 1) {
        this.running = false;
        this.raf = 0;
        this.onDone();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

function sampleAt(path: Vec2[], t: number): Vec2 {
  const f = t * (path.length - 1);
  const i = Math.floor(f);
  const a = path[Math.max(0, Math.min(path.length - 1, i))]!;
  const b = path[Math.max(0, Math.min(path.length - 1, i + 1))]!;
  const frac = f - i;
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
