import {
  PROTOCOL_VERSION,
  normaliseAngle,
  simulateRound,
  type BallResult,
  type BroadcastMsg,
  type Hole,
  type RoundBallInput,
  type StandingsRow,
  type Vec2,
} from "@twitch-golf/shared";

import type { Clock } from "../clock";
import type { GameTimingConfig } from "../config";

export type GamePhase =
  "idle" | "hole-intro" | "round-open" | "round-resolving" | "hole-complete" | "course-complete";

export interface ActiveCourse {
  id: string;
  name: string;
  holes: Hole[];
}

export interface GameDeps {
  channelId: string;
  course: ActiveCourse;
  clock: Clock;
  timing: GameTimingConfig;
  broadcast: (msg: BroadcastMsg) => void;
  onFinished?: () => void;
}

interface BallState {
  id: number;
  userId: string;
  login: string;
  name: string;
  pos: Vec2;
  /** Strokes on the current hole (including penalties). */
  strokes: number;
  sunk: boolean;
  /** Finalised strokes per completed hole; index === hole index. */
  holeScores: number[];
  aces: number;
  waterHits: number;
}

export interface PlayerFinalResult {
  userId: string;
  login: string;
  name: string;
  strokes: number;
  holes: number;
  toPar: number;
  aces: number;
  waterHits: number;
}

export interface SubmitResult {
  ok: boolean;
  reason?: "round-not-open" | "already-sunk";
}

export interface SessionSnapshot {
  courseId: string;
  courseName: string;
  holeIndex: number;
  holeCount: number;
  par: number;
  roundNumber: number;
  phase: GamePhase;
  roundClosesAt: number | null;
  /** Full geometry of the current hole so the client can render + re-sim. */
  hole: Hole;
  balls: { id: number; name: string; x: number; y: number; strokes: number; sunk: boolean }[];
  standings: StandingsRow[];
}

const EMPTY_ROUND_LIMIT = 20;

/** One channel's authoritative game: state machine + simultaneous-round scheduler. */
export class GolfGame {
  private phase: GamePhase = "idle";
  private holeIndex = 0;
  private roundNumber = 0;
  private roundClosesAt: number | null = null;
  private emptyRounds = 0;
  private nextBallId = 1;
  private finished = false;

  private readonly balls = new Map<string, BallState>();
  private readonly pending = new Map<string, { angle: number; power: number; at: number }>();
  private cancel: (() => void) | null = null;

  constructor(private readonly deps: GameDeps) {}

  get channelId(): string {
    return this.deps.channelId;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  isPlayer(userId: string): boolean {
    return this.balls.has(userId);
  }

  ballIdFor(userId: string): number | null {
    return this.balls.get(userId)?.id ?? null;
  }

  start(): void {
    if (this.phase !== "idle") return;
    this.beginHole(0);
  }

  stop(): void {
    this.clearTimer();
    this.finished = true;
    this.phase = "idle";
    this.deps.onFinished?.();
  }

  skipRound(): { ok: boolean; reason?: string } {
    if (this.phase !== "round-open") return { ok: false, reason: "no-open-round" };
    this.closeRound();
    return { ok: true };
  }

  submit(userId: string, login: string, name: string, angle: number, power: number): SubmitResult {
    if (this.phase !== "round-open") return { ok: false, reason: "round-not-open" };

    let ball = this.balls.get(userId);
    if (!ball) {
      ball = {
        id: this.nextBallId++,
        userId,
        login,
        name,
        pos: { ...this.teePos() },
        strokes: 0,
        sunk: false,
        holeScores: [],
        aces: 0,
        waterHits: 0,
      };
      this.balls.set(userId, ball);
    } else {
      if (login && login !== userId) ball.login = login;
      // Don't clobber a real display name with a userId placeholder (drag swings).
      if (name && name !== userId) ball.name = name;
    }
    if (ball.sunk) return { ok: false, reason: "already-sunk" };

    this.pending.set(userId, {
      angle: normaliseAngle(angle),
      power: Math.max(1, Math.min(100, Math.round(power))),
      at: this.deps.clock.now(),
    });
    return { ok: true };
  }

  snapshot(): SessionSnapshot {
    return {
      courseId: this.deps.course.id,
      courseName: this.deps.course.name,
      holeIndex: this.holeIndex,
      holeCount: this.deps.course.holes.length,
      par: this.hole().par,
      roundNumber: this.roundNumber,
      phase: this.phase,
      roundClosesAt: this.roundClosesAt,
      hole: this.hole(),
      balls: [...this.balls.values()].map((b) => ({
        id: b.id,
        name: b.name,
        x: b.pos.x,
        y: b.pos.y,
        strokes: b.strokes,
        sunk: b.sunk,
      })),
      standings: this.standings(),
    };
  }

  // ----- internals -------------------------------------------------------------

  private hole(): Hole {
    const h = this.deps.course.holes[this.holeIndex];
    if (!h) throw new Error(`no hole at index ${this.holeIndex}`);
    return h;
  }

  private teePos(): Vec2 {
    return this.hole().tee;
  }

  private clearTimer(): void {
    this.cancel?.();
    this.cancel = null;
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.cancel = this.deps.clock.after(ms, () => {
      this.cancel = null;
      fn();
    });
  }

  private emitGameState(): void {
    this.deps.broadcast({
      t: "game-state",
      v: PROTOCOL_VERSION,
      phase: this.phase,
      courseId: this.deps.course.id,
      holeIndex: this.holeIndex,
      roundNumber: this.roundNumber,
    });
  }

  private beginHole(index: number): void {
    this.holeIndex = index;
    this.roundNumber = 0;
    this.emptyRounds = 0;
    const tee = this.teePos();
    for (const ball of this.balls.values()) {
      ball.pos = { ...tee };
      ball.strokes = 0;
      ball.sunk = false;
    }
    this.phase = "hole-intro";
    this.emitGameState();
    this.schedule(this.deps.timing.holeIntroSeconds * 1000, () => this.openRound());
  }

  private openRound(): void {
    this.roundNumber += 1;
    this.pending.clear();
    this.phase = "round-open";
    const durationMs = this.deps.timing.roundSeconds * 1000;
    this.roundClosesAt = this.deps.clock.now() + durationMs;
    this.deps.broadcast({
      t: "round-open",
      v: PROTOCOL_VERSION,
      holeIndex: this.holeIndex,
      roundNumber: this.roundNumber,
      durationSec: this.deps.timing.roundSeconds,
      serverTime: this.deps.clock.now(),
    });
    this.schedule(durationMs, () => this.closeRound());
  }

  private closeRound(): void {
    if (this.phase !== "round-open") return;
    this.clearTimer();
    this.phase = "round-resolving";
    this.roundClosesAt = null;

    if (this.balls.size === 0) {
      this.emptyRounds += 1;
      if (this.emptyRounds >= EMPTY_ROUND_LIMIT) return this.completeCourse();
      return this.openRound();
    }

    const active = [...this.balls.values()].filter((b) => !b.sunk).sort((a, b) => a.id - b.id);
    const inputs: RoundBallInput[] = active.map((b) => {
      const swing = this.pending.get(b.userId);
      return {
        id: b.id,
        position: b.pos,
        sunk: false,
        ...(swing ? { swing: { angle: swing.angle, power: swing.power } } : {}),
      };
    });

    const result = simulateRound(this.hole(), inputs, this.roundNumber);
    const byId = new Map(active.map((b) => [b.id, b]));
    const par = this.hole().par;
    const resultBalls: BallResult[] = [];

    for (const traj of result.balls) {
      const ball = byId.get(traj.id);
      if (!ball) continue;
      ball.pos = { ...traj.final };
      if (traj.strokesAdded > 0) {
        ball.strokes += traj.strokesAdded;
        ball.waterHits += traj.penalty;
        if (traj.sunk) {
          ball.sunk = true;
          ball.holeScores[this.holeIndex] = ball.strokes;
          if (ball.strokes === 1) ball.aces += 1;
        }
        const swing = this.pending.get(ball.userId);
        resultBalls.push({
          id: ball.id,
          name: ball.name,
          angle: swing?.angle ?? 0,
          power: swing?.power ?? 0,
          from: traj.from,
          final: traj.final,
          sunk: traj.sunk,
          strokes: ball.strokes,
          penalty: traj.penalty,
        });
      }
    }

    this.deps.broadcast({
      t: "round-result",
      v: PROTOCOL_VERSION,
      roundNumber: this.roundNumber,
      balls: resultBalls,
    });

    const stillOut = [...this.balls.values()].some((b) => !b.sunk);
    if (!stillOut || this.roundNumber >= this.deps.timing.maxRoundsPerHole) {
      this.schedule(this.deps.timing.resultSeconds * 1000, () => this.completeHole(par));
    } else {
      this.schedule(this.deps.timing.resultSeconds * 1000, () => this.openRound());
    }
  }

  private completeHole(par: number): void {
    this.phase = "hole-complete";
    const capScore = this.deps.timing.maxRoundsPerHole + 1;
    for (const ball of this.balls.values()) {
      if (ball.holeScores[this.holeIndex] === undefined) {
        ball.holeScores[this.holeIndex] =
          Math.max(ball.strokes, this.deps.timing.maxRoundsPerHole) + 1;
      }
    }

    const results = [...this.balls.values()]
      .map((b) => ({
        id: b.id,
        name: b.name,
        strokes: b.holeScores[this.holeIndex] ?? capScore,
        toPar: (b.holeScores[this.holeIndex] ?? capScore) - par,
      }))
      .sort((a, b) => a.strokes - b.strokes);

    this.deps.broadcast({
      t: "hole-complete",
      v: PROTOCOL_VERSION,
      holeIndex: this.holeIndex,
      results,
    });
    this.deps.broadcast({
      t: "standings",
      v: PROTOCOL_VERSION,
      rows: this.standings(),
    });

    if (this.holeIndex + 1 < this.deps.course.holes.length) {
      this.schedule(this.deps.timing.holeCompleteSeconds * 1000, () =>
        this.beginHole(this.holeIndex + 1),
      );
    } else {
      this.schedule(this.deps.timing.holeCompleteSeconds * 1000, () => this.completeCourse());
    }
  }

  private completeCourse(): void {
    this.clearTimer();
    this.phase = "course-complete";
    this.finished = true;
    this.deps.broadcast({ t: "standings", v: PROTOCOL_VERSION, rows: this.standings() });
    this.emitGameState();
    this.deps.onFinished?.();
  }

  /** Per-player totals for the whole course; call once the game has finished. */
  finalResults(): PlayerFinalResult[] {
    const pars = this.deps.course.holes.map((h) => h.par);
    return [...this.balls.values()].map((b) => {
      let strokes = 0;
      let holes = 0;
      let parPlayed = 0;
      b.holeScores.forEach((s, i) => {
        if (s === undefined) return;
        strokes += s;
        holes += 1;
        parPlayed += pars[i] ?? 0;
      });
      return {
        userId: b.userId,
        login: b.login,
        name: b.name,
        strokes,
        holes,
        toPar: strokes - parPlayed,
        aces: b.aces,
        waterHits: b.waterHits,
      };
    });
  }

  private standings(): StandingsRow[] {
    const pars = this.deps.course.holes.map((h) => h.par);
    const rows = [...this.balls.values()].map((b) => {
      let total = 0;
      let thru = 0;
      let parThrough = 0;
      for (let i = 0; i < pars.length; i++) {
        const score = b.holeScores[i];
        if (score === undefined) continue;
        total += score;
        parThrough += pars[i] ?? 0;
        thru += 1;
      }
      // Include the in-progress hole so the board moves during play.
      if (!b.sunk && b.strokes > 0 && b.holeScores[this.holeIndex] === undefined) {
        total += b.strokes;
        parThrough += pars[this.holeIndex] ?? 0;
      }
      return { id: b.id, name: b.name, thru, toPar: total - parThrough, total };
    });

    rows.sort((a, b) => a.total - b.total || a.thru - b.thru);
    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }
}
