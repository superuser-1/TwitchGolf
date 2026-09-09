import { PROTOCOL_VERSION } from "@twitch-golf/shared";
import type { BroadcastMsg, StandingsRow } from "@twitch-golf/shared";

import type { Clock } from "../clock";
import type { GameTimingConfig } from "../config";
import type { Store } from "../store/types";
import type { ActiveCourse, GolfGame } from "./game";

export interface TournamentDef {
  id: string;
  name: string;
  courseIds: string[];
}

export interface TournamentDeps {
  channelId: string;
  def: TournamentDef;
  clock: Clock;
  timing: GameTimingConfig;
  broadcast: (msg: BroadcastMsg) => void;
  resolveCourse: (id: string) => ActiveCourse | null;
  makeGame: (course: ActiveCourse, onFinished: (game: GolfGame) => void) => GolfGame;
  store?: Store;
  onFinished?: () => void;
}

interface Cumulative {
  userId: string;
  login: string;
  name: string;
  strokes: number;
  holes: number;
  toPar: number;
  aces: number;
  waterHits: number;
}

/** Runs an ordered list of courses as one stroke-play tournament. */
export class TournamentRunner {
  private index = 0;
  private current: GolfGame | null = null;
  private startedAt = 0;
  private cancelGap: (() => void) | null = null;
  private readonly cumulative = new Map<string, Cumulative>();
  finished = false;

  constructor(private readonly deps: TournamentDeps) {}

  get activeGame(): GolfGame | null {
    return this.current;
  }

  start(): void {
    this.startedAt = this.deps.clock.now();
    this.emitState("hole-intro");
    this.next();
  }

  stop(): void {
    this.finished = true;
    this.cancelGap?.();
    this.cancelGap = null;
    this.current?.stop();
  }

  private next(): void {
    if (this.finished) return;
    if (this.index >= this.deps.def.courseIds.length) return this.finish();
    const courseId = this.deps.def.courseIds[this.index]!;
    const course = this.deps.resolveCourse(courseId);
    if (!course) return this.finish();
    this.current = this.deps.makeGame(course, (game) => this.onGameFinished(game));
    this.current.start();
  }

  private onGameFinished(game: GolfGame): void {
    if (this.finished) return;
    for (const r of game.finalResults()) {
      const acc = this.cumulative.get(r.userId) ?? {
        userId: r.userId,
        login: r.login,
        name: r.name,
        strokes: 0,
        holes: 0,
        toPar: 0,
        aces: 0,
        waterHits: 0,
      };
      acc.login = r.login;
      acc.name = r.name;
      acc.strokes += r.strokes;
      acc.holes += r.holes;
      acc.toPar += r.toPar;
      acc.aces += r.aces;
      acc.waterHits += r.waterHits;
      this.cumulative.set(r.userId, acc);
    }

    this.deps.broadcast({ t: "standings", v: PROTOCOL_VERSION, rows: this.standingsRows() });
    this.index += 1;
    if (this.index >= this.deps.def.courseIds.length) {
      this.cancelGap = this.deps.clock.after(this.deps.timing.holeCompleteSeconds * 1000, () =>
        this.finish(),
      );
    } else {
      this.cancelGap = this.deps.clock.after(this.deps.timing.holeCompleteSeconds * 1000, () =>
        this.next(),
      );
    }
  }

  private ordered(): Cumulative[] {
    return [...this.cumulative.values()].sort(
      (a, b) => a.strokes - b.strokes || b.holes - a.holes || a.name.localeCompare(b.name),
    );
  }

  private standingsRows(): StandingsRow[] {
    return this.ordered().map((c, i) => ({
      rank: i + 1,
      id: i + 1,
      name: c.name,
      thru: c.holes,
      toPar: c.toPar,
      total: c.strokes,
    }));
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const rows = this.standingsRows();
    this.deps.broadcast({ t: "standings", v: PROTOCOL_VERSION, rows });
    this.emitState("course-complete");

    this.deps.store?.recordTournamentResult(this.deps.channelId, {
      tournamentId: this.deps.def.id,
      name: this.deps.def.name,
      courseIds: this.deps.def.courseIds,
      startedAt: this.startedAt,
      finishedAt: this.deps.clock.now(),
      standings: this.ordered().map((c, i) => ({
        userId: c.userId,
        name: c.name,
        strokes: c.strokes,
        toPar: c.toPar,
        rank: i + 1,
      })),
    });
    this.deps.onFinished?.();
  }

  private emitState(phase: string): void {
    this.deps.broadcast({
      t: "game-state",
      v: PROTOCOL_VERSION,
      phase,
      courseId: `tournament:${this.deps.def.id}`,
      holeIndex: 0,
      roundNumber: 0,
    });
  }
}
