import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

import type { BroadcastMsg } from "@twitch-golf/shared";

export interface Broadcaster {
  broadcast(channelId: string, msg: BroadcastMsg): void | Promise<void>;
  close(): Promise<void>;
}

/** Drops everything on the floor. Default until real Twitch PubSub is wired (phase 9). */
export class NoopBroadcaster implements Broadcaster {
  broadcast(): void {}
  async close(): Promise<void> {}
}

/**
 * Local stand-in for Twitch PubSub: a WebSocket server the extension frontend
 * connects to during development. Clients may pass `?channel=<id>` to filter.
 */
export class MockPubSub implements Broadcaster {
  private readonly wss: WebSocketServer;
  private readonly channelOf = new Map<WebSocket, string | null>();

  constructor(port: number, host = "127.0.0.1") {
    this.wss = new WebSocketServer({ port, host });
    this.wss.on("connection", (socket, req) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      this.channelOf.set(socket, url.searchParams.get("channel"));
      socket.on("close", () => this.channelOf.delete(socket));
    });
  }

  get port(): number {
    const addr = this.wss.address();
    return typeof addr === "object" && addr ? addr.port : 0;
  }

  broadcast(channelId: string, msg: BroadcastMsg): void {
    const payload = JSON.stringify({ channelId, msg });
    for (const [socket, filter] of this.channelOf) {
      if (socket.readyState === socket.OPEN && (filter === null || filter === channelId)) {
        socket.send(payload);
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
