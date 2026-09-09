import type { ControlCommand } from "./ebs-client";
import type { ChatMessage } from "./sources/types";

const CONTROL_RE = /^!golf\s+(start|stop|skip|tournament)\b\s*(\S+)?/i;

export type ControlOutcome = "forwarded" | "ignored:not-control" | "ignored:not-privileged";

export interface ControlPipelineOptions {
  forward: (cmd: ControlCommand) => void | Promise<void>;
}

/** Recognises `!golf start|stop|skip|tournament` from mods/broadcaster. */
export class ControlPipeline {
  constructor(private readonly opts: ControlPipelineOptions) {}

  static isControlCommand(text: string): boolean {
    return CONTROL_RE.test(text.trim());
  }

  async handle(msg: ChatMessage): Promise<ControlOutcome> {
    const m = CONTROL_RE.exec(msg.text.trim());
    if (!m) return "ignored:not-control";
    if (!msg.isMod && !msg.isBroadcaster) return "ignored:not-privileged";

    const verb = m[1]!.toLowerCase();
    const arg = m[2];

    const cmd: ControlCommand = {
      channelId: msg.channelId,
      userId: msg.userId,
      login: msg.login,
      isMod: Boolean(msg.isMod),
      isBroadcaster: Boolean(msg.isBroadcaster),
      action:
        verb === "start"
          ? "start"
          : verb === "tournament"
            ? "start-tournament"
            : verb === "skip"
              ? "skip-round"
              : "stop",
      ...(verb === "start" && arg ? { courseId: arg } : {}),
      ...(verb === "tournament" && arg ? { tournamentId: arg } : {}),
    };

    await this.opts.forward(cmd);
    return "forwarded";
  }
}
