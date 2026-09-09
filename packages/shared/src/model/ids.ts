/** Twitch broadcaster / channel id. */
export type ChannelId = string;

/** Twitch user id (only available once the viewer grants identity). */
export type UserId = string;

/** Per-channel, per-user opaque id the extension always receives. */
export type OpaqueUserId = string;

/** Short integer id assigned to a ball within a single game. */
export type BallId = number;

/** Stable id of a single hole definition, e.g. `"seaside-1"`. */
export type HoleRefId = string;

/** Stable id of a course (an ordered list of holes). */
export type CourseId = string;

/** Stable id of a tournament (an ordered list of courses). */
export type TournamentId = string;
