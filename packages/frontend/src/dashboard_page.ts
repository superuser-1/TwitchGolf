// Broadcaster live dashboard. Fleshed out in phase 8; this keeps the bundle entry valid.
import { readRuntimeConfig } from "./config";
import { resolveIdentity } from "./twitch";

async function boot(): Promise<void> {
  const cfg = readRuntimeConfig();
  const identity = await resolveIdentity(cfg);
  const pre = document.getElementById("out");
  if (pre)
    pre.textContent = `channel ${identity.channelId} · role ${identity.role}\n(dashboard UI: phase 8)`;
}

void boot();
