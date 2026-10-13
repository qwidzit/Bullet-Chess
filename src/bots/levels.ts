/**
 * Calibrated opponent strengths, named after the chess.com bullet rating each
 * is meant to play like. Any rating in between is blended from its neighbours.
 *
 * How these were set (October 2026):
 * - 1100 is the anchor. Sampling Maia 1100 as it comes matches real chess.com
 *   bullet players rated 1050–1200 on the measures we could check: share of
 *   mistakes and blunders, seconds per move, and clock left through the game.
 * - 900 to 1500 are spaced by simulated matches so that each scores about 64%
 *   against the level below, which is what a 100-point rating gap means. They
 *   are not checked against real players of those ratings.
 * - 800 and 1600 are extrapolated from the trend and were never tested.
 * - Sampling temperature is the main dial: lower plays the likeliest moves
 *   more reliably. The network sets the style and adds a little strength.
 *   `care` (catching a blunder before playing it) is used only at the top.
 *
 * Pace is a separate setting and does not depend on the rating.
 */
export interface Level {
  rating: number;
  /** Maia network, by the Lichess rating it learned from. */
  network: number;
  temperature: number;
  /** Chance per move of catching a blunder before playing it. */
  care: number;
}

export const LEVELS: Level[] = [
  { rating: 800, network: 1100, temperature: 2.4, care: 0 },
  { rating: 900, network: 1100, temperature: 1.8, care: 0 },
  { rating: 1000, network: 1100, temperature: 1.35, care: 0 },
  { rating: 1100, network: 1100, temperature: 1, care: 0 },
  { rating: 1200, network: 1300, temperature: 0.88, care: 0 },
  { rating: 1300, network: 1500, temperature: 0.86, care: 0 },
  { rating: 1400, network: 1700, temperature: 0.76, care: 0.15 },
  { rating: 1500, network: 1900, temperature: 0.7, care: 0.25 },
  { rating: 1600, network: 1900, temperature: 0.58, care: 0.4 },
];

export const MIN_RATING = LEVELS[0].rating;
export const MAX_RATING = LEVELS[LEVELS.length - 1].rating;

/** The strength dials for any rating in range. */
export interface Dials {
  /** Networks of the calibrated levels below and above the rating... */
  lowNetwork: number;
  highNetwork: number;
  /** ...and the share of moves taken from the higher one. */
  highShare: number;
  temperature: number;
  care: number;
}

/**
 * Blends the two calibrated levels around `rating`. Temperature is blended
 * on a log scale because equal ratios of temperature are worth roughly equal
 * rating steps; the network is chosen move by move in proportion.
 */
export function dialsFor(rating: number): Dials {
  const r = Math.min(MAX_RATING, Math.max(MIN_RATING, rating));
  const upper = Math.max(1, LEVELS.findIndex(level => level.rating >= r));
  const low = LEVELS[upper - 1];
  const high = LEVELS[upper];
  const share = (r - low.rating) / (high.rating - low.rating);
  return {
    lowNetwork: low.network,
    highNetwork: high.network,
    highShare: share,
    temperature: Math.exp(Math.log(low.temperature) * (1 - share) + Math.log(high.temperature) * share),
    care: low.care * (1 - share) + high.care * share,
  };
}
