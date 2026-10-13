import { Chess } from 'chess.js';
import type { PlayerColor } from './game';
import { UNFINISHED, type SavedGame } from './history';

const CLOCK = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Thrown with a message fit to show the player. */
export class PgnError extends Error {}

/** "60", "180+2" or "600+0.5": seconds, then seconds added per move. Daily games have no clock. */
function timeControl(header: string | undefined): { baseSec: number; incSec: number } {
  const match = /^(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/.exec(header ?? '');
  return match ? { baseSec: Number(match[1]), incSec: Number(match[2] ?? 0) } : { baseSec: 0, incSec: 0 };
}

/** How the game ended, in a few words, from chess.com's "Termination" line or the final position. */
function endingOf(termination: string | undefined, chess: Chess): string {
  const text = (termination ?? '').toLowerCase();
  if (/on time|time forfeit/.test(text)) return /insufficient/.test(text) ? 'timeout vs insufficient material' : 'timeout';
  // "X won by resignation", "Game drawn by repetition".
  const by = / by (.+)$/.exec(text);
  if (by) return by[1];
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient material';
  if (chess.isThreefoldRepetition()) return 'repetition';
  return '';
}

/** "2026.10.13" (and an optional "21:03:00") as a time; now, if the date is missing or partial. */
function playedAt(date: string | undefined, time: string | undefined): number {
  const d = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date ?? '');
  if (!d) return Date.now();
  const t = /^(\d{2}):(\d{2})/.exec(time ?? '');
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 12, t ? Number(t[2]) : 0).getTime();
}

/**
 * Turns pasted PGN into a game the review screen can show. Accepts what
 * chess.com's Share → PGN gives (headers, clock comments and all), PGN from
 * other sites, or a bare list of moves. `playerColor` says which side the
 * person pasting it played.
 */
export function importPgn(text: string, playerColor: PlayerColor): SavedGame {
  const pgn = text.trim();
  if (!pgn) throw new PgnError('Paste a game first.');

  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new PgnError('That does not read as a chess game. Paste the PGN text of one game.');
  }
  const history = chess.history({ verbose: true });
  if (!history.length) throw new PgnError('That game has no moves in it.');

  const headers = chess.getHeaders();
  if (history[0].before !== START) {
    throw new PgnError('Only games from the normal starting position can be reviewed.');
  }

  const { baseSec, incSec } = timeControl(headers.TimeControl);
  // One clock reading per move, in order: the time left after that move.
  const clocks = [...pgn.matchAll(CLOCK)].map(
    ([, h, m, s]) => Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000),
  );
  const timed = clocks.length === history.length && baseSec > 0;
  const times = history.map((_, i) => {
    if (!timed) return 0;
    const before = i >= 2 ? clocks[i - 2] : baseSec * 1000;
    return Math.max(0, before - clocks[i] + incSec * 1000);
  });

  const them = playerColor === 'white' ? 'Black' : 'White';
  const rating = headers[`${them}Elo`];
  const name = headers[them] && headers[them] !== '?' ? headers[them] : 'Opponent';
  const result = headers.Result;
  // A bare move list has no result line; a mate on the board still names the winner.
  const mated: PlayerColor | null = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black' : 'white') : null;

  return {
    id: `import-${Date.now()}`,
    playedAt: playedAt(headers.UTCDate ?? headers.Date, headers.UTCTime),
    baseSec,
    incSec,
    playerColor,
    // No `rating` here: that field feeds the table of results against bots.
    opponent: { name: rating && rating !== '?' ? `${name} (${rating})` : name },
    winner: result === '1-0' ? 'white' : result === '0-1' ? 'black' : result === '1/2-1/2' ? null : mated,
    reason:
      (result === '*' || !result) && !chess.isGameOver() ? UNFINISHED : endingOf(headers.Termination, chess),
    moves: history.map(move => move.from + move.to + (move.promotion ?? '')),
    times,
    imported: true,
  };
}
