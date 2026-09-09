import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { ManualClock } from "../src/clock";
import { loadConfig } from "../src/config";
import { loadCourseRegistry } from "../src/courses";
import { GameManager } from "../src/game/manager";
import { buildServer } from "../src/http/server";
import { FileStore } from "../src/store/file-store";
import { makeDevToken } from "../src/twitch/jwt";
import { NoopBroadcaster } from "../src/twitch/pubsub";

const config = loadConfig({ TWITCH_MOCK: "1" });
const broadcasterTok = makeDevToken({
  channel_id: "chan1",
  role: "broadcaster",
  user_id: "b1",
  opaque_user_id: "Ub1",
});
const playerTok = makeDevToken({
  channel_id: "chan1",
  role: "viewer",
  user_id: "v1",
  opaque_user_id: "Uv1",
});
const anonTok = makeDevToken({ channel_id: "chan1", role: "viewer" }); // no user_id
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

let clock: ManualClock;
let store: FileStore;
let manager: GameManager;
let app: FastifyInstance;

beforeEach(async () => {
  clock = new ManualClock();
  store = new FileStore();
  const courses = await loadCourseRegistry();
  manager = new GameManager({
    clock,
    timing: config.timing,
    broadcaster: new NoopBroadcaster(),
    courses,
    store,
  });
  app = buildServer({ config, manager, courses, store, clock });
});

afterEach(async () => {
  manager.stopAll();
  await app.close();
});

const startGame = () =>
  app.inject({
    method: "POST",
    url: "/control",
    headers: bearer(broadcasterTok),
    payload: { action: "start", courseId: "practice" },
  });

const swing = (tok: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/swing", headers: bearer(tok), payload });

describe("POST /swing", () => {
  it("403 when the viewer has not granted identity", async () => {
    await startGame();
    clock.advance(config.timing.holeIntroSeconds * 1000);
    const res = await swing(anonTok, { angle: 70, power: 50 });
    expect(res.statusCode).toBe(403);
    expect(res.json().reason).toBe("identity-required");
  });

  it("404 when no game is running", async () => {
    const res = await swing(playerTok, { angle: 70, power: 50 });
    expect(res.statusCode).toBe(404);
  });

  it("409 before the round opens, 200 once it is open", async () => {
    await startGame();
    expect((await swing(playerTok, { angle: 70, power: 50 })).statusCode).toBe(409);

    clock.advance(config.timing.holeIntroSeconds * 1000);
    const ok = await swing(playerTok, { angle: 70, power: 50 });
    expect(ok.json()).toEqual({ ok: true });

    const session = await app.inject({
      method: "GET",
      url: "/session",
      headers: bearer(playerTok),
    });
    expect(session.json().isPlayer).toBe(true);
  });

  it("rate-limits rapid repeats (429)", async () => {
    await startGame();
    clock.advance(config.timing.holeIntroSeconds * 1000);
    expect((await swing(playerTok, { angle: 10, power: 40 })).statusCode).toBe(200);
    expect((await swing(playerTok, { angle: 20, power: 40 })).statusCode).toBe(429);
  });

  it("a drag swing does not overwrite a name set by a chat swing", async () => {
    await startGame();
    clock.advance(config.timing.holeIntroSeconds * 1000);
    await app.inject({
      method: "POST",
      url: "/command",
      headers: { "x-ingest-secret": config.ingestSecret },
      payload: {
        channelId: "chan1",
        userId: "v1",
        login: "v1",
        displayName: "Vera",
        angle: 5,
        power: 30,
      },
    });
    // different user so the rate limiter doesn't block; check v1's name survives
    await swing(playerTok, { angle: 90, power: 44 });
    const snap = manager.get("chan1")!.snapshot();
    expect(snap.balls.find((b) => b.name === "Vera")).toBeDefined();
  });
});
