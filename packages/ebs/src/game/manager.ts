import type { BroadcastMsg } from "@twitch-golf/shared";

import type { Clock } from "../clock";
import type { GameTimingConfig } from "../config";
import type { CourseRegistry } from "../courses";
import type { Broadcaster } from "../twitch/pubsub";
import { GolfGame } from "./game";
import type { ActiveCourse } from "./game";

export interface ManagerDeps {
  clock: Clock;
  timing: GameTimingConfig;
  broadcaster: Broadcaster;
  courses: CourseRegistry;
}

export interface StartResult {
  ok: boolean;
  reason?: "already-running" | "unknown-course";
}

/** Owns one GolfGame per channel. */
export class GameManager {
  private readonly games = new Map<string, GolfGame>();

  constructor(private readonly deps: ManagerDeps) {}

  get(channelId: string): GolfGame | undefined {
    return this.games.get(channelId);
  }

  start(channelId: string, courseId: string): StartResult {
    const existing = this.games.get(channelId);
    if (existing && !existing.isFinished) return { ok: false, reason: "already-running" };

    const resolved = this.deps.courses.get(courseId);
    if (!resolved) return { ok: false, reason: "unknown-course" };

    const course: ActiveCourse = {
      id: resolved.id,
      name: resolved.name,
      holes: resolved.resolvedHoles,
    };
    const game = new GolfGame({
      channelId,
      course,
      clock: this.deps.clock,
      timing: this.deps.timing,
      broadcast: (msg: BroadcastMsg) => this.deps.broadcaster.broadcast(channelId, msg),
      onFinished: () => {
        // keep the finished game around briefly so late /session reads still work
        this.deps.clock.after(60_000, () => {
          if (this.games.get(channelId)?.isFinished) this.games.delete(channelId);
        });
      },
    });
    this.games.set(channelId, game);
    game.start();
    return { ok: true };
  }

  stop(channelId: string): boolean {
    const game = this.games.get(channelId);
    if (!game) return false;
    game.stop();
    this.games.delete(channelId);
    return true;
  }

  stopAll(): void {
    for (const game of this.games.values()) game.stop();
    this.games.clear();
  }
}
