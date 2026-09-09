import type { BroadcastMsg } from "@twitch-golf/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { ManualClock } from "../src/clock";
import type { GameTimingConfig } from "../src/config";
import { loadCourseRegistry } from "../src/courses";
import { GameManager } from "../src/game/manager";
import { FileStore } from "../src/store/file-store";
import { loadTournamentRegistry } from "../src/tournaments";

const timing: GameTimingConfig = {
  roundSeconds: 4,
  maxRoundsPerHole: 2,
  holeIntroSeconds: 1,
  resultSeconds: 1,
  holeCompleteSeconds: 1,
};

let clock: ManualClock;
let events: BroadcastMsg[];
let store: FileStore;
let manager: GameManager;

beforeEach(async () => {
  clock = new ManualClock();
  events = [];
  store = new FileStore();
  manager = new GameManager({
    clock,
    timing,
    broadcaster: { broadcast: (_c, m) => void events.push(m), close: async () => {} },
    courses: await loadCourseRegistry(),
    tournaments: await loadTournamentRegistry(),
    store,
  });
});

/** Advance far enough to play out one 2-hole practice course to completion. */
function playOneCourse(submit: () => void): void {
  for (let hole = 0; hole < 2; hole++) {
    for (let round = 0; round < timing.maxRoundsPerHole; round++) {
      submit();
      clock.advance(timing.roundSeconds * 1000);
      clock.advance(timing.resultSeconds * 1000);
    }
    clock.advance(timing.holeCompleteSeconds * 1000);
    clock.advance(timing.holeIntroSeconds * 1000);
  }
}

describe("tournament", () => {
  it("runs both courses of the Practice Cup and aggregates standings + stats", () => {
    expect(manager.startTournament("c1", "practice-cup")).toEqual({ ok: true });
    clock.advance(timing.holeIntroSeconds * 1000); // first course, hole 1 opens

    const submit = () => {
      manager.get("c1")?.submit("u1", "u1", "Amy", 3, 18);
      manager.get("c1")?.submit("u2", "u2", "Ben", 357, 22);
    };

    playOneCourse(submit); // course 1
    clock.advance(timing.holeCompleteSeconds * 1000); // gap between courses
    clock.advance(timing.holeIntroSeconds * 1000); // course 2, hole 1 opens
    playOneCourse(submit); // course 2
    clock.advance(timing.holeCompleteSeconds * 1000); // finish

    const finalStandings = [...events].reverse().find((e) => e.t === "standings");
    expect(finalStandings?.t).toBe("standings");
    if (finalStandings?.t === "standings") {
      expect(finalStandings.rows).toHaveLength(2);
      // 2 courses x 2 holes each
      expect(finalStandings.rows.every((r) => r.thru === 4)).toBe(true);
      expect(finalStandings.rows[0]?.rank).toBe(1);
    }

    const courseComplete = [...events]
      .reverse()
      .find((e) => e.t === "game-state" && e.phase === "course-complete");
    expect(courseComplete?.t).toBe("game-state");

    for (const uid of ["u1", "u2"]) {
      const s = store.getPlayerStats("c1", uid);
      expect(s?.tournamentsPlayed).toBe(1);
      expect(s?.gamesPlayed).toBe(2); // one per course
    }
    // one winner recorded
    const wins =
      (store.getPlayerStats("c1", "u1")?.tournamentWins ?? 0) +
      (store.getPlayerStats("c1", "u2")?.tournamentWins ?? 0);
    expect(wins).toBe(1);

    // channel is free again
    expect(manager.start("c1", "practice")).toEqual({ ok: true });
  });
});
