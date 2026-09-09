import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { courseSchema, holeSchema } from "./schema";
import type { Course, Hole } from "./schema";

export function parseHole(data: unknown): Hole {
  return holeSchema.parse(data);
}

export function parseCourse(data: unknown): Course {
  return courseSchema.parse(data);
}

export async function loadHoleFile(path: string): Promise<Hole> {
  return parseHole(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export async function loadCourseFile(path: string): Promise<Course> {
  return parseCourse(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export interface ResolvedCourse extends Course {
  resolvedHoles: Hole[];
}

/**
 * Load a course file and every hole it references from `holesDir`
 * (`<holesDir>/<holeId>.json`).
 */
export async function loadCourseWithHoles(
  courseFile: string,
  holesDir: string,
): Promise<ResolvedCourse> {
  const course = await loadCourseFile(courseFile);
  const resolvedHoles: Hole[] = [];
  for (const holeId of course.holes) {
    resolvedHoles.push(await loadHoleFile(join(holesDir, `${holeId}.json`)));
  }
  return { ...course, resolvedHoles };
}
