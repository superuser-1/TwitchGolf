import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { TournamentDef } from "./game/tournament";

const here = dirname(fileURLToPath(import.meta.url));
const defaultDir = resolve(here, "../../../tournaments");

const schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  courses: z.array(z.string().min(1)).min(1),
  scoring: z.literal("stroke-play").default("stroke-play"),
});

export interface TournamentRegistry {
  get(id: string): TournamentDef | undefined;
  list(): { id: string; name: string; courses: number }[];
}

export async function loadTournamentRegistry(dir = defaultDir): Promise<TournamentRegistry> {
  const byId = new Map<string, TournamentDef>();
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const file of files) {
    const parsed = schema.parse(JSON.parse(await readFile(join(dir, file), "utf8")));
    byId.set(parsed.id, { id: parsed.id, name: parsed.name, courseIds: parsed.courses });
  }
  return {
    get: (id) => byId.get(id),
    list: () =>
      [...byId.values()].map((t) => ({ id: t.id, name: t.name, courses: t.courseIds.length })),
  };
}
