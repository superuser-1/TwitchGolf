import { loadConfig } from "./config";
import { createEbsClient } from "./ebs-client";
import { CommandPipeline } from "./pipeline";
import { LocalChatSource } from "./sources/local";
import { TwitchChatSource } from "./sources/twitch";
import type { ChatSource } from "./sources/types";

async function main(): Promise<void> {
  const config = loadConfig();
  const ebs = createEbsClient({
    baseUrl: config.EBS_URL,
    secret: config.INGEST_SECRET,
    onError: (status, body) => console.error(`[ingest] EBS error ${status}: ${body}`),
  });

  const pipeline = new CommandPipeline({
    forward: (cmd) => ebs.postCommand(cmd),
    userRateMs: config.USER_RATE_MS,
  });

  let source: ChatSource;
  if (config.SOURCE === "twitch") {
    if (!config.TWITCH_CHANNEL) throw new Error("SOURCE=twitch requires TWITCH_CHANNEL");
    source = new TwitchChatSource({
      channel: config.TWITCH_CHANNEL,
      fallbackChannelId: config.CHANNEL_ID,
    });
    console.log(`[ingest] reading #${config.TWITCH_CHANNEL} -> ${config.EBS_URL}`);
  } else {
    source = new LocalChatSource({ channelId: config.CHANNEL_ID });
    console.log(`[ingest] reading stdin (channel ${config.CHANNEL_ID}) -> ${config.EBS_URL}`);
    console.log(`[ingest] type e.g.  alice: !70, 50`);
  }

  source.onMessage((msg) => void pipeline.handle(msg));
  await source.start();

  const shutdown = () => void source.stop().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
