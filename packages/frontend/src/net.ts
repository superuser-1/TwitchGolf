import type { BroadcastMsg } from "@twitch-golf/shared";

import type { RuntimeConfig } from "./config";
import type { Identity } from "./twitch";

export interface SessionResponse {
  role: string;
  hasIdentity: boolean;
  isPlayer: boolean;
  myBallId: number | null;
  allowDragInput: boolean;
  game: unknown;
}

export interface SwingBody {
  angle: number;
  power: number;
  displayName?: string;
}

export async function submitSwing(
  cfg: RuntimeConfig,
  identity: Identity,
  body: SwingBody,
): Promise<{ ok: boolean; reason?: string; status: number }> {
  try {
    const res = await fetch(`${cfg.ebsUrl}/swing`, {
      method: "POST",
      headers: { authorization: `Bearer ${identity.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    return { ok: Boolean(json.ok), reason: json.reason, status: res.status };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network", status: 0 };
  }
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
