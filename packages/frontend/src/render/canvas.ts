import type { Hole, Shape, StandingsRow } from "@twitch-golf/shared";

import type { ClientBall } from "../state";
import { COLORS, surfaceColor } from "./colors";

export interface HudInfo {
  holeIndex: number;
  holeCount: number;
  par: number;
  strokes: number | null;
  secondsLeft: number | null;
  phase: string;
  /** Optional one-line career summary for the identified viewer. */
  career: string | null;
}

export interface ScorecardRow {
  name: string;
  total: number;
  toPar: number;
  perHole: number[];
}

export interface RenderView {
  hole: Hole | null;
  balls: ClientBall[];
  showNames: boolean;
  myBallId: number | null;
  compass: boolean;
  hud: HudInfo;
  standings: StandingsRow[];
  showStandings: boolean;
  holeCount: number;
  scorecard: ScorecardRow[];
  showResults: boolean;
}

/** Maps logical field units to letterboxed canvas pixels. */
interface Fit {
  ox: number;
  oy: number;
  scale: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private fit(hole: Hole): Fit {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const cw = this.canvas.width / dpr;
    const ch = this.canvas.height / dpr;
    const scale = Math.min(cw / hole.size.w, ch / hole.size.h);
    return { ox: (cw - hole.size.w * scale) / 2, oy: (ch - hole.size.h * scale) / 2, scale };
  }

  draw(view: RenderView): void {
    const { ctx } = this;
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const cw = this.canvas.width / dpr;
    const ch = this.canvas.height / dpr;

    ctx.fillStyle = COLORS.outOfBounds;
    ctx.fillRect(0, 0, cw, ch);

    if (!view.hole) {
      this.text(cw / 2, ch / 2, "waiting for a game…", 16, "center");
      return;
    }

    const hole = view.hole;
    const f = this.fit(hole);
    const px = (x: number) => f.ox + x * f.scale;
    const py = (y: number) => f.oy + y * f.scale;
    const ps = (n: number) => n * f.scale;

    ctx.fillStyle = COLORS.fairway;
    ctx.fillRect(px(0), py(0), ps(hole.size.w), ps(hole.size.h));

    for (const surface of hole.surfaces) {
      ctx.fillStyle = surfaceColor(surface.type);
      ctx.globalAlpha = surface.type === "slope" ? 0.5 : 1;
      this.fillShape(surface.shape, px, py, ps);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = Math.max(2, ps(1.4));
    ctx.lineCap = "round";
    for (const wall of hole.walls) {
      ctx.beginPath();
      ctx.moveTo(px(wall.x1), py(wall.y1));
      ctx.lineTo(px(wall.x2), py(wall.y2));
      ctx.stroke();
    }

    // cup + flag
    ctx.fillStyle = COLORS.cup;
    ctx.beginPath();
    ctx.arc(px(hole.cup.x), py(hole.cup.y), Math.max(3, ps(hole.cup.radius)), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.flagPole;
    ctx.lineWidth = Math.max(1.5, ps(0.5));
    ctx.beginPath();
    ctx.moveTo(px(hole.cup.x), py(hole.cup.y));
    ctx.lineTo(px(hole.cup.x), py(hole.cup.y) - ps(12));
    ctx.stroke();
    ctx.fillStyle = COLORS.flag;
    ctx.beginPath();
    ctx.moveTo(px(hole.cup.x), py(hole.cup.y) - ps(12));
    ctx.lineTo(px(hole.cup.x) + ps(8), py(hole.cup.y) - ps(9.5));
    ctx.lineTo(px(hole.cup.x), py(hole.cup.y) - ps(7));
    ctx.closePath();
    ctx.fill();

    const ballR = Math.max(3, ps(1.6));
    for (const ball of view.balls) {
      const bx = px(ball.x);
      const by = py(ball.y);
      if (ball.id === view.myBallId) {
        ctx.strokeStyle = COLORS.myBallRing;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, ballR + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.ball;
      ctx.strokeStyle = COLORS.ballStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (view.showNames) this.text(bx + ballR + 3, by + 3, ball.name, 11, "left");
    }

    if (view.compass && view.myBallId !== null) {
      const me = view.balls.find((b) => b.id === view.myBallId);
      if (me) this.drawCompass(px(me.x), py(me.y), Math.max(26, ps(16)));
    }

    this.drawHud(view.hud, cw);
    if (view.showStandings && !view.showResults) this.drawStandings(view.standings, cw, ch);
    if (view.showResults) this.drawResults(view, cw, ch);
  }

  private drawResults(view: RenderView, cw: number, ch: number): void {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, cw, ch);

    const rows = view.scorecard.length
      ? view.scorecard
      : view.standings.map((s) => ({ name: s.name, total: s.total, toPar: s.toPar, perHole: [] }));

    const bw = Math.min(cw - 24, 260);
    const bh = Math.min(ch - 24, 60 + rows.length * 18 + 24);
    const bx = (cw - bw) / 2;
    const by = (ch - bh) / 2;
    ctx.fillStyle = "rgba(20,24,20,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    this.text(bx + bw / 2, by + 24, "Course complete", 16, "center");
    let y = by + 48;
    rows.forEach((r, i) => {
      const toPar = r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : `${r.toPar}`;
      this.text(bx + 14, y, `${i + 1}. ${r.name}`, 12, "left");
      this.text(bx + bw - 14, y, `${r.total}  (${toPar})`, 12, "right");
      y += 18;
    });
  }

  private fillShape(
    shape: Shape,
    px: (n: number) => number,
    py: (n: number) => number,
    ps: (n: number) => number,
  ): void {
    const { ctx } = this;
    ctx.beginPath();
    if (shape.kind === "circle") {
      ctx.arc(px(shape.x), py(shape.y), ps(shape.r), 0, Math.PI * 2);
    } else if (shape.kind === "rect") {
      ctx.rect(px(shape.x), py(shape.y), ps(shape.w), ps(shape.h));
    } else {
      shape.points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      });
      ctx.closePath();
    }
    ctx.fill();
  }

  private drawCompass(cx: number, cy: number, r: number): void {
    const { ctx } = this;
    ctx.strokeStyle = COLORS.compass;
    ctx.fillStyle = COLORS.compass;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      ctx.beginPath();
      ctx.moveTo(cx + dx * (r - 5), cy + dy * (r - 5));
      ctx.lineTo(cx + dx * r, cy + dy * r);
      ctx.stroke();
    }
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0", cx, cy - r - 4);
    ctx.fillText("90", cx + r + 8, cy + 3);
    ctx.fillText("180", cx, cy + r + 12);
    ctx.fillText("270", cx - r - 10, cy + 3);
  }

  private drawHud(hud: HudInfo, cw: number): void {
    const line1 = `Hole ${hud.holeIndex + 1}/${hud.holeCount}  ·  par ${hud.par}`;
    const line2 = hud.strokes !== null ? `your strokes: ${hud.strokes}` : phaseLabel(hud.phase);
    this.text(10, 20, line1, 14, "left");
    this.text(10, 38, line2, 12, "left");

    if (hud.secondsLeft !== null && hud.secondsLeft >= 0) {
      const w = Math.min(cw - 20, 160);
      const frac = Math.max(0, Math.min(1, hud.secondsLeft / 30));
      this.ctx.fillStyle = "rgba(0,0,0,0.4)";
      this.ctx.fillRect(10, 46, w, 6);
      this.ctx.fillStyle = COLORS.countdown;
      this.ctx.fillRect(10, 46, w * frac, 6);
      this.text(10 + w + 6, 52, `${Math.ceil(hud.secondsLeft)}s`, 11, "left");
    }

    if (hud.career) this.text(10, 66, hud.career, 10, "left");
  }

  private drawStandings(rows: StandingsRow[], cw: number, ch: number): void {
    if (rows.length === 0) return;
    const shown = rows.slice(0, 6);
    const x = cw - 150;
    let y = 24;
    this.text(x, y, "Standings", 13, "left");
    for (const r of shown) {
      y += 16;
      const toPar = r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : `${r.toPar}`;
      this.text(x, y, `${r.rank}. ${r.name}  ${toPar}`, 11, "left");
    }
    void ch;
  }

  private text(x: number, y: number, s: string, size: number, align: CanvasTextAlign): void {
    const { ctx } = this;
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.hudShadow;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(s, x, y);
  }
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "hole-intro":
      return "get ready…";
    case "round-open":
      return "submit your swing in chat";
    case "round-resolving":
      return "resolving…";
    case "hole-complete":
      return "hole complete";
    case "course-complete":
      return "course complete";
    default:
      return "waiting for a game";
  }
}
