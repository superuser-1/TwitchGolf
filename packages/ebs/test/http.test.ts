import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { ManualClock } from "../src/clock";
import { loadConfig } from "../src/config";
import { loadCourseRegistry } from "../src/courses";
import type { CourseRegistry } from "../src/courses";
import { GameManager } from "../src/game/manager";
import { buildServer } from "../src/http/server";
import { NoopBroadcaster } from "../src/twitch/pubsub";
import { makeDevToken } from "../src/twitch/jwt";

const config = loadConfig({ TWITCH_MOCK: "1", DEFAULT_COURSE_ID: "practice" });

const broadcasterTok = makeDevToken({
  channel_id: "chan1",
  role: "broadcaster",
  user_id: "b1",
  opaque_user_id: "Ub1",
});
const viewerTok = makeDevToken({
  channel_id: "chan1",
  role: "viewer",
  user_id: "v1",
  opaque_user_id: "Uv1",
});
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

let courses: CourseRegistry;
let clock: ManualClock;
let manager: GameManager;
let app: FastifyInstance;

beforeEach(async () => {
  courses = await loadCourseRegistry();
  clock = new ManualClock();
  manager = new GameManager({
    clock,
    timing: config.timing,
    broadcaster: new NoopBroadcaster(),
    courses,
  });
  app = buildServer({ config, manager, courses });
});

afterEach(async () => {
  manager.stopAll();
  await app.close();
});

describe("public routes", () => {
  it("GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("GET /courses lists the practice course", async () => {
    const res = await app.inject({ method: "GET", url: "/courses" });
    expect(res.json().courses.map((c: { id: string }) => c.id)).toContain("practice");
  });
});

describe("/session", () => {
  it("401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/session" });
    expect(res.statusCode).toBe(401);
  });

  it("returns role and a null game when nothing is running", async () => {
    const res = await app.inject({ method: "GET", url: "/session", headers: bearer(viewerTok) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      role: "viewer",
      isPlayer: false,
      game: null,
      allowDragInput: true,
    });
  });
});

describe("/control", () => {
  it("403 for a viewer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/control",
      headers: bearer(viewerTok),
      payload: { action: "start" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a broadcaster can start a game, then /session shows it", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/control",
      headers: bearer(broadcasterTok),
      payload: { action: "start", courseId: "practice" },
    });
    expect(start.json()).toEqual({ ok: true });

    const session = await app.inject({
      method: "GET",
      url: "/session",
      headers: bearer(broadcasterTok),
    });
    expect(session.json().game).toMatchObject({ courseId: "practice", phase: "hole-intro" });
  });

  it("starting twice conflicts", async () => {
    await app.inject({
      method: "POST",
      url: "/control",
      headers: bearer(broadcasterTok),
      payload: { action: "start" },
    });
    const again = await app.inject({
      method: "POST",
      url: "/control",
      headers: bearer(broadcasterTok),
      payload: { action: "start" },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe("/command", () => {
  it("401 without the ingest secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/command",
      payload: { channelId: "chan1", userId: "v1", login: "v1", angle: 0, power: 50 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("404 when no game is running for the channel", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/command",
      headers: { "x-ingest-secret": config.ingestSecret },
      payload: { channelId: "chan1", userId: "v1", login: "v1", angle: 0, power: 50 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("accepts a swing once a round is open", async () => {
    await app.inject({
      method: "POST",
      url: "/control",
      headers: bearer(broadcasterTok),
      payload: { action: "start", courseId: "practice" },
    });

    const early = await app.inject({
      method: "POST",
      url: "/command",
      headers: { "x-ingest-secret": config.ingestSecret },
      payload: { channelId: "chan1", userId: "v1", login: "v1", angle: 70, power: 50 },
    });
    expect(early.json()).toMatchObject({ ok: false, reason: "round-not-open" });

    clock.advance(config.timing.holeIntroSeconds * 1000); // open the round

    const ok = await app.inject({
      method: "POST",
      url: "/command",
      headers: { "x-ingest-secret": config.ingestSecret },
      payload: { channelId: "chan1", userId: "v1", login: "v1", angle: 70, power: 50 },
    });
    expect(ok.json()).toEqual({ ok: true });

    const session = await app.inject({
      method: "GET",
      url: "/session",
      headers: bearer(viewerTok),
    });
    expect(session.json().isPlayer).toBe(true);
  });
});
