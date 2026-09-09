import type { Hole } from "@twitch-golf/shared";
import { describe, expect, it } from "vitest";

import type { SessionResponse } from "../src/net";
import { applyMessage, applySession, initialState, showNames, visibleBalls } from "../src/state";

const hole: Hole = {
  id: "h1",
  name: "H1",
  size: { w: 100, h: 150 },
  par: 3,
  tee: { x: 50, y: 135 },
  cup: { x: 50, y: 20, radius: 2.2 },
  surfaces: [],
  walls: [],
  obstacles: [],
};

const session = (over: Partial<SessionResponse> = {}): SessionResponse => ({
  role: "viewer",
  hasIdentity: true,
  isPlayer: true,
  myBallId: 1,
  allowDragInput: true,
  game: {
    holeIndex: 0,
    holeCount: 2,
    par: 3,
    roundNumber: 2,
    phase: "round-open",
    roundClosesAt: null,
    hole,
    balls: [
      { id: 1, name: "Alice", strokes: 1, sunk: false },
      { id: 2, name: "Bob", strokes: 3, sunk: true },
    ],
    standings: [{ rank: 1, id: 2, name: "Bob", thru: 1, toPar: 0, total: 3 }],
  },
  ...over,
});

describe("applySession", () => {
  it("hydrates from a running game", () => {
    const s = applySession(initialState(), session());
    expect(s.phase).toBe("round-open");
    expect(s.hole?.id).toBe("h1");
    expect(s.balls.size).toBe(2);
    expect(s.balls.get(1)).toMatchObject({ name: "Alice", strokes: 1, x: 50, y: 135 });
    expect(s.isPlayer).toBe(true);
    expect(s.myBallId).toBe(1);
  });

  it("clears the board when no game is running", () => {
    const s = applySession(applySession(initialState(), session()), session({ game: null }));
    expect(s.phase).toBe("idle");
    expect(s.hole).toBeNull();
    expect(s.balls.size).toBe(0);
  });
});

describe("applyMessage", () => {
  const base = () => applySession(initialState(), session());

  it("round-open sets the countdown deadline", () => {
    const { state } = applyMessage(
      base(),
      {
        t: "round-open",
        v: 1,
        holeIndex: 0,
        roundNumber: 3,
        durationSec: 30,
        serverTime: 0,
      },
      10_000,
    );
    expect(state.roundClosesAt).toBe(40_000);
    expect(state.roundNumber).toBe(3);
  });

  it("round-result snaps balls to the server finals", () => {
    const { state } = applyMessage(
      base(),
      {
        t: "round-result",
        v: 1,
        roundNumber: 2,
        balls: [
          {
            id: 1,
            name: "Alice",
            angle: 0,
            power: 40,
            from: { x: 50, y: 135 },
            final: { x: 50, y: 110 },
            sunk: false,
            strokes: 2,
            penalty: 0,
          },
        ],
      },
      0,
    );
    expect(state.balls.get(1)).toMatchObject({ x: 50, y: 110, strokes: 2 });
    expect(state.phase).toBe("round-resolving");
  });

  it("hole-complete triggers the reveal-all window", () => {
    const { state } = applyMessage(
      base(),
      {
        t: "hole-complete",
        v: 1,
        holeIndex: 0,
        results: [],
      },
      1_000,
    );
    expect(state.revealAllUntil).toBe(6_000);
    expect(state.phase).toBe("hole-complete");
  });

  it("game-state on a new hole asks for a fresh session", () => {
    const { needsSession } = applyMessage(
      base(),
      {
        t: "game-state",
        v: 1,
        phase: "hole-intro",
        courseId: "c",
        holeIndex: 1,
        roundNumber: 0,
      },
      0,
    );
    expect(needsSession).toBe(true);
  });
});

describe("view rules", () => {
  it("a player in a live round sees only their own ball", () => {
    const s = applySession(initialState(), session());
    expect(visibleBalls(s, 0).map((b) => b.id)).toEqual([1]);
    expect(showNames(s, 0)).toBe(false);
  });

  it("a spectator sees every ball with names", () => {
    const s = applySession(initialState(), session({ isPlayer: false, myBallId: null }));
    expect(
      visibleBalls(s, 0)
        .map((b) => b.id)
        .sort(),
    ).toEqual([1, 2]);
    expect(showNames(s, 0)).toBe(true);
  });

  it("during the post-hole reveal a player sees everyone", () => {
    let s = applySession(initialState(), session());
    ({ state: s } = applyMessage(s, { t: "hole-complete", v: 1, holeIndex: 0, results: [] }, 0));
    expect(
      visibleBalls(s, 1_000)
        .map((b) => b.id)
        .sort(),
    ).toEqual([1, 2]);
  });
});
