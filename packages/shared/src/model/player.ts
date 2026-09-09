import type { UserId } from "./ids";

/** A participant in the current game (persisted stats live in the EBS store). */
export interface Player {
  userId: UserId;
  login: string;
  displayName: string;
  joinedAt: number;
  /**
   * Strokes per completed hole for the current course; index === hole index.
   * Filled as each hole finishes.
   */
  strokesByHole: number[];
}
