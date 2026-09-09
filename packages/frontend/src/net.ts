import type { BroadcastMsg } from "@twitch-golf/shared";

import type { RuntimeConfig } from "./config";
import type { Identity } from "./twitch";

export interface SessionResponse {
  role: string;
  hasIdentity: boolean;
  isPlayer: boolean;
  myBallId: number | null;
  game: unknown;
}

export async function fetchSession(
  cfg: RuntimeConfig,
  identity: Identity,
): Promise<SessionResponse> {
  const res = await fetch(`${cfg.ebsUrl}/session`, {
    headers: { authorization: `Bearer ${identity.token}` },
  });
  if (!res.ok) throw new Error(`/session ${res.status}`);
  return (await res.json()) as SessionResponse;
}

export interface Net {
  close(): void;
}

/** Subscribe to broadcast messages: Twitch PubSub in production, mock WS in dev. */
export function connectNet(
  cfg: RuntimeConfig,
  identity: Identity,
  onMessage: (msg: BroadcastMsg) => void,
): Net {
  if (!cfg.dev && window.Twitch?.ext) {
    const ext = window.Twitch.ext;
    const listener = (_target: string, _contentType: string, raw: string) => {
      try {
        onMessage(JSON.parse(raw) as BroadcastMsg);
      } catch {
        /* ignore malformed */
      }
    };
    ext.listen("broadcast", listener);
    return { close: () => ext.unlisten("broadcast", listener) };
  }

  let socket: WebSocket | null = null;
  let closed = false;

  const open = () => {
    socket = new WebSocket(`${cfg.wsUrl}?channel=${encodeURIComponent(identity.channelId)}`);
    socket.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as { channelId: string; msg: BroadcastMsg };
        onMessage(parsed.msg);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      if (!closed) setTimeout(open, 1500);
    };
  };
  open();

  return {
    close: () => {
      closed = true;
      socket?.close();
    },
  };
}
