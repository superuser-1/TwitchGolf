import type { Vec2 } from "../model/vec";

/**
 * EBS -> frontend broadcast messages (see `docs/DESIGN.md` §8). Kept small:
 * short int ids, `name` omitted from the player-facing stream, trajectories are
 * NOT sent (the client re-runs the deterministic sim from `from`/`angle`/`power`).
 */
export const PROTOCOL_VERSION = 1;

export interface BallResult {
  id: number;
  /** Present only in spectator packets / post-hole reveal. */
  name?: string;
  angle: number;
  power: number;
  from: Vec2;
  final: Vec2;
  sunk: boolean;
  strokes: number;
  penalty: number;
}

export interface RoundOpenMsg {
  t: "round-open";
  v: number;
  holeIndex: number;
  roundNumber: number;
  durationSec: number;
  serverTime: number;
}

export interface RoundResultMsg {
  t: "round-result";
  v: number;
  roundNumber: number;
  balls: BallResult[];
}

export interface HoleResultRow {
  id: number;
  name: string;
  strokes: number;
  toPar: number;
}

export interface HoleCompleteMsg {
  t: "hole-complete";
  v: number;
  holeIndex: number;
  results: HoleResultRow[];
}

export interface StandingsRow {
  rank: number;
  id: number;
  name: string;
  thru: number;
  toPar: number;
  total: number;
}

export interface StandingsMsg {
  t: "standings";
  v: number;
  rows: StandingsRow[];
}

export interface GameStateMsg {
  t: "game-state";
  v: number;
  phase: string;
  courseId: string;
  holeIndex: number;
  roundNumber: number;
}

export type BroadcastMsg =
  RoundOpenMsg | RoundResultMsg | HoleCompleteMsg | StandingsMsg | GameStateMsg;
