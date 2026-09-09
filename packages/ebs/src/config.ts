import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8081),
  HOST: z.string().default("127.0.0.1"),

  /** Shared secret the ingest service presents on POST /command. */
  INGEST_SECRET: z.string().default("dev-ingest-secret"),

  /** Base64 Twitch extension secret used to verify frontend JWTs. */
  TWITCH_EXT_SECRET: z.string().default(""),
  /** Twitch extension client id (needed only for real PubSub, phase 9). */
  TWITCH_EXT_CLIENT_ID: z.string().default(""),
  TWITCH_OWNER_ID: z.string().default(""),

  /** "1" => use the local mock broadcaster + accept dev JWTs. */
  TWITCH_MOCK: z.string().default("1"),
  MOCK_PUBSUB_PORT: z.coerce.number().int().positive().default(8082),

  ROUND_SECONDS: z.coerce.number().positive().default(30),
  MAX_ROUNDS_PER_HOLE: z.coerce.number().int().positive().default(8),
  HOLE_INTRO_SECONDS: z.coerce.number().nonnegative().default(4),
  RESULT_SECONDS: z.coerce.number().nonnegative().default(4),
  HOLE_COMPLETE_SECONDS: z.coerce.number().nonnegative().default(6),

  DEFAULT_COURSE_ID: z.string().default("practice"),
  COURSES_DIR: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  port: number;
  host: string;
  ingestSecret: string;
  twitchExtSecret: string;
  twitchClientId: string;
  twitchOwnerId: string;
  mock: boolean;
  mockPubsubPort: number;
  defaultCourseId: string;
  coursesDir: string;
  timing: GameTimingConfig;
}

export interface GameTimingConfig {
  roundSeconds: number;
  maxRoundsPerHole: number;
  holeIntroSeconds: number;
  resultSeconds: number;
  holeCompleteSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  return {
    port: e.PORT,
    host: e.HOST,
    ingestSecret: e.INGEST_SECRET,
    twitchExtSecret: e.TWITCH_EXT_SECRET,
    twitchClientId: e.TWITCH_EXT_CLIENT_ID,
    twitchOwnerId: e.TWITCH_OWNER_ID,
    mock: e.TWITCH_MOCK === "1" || e.TWITCH_EXT_SECRET === "",
    mockPubsubPort: e.MOCK_PUBSUB_PORT,
    defaultCourseId: e.DEFAULT_COURSE_ID,
    coursesDir: e.COURSES_DIR,
    timing: {
      roundSeconds: e.ROUND_SECONDS,
      maxRoundsPerHole: e.MAX_ROUNDS_PER_HOLE,
      holeIntroSeconds: e.HOLE_INTRO_SECONDS,
      resultSeconds: e.RESULT_SECONDS,
      holeCompleteSeconds: e.HOLE_COMPLETE_SECONDS,
    },
  };
}
