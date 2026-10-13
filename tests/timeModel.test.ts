import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_PROFILE, thinkTime, type MoveContext, type Random } from '../src/bots/timeModel';

/** A repeatable stream of numbers in [0, 1), so the tests do not flicker. */
function seeded(seed = 1): Random {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** A quiet middlegame move in a one-minute game with plenty of time. */
function context(overrides: Partial<MoveContext> = {}): MoveContext {
  return {
    ply: 40,
    ownMs: 40_000,
    opponentMs: 40_000,
    baseMs: 60_000,
    incMs: 0,
    forced: false,
    inCheck: false,
    isCapture: false,
    isRecapture: false,
    captureOptions: 1,
    endgame: false,
    evalCp: 20,
    gapCp: 30,
    closeChoices: 1,
    swingCp: 0,
    humanProbability: 0.3,
    ...overrides,
  };
}

/** Median of many non-premoved think times for one situation. */
function median(overrides: Partial<MoveContext>, profile = DEFAULT_TIME_PROFILE): number {
  const random = seeded(7);
  const times: number[] = [];
  while (times.length < 801) {
    const ms = thinkTime(context(overrides), profile, 1, random);
    if (ms > 0) times.push(ms);
  }
  return times.sort((a, b) => a - b)[400];
}

describe('thinkTime', () => {
  it('thinks about a second and a half on an ordinary move with time in hand', () => {
    const typical = median({});
    expect(typical).toBeGreaterThan(1000);
    expect(typical).toBeLessThan(2000);
  });

  it('plays the opening faster than the middlegame', () => {
    expect(median({ ply: 2 })).toBeLessThan(median({}) * 0.6);
  });

  it('recaptures and forced moves come quicker than ordinary moves', () => {
    const ordinary = median({});
    expect(median({ isRecapture: true, isCapture: true })).toBeLessThan(ordinary);
    expect(median({ forced: true })).toBeLessThan(ordinary);
  });

  it('never lets a recapture run past the quick-move limit', () => {
    const random = seeded(3);
    for (let i = 0; i < 2000; i++) {
      const ms = thinkTime(context({ isRecapture: true, isCapture: true, baseMs: 1_200_000, ownMs: 1_000_000 }), DEFAULT_TIME_PROFILE, 1, random);
      expect(ms).toBeLessThanOrEqual(DEFAULT_TIME_PROFILE.quickMaxMs);
    }
  });

  it('speeds up when the clock is low, but not to nothing', () => {
    const low = median({ ownMs: 5000 });
    expect(low).toBeLessThan(median({}));
    // Real players still take most of a second with five seconds left.
    expect(low).toBeGreaterThan(400);
  });

  it('takes longer over a sharp position than a quiet one', () => {
    expect(median({ captureOptions: 6, closeChoices: 4, swingCp: 400 })).toBeGreaterThan(median({}) * 1.3);
  });

  it('never spends more than the allowed share of the clock or of the game', () => {
    const p = DEFAULT_TIME_PROFILE;
    const random = seeded(11);
    for (let i = 0; i < 5000; i++) {
      const ownMs = 500 + random() * 59_500;
      const ms = thinkTime(context({ ownMs, swingCp: 500, captureOptions: 8, closeChoices: 4 }), p, 1.5, random);
      // The reaction-time floor can exceed the share when almost no time is left.
      const floor = Math.max(...p.reactionMs, ...p.panicReactionMs);
      expect(ms).toBeLessThanOrEqual(Math.max(floor, ownMs * p.maxClockShare));
      expect(ms).toBeLessThanOrEqual(Math.max(floor, 60_000 * p.maxBaseShare));
    }
  });

  it('premoves when the dice say so, but never the first move of the game', () => {
    const always: Random = () => 0;
    expect(thinkTime(context({ isRecapture: true }), DEFAULT_TIME_PROFILE, 1, always)).toBe(0);
    expect(thinkTime(context({ ply: 0 }), DEFAULT_TIME_PROFILE, 1, always)).toBeGreaterThan(0);
  });

  it('premoves far more often in time trouble', () => {
    const share = (ownMs: number) => {
      const random = seeded(5);
      let premoves = 0;
      for (let i = 0; i < 4000; i++) if (thinkTime(context({ ownMs }), DEFAULT_TIME_PROFILE, 1, random) === 0) premoves++;
      return premoves / 4000;
    };
    expect(share(40_000)).toBeLessThan(0.1);
    expect(share(2000)).toBeGreaterThan(0.3);
  });

  it('scales with the tempo setting and with the pace of the game', () => {
    const base = median({});
    expect(median({}, { ...DEFAULT_TIME_PROFILE, tempo: 2 }) / base).toBeCloseTo(2, 0);
    expect(median({}, { ...DEFAULT_TIME_PROFILE, tempo: 0.5 }) / base).toBeCloseTo(0.5, 1);
  });

  it('thinks longer in longer games and adds most of the increment', () => {
    expect(median({ baseMs: 600_000, ownMs: 500_000 })).toBeGreaterThan(median({}) * 3);
    expect(median({ incMs: 2000 }) - median({})).toBeGreaterThan(1000);
  });
});
