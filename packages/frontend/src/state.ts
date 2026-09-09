import type { BroadcastMsg, Hole, StandingsRow } from "@twitch-golf/shared";

import type { SessionResponse } from "./net";

export interface ClientBall {
  id: number;
  name: string;
  x: number;
  y: number;
  strokes: number;
  sunk: boolean;
}

export interface ClientState {
  connected: boolean;
  role: string;
  hasIdentity: boolean;
  isPlayer: boolean;
  myBallId: number | null;

  phase: string;
  holeIndex: number;
  holeCount: number;
  par: number;
  roundNumber: number;
  /** ms epoch when the open round closes, or null. */
  roundClosesAt: number | null;
  hole: Hole | null;
  balls: Map<number, ClientBall>;
  standings: StandingsRow[];

  /** Show every ball (post-hole reveal) until this ms epoch. */
  revealAllUntil: number;
}

export function initialState(): ClientState {
  return {
    connected: false,
    role: "viewer",
    hasIdentity: false,
    isPlayer: false,
    myBallId: null,
    phase: "idle",
    holeIndex: 0,
    holeCount: 0,
    par: 3,
    roundNumber: 0,
    roundClosesAt: null,
    hole: null,
    balls: new Map(),
    standings: [],
    revealAllUntil: 0,
  };
}

interface GameSnapshot {
  holeIndex: number;
  holeCount: number;
  par: number;
  roundNumber: number;
  phase: string;
  roundClosesAt: number | null;
  hole: Hole;
  balls: { id: number; name: string; x?: number; y?: number; strokes: number; sunk: boolean }[];
  standings: StandingsRow[];
}

/** Apply a fresh GET /session payload (authoritative reset). */
export function applySession(state: ClientState, session: SessionResponse): ClientState {
  const next: ClientState = {
    ...state,
    role: session.role,
    hasIdentity: session.hasIdentity,
    isPlayer: session.isPlayer,
    myBallId: session.myBallId,
  };
  const game = session.game as GameSnapshot | null;
  if (!game) {
    next.phase = "idle";
    next.hole = null;
    next.balls = new Map();
    next.standings = [];
    return next;
  }
  next.phase = game.phase;
  next.holeIndex = game.holeIndex;
  next.holeCount = game.holeCount;
  next.par = game.par;
  next.roundNumber = game.roundNumber;
  next.roundClosesAt = game.roundClosesAt;
  next.hole = game.hole;
  next.standings = game.standings;
  next.balls = new Map(
    game.balls.map((b) => {
      const prev = state.balls.get(b.id);
      return [
        b.id,
        {
          id: b.id,
          name: b.name,
          x: b.x ?? prev?.x ?? game.hole.tee.x,
          y: b.y ?? prev?.y ?? game.hole.tee.y,
          strokes: b.strokes,
          sunk: b.sunk,
        },
      ];
    }),
  );
  return next;
}

/**
 * Apply a broadcast message. Ball positions from `round-result` are set to the
 * server's canonical finals; the animator tweens the visual layer separately.
 * Returns `{ state, needsSession }` — `needsSession` true when hole geometry
 * for the new hole must be fetched.
 */
export function applyMessage(
  state: ClientState,
  msg: BroadcastMsg,
  nowMs: number,
): { state: ClientState; needsSession: boolean } {
  switch (msg.t) {
    case "game-state": {
      const needsSession = msg.holeIndex !== state.holeIndex || state.hole === null;
      return {
        state: {
          ...state,
          phase: msg.phase,
          holeIndex: msg.holeIndex,
          roundNumber: msg.roundNumber,
        },
        needsSession,
      };
    }

    case "round-open": {
      const balls = new Map(state.balls);
      if (state.hole) {
        for (const b of balls.values()) {
          if (!b.sunk && b.strokes === 0) {
            b.x = state.hole.tee.x;
            b.y = state.hole.tee.y;
          }
        }
      }
      return {
        state: {
          ...state,
          phase: "round-open",
          roundNumber: msg.roundNumber,
          holeIndex: msg.holeIndex,
          roundClosesAt: nowMs + msg.durationSec * 1000,
        },
        needsSession: state.hole === null,
      };
    }

    case "round-result": {
      const balls = new Map(state.balls);
      for (const rb of msg.balls) {
        const existing = balls.get(rb.id);
        balls.set(rb.id, {
          id: rb.id,
          name: rb.name ?? existing?.name ?? `#${rb.id}`,
          x: rb.final.x,
          y: rb.final.y,
          strokes: rb.strokes,
          sunk: rb.sunk,
        });
      }
      return {
        state: { ...state, phase: "round-resolving", roundClosesAt: null, balls },
        needsSession: false,
      };
    }

    case "hole-complete": {
      return {
        state: {
          ...state,
          phase: "hole-complete",
          revealAllUntil: nowMs + 5000,
        },
        needsSession: false,
      };
    }

    case "standings": {
      return { state: { ...state, standings: msg.rows }, needsSession: false };
    }

    default:
      return { state, needsSession: false };
  }
}

/** Which balls to draw, given the current view rules. */
export function visibleBalls(state: ClientState, nowMs: number): ClientBall[] {
  const all = [...state.balls.values()];
  const revealAll = nowMs < state.revealAllUntil;
  const playing = state.phase === "round-open" || state.phase === "round-resolving";
  const soloView = state.isPlayer && state.hasIdentity && playing && !revealAll;
  if (soloView && state.myBallId !== null) {
    return all.filter((b) => b.id === state.myBallId);
  }
  return all;
}

export function showNames(state: ClientState, nowMs: number): boolean {
  const playing = state.phase === "round-open" || state.phase === "round-resolving";
  const soloView = state.isPlayer && state.hasIdentity && playing && nowMs >= state.revealAllUntil;
  return !soloView;
}
