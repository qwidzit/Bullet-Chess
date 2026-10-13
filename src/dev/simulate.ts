// Development tool, not part of the app: plays bot-versus-bot games on
// simulated clocks so pacing and strength can be checked in seconds instead of
// by hand. Load it from the dev server console:
//   const { simulate } = await import('/src/dev/simulate.ts');
//   const { createRatedBot } = await import('/src/bots/maiaBot.ts');
//   await simulate(createRatedBot({ rating: 1100 }), createRatedBot({ rating: 1300 }), 60, 0);

import { Chess } from 'chess.js';
import type { Bot } from '../bots';
import type { MoveContext } from '../bots/timeModel';
import { MIN_MOVE_MS } from '../core/clock';

export interface SimMove {
  ply: number;
  side: 'w' | 'b';
  uci: string;
  san: string;
  thinkMs: number;
  /** Clock before the move was made. */
  ownMs: number;
  context?: MoveContext;
}

export interface SimGame {
  moves: SimMove[];
  /** 'w' or 'b' for a decisive game, null for a draw. */
  winner: 'w' | 'b' | null;
  /** How it ended: 'checkmate', 'time' or 'draw'. */
  ending: 'checkmate' | 'time' | 'draw';
  clocks: { w: number; b: number };
  baseMs: number;
  incMs: number;
}

/** Plays one game between two bots on virtual clocks. */
export async function simulate(white: Bot, black: Bot, baseSec: number, incSec: number): Promise<SimGame> {
  const bots = { w: white, b: black };
  await Promise.all([white.init(), black.init()]);
  white.newGame();
  black.newGame();

  const chess = new Chess();
  const baseMs = baseSec * 1000;
  const incMs = incSec * 1000;
  const clocks = { w: baseMs, b: baseMs };
  const uci: string[] = [];
  const moves: SimMove[] = [];
  let lastMove: { to: string; captured: boolean } | null = null;

  const finish = (winner: SimGame['winner'], ending: SimGame['ending']): SimGame => ({
    moves,
    winner,
    ending,
    clocks,
    baseMs,
    incMs,
  });

  for (;;) {
    const side = chess.turn();
    const other = side === 'w' ? 'b' : 'w';
    const reply = await bots[side].chooseMove({
      fen: chess.fen(),
      moves: [...uci],
      ply: uci.length,
      lastMove,
      ownMs: clocks[side],
      opponentMs: clocks[other],
      baseMs,
      incMs,
    });
    const spent = Math.max(reply.thinkMs, MIN_MOVE_MS);
    if (spent >= clocks[side]) {
      // Out of time: a loss unless the opponent has nothing left to mate with.
      const material = chess.board().flat().filter(p => p && p.color === other && p.type !== 'k');
      const bare = material.length === 0 || (material.length === 1 && 'nb'.includes(material[0]!.type));
      return finish(bare ? null : other, bare ? 'draw' : 'time');
    }
    const move = chess.move({
      from: reply.move.slice(0, 2),
      to: reply.move.slice(2, 4),
      promotion: reply.move[4] ?? 'q',
    });
    moves.push({
      ply: uci.length,
      side,
      uci: reply.move,
      san: move.san,
      thinkMs: reply.thinkMs,
      ownMs: clocks[side],
      context: reply.context,
    });
    clocks[side] += incMs - spent;
    uci.push(reply.move);
    lastMove = { to: move.to, captured: !!move.captured };

    if (chess.isCheckmate()) return finish(side, 'checkmate');
    if (chess.isDraw() || uci.length >= 400) return finish(null, 'draw');
  }
}
