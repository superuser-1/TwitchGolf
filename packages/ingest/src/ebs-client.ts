import type { ForwardedCommand } from "./pipeline";

export interface ControlCommand {
  channelId: string;
  userId: string;
  login: string;
  isMod: boolean;
  isBroadcaster: boolean;
  action: "start" | "start-tournament" | "stop" | "skip-round";
  courseId?: string;
  tournamentId?: string;
}

export interface EbsClient {
  postCommand(cmd: ForwardedCommand): Promise<void>;
  postControl(cmd: ControlCommand): Promise<{ status: number; body: unknown }>;
}

export interface EbsClientOptions {
  baseUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  onError?: (status: number, body: string) => void;
}

export function createEbsClient(opts: EbsClientOptions): EbsClient {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async postCommand(cmd) {
      let res: Response;
      try {
        res = await doFetch(`${opts.baseUrl}/command`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-ingest-secret": opts.secret },
          body: JSON.stringify(cmd),
        });
      } catch (err) {
        opts.onError?.(0, err instanceof Error ? err.message : String(err));
        return;
      }
      // 404 (no game running) and 409 (round closed / already sunk) are expected noise.
      if (!res.ok && res.status !== 404 && res.status !== 409) {
        opts.onError?.(res.status, await res.text().catch(() => ""));
      }
    },

    async postControl(cmd) {
      try {
        const res = await doFetch(`${opts.baseUrl}/chat-control`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-ingest-secret": opts.secret },
          body: JSON.stringify(cmd),
        });
        const body = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok && res.status !== 403 && res.status !== 409) {
          opts.onError?.(res.status, JSON.stringify(body));
        }
        return { status: res.status, body };
      } catch (err) {
        opts.onError?.(0, err instanceof Error ? err.message : String(err));
        return { status: 0, body: null };
      }
    },
  };
}
