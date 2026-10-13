import { describe, expect, it } from 'vitest';
import { resultLine } from '../src/core/history';
import { importPgn, PgnError } from '../src/core/pgnImport';

/** The shape of what chess.com's Share → PGN gives for a live game. */
const CHESS_COM = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.10.13"]
[Round "-"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[CurrentPosition "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"]
[Timezone "UTC"]
[ECO "C20"]
[UTCDate "2026.10.13"]
[UTCTime "18:03:00"]
[WhiteElo "1092"]
[BlackElo "1104"]
[TimeControl "60"]
[Termination "alice won by checkmate"]
[Link "https://www.chess.com/game/live/1"]

1. e4 {[%clk 0:00:59.9]} 1... e5 {[%clk 0:00:59.2]} 2. Qh5 {[%clk 0:00:58.4]} 2... Nc6 {[%clk 0:00:57.9]} 3. Bc4 {[%clk 0:00:57.1]} 3... Nf6 {[%clk 0:00:56.9]} 4. Qxf7# {[%clk 0:00:56.6]} 1-0`;

describe('importPgn', () => {
  it('reads a chess.com game: moves, clocks, players and result', () => {
    const game = importPgn(CHESS_COM, 'white');
    expect(game.moves).toEqual(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']);
    expect(game).toMatchObject({
      baseSec: 60,
      incSec: 0,
      playerColor: 'white',
      winner: 'white',
      reason: 'checkmate',
      imported: true,
      opponent: { name: 'bob (1104)' },
    });
    // Time spent is the drop in that player's own clock.
    expect(game.times).toEqual([100, 800, 1500, 1300, 1300, 1000, 500]);
    expect(resultLine(game)).toBe('You won by checkmate');
  });

  it('takes the other player as the opponent when the player had Black', () => {
    const game = importPgn(CHESS_COM, 'black');
    expect(game.opponent.name).toBe('alice (1092)');
    expect(resultLine(game)).toBe('You lost by checkmate');
  });

  it('never records a rating for the opponent, so bot results are not skewed', () => {
    expect(importPgn(CHESS_COM, 'white').opponent.rating).toBeUndefined();
  });

  it('uses the date the game was played', () => {
    const played = new Date(importPgn(CHESS_COM, 'white').playedAt);
    expect([played.getFullYear(), played.getMonth() + 1, played.getDate()]).toEqual([2026, 10, 13]);
  });

  it('counts the increment into time spent', () => {
    const pgn = `[TimeControl "60+1"]\n\n1. e4 {[%clk 0:01:00.5]} e5 {[%clk 0:00:59]} *`;
    // White ended half a second up after gaining a second: half a second spent.
    expect(importPgn(pgn, 'white').times).toEqual([500, 2000]);
  });

  it('accepts a bare list of moves, with no clock times', () => {
    const game = importPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5', 'white');
    expect(game.moves).toHaveLength(5);
    expect(game.times).toEqual([0, 0, 0, 0, 0]);
    expect(game.baseSec).toBe(0);
    expect(game.opponent.name).toBe('Opponent');
    expect(resultLine(game)).toBe('Unfinished game');
  });

  it('works out the winner of a bare move list that ends in mate', () => {
    const game = importPgn('1. f3 e5 2. g4 Qh4#', 'white');
    expect(game).toMatchObject({ winner: 'black', reason: 'checkmate' });
    expect(resultLine(game)).toBe('You lost by checkmate');
  });

  it('reads the common endings from chess.com\'s wording', () => {
    const ending = (termination: string, result = '0-1') =>
      importPgn(`[Result "${result}"]\n[Termination "${termination}"]\n\n1. e4 e5 ${result}`, 'white').reason;
    expect(ending('bob won on time')).toBe('timeout');
    expect(ending('bob won by resignation')).toBe('resignation');
    expect(ending('Game drawn by repetition', '1/2-1/2')).toBe('repetition');
    expect(ending('Game drawn by timeout vs insufficient material', '1/2-1/2')).toBe(
      'timeout vs insufficient material',
    );
  });

  it('has no time control for a daily game', () => {
    const game = importPgn('[TimeControl "1/86400"]\n\n1. e4 e5 *', 'white');
    expect(game.baseSec).toBe(0);
    expect(game.times).toEqual([0, 0]);
  });

  it('explains what is wrong with text that is not a game', () => {
    expect(() => importPgn('', 'white')).toThrow(PgnError);
    expect(() => importPgn('   \n ', 'white')).toThrow('Paste a game first.');
    expect(() => importPgn('hello there', 'white')).toThrow(PgnError);
    expect(() => importPgn('[Event "Live Chess"]\n\n*', 'white')).toThrow('no moves');
    expect(() => importPgn('1. e4 e5 2. Ke3', 'white')).toThrow(PgnError);
  });

  it('refuses a game that did not start from the normal position', () => {
    const pgn = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *';
    expect(() => importPgn(pgn, 'white')).toThrow('normal starting position');
  });
});
