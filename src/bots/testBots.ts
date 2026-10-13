import { Chess, type Move } from 'chess.js';
import type { Bot, BotReply, BotRequest } from './types';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Takes the most valuable piece on offer, otherwise moves at random. */
function greedyMove(fen: string): string {
  const moves = new Chess(fen).moves({ verbose: true }) as Move[];
  let best: Move[] = [];
  let bestGain = 0;
  for (const move of moves) {
    const gain = (move.captured ? VALUE[move.captured] : 0) + (move.promotion ? 8 : 0);
    if (gain > bestGain) {
      best = [move];
      bestGain = gain;
    } else if (gain === bestGain) {
      best.push(move);
    }
  }
  const pick = best[Math.floor(Math.random() * best.length)];
  return pick.from + pick.to + (pick.promotion ? 'q' : '');
}

/**
 * Speed-test opponents for measuring input latency. They play nonsense chess
 * on purpose: the point is how fast the board keeps up, not the moves.
 */
class TestBot implements Bot {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly minMs: number,
    private readonly maxMs: number,
  ) {}

  async init(): Promise<void> {}
  newGame(): void {}
  cancel(): void {}

  async chooseMove(request: BotRequest): Promise<BotReply> {
    return {
      move: greedyMove(request.fen),
      thinkMs: this.minMs + Math.random() * (this.maxMs - this.minMs),
    };
  }
}

export const instantBot = new TestBot(
  'instant',
  'Instant',
  'Speed test: replies in 0 ms',
  0,
  0,
);

export const scrambleBot = new TestBot(
  'scramble',
  'Scrambler',
  'Speed test: replies in 0.1–0.3 s, like a time scramble',
  100,
  300,
);
