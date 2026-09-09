/**
 * Chat-command grammar for golf swings. See `docs/DESIGN.md` §6.
 *
 * Accepted (case-insensitive, leading `!`, flexible whitespace):
 *   !70°, 50    !70, 50    !70 50    !70°50    !-20, 40    !370, 40
 *   !golf 70 50    !dir 70 pow 50    !70 50 anything else is ignored
 *
 * Strategy: after the `!` (and an optional known verb) we extract the first two
 * numbers in order — direction then power. Direction is normalised to [0, 360);
 * power is clamped to (0, 100] and rounded to an integer (power 0 === no swing).
 */

export interface ParsedSwing {
  angle: number;
  power: number;
}

export type CommandParseError =
  "not-a-command" | "no-numbers" | "missing-power" | "bad-direction" | "bad-power" | "power-zero";

export type CommandParseResult =
  | { ok: true; kind: "swing"; angle: number; power: number }
  | { ok: false; reason: CommandParseError };

/** Verbs allowed immediately after `!` so we don't swallow other bots' commands. */
const VERBS = new Set(["golf", "g", "dir", "aim", "hit", "shot", "swing", "putt"]);

const NUMBER_RE = /-?\d+(?:\.\d+)?/g;
const LEADING_WORD_RE = /^[A-Za-z]+/;

/** Normalise an angle in degrees to the range [0, 360). */
export function normaliseAngle(deg: number): number {
  if (!Number.isFinite(deg)) return Number.NaN;
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

export function parseChatCommand(raw: unknown): CommandParseResult {
  if (typeof raw !== "string") return { ok: false, reason: "not-a-command" };

  const trimmed = raw.trim();
  if (!trimmed.startsWith("!")) return { ok: false, reason: "not-a-command" };

  let body = trimmed.slice(1).trim();
  if (body.length === 0) return { ok: false, reason: "not-a-command" };

  // If it starts with a letter, only continue for a recognised verb.
  if (/[A-Za-z]/.test(body.charAt(0))) {
    const word = LEADING_WORD_RE.exec(body)?.[0] ?? "";
    if (!VERBS.has(word.toLowerCase())) return { ok: false, reason: "not-a-command" };
    body = body.slice(word.length);
  }

  const numbers = (body.match(NUMBER_RE) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return { ok: false, reason: "no-numbers" };
  if (numbers.length === 1) return { ok: false, reason: "missing-power" };

  const rawAngle = numbers[0] as number;
  const rawPower = numbers[1] as number;

  const angle = normaliseAngle(Math.round(rawAngle * 10) / 10);
  if (!Number.isFinite(angle)) return { ok: false, reason: "bad-direction" };

  if (rawPower < 0) return { ok: false, reason: "bad-power" };
  const power = Math.round(Math.min(100, rawPower));
  if (power === 0) return { ok: false, reason: "power-zero" };

  return { ok: true, kind: "swing", angle, power };
}
