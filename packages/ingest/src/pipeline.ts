import { parseChatCommand } from "@twitch-golf/shared";

import type { ChatMessage } from "./sources/types";

export interface ForwardedCommand {
  channelId: string;
  userId: string;
  login: string;
  displayName: string;
  angle: number;
  power: number;
}

export type HandleOutcome =
  "forwarded" | "ignored:not-a-command" | "ignored:parse" | "ignored:rate-limited";

export interface PipelineOptions {
  forward: (cmd: ForwardedCommand) => void | Promise<void>;
  /** Minimum ms between accepted commands from one user. */
  userRateMs: number;
  now?: () => number;
}

/** Parse chat -> per-user rate limit -> forward to the EBS. */
export class CommandPipeline {
  private readonly lastAccepted = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly opts: PipelineOptions) {
    this.now = opts.now ?? Date.now;
  }

  async handle(msg: ChatMessage): Promise<HandleOutcome> {
    const parsed = parseChatCommand(msg.text);
    if (!parsed.ok) {
      return parsed.reason === "not-a-command" ? "ignored:not-a-command" : "ignored:parse";
    }

    const t = this.now();
    const last = this.lastAccepted.get(msg.userId);
    if (last !== undefined && t - last < this.opts.userRateMs) return "ignored:rate-limited";
    this.lastAccepted.set(msg.userId, t);

    await this.opts.forward({
      channelId: msg.channelId,
      userId: msg.userId,
      login: msg.login,
      displayName: msg.displayName,
      angle: parsed.angle,
      power: parsed.power,
    });
    return "forwarded";
  }
}
