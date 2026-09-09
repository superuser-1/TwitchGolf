export interface RuntimeConfig {
  /** true when not running inside the Twitch extension iframe. */
  dev: boolean;
  channel: string;
  ebsUrl: string;
  wsUrl: string;
  /** Dev only: role to claim and whether to run without identity. */
  role: string;
  userId: string;
  anon: boolean;
}

export function readRuntimeConfig(): RuntimeConfig {
  const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  // Dev mode: explicit ?dev=1, any dev override param, or no Twitch helper at all.
  // (The Twitch helper script can be present on a plain page without a real
  // extension context, so its presence alone is not a reliable signal.)
  const dev =
    q.get("dev") === "1" ||
    q.has("ebs") ||
    q.has("ws") ||
    q.has("role") ||
    q.has("user") ||
    typeof window === "undefined" ||
    !window.Twitch?.ext;
  return {
    dev,
    channel: q.get("channel") ?? "dev-channel",
    ebsUrl: q.get("ebs") ?? "http://127.0.0.1:8081",
    wsUrl: q.get("ws") ?? "ws://127.0.0.1:8082",
    role: q.get("role") ?? "viewer",
    userId: q.get("user") ?? `dev-${q.get("role") ?? "viewer"}`,
    anon: q.get("anon") === "1",
  };
}
