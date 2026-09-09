export interface PlayerStats {
  channelId: string;
  userId: string;
  login: string;
  displayName: string;
  gamesPlayed: number;
  holesPlayed: number;
  totalStrokes: number;
  holesInOne: number;
  waterHazards: number;
  /** Best (lowest) to-par recorded for a full game; null until one is played. */
  bestToPar: number | null;
  tournamentsPlayed: number;
  tournamentWins: number;
  firstSeen: number;
  lastSeen: number;
}

export interface PlayerGameResult {
  userId: string;
  login: string;
  name: string;
  strokes: number;
  holes: number;
  toPar: number;
  aces: number;
  waterHits: number;
  won: boolean;
}

export interface GameSummary {
  courseId: string;
  tournamentId?: string;
  startedAt: number;
  finishedAt: number;
  players: PlayerGameResult[];
}

export interface TournamentSummary {
  tournamentId: string;
  name: string;
  courseIds: string[];
  startedAt: number;
  finishedAt: number;
  standings: { userId: string; name: string; strokes: number; toPar: number; rank: number }[];
}

export interface PaidEntry {
  channelId: string;
  userId: string;
  kind: "bits" | "channel-points";
  amount: number;
  ref: string;
  createdAt: number;
}

export interface Store {
  recordGameResult(channelId: string, summary: GameSummary): void;
  recordTournamentResult(channelId: string, summary: TournamentSummary): void;
  getPlayerStats(channelId: string, userId: string): PlayerStats | null;
  topPlayers(channelId: string, limit: number): PlayerStats[];
  recordPaidEntry(entry: PaidEntry): void;
  /** Flush any pending writes (no-op for in-memory). */
  close(): Promise<void>;
}
