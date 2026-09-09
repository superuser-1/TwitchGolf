import type { BallId, UserId } from "./ids";
import type { Vec2 } from "./vec";

/** A single player's ball in the active game. */
export interface Ball {
  id: BallId;
  userId: UserId;
  /** Twitch login at the time the player joined. */
  login: string;
  displayName: string;
  position: Vec2;
  velocity: Vec2;
  atRest: boolean;
  /** Strokes taken on the current hole, including penalty strokes. */
  strokes: number;
  sunk: boolean;
  /** Last on-land resting position, used for water drops. */
  lastSafePosition: Vec2;
}
