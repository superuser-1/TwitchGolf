import type { RuntimeConfig } from "./config";

export interface Identity {
  token: string;
  channelId: string;
  userId: string | null;
  role: string;
  hasIdentity: boolean;
}

function devToken(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Resolve the viewer's identity + an EBS auth token, from Twitch or dev query params. */
export function resolveIdentity(cfg: RuntimeConfig): Promise<Identity> {
  if (!cfg.dev && window.Twitch?.ext) {
    const ext = window.Twitch.ext;
    return new Promise((resolve) => {
      ext.onAuthorized((auth) => {
        resolve({
          token: auth.token,
          channelId: auth.channelId,
          userId: ext.viewer?.id ?? null,
          role: ext.viewer?.role ?? "viewer",
          hasIdentity: Boolean(ext.viewer?.isLinked && ext.viewer.id),
        });
      });
    });
  }

  const withId = !cfg.anon;
  return Promise.resolve({
    token: devToken({
      channel_id: cfg.channel,
      role: cfg.role,
      user_id: withId ? cfg.userId : undefined,
      opaque_user_id: `U${withId ? cfg.userId : "anon"}`,
    }),
    channelId: cfg.channel,
    userId: withId ? cfg.userId : null,
    role: cfg.role,
    hasIdentity: withId,
  });
}

export function requestIdentityShare(): void {
  window.Twitch?.ext.actions?.requestIdShare();
}
