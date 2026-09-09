import { z } from "zod";

const envSchema = z.object({
  EBS_URL: z.string().default("http://127.0.0.1:8081"),
  INGEST_SECRET: z.string().default("dev-ingest-secret"),

  /** "twitch" reads live chat anonymously; "local" reads stdin. */
  SOURCE: z.enum(["twitch", "local"]).default("local"),

  /** Twitch login of the channel to join (SOURCE=twitch). */
  TWITCH_CHANNEL: z.string().default(""),
  /** Channel id used for the local source and as a fallback. */
  CHANNEL_ID: z.string().default("dev-channel"),

  /** Minimum ms between accepted commands from one user. */
  USER_RATE_MS: z.coerce.number().nonnegative().default(1000),
});

export type IngestConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestConfig {
  return envSchema.parse(env);
}
