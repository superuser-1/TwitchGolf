import type { Ball } from "./ball";
import type { BallId, ChannelId, CourseId, TournamentId, UserId } from "./ids";
import type { Player } from "./player";

export type GamePhase =
  "idle" | "hole-intro" | "round-open" | "round-resolving" | "hole-complete" | "course-complete";

/** Authoritative per-channel game state, owned by the EBS. */
export interface Game {
  channelId: ChannelId;
  courseId: CourseId;
  holeIndex: number;
  roundNumber: number;
  phase: GamePhase;
  balls: Map<BallId, Ball>;
  players: Map<UserId, Player>;
  /** Set when this game is one leg of a tournament. */
  tournamentId?: TournamentId;
}
