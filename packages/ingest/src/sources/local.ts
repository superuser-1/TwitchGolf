import { createInterface } from "node:readline";
import type { Interface } from "node:readline";

import type { ChatMessage, ChatSource } from "./types";

export interface LocalSourceOptions {
  channelId: string;
  input?: NodeJS.ReadableStream;
}

/**
 * Reads stdin. Line formats:
 *   !70, 50            -> from user "local"
 *   alice: !70, 50     -> from user "alice"
 *   alice !70 50       -> from user "alice"
 */
export class LocalChatSource implements ChatSource {
  private handler: ((msg: ChatMessage) => void) | null = null;
  private rl: Interface | null = null;

  constructor(private readonly opts: LocalSourceOptions) {}

  onMessage(handler: (msg: ChatMessage) => void): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    const input = this.opts.input ?? process.stdin;
    this.rl = createInterface({ input, terminal: false });
    this.rl.on("line", (line) => this.feed(line));
  }

  /** Exposed for tests: push a chat line without stdin. */
  feed(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || !this.handler) return;

    const match = /^(\S+?)\s*:?\s+(!.*)$/.exec(trimmed);
    const login = match ? match[1]! : "local";
    const text = match ? match[2]! : trimmed;

    this.handler({
      channelId: this.opts.channelId,
      userId: `local-${login}`,
      login,
      displayName: login,
      text,
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    this.rl = null;
  }
}
