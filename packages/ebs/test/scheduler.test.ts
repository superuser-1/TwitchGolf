import type { BroadcastMsg, Hole } from "@twitch-golf/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { ManualClock } from "../src/clock";
import type { GameTimingConfig } from "../src/config";
import { GolfGame } from "../src/game/game";
import type { ActiveCourse } from "../src/game/game";

const timing: GameTimingConfig = {
  roundSeconds: 10,
  maxRoundsPerHole: 3,
  holeIntroSeconds: 1,
  resultSeconds: 1,
  holeCompleteSeconds: 1,
};

function makeHole(id: string, par: number): Hole {
  return {
    id,
    name: id,
    size: { w: 20, h: 20 },
    par,
    tee: { x: 10, y: 18 },
    cup: { x: 10, y: 10, radius: 3 },
    surfaces: [],
    walls: [],
    obstacles: [],
  };
}

const course: ActiveCourse = {
  id: "test",
  name: "Test",
  holes: [makeHole("h1", 2), makeHole("h2", 2)],
};

/** A swing from the tee that reaches and drops into the cup. */
const SINK = { angle: 0, power: 25 };
/** A dribble that goes nowhere near the cup. */
const WEAK = { angle: 180, power: 3 };

let clock: ManualClock;
let events: BroadcastMsg[];
let game: GolfGame;

function newGame(finishedCb?: () => void): GolfGame {
  return new GolfGame({
    channelId: "c1",
    course,
    clock,
    timing,
    broadcast: (m) => events.push(m),
    onFinished: finishedCb,
  });
}

const types = () => events.map((e) => e.t);

beforeEach(() => {
  clock = new ManualClock();
  events = [];
  game = newGame();
});

describe("round lifecycle", () => {
  it("start -> hole-intro -> round-open", () => {
    game.start();
    expect(types()).toEqual(["game-state"]);
    clock.advance(timing.holeIntroSeconds * 1000);
    expect(types()).toEqual(["game-state", "round-open"]);
  });

  it("a sinking swing completes the hole and advances to the next", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    expect(game.submit("u1", "u1", "U1", SINK.angle, SINK.power)).toEqual({ ok: true });

    clock.advance(timing.roundSeconds * 1000); // closeRound -> round-result
    expect(types()).toContain("round-result");

    clock.advance(timing.resultSeconds * 1000); // completeHole
    const holeComplete = events.find((e) => e.t === "hole-complete");
    expect(holeComplete).toBeDefined();
    if (holeComplete?.t === "hole-complete") {
      expect(holeComplete.holeIndex).toBe(0);
      expect(holeComplete.results[0]?.strokes).toBe(1);
    }

    clock.advance(timing.holeCompleteSeconds * 1000); // beginHole(1)
    const snap = game.snapshot();
    expect(snap.holeIndex).toBe(1);
    expect(snap.phase).toBe("hole-intro");
  });
});

describe("submissions", () => {
  it("rejects a swing when no round is open and creates no ball", () => {
    game.start();
    const res = game.submit("u1", "u1", "U1", 0, 50);
    expect(res).toEqual({ ok: false, reason: "round-not-open" });
    expect(game.isPlayer("u1")).toBe(false);
  });

  it("last valid submission wins", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    game.submit("u1", "u1", "U1", SINK.angle, SINK.power); // would sink
    game.submit("u1", "u1", "U1", WEAK.angle, WEAK.power); // overrides -> misses
    clock.advance(timing.roundSeconds * 1000);
    expect(game.snapshot().balls[0]?.sunk).toBe(false);
    expect(game.snapshot().balls[0]?.strokes).toBe(1);
  });

  it("submissions after the round closes are ignored", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    game.submit("u1", "u1", "U1", WEAK.angle, WEAK.power); // a ball is in play
    clock.advance(timing.roundSeconds * 1000); // closeRound resolves; phase is round-resolving
    const res = game.submit("u1", "u1", "U1", SINK.angle, SINK.power);
    expect(res).toEqual({ ok: false, reason: "round-not-open" });
  });
});

describe("hole caps and AFK", () => {
  it("advances after maxRoundsPerHole even if nobody sinks", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    for (let r = 0; r < timing.maxRoundsPerHole; r++) {
      game.submit("u1", "u1", "U1", WEAK.angle, WEAK.power);
      clock.advance(timing.roundSeconds * 1000); // closeRound
      clock.advance(timing.resultSeconds * 1000); // next openRound OR completeHole
    }
    const holeComplete = events.find((e) => e.t === "hole-complete");
    expect(holeComplete).toBeDefined();
    if (holeComplete?.t === "hole-complete") {
      expect(holeComplete.results[0]?.strokes).toBeGreaterThan(timing.maxRoundsPerHole);
    }
  });

  it("an AFK player (no submissions) does not stall the table", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    game.submit("u1", "u1", "U1", WEAK.angle, WEAK.power); // joins round 1 only
    clock.advance((timing.roundSeconds + timing.resultSeconds) * 1000); // r1
    clock.advance((timing.roundSeconds + timing.resultSeconds) * 1000); // r2 (no submit)
    clock.advance((timing.roundSeconds + timing.resultSeconds) * 1000); // r3 (no submit) -> cap
    clock.advance(timing.holeCompleteSeconds * 1000);
    expect(game.snapshot().holeIndex).toBe(1);
  });
});

describe("control", () => {
  it("skipRound resolves the open round immediately", () => {
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);
    game.submit("u1", "u1", "U1", WEAK.angle, WEAK.power);
    const before = events.length;
    expect(game.skipRound()).toEqual({ ok: true });
    expect(events.slice(before).map((e) => e.t)).toContain("round-result");
  });

  it("skipRound is a no-op when no round is open", () => {
    game.start();
    expect(game.skipRound()).toEqual({ ok: false, reason: "no-open-round" });
  });

  it("stop() marks the game finished and fires onFinished", () => {
    let finished = false;
    game = newGame(() => {
      finished = true;
    });
    game.start();
    game.stop();
    expect(finished).toBe(true);
    expect(game.isFinished).toBe(true);
  });
});

describe("empty game", () => {
  it("keeps re-opening rounds with no players, then ends", () => {
    let finished = false;
    game = newGame(() => {
      finished = true;
    });
    game.start();
    clock.advance(1000 + 25 * timing.roundSeconds * 1000);
    expect(finished).toBe(true);
    expect(game.snapshot().phase).toBe("course-complete");
  });
});

describe("full course", () => {
  it("emits a final standings row per player and finishes", () => {
    const done: boolean[] = [];
    game = newGame(() => done.push(true));
    game.start();
    clock.advance(timing.holeIntroSeconds * 1000);

    // Two holes, sink on the first round of each.
    for (let hole = 0; hole < course.holes.length; hole++) {
      game.submit("u1", "u1", "Alice", SINK.angle, SINK.power);
      game.submit("u2", "u2", "Bob", WEAK.angle, WEAK.power);
      clock.advance(timing.roundSeconds * 1000);
      // u2 never sinks -> ride the per-hole cap
      for (let r = 1; r < timing.maxRoundsPerHole; r++) {
        clock.advance(timing.resultSeconds * 1000);
        game.submit("u2", "u2", "Bob", WEAK.angle, WEAK.power);
        clock.advance(timing.roundSeconds * 1000);
      }
      clock.advance(timing.resultSeconds * 1000); // completeHole
      clock.advance(timing.holeCompleteSeconds * 1000); // next hole intro or course end
      clock.advance(timing.holeIntroSeconds * 1000);
    }

    const standings = [...events].reverse().find((e) => e.t === "standings");
    expect(standings?.t).toBe("standings");
    if (standings?.t === "standings") {
      expect(standings.rows).toHaveLength(2);
      expect(standings.rows[0]?.name).toBe("Alice"); // fewer strokes
      expect(standings.rows[0]?.rank).toBe(1);
    }
    expect(done.length).toBeGreaterThan(0);
  });
});
