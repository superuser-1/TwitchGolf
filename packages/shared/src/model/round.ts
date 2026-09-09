import type { UserId } from "./ids";

export type RoundPhase = "open" | "resolving" | "closed";

/** A swing submitted by a player during an open round. */
export interface Swing {
  userId: UserId;
  login: string;
  /** Normalised to [0, 360). */
  angle: number;
  /** Integer in (0, 100]. */
  power: number;
  receivedAt: number;
}

/**
 * One simultaneous, timed round for a single hole. Players submit swings in
 * chat; the last valid submission before `closesAt` wins.
 */
export interface Round {
  roundNumber: number;
  holeIndex: number;
  phase: RoundPhase;
  opensAt: number;
  closesAt: number;
  /** One pending swing per user; last valid submission replaces the previous. */
  pending: Map<UserId, Swing>;
}
