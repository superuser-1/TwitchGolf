import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { Clock } from "../clock";
import type { AppConfig } from "../config";
import type { CourseRegistry } from "../courses";
import { FreeGate } from "../entry/gate";
import type { EntryGate } from "../entry/gate";
import type { GameManager } from "../game/manager";
import type { Store } from "../store/types";
import type { TournamentRegistry } from "../tournaments";
import { verifyExtensionJwt } from "../twitch/jwt";
import type { ExtensionIdentity } from "../twitch/jwt";

export interface ServerDeps {
  config: AppConfig;
  manager: GameManager;
  courses: CourseRegistry;
  tournaments?: TournamentRegistry;
  store?: Store;
  gate?: EntryGate;
  /** Time source for the swing rate limiter (defaults to wall clock). */
  clock?: Clock;
}

const commandBody = z.object({
  channelId: z.string().min(1),
  userId: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1).optional(),
  angle: z.number(),
  power: z.number(),
});

const controlActions = ["start", "start-tournament", "stop", "skip-round"] as const;

const controlBody = z.object({
  action: z.enum(controlActions),
  courseId: z.string().min(1).optional(),
  tournamentId: z.string().min(1).optional(),
});

const chatControlBody = z.object({
  channelId: z.string().min(1),
  userId: z.string().min(1),
  login: z.string().min(1),
  isMod: z.boolean().default(false),
  isBroadcaster: z.boolean().default(false),
  action: z.enum(controlActions),
  courseId: z.string().min(1).optional(),
  tournamentId: z.string().min(1).optional(),
});

const configBody = z.object({
  defaultCourseId: z.string().min(1),
  roundSeconds: z.number().int().min(10).max(180),
  maxRoundsPerHole: z.number().int().min(2).max(15),
  allowDragInput: z.boolean().default(true),
});

const swingBody = z.object({
  angle: z.number(),
  power: z.number(),
  displayName: z.string().min(1).max(60).optional(),
});

/** Minimum ms between accepted overlay swings from one viewer (anti-spam). */
const SWING_RATE_MS = 400;

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

interface ControlRequest {
  action: (typeof controlActions)[number];
  courseId?: string;
  tournamentId?: string;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const { config, manager, courses } = deps;
  const gate: EntryGate = deps.gate ?? new FreeGate();
  const lastSwingAt = new Map<string, number>();

  const resolveDefaultCourse = (channelId: string): string =>
    deps.store?.getChannelConfig(channelId)?.defaultCourseId ?? config.defaultCourseId;

  const dispatchControl = (
    channelId: string,
    body: ControlRequest,
  ): { code: number; payload: unknown } => {
    if (body.action === "start") {
      const result = manager.start(channelId, body.courseId ?? resolveDefaultCourse(channelId));
      return { code: result.ok ? 200 : 409, payload: result };
    }
    if (body.action === "start-tournament") {
      if (!body.tournamentId) {
        return { code: 400, payload: { ok: false, reason: "tournamentId required" } };
      }
      const result = manager.startTournament(channelId, body.tournamentId);
      return { code: result.ok ? 200 : 409, payload: result };
    }
    if (body.action === "stop") {
      return { code: 200, payload: { ok: manager.stop(channelId) } };
    }
    const game = manager.get(channelId);
    if (!game) return { code: 404, payload: { ok: false, reason: "no-game" } };
    return { code: 200, payload: game.skipRound() };
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AuthError) return reply.code(401).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues });
    reply.code(500).send({ error: "internal" });
  });

  // The extension frontend is served from a different origin; allow it through.
  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-headers", "authorization,content-type,x-ingest-secret");
    reply.header("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/courses", async () => ({ courses: courses.list() }));

  app.get("/tournaments", async () => ({ tournaments: deps.tournaments?.list() ?? [] }));

  app.get("/leaderboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    return reply.send({ players: deps.store?.topPlayers(id.channelId, 20) ?? [] });
  });

  app.get("/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    const q = req.query as { user?: string };
    const target = q.user ?? id.userId;
    if (!target) return reply.send({ stats: null });
    return reply.send({ stats: deps.store?.getPlayerStats(id.channelId, target) ?? null });
  });

  app.get("/session", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    const game = manager.get(id.channelId);
    const live = game && !game.isFinished ? game : null;
    return reply.send({
      role: id.role,
      hasIdentity: Boolean(id.userId),
      isPlayer: Boolean(id.userId && live?.isPlayer(id.userId)),
      myBallId: id.userId ? (live?.ballIdFor(id.userId) ?? null) : null,
      allowDragInput: deps.store?.getChannelConfig(id.channelId)?.allowDragInput ?? true,
      game: live ? live.snapshot() : null,
    });
  });

  app.get("/config", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    if (id.role !== "broadcaster" && id.role !== "moderator") {
      return reply.code(403).send({ error: "broadcaster or moderator only" });
    }
    const stored = deps.store?.getChannelConfig(id.channelId);
    return reply.send({
      config: stored ?? {
        defaultCourseId: config.defaultCourseId,
        roundSeconds: config.timing.roundSeconds,
        maxRoundsPerHole: config.timing.maxRoundsPerHole,
        allowDragInput: true,
      },
      courses: courses.list(),
      tournaments: deps.tournaments?.list() ?? [],
    });
  });

  app.put("/config", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    if (id.role !== "broadcaster") {
      return reply.code(403).send({ error: "broadcaster only" });
    }
    const body = configBody.parse(req.body);
    if (!courses.get(body.defaultCourseId)) {
      return reply.code(400).send({ ok: false, reason: "unknown-course" });
    }
    deps.store?.setChannelConfig(id.channelId, body);
    return reply.send({ ok: true, config: body });
  });

  app.post("/control", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    const gated = gate.authorizeStart({
      channelId: id.channelId,
      userId: id.userId ?? null,
      role: id.role,
    });
    if (!gated.ok) return reply.code(403).send({ ok: false, reason: gated.reason });

    const body = controlBody.parse(req.body);
    const { code, payload } = dispatchControl(id.channelId, body);
    return reply.code(code).send(payload);
  });

  app.post("/chat-control", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers["x-ingest-secret"] !== config.ingestSecret) {
      return reply.code(401).send({ error: "bad ingest secret" });
    }
    const body = chatControlBody.parse(req.body);
    const role = body.isBroadcaster ? "broadcaster" : body.isMod ? "moderator" : "viewer";
    const gated = gate.authorizeStart({ channelId: body.channelId, userId: body.userId, role });
    if (!gated.ok) return reply.code(403).send({ ok: false, reason: gated.reason });

    const { code, payload } = dispatchControl(body.channelId, body);
    return reply.code(code).send(payload);
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

  // Drag-to-aim swing submitted straight from the overlay, authenticated by the
  // viewer's Twitch JWT. Same authoritative round as chat (last valid wins).
  app.post("/swing", async (req: FastifyRequest, reply: FastifyReply) => {
    const id = identityFrom(req, config);
    if (!id.userId) {
      return reply.code(403).send({ ok: false, reason: "identity-required" });
    }
    const body = swingBody.parse(req.body);

    const key = `${id.channelId}:${id.userId}`;
    const now = deps.clock?.now() ?? Date.now();
    const last = lastSwingAt.get(key);
    if (last !== undefined && now - last < SWING_RATE_MS) {
      return reply.code(429).send({ ok: false, reason: "too-fast" });
    }
    lastSwingAt.set(key, now);

    const game = manager.get(id.channelId);
    if (!game || game.isFinished) return reply.code(404).send({ ok: false, reason: "no-game" });

    const result = game.submit(
      id.userId,
      id.userId,
      body.displayName ?? id.userId,
      body.angle,
      body.power,
    );
    return reply.code(result.ok ? 200 : 409).send(result);
  });

  return app;
}
