import { read, write } from '@lichess-org/chessground/fen';
import { describe, expect, it } from 'vitest';
import { applyPremove, premoveDests } from '../src/core/premoves';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const ALL_CASTLING = { kingSide: true, queenSide: true };

describe('applyPremove', () => {
  it('moves the piece without checking legality', () => {
    const pieces = read(START);
    // A bishop cannot really jump its own pawn; on the virtual board it may.
    applyPremove(pieces, { from: 'f1', to: 'c4' });
    expect(pieces.get('c4')).toMatchObject({ role: 'bishop', color: 'white' });
    expect(pieces.has('f1')).toBe(false);
  });

  it('lets a piece land on one of its own, as a pre-recapture', () => {
    const pieces = read('3rk3/8/8/8/3N4/8/8/3QK3');
    applyPremove(pieces, { from: 'd1', to: 'd4' });
    expect(write(pieces)).toBe('3rk3/8/8/8/3Q4/8/8/4K3');
  });

  it('brings the rook along when the king castles', () => {
    const pieces = read('r3k2r/8/8/8/8/8/8/R3K2R');
    applyPremove(pieces, { from: 'e1', to: 'g1' });
    applyPremove(pieces, { from: 'e8', to: 'c8' });
    expect(write(pieces)).toBe('2kr3r/8/8/8/8/8/8/R4RK1');
  });

  it('promotes a pawn reaching the last rank to a queen', () => {
    const pieces = read('7k/P7/8/8/8/8/8/K7');
    applyPremove(pieces, { from: 'a7', to: 'a8' });
    expect(pieces.get('a8')).toMatchObject({ role: 'queen', color: 'white' });
  });

  it('does nothing when the piece has gone', () => {
    const pieces = read(START);
    applyPremove(pieces, { from: 'e4', to: 'e5' });
    expect(write(pieces)).toBe(START);
  });
});

describe('premoveDests', () => {
  const dests = (fen: string, castling = ALL_CASTLING) => premoveDests(read(fen), 'white', castling);

  it('offers a knight its eight jumps, on the board', () => {
    expect(dests(START).get('g1')?.sort()).toEqual(['e2', 'f3', 'h3']);
  });

  it('lets sliding pieces reach through blockers', () => {
    const bishop = dests(START).get('c1')!;
    expect(bishop).toContain('h6');
    expect(bishop).toContain('d2');
  });

  it('gives a pawn both pushes from its home rank and both captures', () => {
    expect(dests(START).get('e2')?.sort()).toEqual(['d3', 'e3', 'e4', 'f3']);
    expect(dests('4k3/8/8/8/4P3/8/8/4K3').get('e4')?.sort()).toEqual(['d5', 'e5', 'f5']);
  });

  it('offers castling only with the right and the rook in place', () => {
    const open = 'r3k2r/8/8/8/8/8/8/R3K2R';
    expect(dests(open).get('e1')).toEqual(expect.arrayContaining(['g1', 'c1']));
    expect(dests(open, { kingSide: false, queenSide: true }).get('e1')).not.toContain('g1');
    expect(dests('r3k2r/8/8/8/8/8/8/R3K3').get('e1')).not.toContain('g1');
  });

  it('only lists the given colour', () => {
    const map = dests(START);
    expect(map.has('e7')).toBe(false);
    expect(map.size).toBe(16);
  });
});
