import type { BroadcastMsg } from "@twitch-golf/shared";

import type { Clock } from "../clock";
import type { GameTimingConfig } from "../config";
import type { CourseRegistry } from "../courses";
import type { Store } from "../store/types";
import type { TournamentRegistry } from "../tournaments";
import type { Broadcaster } from "../twitch/pubsub";
import { GolfGame } from "./game";
import type { ActiveCourse } from "./game";
import { TournamentRunner } from "./tournament";

export interface ManagerDeps {
  clock: Clock;
  timing: GameTimingConfig;
  broadcaster: Broadcaster;
  courses: CourseRegistry;
  tournaments?: TournamentRegistry;
  store?: Store;
}

export interface StartResult {
  ok: boolean;
  reason?: "already-running" | "unknown-course" | "unknown-tournament";
}

/** Owns the active game (and any tournament) per channel. */
export class GameManager {
  private readonly games = new Map<string, GolfGame>();
  private readonly tournaments = new Map<string, TournamentRunner>();

  constructor(private readonly deps: ManagerDeps) {}

  get(channelId: string): GolfGame | undefined {
    return this.games.get(channelId);
  }

  private toActiveCourse(id: string): ActiveCourse | null {
    const c = this.deps.courses.get(id);
    return c ? { id: c.id, name: c.name, holes: c.resolvedHoles } : null;
  }

  private timingFor(channelId: string): GameTimingConfig {
    const cfg = this.deps.store?.getChannelConfig(channelId);
    if (!cfg) return this.deps.timing;
    return {
      ...this.deps.timing,
      roundSeconds: cfg.roundSeconds,
      maxRoundsPerHole: cfg.maxRoundsPerHole,
    };
  }

  private recordGame(
    channelId: string,
    courseId: string,
    tournamentId: string | undefined,
    startedAt: number,
    game: GolfGame,
  ): void {
    const store = this.deps.store;
    if (!store) return;
    const results = game.finalResults().filter((r) => r.holes > 0);
    if (results.length === 0) return;
    const best = Math.min(...results.map((r) => r.strokes));
    store.recordGameResult(channelId, {
      courseId,
      startedAt,
      finishedAt: this.deps.clock.now(),
      ...(tournamentId ? { tournamentId } : {}),
      players: results.map((r) => ({
        userId: r.userId,
        login: r.login,
        name: r.name,
        strokes: r.strokes,
        holes: r.holes,
        toPar: r.toPar,
        aces: r.aces,
        waterHits: r.waterHits,
        won: r.strokes === best,
      })),
    });
  }

  private buildGame(
    channelId: string,
    course: ActiveCourse,
    tournamentId: string | undefined,
    onFinished?: (game: GolfGame) => void,
  ): GolfGame {
    const startedAt = this.deps.clock.now();
    const game = new GolfGame({
      channelId,
      course,
      clock: this.deps.clock,
      timing: this.timingFor(channelId),
      broadcast: (msg: BroadcastMsg) => this.deps.broadcaster.broadcast(channelId, msg),
      onFinished: () => {
        this.recordGame(channelId, course.id, tournamentId, startedAt, game);
        onFinished?.(game);
        this.deps.clock.after(60_000, () => {
          if (this.games.get(channelId) === game) this.games.delete(channelId);
        });
      },
    });
    return game;
  }

  start(channelId: string, courseId: string): StartResult {
    if (this.isBusy(channelId)) return { ok: false, reason: "already-running" };
    const course = this.toActiveCourse(courseId);
    if (!course) return { ok: false, reason: "unknown-course" };

    const game = this.buildGame(channelId, course, undefined);
    this.games.set(channelId, game);
    game.start();
    return { ok: true };
  }

  startTournament(channelId: string, tournamentId: string): StartResult {
    if (this.isBusy(channelId)) return { ok: false, reason: "already-running" };
    const def = this.deps.tournaments?.get(tournamentId);
    if (!def) return { ok: false, reason: "unknown-tournament" };

    const runner = new TournamentRunner({
      channelId,
      def,
      clock: this.deps.clock,
      timing: this.timingFor(channelId),
      broadcast: (msg: BroadcastMsg) => this.deps.broadcaster.broadcast(channelId, msg),
      resolveCourse: (id) => this.toActiveCourse(id),
      makeGame: (course, onGameFinished) => {
        const game = this.buildGame(channelId, course, def.id, onGameFinished);
        this.games.set(channelId, game);
        return game;
      },
      ...(this.deps.store ? { store: this.deps.store } : {}),
      onFinished: () => this.tournaments.delete(channelId),
    });
    this.tournaments.set(channelId, runner);
    runner.start();
    return { ok: true };
  }

  stop(channelId: string): boolean {
    const runner = this.tournaments.get(channelId);
    if (runner) {
      runner.stop();
      this.tournaments.delete(channelId);
    }
    const game = this.games.get(channelId);
    if (game) {
      game.stop();
      this.games.delete(channelId);
    }
    return Boolean(runner || game);
  }

  stopAll(): void {
    for (const runner of this.tournaments.values()) runner.stop();
    for (const game of this.games.values()) game.stop();
    this.tournaments.clear();
    this.games.clear();
  }

  private isBusy(channelId: string): boolean {
    const game = this.games.get(channelId);
    return Boolean(this.tournaments.get(channelId) || (game && !game.isFinished));
  }
}
