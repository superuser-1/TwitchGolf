import type { CourseId, TournamentId, UserId } from "./ids";

export type TournamentJoinPolicy = "locked-at-start" | "rolling-between-courses";
export type ScoringMode = "stroke-play";

export interface Tournament {
  id: TournamentId;
  name: string;
  courseIds: CourseId[];
  join: TournamentJoinPolicy;
  scoring: ScoringMode;
  currentCourseIndex: number;
  roster: Set<UserId>;
}

/** A single row of the live tournament standings. */
export interface Standing {
  rank: number;
  userId: UserId;
  displayName: string;
  /** Holes completed so far (across the tournament). */
  thru: number;
  /** Total strokes relative to par. */
  toPar: number;
  /** Total strokes. */
  total: number;
}
