import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type {
  GameSummary,
  PaidEntry,
  PlayerGameResult,
  PlayerStats,
  Store,
  TournamentSummary,
} from "./types";

interface DbShape {
  players: Record<string, PlayerStats>;
  games: (GameSummary & { channelId: string })[];
  tournaments: (TournamentSummary & { channelId: string })[];
  paidEntry: PaidEntry[];
}

const MAX_HISTORY = 500;

function emptyDb(): DbShape {
  return { players: {}, games: [], tournaments: [], paidEntry: [] };
}

/**
 * Persistent stats store backed by a single JSON file (or purely in-memory when
 * no path is given). The `Store` interface is the seam for a SQLite backend
 * later — see `docs/DESIGN.md` §3.2.
 */
export class FileStore implements Store {
  private readonly db: DbShape;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path?: string) {
    this.db = path ? load(path) : emptyDb();
  }

  private key(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
  }

  private ensure(channelId: string, r: PlayerGameResult, now: number): PlayerStats {
    const k = this.key(channelId, r.userId);
    let stats = this.db.players[k];
    if (!stats) {
      stats = {
        channelId,
        userId: r.userId,
        login: r.login,
        displayName: r.name,
        gamesPlayed: 0,
        holesPlayed: 0,
        totalStrokes: 0,
        holesInOne: 0,
        waterHazards: 0,
        bestToPar: null,
        tournamentsPlayed: 0,
        tournamentWins: 0,
        firstSeen: now,
        lastSeen: now,
      };
      this.db.players[k] = stats;
    }
    stats.login = r.login;
    stats.displayName = r.name;
    stats.lastSeen = now;
    return stats;
  }

  recordGameResult(channelId: string, summary: GameSummary): void {
    const now = summary.finishedAt;
    for (const r of summary.players) {
      const stats = this.ensure(channelId, r, now);
      stats.gamesPlayed += 1;
      stats.holesPlayed += r.holes;
      stats.totalStrokes += r.strokes;
      stats.holesInOne += r.aces;
      stats.waterHazards += r.waterHits;
      if (r.holes > 0) {
        stats.bestToPar = stats.bestToPar === null ? r.toPar : Math.min(stats.bestToPar, r.toPar);
      }
    }
    this.db.games.push({ channelId, ...summary });
    if (this.db.games.length > MAX_HISTORY)
      this.db.games.splice(0, this.db.games.length - MAX_HISTORY);
    this.scheduleWrite();
  }

  recordTournamentResult(channelId: string, summary: TournamentSummary): void {
    const now = summary.finishedAt;
    summary.standings.forEach((row) => {
      const stats = this.ensure(
        channelId,
        { userId: row.userId, login: row.name, name: row.name } as PlayerGameResult,
        now,
      );
      stats.tournamentsPlayed += 1;
      if (row.rank === 1) stats.tournamentWins += 1;
    });
    this.db.tournaments.push({ channelId, ...summary });
    if (this.db.tournaments.length > MAX_HISTORY) {
      this.db.tournaments.splice(0, this.db.tournaments.length - MAX_HISTORY);
    }
    this.scheduleWrite();
  }

  getPlayerStats(channelId: string, userId: string): PlayerStats | null {
    return this.db.players[this.key(channelId, userId)] ?? null;
  }

  topPlayers(channelId: string, limit: number): PlayerStats[] {
    return Object.values(this.db.players)
      .filter((p) => p.channelId === channelId && p.holesPlayed > 0)
      .sort((a, b) => a.totalStrokes / a.holesPlayed - b.totalStrokes / b.holesPlayed)
      .slice(0, limit);
  }

  recordPaidEntry(entry: PaidEntry): void {
    this.db.paidEntry.push(entry);
    this.scheduleWrite();
  }

  async close(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.flush();
  }

  private scheduleWrite(): void {
    if (!this.path || this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 250);
  }

  private flush(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.db), "utf8");
  }
}

function load(path: string): DbShape {
  try {
    return { ...emptyDb(), ...(JSON.parse(readFileSync(path, "utf8")) as Partial<DbShape>) };
  } catch {
    return emptyDb();
  }
}
