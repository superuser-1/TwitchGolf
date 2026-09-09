import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { ManualClock } from "../src/clock";
import { loadConfig } from "../src/config";
import { loadCourseRegistry } from "../src/courses";
import { GameManager } from "../src/game/manager";
import { buildServer } from "../src/http/server";
import { FileStore } from "../src/store/file-store";
import { loadTournamentRegistry } from "../src/tournaments";
import { makeDevToken } from "../src/twitch/jwt";
import { NoopBroadcaster } from "../src/twitch/pubsub";

const config = loadConfig({ TWITCH_MOCK: "1" });
const tok = (role: string) =>
  makeDevToken({ channel_id: "chan1", role, user_id: `${role}-1`, opaque_user_id: `U${role}` });
const bearer = (role: string) => ({ authorization: `Bearer ${tok(role)}` });

let store: FileStore;
let manager: GameManager;
let app: FastifyInstance;

beforeEach(async () => {
  store = new FileStore();
  const courses = await loadCourseRegistry();
  manager = new GameManager({
    clock: new ManualClock(),
    timing: config.timing,
    broadcaster: new NoopBroadcaster(),
    courses,
    tournaments: await loadTournamentRegistry(),
    store,
  });
  app = buildServer({
    config,
    manager,
    courses,
    tournaments: await loadTournamentRegistry(),
    store,
  });
});

afterEach(async () => {
  manager.stopAll();
  await app.close();
});

describe("/config", () => {
  it("returns defaults + course/tournament lists for the broadcaster", async () => {
    const res = await app.inject({ method: "GET", url: "/config", headers: bearer("broadcaster") });
    const body = res.json();
    expect(body.config.roundSeconds).toBe(config.timing.roundSeconds);
    expect(body.courses.length).toBeGreaterThan(0);
    expect(body.tournaments.length).toBeGreaterThan(0);
  });

  it("403 for a viewer", async () => {
    const res = await app.inject({ method: "GET", url: "/config", headers: bearer("viewer") });
    expect(res.statusCode).toBe(403);
  });

  it("PUT persists and round-trips", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/config",
      headers: bearer("broadcaster"),
      payload: {
        defaultCourseId: "seaside",
        roundSeconds: 45,
        maxRoundsPerHole: 6,
        allowDragInput: false,
      },
    });
    expect(put.json()).toEqual({
      ok: true,
      config: {
        defaultCourseId: "seaside",
        roundSeconds: 45,
        maxRoundsPerHole: 6,
        allowDragInput: false,
      },
    });
    expect(store.getChannelConfig("chan1")).toMatchObject({
      roundSeconds: 45,
      allowDragInput: false,
    });

    const get = await app.inject({ method: "GET", url: "/config", headers: bearer("broadcaster") });
    expect(get.json().config.defaultCourseId).toBe("seaside");
    expect(get.json().config.allowDragInput).toBe(false);
  });

  it("PUT rejects an unknown course", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/config",
      headers: bearer("broadcaster"),
      payload: { defaultCourseId: "nope", roundSeconds: 30, maxRoundsPerHole: 8 },
    });
    expect(put.statusCode).toBe(400);
  });

  it("PUT is broadcaster-only (moderator 403)", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/config",
      headers: bearer("moderator"),
      payload: { defaultCourseId: "seaside", roundSeconds: 30, maxRoundsPerHole: 8 },
    });
    expect(put.statusCode).toBe(403);
  });
});

describe("/chat-control", () => {
  const post = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/chat-control",
      headers: { "x-ingest-secret": config.ingestSecret },
      payload,
    });

  it("a moderator can start a game", async () => {
    const res = await post({
      channelId: "chan1",
      userId: "m1",
      login: "mod",
      isMod: true,
      action: "start",
      courseId: "practice",
    });
    expect(res.json()).toEqual({ ok: true });
    expect(manager.get("chan1")).toBeDefined();
  });

  it("a non-privileged viewer is rejected", async () => {
    const res = await post({
      channelId: "chan1",
      userId: "v1",
      login: "viewer",
      action: "start",
    });
    expect(res.statusCode).toBe(403);
    expect(manager.get("chan1")).toBeUndefined();
  });

  it("requires the ingest secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/chat-control",
      payload: { channelId: "chan1", userId: "m1", login: "mod", isMod: true, action: "start" },
    });
    expect(res.statusCode).toBe(401);
  });
});
