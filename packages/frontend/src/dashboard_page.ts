import { readRuntimeConfig } from "./config";
import { resolveIdentity } from "./twitch";

interface ConfigResponse {
  courses: { id: string; name: string }[];
  tournaments: { id: string; name: string }[];
}

const cfg = readRuntimeConfig();

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

async function boot(): Promise<void> {
  const identity = await resolveIdentity(cfg);
  const app = el<HTMLDivElement>("app");
  const phase = el<HTMLDivElement>("phase");
  const status = el<HTMLDivElement>("status");
  const auth = { authorization: `Bearer ${identity.token}` };

  const listRes = await fetch(`${cfg.ebsUrl}/config`, { headers: auth });
  if (!listRes.ok) {
    app.textContent = `not authorized (${listRes.status})`;
    return;
  }
  const lists = (await listRes.json()) as ConfigResponse;

  const control = async (body: Record<string, unknown>) => {
    status.textContent = "…";
    const res = await fetch(`${cfg.ebsUrl}/control`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    status.textContent = json.ok ? "ok ✓" : `failed: ${json.reason ?? res.status}`;
  };

  app.innerHTML = "";

  const courseSel = selectFrom(lists.courses);
  app.append(
    row(
      courseSel,
      button("Start course", () => control({ action: "start", courseId: courseSel.value })),
    ),
  );

  if (lists.tournaments.length) {
    const tourSel = selectFrom(lists.tournaments);
    app.append(
      row(
        tourSel,
        button("Start tournament", () =>
          control({ action: "start-tournament", tournamentId: tourSel.value }),
        ),
      ),
    );
  }

  app.append(
    row(
      button("Skip round", () => control({ action: "skip-round" }), true),
      button("Stop game", () => control({ action: "stop" }), true),
    ),
  );

  const poll = async () => {
    try {
      const res = await fetch(`${cfg.ebsUrl}/session`, { headers: auth });
      const s = (await res.json()) as {
        game: { phase: string; holeIndex: number; holeCount: number } | null;
      };
      phase.textContent = s.game
        ? `phase: ${s.game.phase} · hole ${s.game.holeIndex + 1}/${s.game.holeCount}`
        : "no game running";
    } catch {
      phase.textContent = "ebs unreachable";
    }
  };
  void poll();
  setInterval(() => void poll(), 3000);
}

function selectFrom(items: { id: string; name: string }[]): HTMLSelectElement {
  const sel = document.createElement("select");
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    sel.append(opt);
  }
  return sel;
}

function button(text: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  if (secondary) b.className = "secondary";
  b.onclick = onClick;
  return b;
}

function row(...children: HTMLElement[]): HTMLElement {
  const div = document.createElement("div");
  div.className = "row";
  div.append(...children);
  return div;
}

void boot();
