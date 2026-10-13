// Development tool, not part of the app: measures how accurately and how fast
// a set of games was played, with the same yardstick for real players and for
// bots, so bot settings can be tuned until the numbers match.
//
// Accuracy is judged by Stockfish at a fixed depth and expressed as lost
// winning chances per move (0–100), which unlike centipawns does not explode
// in positions that are already decided.

import { Chess } from 'chess.js';
import type { Bot } from '../bots';
import { lossOf, reviewGame } from '../core/review';
import { simulate, type SimGame } from './simulate';

/** A game reduced to what the measurements need. */
export interface GameRecord {
  moves: string[];
  /** Time left for the mover after each move, in ms. */
  clocks: number[];
  baseMs: number;
  incMs: number;
  /** Ratings of the two players, when known. */
  ratings?: { w: number; b: number };
  /** The game was decided by the clock. */
  endedOnTime: boolean;
}

export interface MoveStat {
  side: 'w' | 'b';
  /** 1 for the player's first move, 2 for their second, ... */
  ownMove: number;
  rating: number | null;
  /** Winning chances thrown away by this move, 0–100. */
  loss: number;
  clockBefore: number;
  spentMs: number;
  recapture: boolean;
}

/** Evaluations shared across games: openings repeat. */
const evalCache = new Map<string, { cp: number; best: string }>();

/** Judges every move of one game, with the same engine review the app shows players. */
export async function analyse(game: GameRecord): Promise<MoveStat[]> {
  const review = await reviewGame(game.moves, { cache: evalCache });
  if (!review) return [];

  const chess = new Chess();
  const stats: MoveStat[] = [];
  let lastTo: string | null = null;
  let lastWasCapture = false;

  game.moves.forEach((uci, i) => {
    const side = chess.turn();
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    const clockBefore = i >= 2 ? game.clocks[i - 2] : game.baseMs;
    stats.push({
      side,
      ownMove: (i >> 1) + 1,
      rating: game.ratings?.[side] ?? null,
      loss: lossOf(review, i),
      clockBefore,
      spentMs: clockBefore - game.clocks[i] + game.incMs,
      recapture: !!move.captured && lastWasCapture && move.to === lastTo,
    });
    lastTo = move.to;
    lastWasCapture = !!move.captured;
  });
  return stats;
}

export function recordOf(sim: SimGame): GameRecord {
  return {
    moves: sim.moves.map(m => m.uci),
    clocks: sim.moves.map(m => m.ownMs - Math.max(m.thinkMs, 100) + sim.incMs),
    baseMs: sim.baseMs,
    incMs: sim.incMs,
    endedOnTime: sim.ending === 'time',
  };
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const round = (value: number, digits = 1): number => Number(value.toFixed(digits));

/** The headline numbers for a set of judged moves. */
export function summarise(stats: MoveStat[], games: number) {
  const accuracy = (moves: MoveStat[]) => ({
    moves: moves.length,
    avgLoss: round(mean(moves.map(m => m.loss)), 2),
    mistakesPct: round((100 * moves.filter(m => m.loss >= 10).length) / moves.length),
    blundersPct: round((100 * moves.filter(m => m.loss >= 20).length) / moves.length),
  });
  // The first moves are theory and tell little about strength.
  const played = stats.filter(m => m.ownMove > 6);
  const seconds = (moves: MoveStat[]) => round(mean(moves.map(m => m.spentMs)) / 1000, 2);
  const clockAfter = (n: number) => {
    const at = stats.filter(m => m.ownMove === n);
    return at.length ? round(mean(at.map(m => m.clockBefore - m.spentMs)) / 1000) : null;
  };

  return {
    games,
    all: accuracy(played),
    calm: accuracy(played.filter(m => m.clockBefore >= 20_000)),
    hurried: accuracy(played.filter(m => m.clockBefore < 10_000)),
    secondsPerMove: {
      opening: seconds(stats.filter(m => m.ownMove <= 7)),
      recapture: seconds(played.filter(m => m.recapture && m.clockBefore >= 10_000)),
      other: seconds(played.filter(m => !m.recapture && m.clockBefore >= 10_000)),
      hurried: seconds(played.filter(m => m.clockBefore < 10_000)),
    },
    clockLeftAfterMove: { 10: clockAfter(10), 20: clockAfter(20), 30: clockAfter(30), 40: clockAfter(40) },
  };
}

/**
 * Plays `games` games between two bots. With `judge` every move is also
 * scored for accuracy, which takes about as long again as playing the games.
 */
export async function measureBots(
  white: Bot,
  black: Bot,
  baseSec: number,
  incSec: number,
  games: number,
  onProgress?: (done: number) => void,
  judge = true,
) {
  const stats: { w: MoveStat[]; b: MoveStat[] } = { w: [], b: [] };
  const score = { w: 0, b: 0, draws: 0, onTime: 0, moves: 0 };
  for (let g = 0; g < games; g++) {
    // Alternate colours so neither bot is measured only as White.
    const swap = g % 2 === 1;
    const sim = await simulate(swap ? black : white, swap ? white : black, baseSec, incSec);
    const judged = judge ? await analyse(recordOf(sim)) : [];
    for (const stat of judged) stats[(stat.side === 'w') !== swap ? 'w' : 'b'].push(stat);
    if (sim.winner === null) score.draws++;
    else score[(sim.winner === 'w') !== swap ? 'w' : 'b']++;
    if (sim.ending === 'time') score.onTime++;
    score.moves += Math.ceil(sim.moves.length / 2);
    onProgress?.(g + 1);
  }
  return {
    first: summarise(stats.w, games),
    second: summarise(stats.b, games),
    score: {
      first: score.w,
      second: score.b,
      draws: score.draws,
      endedOnTimePct: round((100 * score.onTime) / games),
      avgLength: round(score.moves / games),
    },
  };
}
