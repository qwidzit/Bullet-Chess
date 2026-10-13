import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteGame,
  isArchived,
  loadHistory,
  outcomeOf,
  pgnOf,
  saveGame,
  type SavedGame,
} from '../src/core/history';
import { durationLabel, loadSettings, saveSettings, timeControlLabel } from '../src/core/settings';

/** The app keeps everything in the browser's localStorage; give Node a stand-in. */
beforeEach(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: key => void data.delete(key),
    clear: () => data.clear(),
    key: index => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
});

function game(overrides: Partial<SavedGame> = {}): SavedGame {
  return {
    id: 'a',
    playedAt: new Date(2026, 9, 13, 21, 3).getTime(),
    baseSec: 60,
    incSec: 0,
    playerColor: 'white',
    opponent: { name: 'Bot 1100', rating: 1100, speedPct: 100 },
    winner: 'white',
    reason: 'checkmate',
    // Scholar's mate.
    moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'],
    times: [500, 900, 1200, 700, 100, 2000, 300],
    ...overrides,
  };
}

describe('archive', () => {
  it('starts empty and keeps only what is saved', () => {
    expect(loadHistory()).toEqual([]);
    expect(isArchived('a')).toBe(false);
    saveGame(game());
    expect(isArchived('a')).toBe(true);
    expect(loadHistory()).toHaveLength(1);
  });

  it('lists the newest game first', () => {
    saveGame(game({ id: 'a' }));
    saveGame(game({ id: 'b' }));
    expect(loadHistory().map(g => g.id)).toEqual(['b', 'a']);
  });

  it('replaces a game saved again under the same id', () => {
    saveGame(game());
    saveGame(game({ review: { cp: [0], best: [], second: [] } }));
    expect(loadHistory()).toHaveLength(1);
    expect(loadHistory()[0].review).toBeDefined();
  });

  it('deletes one game and leaves the rest', () => {
    saveGame(game({ id: 'a' }));
    saveGame(game({ id: 'b' }));
    deleteGame('a');
    expect(loadHistory().map(g => g.id)).toEqual(['b']);
  });

  it('survives unreadable stored data', () => {
    localStorage.setItem('bullet-chess.history', '{not json');
    expect(loadHistory()).toEqual([]);
  });

  it('reads the result from the player\'s side', () => {
    expect(outcomeOf(game())).toBe('win');
    expect(outcomeOf(game({ playerColor: 'black' }))).toBe('loss');
    expect(outcomeOf(game({ winner: null }))).toBe('draw');
  });
});

describe('pgnOf', () => {
  it('writes headers, moves and the clock after every move', () => {
    const pgn = pgnOf(game());
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Black "Bot 1100"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[TimeControl "60+0"]');
    expect(pgn).toContain('[Date "2026.10.13"]');
    expect(pgn).toContain('1. e4 {[%clk 0:00:59.5]} e5 {[%clk 0:00:59.1]}');
    expect(pgn).toContain('Qxf7#');
  });

  it('counts the increment into the clocks', () => {
    const pgn = pgnOf(game({ incSec: 2 }));
    // 60 s minus 0.5 s spent plus 2 s added.
    expect(pgn).toContain('1. e4 {[%clk 0:01:01.5]}');
  });

  it('names the players the other way round when the player had Black', () => {
    const pgn = pgnOf(game({ playerColor: 'black', winner: 'white' }));
    expect(pgn).toContain('[White "Bot 1100"]');
    expect(pgn).toContain('[Black "You"]');
  });
});

describe('settings', () => {
  it('starts from the defaults', () => {
    expect(loadSettings()).toMatchObject({ baseSec: 60, incSec: 0, opponent: 'rated', rating: 1100, speedPct: 100 });
  });

  it('restores what was saved', () => {
    saveSettings({ ...loadSettings(), rating: 1350, speedPct: 45, incSec: 0.5 });
    expect(loadSettings()).toMatchObject({ rating: 1350, speedPct: 45, incSec: 0.5 });
  });

  it('drops settings that no longer exist or have the wrong type', () => {
    localStorage.setItem(
      'bullet-chess.settings',
      JSON.stringify({ botId: 'maia-1500', showLatency: true, rating: 'high', speedPct: 150 }),
    );
    const settings = loadSettings() as unknown as Record<string, unknown>;
    expect(settings.botId).toBeUndefined();
    expect(settings.showLatency).toBeUndefined();
    expect(settings.rating).toBe(1100);
    expect(settings.speedPct).toBe(150);
  });

  it('labels time controls the usual way', () => {
    expect(timeControlLabel(60, 0)).toBe('1+0');
    expect(timeControlLabel(30, 0.5)).toBe('0.5+0.5');
    expect(timeControlLabel(45, 0)).toBe('0.75+0');
    expect(timeControlLabel(1200, 15)).toBe('20+15');
    expect(durationLabel(45)).toBe('45 sec');
    expect(durationLabel(90)).toBe('1.5 min');
    expect(durationLabel(1200)).toBe('20 min');
  });
});
