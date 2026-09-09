import { describe, expect, it } from "vitest";

import { FileStore } from "../src/store/file-store";
import type { PlayerGameResult } from "../src/store/types";

const player = (over: Partial<PlayerGameResult> = {}): PlayerGameResult => ({
  userId: "u1",
  login: "u1",
  name: "U1",
  strokes: 9,
  holes: 3,
  toPar: 0,
  aces: 0,
  waterHits: 0,
  won: false,
  ...over,
});

describe("FileStore (in-memory)", () => {
  it("accumulates player stats across games", () => {
    const store = new FileStore();
    store.recordGameResult("c1", {
      courseId: "practice",
      startedAt: 0,
      finishedAt: 1000,
      players: [player({ strokes: 9, holes: 3, toPar: 3, waterHits: 1 })],
    });
    store.recordGameResult("c1", {
      courseId: "practice",
      startedAt: 2000,
      finishedAt: 3000,
      players: [player({ strokes: 6, holes: 3, toPar: 0, aces: 1 })],
    });

    const s = store.getPlayerStats("c1", "u1");
    expect(s).toMatchObject({
      gamesPlayed: 2,
      holesPlayed: 6,
      totalStrokes: 15,
      holesInOne: 1,
      waterHazards: 1,
      bestToPar: 0,
    });
  });

  it("returns null for an unknown player", () => {
    expect(new FileStore().getPlayerStats("c1", "nobody")).toBeNull();
  });

  it("ranks topPlayers by strokes per hole", () => {
    const store = new FileStore();
    store.recordGameResult("c1", {
      courseId: "x",
      startedAt: 0,
      finishedAt: 1,
      players: [
        player({ userId: "slow", login: "slow", name: "Slow", strokes: 12, holes: 3 }),
        player({ userId: "fast", login: "fast", name: "Fast", strokes: 6, holes: 3 }),
      ],
    });
    expect(store.topPlayers("c1", 10).map((p) => p.userId)).toEqual(["fast", "slow"]);
  });

  it("records tournament participation and wins", () => {
    const store = new FileStore();
    store.recordTournamentResult("c1", {
      tournamentId: "t1",
      name: "T1",
      courseIds: ["a", "b"],
      startedAt: 0,
      finishedAt: 10,
      standings: [
        { userId: "champ", name: "Champ", strokes: 20, toPar: -2, rank: 1 },
        { userId: "second", name: "Second", strokes: 24, toPar: 2, rank: 2 },
      ],
    });
    expect(store.getPlayerStats("c1", "champ")).toMatchObject({
      tournamentsPlayed: 1,
      tournamentWins: 1,
    });
    expect(store.getPlayerStats("c1", "second")).toMatchObject({
      tournamentsPlayed: 1,
      tournamentWins: 0,
    });
  });
});
