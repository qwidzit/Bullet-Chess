import { DEFAULT_TIME_PROFILE, type TimeProfile } from './timeModel';

/**
 * A way of handling the clock. "Natural" is the pace measured from real
 * players. The others are characters built on top of it by hand: they are
 * recognisable types of bullet player, not fitted to anyone's games.
 */
export type TimeStyle = 'natural' | 'speedster' | 'thinker' | 'scrambler';

export const TIME_STYLES: { id: TimeStyle; name: string; description: string }[] = [
  { id: 'natural', name: 'Natural', description: 'Uses the clock the way real players were measured to' },
  { id: 'speedster', name: 'Speedster', description: 'Moves fast all game and premoves a lot; hard to beat on time' },
  { id: 'thinker', name: 'Thinker', description: 'Takes its time early and ends up short of it; often loses on time' },
  { id: 'scrambler', name: 'Scrambler', description: 'Ordinary pace until the clock is low, then very quick' },
];

const base = DEFAULT_TIME_PROFILE;

const PROFILES: Record<TimeStyle, TimeProfile> = {
  natural: base,

  speedster: {
    ...base,
    baseMs: base.baseMs * 0.6,
    opening: { ...base.opening, earlyMs: base.opening.earlyMs * 0.6, lateMs: base.opening.lateMs * 0.6 },
    premove: { ...base.premove, opening: 0.25, recapture: 0.5, other: 0.12 },
  },

  thinker: {
    ...base,
    baseMs: base.baseMs * 1.3,
    noise: 0.6,
    opening: { ...base.opening, earlyMs: base.opening.earlyMs * 1.2, lateMs: base.opening.lateMs * 1.25 },
    premove: { ...base.premove, opening: 0.04, other: 0.02 },
    maxBaseShare: 0.3,
  },

  scrambler: {
    ...base,
    // Shifts down hard once the clock is visibly low, instead of drifting.
    lowClock: [
      [22_000, 1],
      [15_000, 0.6],
      [7500, 0.35],
      [3500, 0.25],
      [1000, 0.12],
      [0, 0.08],
    ],
    premove: { ...base.premove, hurried: 0.45, hurriedObvious: 0.75, panic: 0.7 },
    panicReactionMs: [60, 150],
  },
};

/** The time profile for a style, at a speed given as a percentage of its normal pace. */
export function timeProfileFor(style: TimeStyle, speedPct: number): TimeProfile {
  return { ...PROFILES[style], tempo: 100 / speedPct };
}
