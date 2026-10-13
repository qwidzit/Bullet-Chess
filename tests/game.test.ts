// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from '../src/bots';
import { Game, type GameResult, type PlayerColor } from '../src/core/game';

/** A bot that plays a fixed list of moves, each after `thinkMs`. */
function scriptedBot(moves: string[], thinkMs = 0): Bot {
  let next = 0;
  return {
    id: 'scripted',
    name: 'Scripted',
    description: '',
    init: async () => {},
    newGame: () => {},
    cancel: () => {},
    chooseMove: async () => ({ move: moves[next++] ?? '', thinkMs }),
  };
}

/** The board reports the player's moves through this private handler. */
interface BoardInput {
  onBoardMove(from: string, to: string): void;
}

function play(bot: Bot, playerColor: PlayerColor = 'white', baseMs = 60_000, incMs = 0) {
  const results: GameResult[] = [];
  const game = new Game(
    document.createElement('div'),
    { baseMs, incMs, playerColor, bot },
    { onEnd: result => results.push(result) },
  );
  game.start();
  const board = game as unknown as BoardInput;
  return { game, results, move: (from: string, to: string) => board.onBoardMove(from, to) };
}

/** Lets the bot's reply, and anything it triggers, happen. */
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('Game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays the player\'s move and then the bot\'s reply', async () => {
    const { game, move } = play(scriptedBot(['e7e5']));
    move('e2', 'e4');
    await settle();
    expect(game.chess.history()).toEqual(['e4', 'e5']);
    expect(game.turn).toBe('w');
  });

  it('lets the bot move first when the player has Black', async () => {
    const { game } = play(scriptedBot(['d2d4']), 'black');
    await settle();
    expect(game.chess.history()).toEqual(['d4']);
  });

  it('ignores an illegal move by the player', async () => {
    const { game, move } = play(scriptedBot([]));
    move('e2', 'e5');
    await settle();
    expect(game.chess.history()).toEqual([]);
    expect(game.turn).toBe('w');
  });

  it('charges each side for its thinking time', async () => {
    const { game, move } = play(scriptedBot(['e7e5'], 2000));
    await settle(1500);
    move('e2', 'e4');
    await settle(2000);
    expect(game.clock.timeLeft('w')).toBe(58_500);
    expect(game.clock.timeLeft('b')).toBe(58_000);
  });

  describe('premoves', () => {
    it('queues moves made while the bot is thinking', async () => {
      const { game, move } = play(scriptedBot(['e7e5', 'b8c6', 'g8f6'], 1000));
      move('e2', 'e4');
      move('g1', 'f3');
      move('f1', 'c4');
      expect(game.queuedPremoves).toBe(2);
      expect(game.chess.history()).toEqual(['e4']);
    });

    it('plays one queued move per bot move, in order', async () => {
      const { game, move } = play(scriptedBot(['e7e5', 'b8c6', 'g8f6'], 1000));
      move('e2', 'e4');
      move('g1', 'f3');
      move('f1', 'c4');
      await settle(1000);
      expect(game.chess.history()).toEqual(['e4', 'e5', 'Nf3']);
      expect(game.queuedPremoves).toBe(1);
      await settle(1000);
      expect(game.chess.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
      expect(game.queuedPremoves).toBe(0);
    });

    it('charges a tenth of a second for a premove', async () => {
      const { game, move } = play(scriptedBot(['e7e5'], 1000));
      move('e2', 'e4');
      const before = game.clock.timeLeft('w');
      move('g1', 'f3');
      await settle(1000);
      expect(before - game.clock.timeLeft('w')).toBe(100);
    });

    it('drops the whole queue when the next premove is no longer legal', async () => {
      // The bot takes on e4, so the planned pawn push from e4 cannot happen.
      const { game, move } = play(scriptedBot(['d7d5', 'd5e4'], 1000));
      move('e2', 'e4');
      move('g1', 'f3');
      move('e4', 'e5');
      move('f1', 'c4');
      await settle(1000);
      expect(game.chess.history()).toEqual(['e4', 'd5', 'Nf3']);
      await settle(1000);
      expect(game.chess.history()).toEqual(['e4', 'd5', 'Nf3', 'dxe4']);
      expect(game.queuedPremoves).toBe(0);
      expect(game.turn).toBe('w');
    });

    it('can be cancelled', async () => {
      const { game, move } = play(scriptedBot(['e7e5'], 1000));
      move('e2', 'e4');
      move('g1', 'f3');
      game.cancelPremoves();
      await settle(1000);
      expect(game.chess.history()).toEqual(['e4', 'e5']);
    });
  });

  describe('endings', () => {
    it('ends in checkmate for the side that delivers it', async () => {
      // Fool's mate: the bot mates with the queen.
      const { game, results, move } = play(scriptedBot(['e7e5', 'd8h4']));
      move('f2', 'f3');
      await settle();
      move('g2', 'g4');
      await settle();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ winner: 'black', reason: 'checkmate' });
      expect(results[0].moves).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
      expect(results[0].times).toHaveLength(4);
      expect(game.over).toBe(true);
    });

    it('is lost on time when the player\'s clock runs out', async () => {
      const { results } = play(scriptedBot([]), 'white', 2000);
      await settle(2100);
      expect(results[0]).toMatchObject({ winner: 'black', reason: 'timeout' });
    });

    it('is won on time when the bot\'s clock runs out', async () => {
      const { results, move } = play(scriptedBot(['e7e5'], 60_000), 'white', 2000);
      move('e2', 'e4');
      await settle(2100);
      expect(results[0]).toMatchObject({ winner: 'white', reason: 'timeout' });
    });

    it('is a draw on time when the opponent has only a king', async () => {
      const { game, results } = play(scriptedBot([]), 'white', 2000);
      game.chess.load('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
      await settle(2100);
      expect(results[0]).toMatchObject({ winner: null, reason: 'timeout vs insufficient material' });
    });

    it('is lost by resignation', () => {
      const { game, results } = play(scriptedBot([]));
      game.resign();
      expect(results[0]).toMatchObject({ winner: 'black', reason: 'resignation' });
    });

    it('ignores moves and a second ending once it is over', async () => {
      const { game, results, move } = play(scriptedBot(['e7e5']));
      game.resign();
      move('e2', 'e4');
      game.resign();
      await settle(100);
      expect(results).toHaveLength(1);
      expect(game.chess.history()).toEqual([]);
    });

    it('is a draw by stalemate', async () => {
      const { game, results, move } = play(scriptedBot([]));
      game.chess.load('7k/8/5Q2/8/8/8/8/K7 w - - 0 1');
      move('f6', 'f7');
      await settle();
      expect(results[0]).toMatchObject({ winner: null, reason: 'stalemate' });
    });
  });

  describe('statistics', () => {
    it('counts premoves queued and played, and the longest run of them', async () => {
      const { game, results, move } = play(scriptedBot(['e7e5', 'b8c6', 'g8f6', 'f8c5'], 1000));
      move('e2', 'e4');
      // Two premoves that will both be played, then one real move.
      move('g1', 'f3');
      move('f1', 'c4');
      await settle(2000);
      await settle(1000);
      move('d2', 'd3');
      // One more premove, cancelled before its turn.
      move('b1', 'c3');
      game.cancelPremoves();
      game.resign();
      expect(results[0].stats).toMatchObject({
        moves: 4,
        premovesQueued: 3,
        premovesPlayed: 2,
        bestPremoveStreak: 2,
      });
    });

    it('reports the longest move and the average speed over the player\'s own time', async () => {
      const { game, results, move } = play(scriptedBot(['e7e5', 'b8c6']));
      await settle(3000);
      move('e2', 'e4');
      await settle(1000);
      move('g1', 'f3');
      await settle();
      game.resign();
      const { stats } = results[0];
      expect(stats.longestMoveMs).toBe(3000);
      // Two moves in four seconds of the player's clock.
      expect(stats.movesPerSec).toBeCloseTo(0.5);
      expect(stats.peakMovesPerSec).toBe(1);
    });
  });
});
