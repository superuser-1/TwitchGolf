import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { ManualClock } from "@twitch-golf/ebs/clock";
import { loadConfig as loadEbsConfig } from "@twitch-golf/ebs/config";
import { loadCourseRegistry } from "@twitch-golf/ebs/courses";
import { GameManager } from "@twitch-golf/ebs/game/manager";
import { buildServer } from "@twitch-golf/ebs/http/server";
import { makeDevToken } from "@twitch-golf/ebs/twitch/jwt";
import { NoopBroadcaster } from "@twitch-golf/ebs/twitch/pubsub";

import { CommandPipeline } from "../src/pipeline";
import { LocalChatSource } from "../src/sources/local";

const CHANNEL = "dev-channel";
const ebsConfig = loadEbsConfig({ TWITCH_MOCK: "1" });
const broadcasterTok = makeDevToken({
  channel_id: CHANNEL,
  role: "broadcaster",
  user_id: "b1",
  opaque_user_id: "Ub1",
});

let clock: ManualClock;
let manager: GameManager;
let app: FastifyInstance;

beforeEach(async () => {
  clock = new ManualClock();
  const courses = await loadCourseRegistry();
  manager = new GameManager({
    clock,
    timing: ebsConfig.timing,
    broadcaster: new NoopBroadcaster(),
    courses,
  });
  app = buildServer({ config: ebsConfig, manager, courses });
  await app.inject({
    method: "POST",
    url: "/control",
    headers: { authorization: `Bearer ${broadcasterTok}` },
    payload: { action: "start", courseId: "practice" },
  });
  clock.advance(ebsConfig.timing.holeIntroSeconds * 1000); // open the round
});

afterEach(async () => {
  manager.stopAll();
  await app.close();
});

function wire(userRateMs = 0) {
  const statuses: number[] = [];
  const pending: Promise<unknown>[] = [];
  const pipeline = new CommandPipeline({
    userRateMs,
    forward: async (cmd) => {
      const res = await app.inject({
        method: "POST",
        url: "/command",
        headers: { "x-ingest-secret": ebsConfig.ingestSecret },
        payload: cmd,
      });
      statuses.push(res.statusCode);
    },
  });
  const source = new LocalChatSource({ channelId: CHANNEL });
  source.onMessage((m) => pending.push(pipeline.handle(m)));
  return { source, statuses, settle: () => Promise.all(pending) };
}

describe("local chat -> pipeline -> EBS", () => {
  it("a chat swing registers the player in the game", async () => {
    const { source, statuses, settle } = wire();
    source.feed("alice: !70, 50");
    await settle();

    expect(statuses).toEqual([200]);
    expect(manager.get(CHANNEL)?.isPlayer("local-alice")).toBe(true);
  });

  it("garbage chat is dropped before it reaches the EBS", async () => {
    const { source, statuses, settle } = wire();
    source.feed("hey what's up");
    source.feed("!nonsense");
    await settle();
    expect(statuses).toHaveLength(0);
    expect(manager.get(CHANNEL)?.snapshot().balls).toHaveLength(0);
  });

  it("rate-limited repeats never hit the EBS", async () => {
    const { source, statuses, settle } = wire(60_000);
    source.feed("bob: !10, 40");
    source.feed("bob: !20, 40");
    source.feed("bob: !30, 40");
    await settle();
    expect(statuses).toEqual([200]);
  });
});
