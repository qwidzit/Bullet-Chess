import { Chess } from 'chess.js';
import type { EndReason, PlayerColor, PlayerStats } from './game';
import type { GameReview } from './review';

/** Stands in for the ending of a pasted game whose result line says it was not finished. */
export const UNFINISHED = 'unfinished';

/**
 * A finished game. Games are kept on the device only when the player
 * archives them; until then one lives just as long as its result is on screen.
 */
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
  /** How it ended: one of the app's own endings, or a pasted game's own words. Empty if unknown. */
  reason: EndReason | string;
  /** Pasted in for analysis rather than played in the app. */
  imported?: boolean;
  /** Moves in UCI notation. */
  moves: string[];
  /** Time charged for each move, in ms. */
  times: number[];
  stats?: PlayerStats;
  /** Engine verdicts, filled in the first time the game is reviewed. */
  review?: GameReview;
}

const KEY = 'bullet-chess.history';
/** Oldest archived games are dropped beyond this, to stay inside browser storage limits. */
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

/** Archives a game, or replaces the archived copy with the same id. Newest first. */
export function saveGame(game: SavedGame): void {
  store([game, ...loadHistory().filter(g => g.id !== game.id)]);
}

export const isArchived = (id: string): boolean => loadHistory().some(g => g.id === id);

export function deleteGame(id: string): void {
  store(loadHistory().filter(g => g.id !== id));
}

export type Outcome = 'win' | 'loss' | 'draw';

export const outcomeOf = (game: SavedGame): Outcome =>
  game.winner === null ? 'draw' : game.winner === game.playerColor ? 'win' : 'loss';

/** "You won by checkmate", "Draw by repetition", "Unfinished game". */
export function resultLine(game: SavedGame): string {
  if (game.reason === UNFINISHED) return 'Unfinished game';
  const outcome = outcomeOf(game);
  const headline = outcome === 'draw' ? 'Draw' : outcome === 'win' ? 'You won' : 'You lost';
  return game.reason ? `${headline} by ${game.reason}` : headline;
}

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
