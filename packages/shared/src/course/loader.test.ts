import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadCourseWithHoles } from "./loader";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

describe("loadCourseWithHoles", () => {
  it("loads the practice course and resolves its holes", async () => {
    const course = await loadCourseWithHoles(
      resolve(repoRoot, "courses/practice.json"),
      resolve(repoRoot, "courses/holes"),
    );

    expect(course.id).toBe("practice");
    expect(course.resolvedHoles.map((h) => h.id)).toEqual(["practice-1", "practice-2"]);
    expect(course.resolvedHoles[1]?.surfaces.length).toBeGreaterThan(0);
    expect(course.resolvedHoles[1]?.obstacles[0]?.kind).toBe("windmill");
  });
});
