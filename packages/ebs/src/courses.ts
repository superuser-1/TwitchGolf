import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCourseWithHoles } from "@twitch-golf/shared/node";
import type { ResolvedCourse } from "@twitch-golf/shared/node";

const here = dirname(fileURLToPath(import.meta.url));
const defaultCoursesDir = resolve(here, "../../../courses");

export interface CourseRegistry {
  get(id: string): ResolvedCourse | undefined;
  list(): { id: string; name: string; holes: number }[];
}

export async function loadCourseRegistry(coursesDir = defaultCoursesDir): Promise<CourseRegistry> {
  const holesDir = join(coursesDir, "holes");
  const files = (await readdir(coursesDir)).filter((f) => f.endsWith(".json"));

  const byId = new Map<string, ResolvedCourse>();
  for (const file of files) {
    const course = await loadCourseWithHoles(join(coursesDir, file), holesDir);
    byId.set(course.id, course);
  }

  return {
    get: (id) => byId.get(id),
    list: () =>
      [...byId.values()].map((c) => ({ id: c.id, name: c.name, holes: c.resolvedHoles.length })),
  };
}
