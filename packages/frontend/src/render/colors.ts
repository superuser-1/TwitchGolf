import type { SurfaceType } from "@twitch-golf/shared";

export const COLORS = {
  outOfBounds: "#0c1a10",
  fairway: "#2f9e44",
  green: "#51cf66",
  sand: "#e6d29a",
  water: "#3b82f6",
  slope: "#2b8a3e",
  wall: "#1b1b1b",
  cup: "#111111",
  flagPole: "#cbb48b",
  flag: "#e03131",
  ball: "#ffffff",
  ballStroke: "#1b1b1b",
  myBallRing: "#ffd43b",
  hudText: "#f8f9fa",
  hudShadow: "rgba(0,0,0,0.55)",
  countdown: "#ffd43b",
  compass: "rgba(255,255,255,0.75)",
} as const;

export function surfaceColor(type: SurfaceType): string {
  return COLORS[type];
}
