import type { BroadcastMsg, Vec2 } from "@twitch-golf/shared";

import { Animator } from "./anim";
import { readRuntimeConfig } from "./config";
import { connectNet, fetchSession } from "./net";
import { Renderer } from "./render/canvas";
import type { RenderView } from "./render/canvas";
import {
  applyMessage,
  applySession,
  initialState,
  showNames,
  visibleBalls,
  type ClientState,
} from "./state";
import { requestIdentityShare, resolveIdentity } from "./twitch";

const cfg = readRuntimeConfig();

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

async function boot(): Promise<void> {
  const canvas = el<HTMLCanvasElement>("field");
  const grantBtn = el<HTMLButtonElement>("grant");
  const renderer = new Renderer(canvas);
  renderer.resize();
  window.addEventListener("resize", () => renderer.resize());

  let state: ClientState = initialState();
  const animPositions = new Map<number, Vec2>();

  const identity = await resolveIdentity(cfg);
  grantBtn.hidden = identity.hasIdentity || cfg.dev;
  grantBtn.onclick = () => requestIdentityShare();

  const refetch = async () => {
    try {
      state = applySession(state, await fetchSession(cfg, identity));
    } catch (err) {
      console.warn("session fetch failed", err);
    }
  };
  await refetch();
  state.connected = true;

  let career: string | null = null;
  if (identity.userId) {
    try {
      const res = await fetch(`${cfg.ebsUrl}/stats`, {
        headers: { authorization: `Bearer ${identity.token}` },
      });
      const body = (await res.json()) as {
        stats: {
          gamesPlayed: number;
          holesPlayed: number;
          totalStrokes: number;
          holesInOne: number;
        } | null;
      };
      const s = body.stats;
      if (s && s.holesPlayed > 0) {
        const avg = (s.totalStrokes / s.holesPlayed).toFixed(2);
        career = `career: ${s.gamesPlayed} games · ${avg}/hole · ${s.holesInOne} ace${s.holesInOne === 1 ? "" : "s"}`;
      }
    } catch {
      /* stats are optional */
    }
  }

  const animator = new Animator(
    (positions) => {
      for (const [id, p] of positions) animPositions.set(id, p);
    },
    () => animPositions.clear(),
  );

  const onMessage = (msg: BroadcastMsg) => {
    const { state: next, needsSession } = applyMessage(state, msg, Date.now());
    state = next;
    if (needsSession) void refetch();
    if (msg.t === "round-result" && state.hole) animator.play(msg, state.hole);
  };
  const net = connectNet(cfg, identity, onMessage);
  window.addEventListener("beforeunload", () => net.close());

  const frame = () => {
    const now = Date.now();
    const balls = visibleBalls(state, now).map((b) => {
      const p = animPositions.get(b.id);
      return p ? { ...b, x: p.x, y: p.y } : b;
    });
    const me = state.myBallId !== null ? state.balls.get(state.myBallId) : undefined;
    const secondsLeft = state.roundClosesAt !== null ? (state.roundClosesAt - now) / 1000 : null;

    const view: RenderView = {
      hole: state.hole,
      balls,
      showNames: showNames(state, now),
      myBallId: state.isPlayer ? state.myBallId : null,
      compass: state.isPlayer && state.hasIdentity && state.phase === "round-open",
      hud: {
        holeIndex: state.holeIndex,
        holeCount: state.holeCount,
        par: state.par,
        strokes: state.isPlayer && me ? me.strokes : null,
        secondsLeft,
        phase: state.phase,
        career: state.isPlayer ? career : null,
      },
      standings: state.standings,
      showStandings:
        !state.isPlayer || now < state.revealAllUntil || state.phase.includes("complete"),
      holeCount: state.holeCount,
      scorecard: state.standings.map((s) => ({
        name: s.name,
        total: s.total,
        toPar: s.toPar,
        perHole: state.scorecard.get(s.id) ?? [],
      })),
      showResults: state.phase === "course-complete",
    };
    renderer.draw(view);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err: unknown) => {
  console.error(err);
  const status = document.getElementById("status");
  if (status) status.textContent = String(err);
});
