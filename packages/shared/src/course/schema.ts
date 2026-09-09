import { z } from "zod";

/**
 * Course & hole definition schema. Pure (browser-safe) — no filesystem access.
 * See `docs/DESIGN.md` §7 for the format rationale.
 */

const finite = () => z.number().finite();

export const vec2Schema = z.object({ x: finite(), y: finite() });

export const circleShapeSchema = z.object({
  kind: z.literal("circle"),
  x: finite(),
  y: finite(),
  r: z.number().positive(),
});

export const rectShapeSchema = z.object({
  kind: z.literal("rect"),
  x: finite(),
  y: finite(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const polygonShapeSchema = z.object({
  kind: z.literal("polygon"),
  points: z.array(z.tuple([finite(), finite()])).min(3),
});

export const shapeSchema = z.discriminatedUnion("kind", [
  circleShapeSchema,
  rectShapeSchema,
  polygonShapeSchema,
]);

export const surfaceTypeSchema = z.enum(["fairway", "green", "sand", "water", "slope"]);

export const surfaceSchema = z
  .object({
    type: surfaceTypeSchema,
    shape: shapeSchema,
    /** Acceleration vector (field units/s^2) applied while a ball is over a slope. */
    accel: vec2Schema.optional(),
  })
  .superRefine((surface, ctx) => {
    if (surface.type === "slope" && surface.accel === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a 'slope' surface requires an 'accel' vector",
        path: ["accel"],
      });
    }
  });

export const wallSchema = z.object({
  x1: finite(),
  y1: finite(),
  x2: finite(),
  y2: finite(),
});

export const obstacleSchema = z.object({
  kind: z.literal("windmill"),
  x: finite(),
  y: finite(),
  radius: z.number().positive(),
  /** Seconds for one full revolution. */
  period: z.number().positive(),
  /** Starting phase in radians. */
  phase: finite().default(0),
});

export const holePhysicsSchema = z
  .object({
    restitution: z.number().min(0).max(1).optional(),
    /** Wind acceleration (units/s^2) at wind.power = 100. Defaults to 1.6. */
    windScale: z.number().nonnegative().optional(),
    decel: z
      .object({
        fairway: z.number().positive().optional(),
        green: z.number().positive().optional(),
        sand: z.number().positive().optional(),
        water: z.number().positive().optional(),
      })
      .optional(),
  })
  .optional();

/** Wind on a hole: `angle` (degrees, the way the wind blows) + `power` 0..100. */
export const windSchema = z.object({
  angle: finite(),
  power: z.number().min(0).max(100),
});

export const holeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.object({ w: z.number().positive(), h: z.number().positive() }),
    par: z.number().int().positive(),
    tee: vec2Schema,
    cup: z.object({ x: finite(), y: finite(), radius: z.number().positive() }),
    surfaces: z.array(surfaceSchema).default([]),
    walls: z.array(wallSchema).default([]),
    obstacles: z.array(obstacleSchema).default([]),
    wind: windSchema.optional(),
    physics: holePhysicsSchema,
  })
  .superRefine((hole, ctx) => {
    const inField = (x: number, y: number) =>
      x >= 0 && y >= 0 && x <= hole.size.w && y <= hole.size.h;
    if (!inField(hole.tee.x, hole.tee.y)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tee is outside the field",
        path: ["tee"],
      });
    }
    if (!inField(hole.cup.x, hole.cup.y)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cup is outside the field",
        path: ["cup"],
      });
    }
  });

export const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  holes: z.array(z.string().min(1)).min(1),
});

export type CircleShape = z.infer<typeof circleShapeSchema>;
export type RectShape = z.infer<typeof rectShapeSchema>;
export type PolygonShape = z.infer<typeof polygonShapeSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type SurfaceType = z.infer<typeof surfaceTypeSchema>;
export type Surface = z.infer<typeof surfaceSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Obstacle = z.infer<typeof obstacleSchema>;
export type HolePhysics = z.infer<typeof holePhysicsSchema>;
export type Wind = z.infer<typeof windSchema>;
export type Hole = z.infer<typeof holeSchema>;
export type Course = z.infer<typeof courseSchema>;
