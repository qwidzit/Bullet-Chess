/** Target for touch-to-screen latency, in milliseconds (95th percentile). */
export const LATENCY_BUDGET_MS = 50;
const MIN_SAMPLES = 10;

class Stat {
  private values: number[] = [];

  add(value: number): void {
    this.values.push(value);
  }

  get count(): number {
    return this.values.length;
  }

  get last(): number {
    return this.values.at(-1) ?? 0;
  }

  get max(): number {
    return this.values.reduce((a, b) => Math.max(a, b), 0);
  }

  get avg(): number {
    return this.count ? this.values.reduce((a, b) => a + b, 0) / this.count : 0;
  }

  get p95(): number {
    if (!this.count) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }
}

export interface LatencySummary {
  verdict: 'pass' | 'fail' | 'insufficient';
  rows: { label: string; value: string; ok?: boolean }[];
}

const ms = (value: number): string => `${value < 10 ? value.toFixed(1) : Math.round(value)}`;

/**
 * Measures how quickly the app turns a touch into a move on screen.
 *
 * "Frame" times end when the main thread has committed the frame containing
 * the move. Screen scan-out and the touch digitiser add a further fixed delay
 * that is identical for web and native apps, so it is left out.
 */
export class LatencyMeter {
  private tapToApplied = new Stat();
  private tapToFrame = new Stat();
  private premoveToFrame = new Stat();
  private botCompute = new Stat();
  private premovesSet = 0;
  private premovesPlayed = 0;
  private peakMovesPerSec = 0;
  private moveStamps: number[] = [];

  private lastInputTs = 0;
  private botArrivedTs = 0;

  private running = false;
  private raf = 0;
  private lastFrameTs = 0;
  private warmup: number[] = [];
  private frameMs = 0;
  private jankyFrames = 0;
  private worstFrameMs = 0;

  private paintQueue: ((t: number) => void)[] = [];
  private channel = new MessageChannel();

  constructor() {
    this.channel.port1.onmessage = () => {
      const t = performance.now();
      for (const callback of this.paintQueue.splice(0)) callback(t);
    };
  }

  private onInput = (e: Event): void => {
    const now = performance.now();
    // Prefer the time the OS produced the event, which includes queueing delay.
    this.lastInputTs = e.timeStamp > now - 1000 && e.timeStamp <= now ? e.timeStamp : now;
  };

  attach(): void {
    for (const type of ['touchstart', 'touchend', 'mousedown', 'mouseup']) {
      document.addEventListener(type, this.onInput, { capture: true, passive: true });
    }
  }

  detach(): void {
    this.stop();
    for (const type of ['touchstart', 'touchend', 'mousedown', 'mouseup']) {
      document.removeEventListener(type, this.onInput, { capture: true });
    }
  }

  /** Resets all figures and starts watching frames for a new game. */
  start(): void {
    this.tapToApplied = new Stat();
    this.tapToFrame = new Stat();
    this.premoveToFrame = new Stat();
    this.botCompute = new Stat();
    this.premovesSet = this.premovesPlayed = this.peakMovesPerSec = 0;
    this.moveStamps = [];
    this.warmup = [];
    this.frameMs = this.jankyFrames = this.worstFrameMs = this.lastFrameTs = 0;
    this.running = true;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onFrame = (t: number): void => {
    if (!this.running) return;
    if (this.lastFrameTs) {
      const delta = t - this.lastFrameTs;
      if (!this.frameMs) {
        // Learn the display's frame interval from the first half second or so.
        this.warmup.push(delta);
        if (this.warmup.length >= 40) {
          this.frameMs = [...this.warmup].sort((a, b) => a - b)[20];
        }
      } else {
        this.worstFrameMs = Math.max(this.worstFrameMs, delta);
        if (delta > this.frameMs * 1.6) this.jankyFrames++;
      }
    }
    this.lastFrameTs = t;
    this.raf = requestAnimationFrame(this.onFrame);
  };

  private afterPaint(callback: (t: number) => void): void {
    requestAnimationFrame(() => {
      this.paintQueue.push(callback);
      this.channel.port2.postMessage(0);
    });
  }

  premoveSet(): void {
    this.premovesSet++;
  }

  botMoveArrived(now: number): void {
    this.botArrivedTs = now;
  }

  botComputed(durationMs: number): void {
    this.botCompute.add(durationMs);
  }

  /** Call once the player's move has been applied and the board updated. */
  userMove(premove: boolean): void {
    const now = performance.now();
    this.moveStamps.push(now);
    while (this.moveStamps[0] < now - 1000) this.moveStamps.shift();
    this.peakMovesPerSec = Math.max(this.peakMovesPerSec, this.moveStamps.length);

    if (premove) {
      this.premovesPlayed++;
      const origin = this.botArrivedTs;
      this.afterPaint(t => this.premoveToFrame.add(t - origin));
      return;
    }
    const origin = this.lastInputTs;
    if (now - origin > 500) return; // not driven by a fresh touch
    this.tapToApplied.add(now - origin);
    this.afterPaint(t => this.tapToFrame.add(t - origin));
  }

  /** Compact live readout for the in-game overlay. */
  lines(): string[] {
    const hz = this.frameMs ? Math.round(1000 / this.frameMs) : 0;
    return [
      `touch→frame ${ms(this.tapToFrame.last)} · avg ${ms(this.tapToFrame.avg)} · max ${ms(this.tapToFrame.max)} ms`,
      `premove→frame ${ms(this.premoveToFrame.last)} · max ${ms(this.premoveToFrame.max)} ms · bot ${ms(this.botCompute.last)} ms`,
      `${hz || '–'} Hz · slow frames ${this.jankyFrames} · peak ${this.peakMovesPerSec} moves/s`,
    ];
  }

  summary(): LatencySummary {
    const touchOk = this.tapToFrame.p95 <= LATENCY_BUDGET_MS;
    const premoveOk = this.premoveToFrame.p95 <= LATENCY_BUDGET_MS;
    const enough = this.tapToFrame.count >= MIN_SAMPLES;
    const rows: LatencySummary['rows'] = [
      {
        label: 'Touch → move applied',
        value: `avg ${ms(this.tapToApplied.avg)} · max ${ms(this.tapToApplied.max)} ms`,
      },
      {
        label: `Touch → on screen (${this.tapToFrame.count} moves)`,
        value: `avg ${ms(this.tapToFrame.avg)} · p95 ${ms(this.tapToFrame.p95)} · max ${ms(this.tapToFrame.max)} ms`,
        ok: this.tapToFrame.count ? touchOk : undefined,
      },
      {
        label: `Premove → on screen (${this.premovesPlayed} of ${this.premovesSet} played)`,
        value: this.premoveToFrame.count
          ? `avg ${ms(this.premoveToFrame.avg)} · p95 ${ms(this.premoveToFrame.p95)} · max ${ms(this.premoveToFrame.max)} ms`
          : '–',
        ok: this.premoveToFrame.count ? premoveOk : undefined,
      },
      {
        label: 'Bot compute',
        value: `avg ${ms(this.botCompute.avg)} · max ${ms(this.botCompute.max)} ms`,
      },
      {
        label: 'Display',
        value: this.frameMs
          ? `${Math.round(1000 / this.frameMs)} Hz · ${this.jankyFrames} slow frames · worst ${ms(this.worstFrameMs)} ms`
          : '–',
      },
      { label: 'Peak speed', value: `${this.peakMovesPerSec} moves in one second` },
    ];
    const verdict = !enough ? 'insufficient' : touchOk && premoveOk ? 'pass' : 'fail';
    return { verdict, rows };
  }
}
