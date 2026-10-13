import { Chess } from 'chess.js';
import { engine } from '../bots/engine';

/** Engine verdicts on a whole game. */
export interface GameReview {
  /**
   * Score from White's point of view, in centipawns, for the starting position
   * and after every move. One entry longer than the move list.
   */
  cp: number[];
  /** The engine's preferred move in the position before each move. */
  best: string[];
}

export type Verdict = 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const DEPTH = 10;
const MATE_CP = 10_000;

/** Winning chances (0–100) for a centipawn score, the curve Lichess uses. */
export const winChance = (cp: number): number =>
  50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);

/** Winning chances the mover threw away with move `index`, 0–100. */
export function lossOf(review: GameReview, index: number): number {
  const sign = index % 2 === 0 ? 1 : -1;
  return Math.max(0, winChance(sign * review.cp[index]) - winChance(sign * review.cp[index + 1]));
}

export function verdictOf(loss: number): Verdict {
  if (loss >= 20) return 'blunder';
  if (loss >= 10) return 'mistake';
  if (loss >= 5) return 'inaccuracy';
  return 'good';
}

type Evaluation = { cp: number; best: string };

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
  engine.setOption('MultiPV', 1);

  const chess = new Chess();
  const review: GameReview = { cp: [], best: [] };

  /** Score for White and best move in the current position. */
  const evaluate = async (): Promise<Evaluation> => {
    const whiteToMove = chess.turn() === 'w';
    if (chess.isCheckmate()) return { cp: whiteToMove ? -MATE_CP : MATE_CP, best: '' };
    if (chess.isDraw() || chess.isStalemate()) return { cp: 0, best: '' };
    const key = chess.fen().split(' ').slice(0, 4).join(' ');
    let known = options.cache?.get(key);
    if (!known) {
      const result = await engine.search(chess.fen(), `depth ${DEPTH}`);
      const cp = result.lines[0]?.cp ?? 0;
      known = { cp: whiteToMove ? cp : -cp, best: result.bestMove };
      options.cache?.set(key, known);
    }
    return known;
  };

  for (let i = 0; i <= moves.length; i++) {
    if (options.isCancelled?.()) {
      engine.stop();
      return null;
    }
    const { cp, best } = await evaluate();
    review.cp.push(cp);
    if (i === moves.length) break;
    review.best.push(best);
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
