export type Side = 'w' | 'b';

export const other = (side: Side): Side => (side === 'w' ? 'b' : 'w');

/** Chess.com charges at least this much per move, premoves included. */
export const MIN_MOVE_MS = 100;

/**
 * Game clock driven by timestamps rather than ticks, so a busy main thread
 * can delay the display but never the time accounting.
 */
export class Clock {
  private remaining: Record<Side, number>;
  private running: Side | null = null;
  private startedAt = 0;
  private flagTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    baseMs: number,
    private readonly incMs: number,
    private readonly onFlag: (side: Side) => void,
  ) {
    this.remaining = { w: baseMs, b: baseMs };
  }

  get runningSide(): Side | null {
    return this.running;
  }

  start(side: Side, now = performance.now()): void {
    this.running = side;
    this.startedAt = now;
    this.armFlag(now);
  }

  /**
   * Completes `side`'s move: charges the elapsed time, adds the increment and
   * starts the opponent's clock. Returns the time charged for the move.
   */
  press(side: Side, now = performance.now()): number {
    if (this.running !== side) return 0;
    const spent = Math.max(now - this.startedAt, MIN_MOVE_MS);
    this.remaining[side] = Math.max(0, this.remaining[side] - spent) + this.incMs;
    this.start(other(side), now);
    return spent;
  }

  stop(now = performance.now()): void {
    if (this.running) {
      this.remaining[this.running] = this.timeLeft(this.running, now);
      this.running = null;
    }
    clearTimeout(this.flagTimer);
  }

  timeLeft(side: Side, now = performance.now()): number {
    const elapsed = this.running === side ? now - this.startedAt : 0;
    return Math.max(0, this.remaining[side] - elapsed);
  }

  private armFlag(now: number): void {
    clearTimeout(this.flagTimer);
    const side = this.running;
    if (!side) return;
    this.flagTimer = setTimeout(() => {
      if (this.running !== side) return;
      const t = performance.now();
      if (this.timeLeft(side, t) <= 0) {
        this.stop(t);
        this.onFlag(side);
      } else {
        this.armFlag(t);
      }
    }, this.timeLeft(side, now) + 1);
  }
}

export function formatClock(ms: number): string {
  if (ms < 20_000) {
    const tenths = Math.ceil(ms / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  const secs = Math.ceil(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
