// How long a bot appears to think about a move.
//
// The numbers are fitted to real chess.com bullet games (one-minute games
// between players rated about 1000–1250). What those games show:
//
// - With time in hand, players spend about the same on every middlegame move
//   (median 1.4 s) however many moves remain. They do not ration the clock.
// - They speed up only once the clock is visibly low, and even with 5 seconds
//   left the typical move still takes half a second.
// - Think times are widely spread: a tenth of moves take over 3 s.
// - A third of recaptures are premoved; the rest take most of a second.
// - Different players, and the same player on different days, run at clearly
//   different speeds. That, not planning, is why so many games end on time.
//
// Every number that shapes this lives in TimeProfile.

/** Everything the time model knows about one move decision. */
export interface MoveContext {
  /** Half-moves played before this move. */
  ply: number;
  ownMs: number;
  opponentMs: number;
  baseMs: number;
  incMs: number;

  /** Only one legal move exists. */
  forced: boolean;
  inCheck: boolean;
  isCapture: boolean;
  /** Takes back on the square the opponent just captured on. */
  isRecapture: boolean;
  /** Captures available to the side to move: a rough measure of tension. */
  captureOptions: number;
  /** Few pieces left besides pawns. */
  endgame: boolean;

  /** Engine score for the side to move, in centipawns. Null when unknown. */
  evalCp: number | null;
  /** How much worse the second-best move is than the best. Null when unknown. */
  gapCp: number | null;
  /** Candidate moves scoring within a whisker of the best, the best included. */
  closeChoices: number;
  /** Change in the score since this bot's previous move. Null on its first move. */
  swingCp: number | null;
  /** How likely a player of the bot's level is to choose this move. Null when unknown. */
  humanProbability: number | null;
}

export interface TimeProfile {
  /** Overall speed: below 1 plays faster, above 1 slower. */
  tempo: number;
  /** How much the pace differs from one game to the next (log-normal sigma). */
  gameSpread: number;

  /** Typical think on an ordinary move with time in hand, in a one-minute game. */
  baseMs: number;
  /** How that scales with the starting time: 1 is proportional, 0 not at all. */
  baseTimeExponent: number;
  /** Share of the increment added to every think. */
  incrementUse: number;
  /** Spread of individual think times (log-normal sigma). */
  noise: number;

  /**
   * Pace as the clock runs down: [clock in ms, multiplier] points for a
   * one-minute game, highest clock first. Values in between are interpolated.
   */
  lowClock: [number, number][];

  opening: {
    /** The bot's first moves are played from memory... */
    moves: number;
    /** ...the very first ones fastest. */
    earlyMoves: number;
    earlyMs: number;
    lateMs: number;
  };

  /** Score gap above which a capture counts as the obvious move. */
  obviousGapCp: number;
  /** A move nearly everyone at this level would play is obvious too. */
  obviousProbability: number;
  /** Score change since the last move that counts as a surprise. */
  surpriseCp: number;
  /** Lead or deficit beyond which the game feels decided. */
  decidedCp: number;
  /** Candidate moves this close to the best count as real alternatives. */
  closeChoices: number;
  /** Captures on offer at which the position counts as tense. */
  tenseCaptures: number;

  /** Multipliers on the typical think. */
  factor: {
    forced: number;
    recapture: number;
    obvious: number;
    quiet: number;
    manyChoices: number;
    tense: number;
    surprise: number;
    inCheck: number;
    decided: number;
    endgame: number;
  };

  /** Chance that a move was decided before the opponent replied. */
  premove: {
    opening: number;
    recapture: number;
    other: number;
    /** Below `hurriedBelowMs` on the clock. */
    hurried: number;
    hurriedObvious: number;
    /** Below `panicBelowMs` on the clock. */
    panic: number;
  };
  hurriedBelowMs: number;
  panicBelowMs: number;

  /** Quickest reply to a move that was not anticipated, in ms (range). */
  reactionMs: [number, number];
  panicReactionMs: [number, number];
  /** Forced moves and recaptures never take longer than this. */
  quickMaxMs: number;
  /** Never spend more than this share of the remaining clock on one move... */
  maxClockShare: number;
  /** ...nor more than this share of the starting time. */
  maxBaseShare: number;
}

export const DEFAULT_TIME_PROFILE: TimeProfile = {
  tempo: 1,
  gameSpread: 0.2,

  baseMs: 1550,
  baseTimeExponent: 0.85,
  incrementUse: 0.8,
  noise: 0.55,

  // Real players barely speed up: a move that is not premoved still takes
  // most of a second with five seconds left. That is how they lose on time.
  lowClock: [
    [22_000, 1],
    [15_000, 0.8],
    [7500, 0.62],
    [3500, 0.6],
    [1000, 0.4],
    [0, 0.3],
  ],

  opening: { moves: 7, earlyMoves: 3, earlyMs: 570, lateMs: 925 },

  obviousGapCp: 200,
  obviousProbability: 0.8,
  surpriseCp: 250,
  decidedCp: 600,
  closeChoices: 3,
  tenseCaptures: 4,

  factor: {
    forced: 0.45,
    recapture: 0.62,
    obvious: 0.65,
    quiet: 0.9,
    manyChoices: 1.15,
    tense: 1.15,
    surprise: 1.4,
    inCheck: 0.9,
    decided: 0.8,
    endgame: 0.8,
  },

  premove: {
    opening: 0.11,
    recapture: 0.34,
    other: 0.05,
    hurried: 0.22,
    hurriedObvious: 0.5,
    panic: 0.4,
  },
  hurriedBelowMs: 10_000,
  panicBelowMs: 3000,

  reactionMs: [150, 350],
  panicReactionMs: [100, 250],
  quickMaxMs: 2500,
  maxClockShare: 0.5,
  maxBaseShare: 0.2,
};

export type Random = () => number;

const between = ([low, high]: [number, number], random: Random): number =>
  low + random() * (high - low);

/** Standard normal sample (Box-Muller). */
function gaussian(random: Random): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** A pace for one whole game: some days a player is simply quicker. */
export function drawGamePace(profile: TimeProfile, random: Random = Math.random): number {
  return Math.exp(profile.gameSpread * gaussian(random));
}

/**
 * The clock as it feels to the player. In games shorter than a minute the
 * same number of seconds is a bigger share of the game, so it feels like more.
 */
function feltClock(ownMs: number, baseMs: number): number {
  return ownMs / Math.min(1, Math.max(0.5, baseMs / 60_000));
}

/** Pace multiplier for the clock, interpolated between the profile's points. */
function clockPace(clockMs: number, points: [number, number][]): number {
  if (clockMs >= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [low, lowPace] = points[i];
    if (clockMs >= low) {
      const [high, highPace] = points[i - 1];
      return lowPace + ((clockMs - low) / (high - low)) * (highPace - lowPace);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Milliseconds the bot should appear to think. Zero means it premoved.
 * `gamePace` is this game's draw from `drawGamePace`. Pure apart from
 * `random`, so pacing can be simulated without a board.
 */
export function thinkTime(
  ctx: MoveContext,
  profile: TimeProfile = DEFAULT_TIME_PROFILE,
  gamePace = 1,
  random: Random = Math.random,
): number {
  const p = profile;
  const ownMoves = Math.floor(ctx.ply / 2);
  const clock = feltClock(ctx.ownMs, ctx.baseMs);
  const hurried = clock < p.hurriedBelowMs;
  const panic = clock < p.panicBelowMs;

  const surprised = ctx.swingCp !== null && Math.abs(ctx.swingCp) >= p.surpriseCp;
  const inOpening = ownMoves < p.opening.moves && !surprised;
  const obvious =
    ctx.forced ||
    ctx.isRecapture ||
    (ctx.isCapture && ctx.gapCp !== null && ctx.gapCp >= p.obviousGapCp) ||
    (ctx.humanProbability !== null && ctx.humanProbability >= p.obviousProbability);

  // Premoves: the move was decided before the opponent even replied.
  const premoveChance = panic
    ? p.premove.panic
    : hurried
      ? obvious
        ? p.premove.hurriedObvious
        : p.premove.hurried
      : inOpening
        ? p.premove.opening
        : ctx.isRecapture
          ? p.premove.recapture
          : p.premove.other;
  if (ctx.ply > 0 && random() < premoveChance) return 0;

  // Longer games are played more slowly, though not in proportion.
  const lengthScale = Math.pow(ctx.baseMs / 60_000, p.baseTimeExponent);
  let typical: number;
  if (inOpening) {
    typical = (ownMoves < p.opening.earlyMoves ? p.opening.earlyMs : p.opening.lateMs) * lengthScale;
  } else {
    let factor = 1;
    if (ctx.forced) factor = p.factor.forced;
    else if (ctx.isRecapture) factor = p.factor.recapture;
    else if (obvious) factor = p.factor.obvious;
    else {
      const manyChoices = ctx.closeChoices >= p.closeChoices;
      const tense = ctx.captureOptions >= p.tenseCaptures;
      if (manyChoices) factor *= p.factor.manyChoices;
      if (tense) factor *= p.factor.tense;
      if (surprised) factor *= p.factor.surprise;
      if (ctx.inCheck) factor *= p.factor.inCheck;
      if (!manyChoices && !tense && !surprised && !ctx.inCheck) factor *= p.factor.quiet;
    }
    if (ctx.evalCp !== null && Math.abs(ctx.evalCp) >= p.decidedCp) factor *= p.factor.decided;
    if (ctx.endgame) factor *= p.factor.endgame;
    typical = p.baseMs * lengthScale * factor + ctx.incMs * p.incrementUse;
  }

  let ms = typical * clockPace(clock, p.lowClock);
  ms *= Math.exp(p.noise * gaussian(random)) * p.tempo * gamePace;

  if (ctx.forced || ctx.isRecapture) ms = Math.min(ms, p.quickMaxMs);
  ms = Math.min(ms, ctx.ownMs * p.maxClockShare, ctx.baseMs * p.maxBaseShare + ctx.incMs);

  // Nobody answers an unexpected move faster than they can react to it.
  return Math.max(ms, between(panic ? p.panicReactionMs : p.reactionMs, random));
}
