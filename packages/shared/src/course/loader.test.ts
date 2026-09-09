import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadCourseWithHoles } from "./loader";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const coursesDir = resolve(repoRoot, "courses");

describe("loadCourseWithHoles", () => {
  it("loads the practice course and resolves its holes", async () => {
    const course = await loadCourseWithHoles(
      resolve(coursesDir, "practice.json"),
      resolve(coursesDir, "holes"),
    );

    expect(course.id).toBe("practice");
    expect(course.resolvedHoles.map((h) => h.id)).toEqual(["practice-1", "practice-2"]);
    expect(course.resolvedHoles[1]?.surfaces.length).toBeGreaterThan(0);
    expect(course.resolvedHoles[1]?.obstacles[0]?.kind).toBe("windmill");
  });

  it("every shipped course file validates and resolves", async () => {
    const files = (await readdir(coursesDir)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const course = await loadCourseWithHoles(
        resolve(coursesDir, file),
        resolve(coursesDir, "holes"),
      );
      expect(course.resolvedHoles.length).toBe(course.holes.length);
      for (const hole of course.resolvedHoles) {
        expect(hole.par).toBeGreaterThan(0);
        expect(hole.tee.x).toBeGreaterThanOrEqual(0);
        expect(hole.cup.radius).toBeGreaterThan(0);
      }
    }
  });
});
