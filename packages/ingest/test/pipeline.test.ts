import { describe, expect, it, vi } from "vitest";

import { CommandPipeline } from "../src/pipeline";
import type { ForwardedCommand } from "../src/pipeline";
import type { ChatMessage } from "../src/sources/types";

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  channelId: "c1",
  userId: "u1",
  login: "u1",
  displayName: "U1",
  text: "!70, 50",
  ...over,
});

function make(userRateMs = 1000) {
  const forwarded: ForwardedCommand[] = [];
  let now = 0;
  const pipeline = new CommandPipeline({
    forward: (cmd) => void forwarded.push(cmd),
    userRateMs,
    now: () => now,
  });
  return { pipeline, forwarded, tick: (ms: number) => (now += ms) };
}

describe("CommandPipeline", () => {
  it("forwards a valid swing with parsed angle/power", async () => {
    const { pipeline, forwarded } = make();
    await expect(pipeline.handle(msg({ text: "!dir 70 pow 50" }))).resolves.toBe("forwarded");
    expect(forwarded).toEqual([
      { channelId: "c1", userId: "u1", login: "u1", displayName: "U1", angle: 70, power: 50 },
    ]);
  });

  it("ignores non-commands and garbage", async () => {
    const { pipeline, forwarded } = make();
    expect(await pipeline.handle(msg({ text: "hello chat" }))).toBe("ignored:not-a-command");
    expect(await pipeline.handle(msg({ text: "!golf go" }))).toBe("ignored:parse");
    expect(forwarded).toHaveLength(0);
  });

  it("rate-limits a second command from the same user inside the window", async () => {
    const { pipeline, forwarded, tick } = make(1000);
    expect(await pipeline.handle(msg())).toBe("forwarded");
    expect(await pipeline.handle(msg({ text: "!90, 20" }))).toBe("ignored:rate-limited");
    tick(1000);
    expect(await pipeline.handle(msg({ text: "!120, 30" }))).toBe("forwarded");
    expect(forwarded.map((c) => c.angle)).toEqual([70, 120]);
  });

  it("rate limit is per user", async () => {
    const { pipeline, forwarded } = make(1000);
    await pipeline.handle(msg({ userId: "a" }));
    await pipeline.handle(msg({ userId: "b" }));
    expect(forwarded).toHaveLength(2);
  });

  it("awaits an async forward", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const pipeline = new CommandPipeline({ forward, userRateMs: 0 });
    await pipeline.handle(msg());
    expect(forward).toHaveBeenCalledOnce();
  });
});
