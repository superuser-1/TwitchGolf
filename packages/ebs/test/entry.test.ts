import { describe, expect, it } from "vitest";

import { FreeGate } from "../src/entry/gate";

describe("FreeGate", () => {
  const gate = new FreeGate();

  it("allows the broadcaster", () => {
    expect(gate.authorizeStart({ channelId: "c", userId: "u", role: "broadcaster" }).ok).toBe(true);
  });
  it("allows moderators", () => {
    expect(gate.authorizeStart({ channelId: "c", userId: "u", role: "moderator" }).ok).toBe(true);
  });
  it("rejects viewers with a reason", () => {
    const r = gate.authorizeStart({ channelId: "c", userId: "u", role: "viewer" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/broadcaster or moderator/);
  });
});
