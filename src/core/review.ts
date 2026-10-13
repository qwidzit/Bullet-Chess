import { Chess, type Color, type Move, type Square } from 'chess.js';
import { engine } from '../bots/engine';
import { inBook } from './openingBook';

/** Engine verdicts on a whole game. */
export interface GameReview {
  /**
   * Score from White's point of view, in centipawns, for the starting position
   * and after every move. One entry longer than the move list.
   */
  cp: number[];
  /** The engine's preferred move in the position before each move. */
  best: string[];
  /** Score (White's point of view) of the engine's second choice there; null if there is none. */
  second: (number | null)[];
}

/**
 * How good a move was, on chess.com's scale. The thresholds for Best down to
 * Blunder are the ones chess.com publishes, in winning chances lost. Its
 * engine, its winning-chances model and its exact rules for Brilliant, Great
 * and Miss are private, so those three follow its descriptions as closely as
 * a simple rule can, and individual moves will sometimes be labelled
 * differently from chess.com's own review.
 */
export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Best to worst, the order chess.com lists them in. */
export const MOVE_CLASSES: { id: MoveClass; name: string; mark: string }[] = [
  { id: 'brilliant', name: 'Brilliant', mark: '!!' },
  { id: 'great', name: 'Great', mark: '!' },
  { id: 'best', name: 'Best', mark: '★' },
  { id: 'excellent', name: 'Excellent', mark: '✓' },
  { id: 'good', name: 'Good', mark: '·' },
  { id: 'book', name: 'Book', mark: '≡' },
  { id: 'inaccuracy', name: 'Inaccuracy', mark: '?!' },
  { id: 'mistake', name: 'Mistake', mark: '?' },
  { id: 'miss', name: 'Miss', mark: '✕' },
  { id: 'blunder', name: 'Blunder', mark: '??' },
];

const DEPTH = 10;
const MATE_CP = 10_000;
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Winning chances (0–100) for a centipawn score, the curve Lichess uses. */
export const winChance = (cp: number): number =>
  50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);

/** Winning chances the mover threw away with move `index`, 0–100. */
export function lossOf(review: GameReview, index: number): number {
  const sign = index % 2 === 0 ? 1 : -1;
  return Math.max(0, winChance(sign * review.cp[index]) - winChance(sign * review.cp[index + 1]));
}

/** What the engine made of one position; all scores from White's point of view. */
export type Evaluation = { cp: number; best: string; second: number | null };

/**
 * Runs Stockfish over every position of a game. Resolves with null when
 * `isCancelled` turns true part-way. Pass a `cache` to reuse evaluations
 * across games (openings repeat).
 */
export async function reviewGame(
  moves: string[],
  options: {
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
    cache?: Map<string, Evaluation>;
  } = {},
): Promise<GameReview | null> {
  await engine.init();
  engine.setOption('Skill Level', 20);
  // Two candidates per position: the gap between them shows when only one move was good.
  engine.setOption('MultiPV', 2);

  const chess = new Chess();
  const review: GameReview = { cp: [], best: [], second: [] };

  /** Scores for White and the best move in the current position. */
  const evaluate = async (): Promise<Evaluation> => {
    const whiteToMove = chess.turn() === 'w';
    if (chess.isCheckmate()) return { cp: whiteToMove ? -MATE_CP : MATE_CP, best: '', second: null };
    if (chess.isDraw() || chess.isStalemate()) return { cp: 0, best: '', second: null };
    const key = chess.fen().split(' ').slice(0, 4).join(' ');
    let known = options.cache?.get(key);
    if (!known) {
      const result = await engine.search(chess.fen(), `depth ${DEPTH}`);
      const forWhite = (cp: number) => (whiteToMove ? cp : -cp);
      known = {
        cp: forWhite(result.lines[0]?.cp ?? 0),
        best: result.bestMove,
        second: result.lines[1] ? forWhite(result.lines[1].cp) : null,
      };
      options.cache?.set(key, known);
    }
    return known;
  };

  for (let i = 0; i <= moves.length; i++) {
    if (options.isCancelled?.()) {
      engine.stop();
      return null;
    }
    const { cp, best, second } = await evaluate();
    review.cp.push(cp);
    if (i === moves.length) break;
    review.best.push(best);
    review.second.push(second);
    const uci = moves[i];
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    } catch {
      return null;
    }
    options.onProgress?.(i + 1, moves.length);
  }
  return review;
}

/**
 * Value of the piece on `square` if it can be taken at a profit: attacked and
 * either undefended or attacked by something cheaper. Zero otherwise. A king
 * only counts as an attacker of an undefended piece. Pins are ignored.
 */
function hangingAt(chess: Chess, square: Square): number {
  const piece = chess.get(square);
  if (!piece || piece.type === 'k' || piece.type === 'p') return 0;
  const enemy: Color = piece.color === 'w' ? 'b' : 'w';
  const attackers = chess.attackers(square, enemy).map(s => chess.get(s)!.type);
  if (!attackers.length) return 0;
  const value = PIECE_VALUE[piece.type];
  if (!chess.attackers(square, piece.color).length) return value;
  const cheaper = attackers.some(type => type !== 'k' && PIECE_VALUE[type] < value);
  return cheaper ? value : 0;
}

/** Value of the most valuable piece `color` has left to be taken. */
function hangingValue(chess: Chess, color: Color): number {
  let worst = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.color === color) worst = Math.max(worst, hangingAt(chess, piece.square));
    }
  }
  return worst;
}

/** Labels every move of a reviewed game on chess.com's scale. */
export function classifyGame(moves: string[], review: GameReview): MoveClass[] {
  const chess = new Chess();
  const classes: MoveClass[] = [];
  const san: string[] = [];
  let followingBook = true;
  /** Winning chances the opponent gave away on the previous move. */
  let gift = 0;
  let last: Move | undefined;

  moves.forEach((uci, i) => {
    const mover = chess.turn();
    const sign = i % 2 === 0 ? 1 : -1;
    const before = winChance(sign * review.cp[i]);
    const after = winChance(sign * review.cp[i + 1]);
    const loss = Math.max(0, before - after);
    const choices = chess.moves().length;
    const hangingBefore = hangingValue(chess, mover);

    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    san.push(move.san);
    followingBook &&= inBook(san);
    const playedBest = uci.slice(0, 4) === review.best[i]?.slice(0, 4);
    const recapture = !!move.captured && !!last?.captured && move.to === last.to;

    let cls: MoveClass;
    if (followingBook) cls = 'book';
    else if (loss >= 20) cls = 'blunder';
    else if (loss >= 10) cls = 'mistake';
    else if (loss >= 5) cls = 'inaccuracy';
    else if (loss >= 2) cls = 'good';
    else if (playedBest || loss < 0.5) cls = 'best';
    else cls = 'excellent';

    if (cls === 'best' || cls === 'excellent') {
      // Brilliant: a sound sacrifice. The piece that moved can be taken where
      // it landed, or the move leaves a bigger piece to be taken than was
      // hanging before; either way it gives up clearly more than it captures,
      // keeps the position at least level, and was not played from an already
      // won game.
      const offered = Math.max(
        hangingAt(chess, move.to),
        hangingValue(chess, mover) > hangingBefore ? hangingValue(chess, mover) : 0,
      );
      const captured = move.captured ? PIECE_VALUE[move.captured] : 0;
      const sacrifice = offered - captured >= 2;
      if (sacrifice && after >= 50 && before <= 92) cls = 'brilliant';
      else {
        // Great: the one move that held or won. The engine's second choice is
        // clearly worse, and the move was neither forced nor an obvious recapture.
        const second = review.second[i];
        const onlyMove = second !== null && before - winChance(sign * second) >= 15;
        if (playedBest && onlyMove && choices > 1 && !recapture) cls = 'great';
      }
    } else if ((cls === 'mistake' || cls === 'blunder') && gift >= 10 && after >= 40) {
      // Miss: the opponent had just erred and the chance went begging, without
      // the position turning bad.
      cls = 'miss';
    }

    classes.push(cls);
    gift = loss;
    last = move;
  });
  return classes;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

function deviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/**
 * Accuracy of both players, 0–100, by the formula Lichess publishes.
 * Chess.com's own accuracy score is not public; the two usually land within a
 * few points of each other but are not the same number.
 *
 * Each move is scored from the winning chances it lost. A player's accuracy is
 * the average of two means of those scores: one weighted towards the volatile
 * parts of the game, one harmonic, which punishes single bad moves.
 */
export function accuracyOf(review: GameReview): { white: number; black: number } {
  const chances = review.cp.map(winChance);
  const moves = chances.length - 1;
  const window = clamp(Math.floor(moves / 10), 2, 8);
  const tallies = [
    { weighted: 0, weights: 0, inverse: 0, count: 0 },
    { weighted: 0, weights: 0, inverse: 0, count: 0 },
  ];

  for (let i = 0; i < moves; i++) {
    const white = i % 2 === 0;
    const before = white ? chances[i] : 100 - chances[i];
    const after = white ? chances[i + 1] : 100 - chances[i + 1];
    const lost = Math.max(0, before - after);
    const score = clamp(103.1668100711649 * Math.exp(-0.04354415386753951 * lost) - 3.166924740191411 + 1, 0, 100);
    // Moves count for more where the evaluation around them was swinging.
    const start = Math.max(0, i - (window - 2));
    const weight = clamp(deviation(chances.slice(start, start + window)), 0.5, 12);

    const tally = tallies[white ? 0 : 1];
    tally.weighted += score * weight;
    tally.weights += weight;
    tally.inverse += 1 / Math.max(score, 0.1);
    tally.count++;
  }

  const result = tallies.map(t =>
    t.count ? (t.weighted / t.weights + t.count / t.inverse) / 2 : 0,
  );
  return { white: result[0], black: result[1] };
}
