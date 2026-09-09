import tmi from "tmi.js";
import type { ChatUserstate, Client } from "tmi.js";

import type { ChatMessage, ChatSource } from "./types";

export interface TwitchSourceOptions {
  channel: string;
  /** Used only if a message somehow lacks a room-id tag. */
  fallbackChannelId: string;
}

/**
 * Anonymous chat reader. tmi.js connects without credentials for read-only
 * access to a public channel and reconnects on its own.
 */
export class TwitchChatSource implements ChatSource {
  private readonly client: Client;
  private handler: ((msg: ChatMessage) => void) | null = null;

  constructor(private readonly opts: TwitchSourceOptions) {
    this.client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true, reconnectInterval: 2000 },
      channels: [opts.channel],
    });

    this.client.on(
      "message",
      (_channel: string, tags: ChatUserstate, message: string, self: boolean) => {
        if (self || !this.handler) return;
        const userId = tags["user-id"];
        const login = tags.username;
        if (!userId || !login) return;
        const isBroadcaster = Boolean(tags.badges?.broadcaster) || tags["room-id"] === userId;
        this.handler({
          channelId: tags["room-id"] ?? this.opts.fallbackChannelId,
          userId,
          login,
          displayName: tags["display-name"] ?? login,
          text: message,
          isMod: tags.mod === true || Boolean(tags.badges?.moderator),
          isBroadcaster,
        });
      },
    );
  }

  onMessage(handler: (msg: ChatMessage) => void): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.client.connect();
  }

  async stop(): Promise<void> {
    await this.client.disconnect();
  }
}
