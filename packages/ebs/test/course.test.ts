import type { BroadcastMsg } from "@twitch-golf/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { ManualClock } from "../src/clock";
import type { GameTimingConfig } from "../src/config";
import { loadCourseRegistry } from "../src/courses";
import type { CourseRegistry } from "../src/courses";
import { GameManager } from "../src/game/manager";

const timing: GameTimingConfig = {
  roundSeconds: 5,
  maxRoundsPerHole: 2,
  holeIntroSeconds: 1,
  resultSeconds: 1,
  holeCompleteSeconds: 1,
};

let clock: ManualClock;
let courses: CourseRegistry;
let events: BroadcastMsg[];
let manager: GameManager;

beforeEach(async () => {
  clock = new ManualClock();
  courses = await loadCourseRegistry();
  events = [];
  manager = new GameManager({
    clock,
    timing,
    broadcaster: {
      broadcast: (_ch, msg) => void events.push(msg),
      close: async () => {},
    },
    courses,
  });
});

describe("multi-hole course", () => {
  it("plays every hole of Seaside Links and finishes with per-player standings", () => {
    const started = manager.start("c1", "seaside");
    expect(started).toEqual({ ok: true });
    const game = manager.get("c1")!;
    const holeCount = courses.get("seaside")!.resolvedHoles.length;
    expect(holeCount).toBe(4);

    clock.advance(timing.holeIntroSeconds * 1000); // hole 1 round 1 opens

    // Two players who never sink -> each hole rides the round cap.
    for (let hole = 0; hole < holeCount; hole++) {
      for (let round = 0; round < timing.maxRoundsPerHole; round++) {
        game.submit("u1", "u1", "Amy", 5, 20);
        game.submit("u2", "u2", "Ben", 355, 18);
        clock.advance(timing.roundSeconds * 1000); // resolve
        clock.advance(timing.resultSeconds * 1000); // next round OR completeHole
      }
      clock.advance(timing.holeCompleteSeconds * 1000); // next hole intro / course end
      clock.advance(timing.holeIntroSeconds * 1000);
    }

    expect(game.snapshot().phase).toBe("course-complete");
    expect(game.isFinished).toBe(true);

    const holeCompletes = events.filter((e) => e.t === "hole-complete");
    expect(holeCompletes.map((e) => (e.t === "hole-complete" ? e.holeIndex : -1))).toEqual([
      0, 1, 2, 3,
    ]);

    const finalStandings = [...events].reverse().find((e) => e.t === "standings");
    expect(finalStandings?.t).toBe("standings");
    if (finalStandings?.t === "standings") {
      expect(finalStandings.rows).toHaveLength(2);
      expect(finalStandings.rows.every((r) => r.thru === holeCount)).toBe(true);
      expect(finalStandings.rows[0]?.rank).toBe(1);
    }
  });
});
