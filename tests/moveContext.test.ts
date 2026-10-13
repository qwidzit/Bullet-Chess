import { describe, expect, it } from 'vitest';
import { describeMove } from '../src/bots/moveContext';
import type { BotRequest } from '../src/bots/types';

function request(fen: string, lastMove: BotRequest['lastMove'] = null): BotRequest {
  return { fen, moves: [], ply: 20, lastMove, ownMs: 30_000, opponentMs: 30_000, baseMs: 60_000, incMs: 0 };
}

describe('describeMove', () => {
  it('recognises taking back on the square the opponent just captured on', () => {
    // Black has just played ...Bxd4; the queen takes back.
    const fen = '4k3/8/8/8/3b4/8/8/3QK3 w - - 0 1';
    const context = describeMove(request(fen, { to: 'd4', captured: true }), 'd1d4', [], null);
    expect(context).toMatchObject({ isCapture: true, isRecapture: true });
  });

  it('does not call a capture elsewhere, or after a quiet move, a recapture', () => {
    const fen = '4k3/8/8/8/3b4/8/8/3QK3 w - - 0 1';
    expect(describeMove(request(fen, { to: 'a1', captured: true }), 'd1d4', [], null).isRecapture).toBe(false);
    expect(describeMove(request(fen, { to: 'd4', captured: false }), 'd1d4', [], null).isRecapture).toBe(false);
  });

  it('notices a forced move and a check', () => {
    // The king on h1 is checked by the rook and has one square.
    const context = describeMove(request('7k/8/8/8/8/8/6P1/r6K w - - 0 1'), 'h1h2', [], null);
    expect(context).toMatchObject({ forced: true, inCheck: true });
  });

  it('counts the captures on offer and spots an endgame', () => {
    const middlegame = describeMove(
      request('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'),
      'e1g1',
      [],
      null,
    );
    expect(middlegame.endgame).toBe(false);
    expect(middlegame.captureOptions).toBe(2); // Nxe5 and Bxf7+
    expect(describeMove(request('4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1'), 'e2e7', [], null).endgame).toBe(true);
  });

  it('reads the engine lines: score, gap, close choices and swing', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const lines = [
      { move: 'e1g1', cp: 40 },
      { move: 'd2d3', cp: 30 },
      { move: 'b1c3', cp: 5 },
      { move: 'f3g5', cp: -90 },
    ];
    const context = describeMove(request(fen), 'e1g1', lines, 300, 0.4);
    expect(context).toMatchObject({ evalCp: 40, gapCp: 10, closeChoices: 3, swingCp: -260, humanProbability: 0.4 });
  });

  it('leaves engine figures empty when there are no lines', () => {
    const context = describeMove(request('4k3/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1g1', [], null);
    expect(context).toMatchObject({ evalCp: null, gapCp: null, swingCp: null, humanProbability: null });
  });
});
