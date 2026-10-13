import { Chess } from 'chess.js';
import type { EndReason, PlayerColor } from './game';

/** A finished game, as kept on the device. */
export interface SavedGame {
  id: string;
  /** When the game ended, in ms since 1970. */
  playedAt: number;
  baseSec: number;
  incSec: number;
  playerColor: PlayerColor;
  opponent: {
    name: string;
    /** Set for human-like bots only. */
    rating?: number;
    speedPct?: number;
  };
  winner: PlayerColor | null;
  reason: EndReason;
  /** Moves in UCI notation. */
  moves: string[];
  /** Time charged for each move, in ms. */
  times: number[];
  /** Engine verdicts, filled in the first time the game is reviewed. */
  review?: { cp: number[]; best: string[] };
}

const KEY = 'bullet-chess.history';
/** Oldest games are dropped beyond this, to stay inside browser storage limits. */
const MAX_GAMES = 400;

export function loadHistory(): SavedGame[] {
  try {
    const games = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function store(games: SavedGame[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(games.slice(0, MAX_GAMES)));
  } catch {
    // Storage full or unavailable: the game is simply not kept.
  }
}

/** Adds a game, or replaces the stored copy with the same id. Newest first. */
export function saveGame(game: SavedGame): void {
  store([game, ...loadHistory().filter(g => g.id !== game.id)]);
}

export function deleteGame(id: string): void {
  store(loadHistory().filter(g => g.id !== id));
}

export type Outcome = 'win' | 'loss' | 'draw';

export const outcomeOf = (game: SavedGame): Outcome =>
  game.winner === null ? 'draw' : game.winner === game.playerColor ? 'win' : 'loss';

const clockTag = (ms: number): string => {
  const tenths = Math.max(0, Math.round(ms / 100));
  const seconds = (tenths % 600) / 10;
  return `[%clk 0:${String(Math.floor(tenths / 600)).padStart(2, '0')}:${seconds < 10 ? '0' : ''}${seconds.toFixed(1)}]`;
};

/** The game as PGN, with each player's remaining clock after every move. */
export function pgnOf(game: SavedGame): string {
  const chess = new Chess();
  const date = new Date(game.playedAt);
  const youAreWhite = game.playerColor === 'white';
  chess.setHeader('Event', 'Bullet Chess practice');
  chess.setHeader('Date', `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`);
  chess.setHeader('White', youAreWhite ? 'You' : game.opponent.name);
  chess.setHeader('Black', youAreWhite ? game.opponent.name : 'You');
  chess.setHeader('Result', game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2');
  chess.setHeader('TimeControl', `${game.baseSec}+${game.incSec}`);
  chess.setHeader('Termination', game.reason);

  const clocks = [game.baseSec * 1000, game.baseSec * 1000];
  game.moves.forEach((uci, i) => {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    clocks[i % 2] += game.incSec * 1000 - (game.times[i] ?? 0);
    chess.setComment(clockTag(clocks[i % 2]));
  });
  return chess.pgn();
}
