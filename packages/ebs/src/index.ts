import { systemClock } from "./clock";
import { loadConfig } from "./config";
import { loadCourseRegistry } from "./courses";
import { GameManager } from "./game/manager";
import { buildServer } from "./http/server";
import { MockPubSub, NoopBroadcaster } from "./twitch/pubsub";
import type { Broadcaster } from "./twitch/pubsub";

async function main(): Promise<void> {
  const config = loadConfig();
  const courses = await loadCourseRegistry(config.coursesDir || undefined);

  let broadcaster: Broadcaster;
  if (config.mock) {
    const mock = new MockPubSub(config.mockPubsubPort, config.host);
    broadcaster = mock;
    console.log(`[ebs] mock PubSub on ws://${config.host}:${config.mockPubsubPort}`);
  } else {
    // Real Twitch PubSub is wired in phase 9.
    broadcaster = new NoopBroadcaster();
    console.warn("[ebs] no mock + no real broadcaster: messages are dropped");
  }

  const manager = new GameManager({
    clock: systemClock,
    timing: config.timing,
    broadcaster,
    courses,
  });

  const app = buildServer({ config, manager, courses });
  await app.listen({ port: config.port, host: config.host });
  console.log(
    `[ebs] http://${config.host}:${config.port}  courses: ${courses
      .list()
      .map((c) => c.id)
      .join(", ")}`,
  );

  const shutdown = () => {
    manager.stopAll();
    void broadcaster.close();
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
