/** Injectable time source so the round scheduler can be driven deterministically in tests. */
export interface Clock {
  now(): number;
  /** Run `fn` after `ms`. Returns a canceller. */
  after(ms: number, fn: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};

interface Scheduled {
  at: number;
  fn: () => void;
  cancelled: boolean;
}

/** Test clock: time only moves when you call `advance`. */
export class ManualClock implements Clock {
  private t: number;
  private queue: Scheduled[] = [];

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  after(ms: number, fn: () => void): () => void {
    const entry: Scheduled = { at: this.t + Math.max(0, ms), fn, cancelled: false };
    this.queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  /** Advance time by `ms`, firing due timers in order (including ones they schedule). */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const next = this.queue
        .filter((e) => !e.cancelled && e.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.queue = this.queue.filter((e) => e !== next);
      this.t = next.at;
      next.fn();
    }
    this.t = target;
  }
}
