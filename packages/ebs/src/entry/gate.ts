/**
 * Gate that decides whether a viewer may start a game / tournament. The seam
 * for paid entry (Bits / channel points) later — see `docs/DESIGN.md` §11.
 */
export interface EntryContext {
  channelId: string;
  userId: string | null;
  role: string;
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export interface EntryGate {
  authorizeStart(ctx: EntryContext): GateResult;
}

/** v1 policy: only the broadcaster and moderators can start games. */
export class FreeGate implements EntryGate {
  authorizeStart(ctx: EntryContext): GateResult {
    if (ctx.role === "broadcaster" || ctx.role === "moderator") return { ok: true };
    return { ok: false, reason: "broadcaster or moderator only" };
  }
}
