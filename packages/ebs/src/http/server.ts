import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppConfig } from "../config";
import type { CourseRegistry } from "../courses";
import type { GameManager } from "../game/manager";
import { verifyExtensionJwt } from "../twitch/jwt";
import type { ExtensionIdentity } from "../twitch/jwt";

export interface ServerDeps {
  config: AppConfig;
  manager: GameManager;
  courses: CourseRegistry;
}

const commandBody = z.object({
  channelId: z.string().min(1),
  userId: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1).optional(),
  angle: z.number(),
  power: z.number(),
});

const controlBody = z.object({
  action: z.enum(["start", "stop", "skip-round"]),
  courseId: z.string().min(1).optional(),
});

function identityFrom(req: FastifyRequest, config: AppConfig): ExtensionIdentity {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) throw new AuthError("missing bearer token");
  try {
    return verifyExtensionJwt(token, config.twitchExtSecret, { allowDevTokens: config.mock });
  } catch (err) {
    throw new AuthError(err instanceof Error ? err.message : "invalid token");
  }
}

class AuthError extends Error {}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const { config, manager, courses } = deps;

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AuthError) return reply.code(401).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues });
    reply.code(500).send({ error: "internal" });
  });

  // The extension frontend is served from a different origin; allow it through.
  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-headers", "authorization,content-type,x-ingest-secret");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/courses", async () => ({ courses: courses.list() }));

  app.get("/session", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    const game = manager.get(id.channelId);
    const live = game && !game.isFinished ? game : null;
    return reply.send({
      role: id.role,
      hasIdentity: Boolean(id.userId),
      isPlayer: Boolean(id.userId && live?.isPlayer(id.userId)),
      myBallId: id.userId ? (live?.ballIdFor(id.userId) ?? null) : null,
      game: live ? live.snapshot() : null,
    });
  });

  app.post("/control", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    if (id.role !== "broadcaster" && id.role !== "moderator") {
      return reply.code(403).send({ error: "broadcaster or moderator only" });
    }
    const body = controlBody.parse(req.body);

    if (body.action === "start") {
      const result = manager.start(id.channelId, body.courseId ?? config.defaultCourseId);
      return reply.code(result.ok ? 200 : 409).send(result);
    }
    if (body.action === "stop") {
      return reply.send({ ok: manager.stop(id.channelId) });
    }
    const game = manager.get(id.channelId);
    if (!game) return reply.code(404).send({ ok: false, reason: "no-game" });
    return reply.send(game.skipRound());
  });

  app.post("/command", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers["x-ingest-secret"] !== config.ingestSecret) {
      return reply.code(401).send({ error: "bad ingest secret" });
    }
    const body = commandBody.parse(req.body);
    const game = manager.get(body.channelId);
    if (!game || game.isFinished) return reply.code(404).send({ ok: false, reason: "no-game" });

    const result = game.submit(
      body.userId,
      body.login,
      body.displayName ?? body.login,
      body.angle,
      body.power,
    );
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  return app;
}
