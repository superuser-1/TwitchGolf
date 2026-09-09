import { readRuntimeConfig } from "./config";
import { resolveIdentity } from "./twitch";
import type { Identity } from "./twitch";

interface ChannelConfig {
  defaultCourseId: string;
  roundSeconds: number;
  maxRoundsPerHole: number;
  allowDragInput: boolean;
}
interface ConfigResponse {
  config: ChannelConfig;
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
  const status = el<HTMLDivElement>("status");

  const res = await fetch(`${cfg.ebsUrl}/config`, {
    headers: { authorization: `Bearer ${identity.token}` },
  });
  if (!res.ok) {
    app.textContent = `could not load config (${res.status})`;
    return;
  }
  const data = (await res.json()) as ConfigResponse;

  app.innerHTML = "";
  const courseSel = document.createElement("select");
  for (const c of data.courses) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.id})`;
    if (c.id === data.config.defaultCourseId) opt.selected = true;
    courseSel.append(opt);
  }
  const roundInput = numberInput(data.config.roundSeconds, 10, 180);
  const capInput = numberInput(data.config.maxRoundsPerHole, 2, 15);
  const dragInput = document.createElement("input");
  dragInput.type = "checkbox";
  dragInput.checked = data.config.allowDragInput ?? true;

  app.append(
    labelled("Default course", courseSel),
    labelled("Round length (seconds)", roundInput),
    labelled("Max rounds per hole", capInput),
    labelled("Allow drag-to-aim on the overlay (chat always works)", dragInput),
  );

  const save = document.createElement("button");
  save.textContent = "Save";
  save.onclick = async () => {
    status.textContent = "saving…";
    const put = await fetch(`${cfg.ebsUrl}/config`, {
      method: "PUT",
      headers: { authorization: `Bearer ${identity.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        defaultCourseId: courseSel.value,
        roundSeconds: Number(roundInput.value),
        maxRoundsPerHole: Number(capInput.value),
        allowDragInput: dragInput.checked,
      }),
    });
    status.textContent = put.ok ? "saved ✓" : `save failed (${put.status})`;
  };
  app.append(save);
  identityNote(identity, app);
}

function numberInput(value: number, min: number, max: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  return input;
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = text;
  wrap.append(label, control);
  return wrap;
}

function identityNote(identity: Identity, app: HTMLElement): void {
  const note = document.createElement("p");
  note.style.cssText = "font-size:12px;color:#868e96;margin-top:16px";
  note.textContent = `channel ${identity.channelId} · role ${identity.role}`;
  app.append(note);
}

void boot();
