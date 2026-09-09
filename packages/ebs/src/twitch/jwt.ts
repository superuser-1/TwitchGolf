import jwt from "jsonwebtoken";

export type ViewerRole = "broadcaster" | "moderator" | "viewer" | "external";

export interface ExtensionIdentity {
  channelId: string;
  /** Present only when the viewer granted identity. */
  userId?: string;
  opaqueUserId: string;
  role: ViewerRole;
}

interface TwitchJwtClaims {
  channel_id: string;
  user_id?: string;
  opaque_user_id: string;
  role: string;
  exp: number;
}

function normaliseRole(role: string): ViewerRole {
  return role === "broadcaster" || role === "moderator" || role === "viewer" || role === "external"
    ? role
    : "viewer";
}

/**
 * Verify a Twitch extension JWT. The extension secret is base64. In mock mode
 * an unsigned dev token (`base64url(JSON)` with `alg: "none"`) is also accepted.
 */
export function verifyExtensionJwt(
  token: string,
  base64Secret: string,
  { allowDevTokens = false }: { allowDevTokens?: boolean } = {},
): ExtensionIdentity {
  if (base64Secret) {
    const decoded = jwt.verify(token, Buffer.from(base64Secret, "base64")) as TwitchJwtClaims;
    return toIdentity(decoded);
  }
  if (allowDevTokens) return toIdentity(decodeDevToken(token));
  throw new Error("no extension secret configured and dev tokens are disabled");
}

function toIdentity(c: TwitchJwtClaims): ExtensionIdentity {
  if (!c.channel_id || !c.opaque_user_id) throw new Error("missing channel_id / opaque_user_id");
  return {
    channelId: c.channel_id,
    userId: c.user_id,
    opaqueUserId: c.opaque_user_id,
    role: normaliseRole(c.role),
  };
}

function decodeDevToken(token: string): TwitchJwtClaims {
  // Accept a raw JSON object or a JWT-shaped `header.payload.sig` string.
  const payload = token.includes(".") ? (token.split(".")[1] ?? "") : token;
  const json = Buffer.from(payload, "base64url").toString("utf8");
  const obj = JSON.parse(json) as Partial<TwitchJwtClaims>;
  return {
    channel_id: obj.channel_id ?? "dev-channel",
    user_id: obj.user_id,
    opaque_user_id: obj.opaque_user_id ?? `U${obj.user_id ?? "anon"}`,
    role: obj.role ?? "viewer",
    exp: obj.exp ?? Math.floor(Date.now() / 1000) + 3600,
  };
}

/** Mint a dev token for local testing (never used against real Twitch). */
export function makeDevToken(claims: Partial<TwitchJwtClaims>): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}
