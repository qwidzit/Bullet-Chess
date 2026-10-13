import type { Color, Key, Pieces } from '@lichess-org/chessground/types';

export interface Premove {
  from: Key;
  to: Key;
}

const FILES = 'abcdefgh';

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DIAGONAL = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const STRAIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Plays a queued premove on a piece map without checking legality, so the
 * board can show where the pieces will stand once the queue has run.
 */
export function applyPremove(pieces: Pieces, { from, to }: Premove): void {
  const piece = pieces.get(from);
  if (!piece) return;
  pieces.delete(from);

  const rank = to[1];
  const home = piece.color === 'white' ? 'e1' : 'e8';
  if (piece.role === 'king' && from === home && (to === `g${rank}` || to === `c${rank}`)) {
    const kingSide = to[0] === 'g';
    const rookFrom = `${kingSide ? 'h' : 'a'}${rank}` as Key;
    const rook = pieces.get(rookFrom);
    if (rook?.role === 'rook' && rook.color === piece.color) {
      pieces.delete(rookFrom);
      pieces.set(`${kingSide ? 'f' : 'd'}${rank}` as Key, rook);
    }
  }

  const promotes = piece.role === 'pawn' && (rank === '1' || rank === '8');
  pieces.set(to, promotes ? { role: 'queen', color: piece.color } : piece);
}

/**
 * Squares each of `color`'s pieces may be premoved to. Deliberately generous:
 * blockers are ignored and own pieces can be targeted, because the position
 * will have changed by the time the premove is tried. Legality is checked then.
 */
export function premoveDests(
  pieces: Pieces,
  color: Color,
  castling: { kingSide: boolean; queenSide: boolean },
): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const [key, piece] of pieces) {
    if (piece.color !== color) continue;
    const file = key.charCodeAt(0) - 97;
    const rank = Number(key[1]) - 1;
    const out: Key[] = [];
    const add = (df: number, dr: number) => {
      const f = file + df;
      const r = rank + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(`${FILES[f]}${r + 1}` as Key);
    };
    const slide = (directions: number[][]) => {
      for (const [df, dr] of directions) for (let i = 1; i < 8; i++) add(df * i, dr * i);
    };

    switch (piece.role) {
      case 'pawn': {
        const dir = color === 'white' ? 1 : -1;
        add(0, dir);
        if (rank === (color === 'white' ? 1 : 6)) add(0, 2 * dir);
        add(-1, dir);
        add(1, dir);
        break;
      }
      case 'knight':
        for (const [df, dr] of KNIGHT) add(df, dr);
        break;
      case 'bishop':
        slide(DIAGONAL);
        break;
      case 'rook':
        slide(STRAIGHT);
        break;
      case 'queen':
        slide(DIAGONAL);
        slide(STRAIGHT);
        break;
      case 'king': {
        for (const [df, dr] of [...DIAGONAL, ...STRAIGHT]) add(df, dr);
        const back = color === 'white' ? '1' : '8';
        const ownRook = (square: string) => {
          const rook = pieces.get(square as Key);
          return rook?.role === 'rook' && rook.color === color;
        };
        if (key === `e${back}`) {
          if (castling.kingSide && ownRook(`h${back}`)) add(2, 0);
          if (castling.queenSide && ownRook(`a${back}`)) add(-2, 0);
        }
        break;
      }
    }
    dests.set(key, out);
  }
  return dests;
}
