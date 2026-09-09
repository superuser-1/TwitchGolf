import { describe, expect, it } from "vitest";

import { ControlPipeline } from "../src/control-pipeline";
import type { ControlCommand } from "../src/ebs-client";
import type { ChatMessage } from "../src/sources/types";

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  channelId: "c1",
  userId: "u1",
  login: "u1",
  displayName: "U1",
  text: "!golf start",
  ...over,
});

function make() {
  const sent: ControlCommand[] = [];
  return { pipeline: new ControlPipeline({ forward: (c) => void sent.push(c) }), sent };
}

describe("ControlPipeline.isControlCommand", () => {
  it("matches !golf verbs only", () => {
    expect(ControlPipeline.isControlCommand("!golf start")).toBe(true);
    expect(ControlPipeline.isControlCommand("!golf tournament weekly-open")).toBe(true);
    expect(ControlPipeline.isControlCommand("!golf 70 50")).toBe(false);
    expect(ControlPipeline.isControlCommand("!70, 50")).toBe(false);
  });
});

describe("ControlPipeline.handle", () => {
  it("forwards a moderator's start with an optional course arg", async () => {
    const { pipeline, sent } = make();
    expect(await pipeline.handle(msg({ text: "!golf start seaside", isMod: true }))).toBe(
      "forwarded",
    );
    expect(sent[0]).toMatchObject({ action: "start", courseId: "seaside", isMod: true });
  });

  it("maps tournament / skip / stop verbs", async () => {
    const { pipeline, sent } = make();
    await pipeline.handle(msg({ text: "!golf tournament weekly-open", isBroadcaster: true }));
    await pipeline.handle(msg({ text: "!golf skip", isBroadcaster: true }));
    await pipeline.handle(msg({ text: "!golf stop", isBroadcaster: true }));
    expect(sent.map((c) => c.action)).toEqual(["start-tournament", "skip-round", "stop"]);
    expect(sent[0]?.tournamentId).toBe("weekly-open");
  });

  it("ignores non-privileged users", async () => {
    const { pipeline, sent } = make();
    expect(await pipeline.handle(msg({ text: "!golf start", isMod: false }))).toBe(
      "ignored:not-privileged",
    );
    expect(sent).toHaveLength(0);
  });

  it("ignores non-control text", async () => {
    const { pipeline } = make();
    expect(await pipeline.handle(msg({ text: "!70, 50", isMod: true }))).toBe(
      "ignored:not-control",
    );
  });
});
