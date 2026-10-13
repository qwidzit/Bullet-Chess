// A small book of well-known opening lines, grouped by opening. It serves two
// purposes: the review calls a move "book" while the game still follows one of
// these lines, and a bot given a repertoire plays along them.
//
// It is far smaller than a real opening database: the main lines of common
// openings, a few moves deep.

export interface Opening {
  id: string;
  name: string;
  /** Each line as space-separated SAN from the first move. */
  lines: string[];
}

export const OPENINGS: Opening[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    lines: [
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5',
      'e4 e5 Nf3 Nc6 Bc4 Be7',
      'e4 e5 Nf3 Nc6 Bc4 d6',
      'e4 e5 Nf3 Nc6 Bc4 Nd4',
    ],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    lines: [
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',
      'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4',
      'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6',
      'e4 e5 Nf3 Nc6 Bb5 Bc5',
      'e4 e5 Nf3 Nc6 Bb5 d6',
      'e4 e5 Nf3 Nc6 Bb5 Nd4',
      'e4 e5 Nf3 Nc6 Bb5 f5',
    ],
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    lines: ['e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5'],
  },
  {
    id: 'four-knights',
    name: 'Four Knights',
    lines: ['e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4', 'e4 e5 Nf3 Nc6 Nc3 Nf6 d4 exd4 Nxd4 Bb4'],
  },
  {
    id: 'petrov',
    name: 'Petrov and Philidor',
    lines: [
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7',
      'e4 e5 Nf3 d6 Bc4',
    ],
  },
  {
    id: 'vienna',
    name: 'Vienna and King\'s Gambit',
    lines: [
      'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4',
      'e4 e5 Nc3 Nc6 Bc4 Nf6 d3',
      'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5',
      'e4 e5 f4 d5 exd5 e4',
    ],
  },
  {
    id: 'open-sidelines',
    name: 'Other 1.e4 e5 lines',
    lines: [
      'e4 e5 Nf3 Nc6 c3 Nf6 d4',
      'e4 e5 Nf3 Nc6 d3',
      'e4 e5 Bc4 Nf6 d3 Nc6 Nf3',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3',
      'e4 e5 d4 exd4 c3 dxc3 Bc4',
      'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6',
    ],
  },
  {
    id: 'sicilian',
    name: 'Sicilian Defence',
    lines: [
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6',
      'e4 c5 Nf3 Nc6 Bb5 g6',
      'e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7',
      'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4',
      'e4 c5 c3 d5 exd5 Qxd5 d4',
      'e4 c5 d4 cxd4 c3 dxc3 Nxc3',
      'e4 c5 Bc4 e6',
      'e4 c5 f4 d5',
    ],
  },
  {
    id: 'french',
    name: 'French Defence',
    lines: [
      'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7',
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
      'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6',
      'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7',
    ],
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    lines: [
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
      'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3',
      'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3',
    ],
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defence',
    lines: ['e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3', 'e4 d5 exd5 Nf6 d4 Nxd5 Nf3'],
  },
  {
    id: 'pirc',
    name: 'Pirc, Modern and Alekhine',
    lines: [
      'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7',
      'e4 g6 d4 Bg7 Nc3 d6',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3',
      'e4 Nc6 d4 d5',
      'e4 b6 d4 Bb7',
    ],
  },
  {
    id: 'queens-gambit',
    name: 'Queen\'s Gambit',
    lines: [
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7',
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7',
      'd4 d5 c4 e6 Nc3 c5 cxd5 exd5',
      'd4 d5 c4 Nf6',
      'd4 d5 c4 e5 dxe5 d4',
      'd4 d5 Nf3 Nf6 c4 e6',
      'd4 Nf6 Nf3 d5 c4 e6',
      'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bg5',
    ],
  },
  {
    id: 'london',
    name: 'London System',
    lines: [
      'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2',
      'd4 d5 Bf4 c5',
      'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5',
      'd4 d5 Nc3 Nf6 Bf4',
      'd4 Nf6 Bf4 d5 e3',
      'd4 Nf6 Nf3 g6 Bf4 Bg7 e3',
      'd4 Nf6 Nf3 e6 Bf4 c5 e3',
    ],
  },
  {
    id: 'kings-indian',
    name: 'King\'s Indian and Grünfeld',
    lines: [
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5',
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7',
    ],
  },
  {
    id: 'nimzo',
    name: 'Nimzo, Queen\'s Indian and Catalan',
    lines: [
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5',
      'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7',
      'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O',
    ],
  },
  {
    id: 'benoni',
    name: 'Benoni, Benko and Budapest',
    lines: [
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6',
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6',
      'd4 Nf6 c4 e5 dxe5 Ng4',
    ],
  },
  {
    id: 'dutch',
    name: 'Dutch Defence',
    lines: ['d4 f5 g3 Nf6 Bg2 e6 Nf3', 'd4 f5 c4 Nf6 Nc3 e6', 'd4 e6 c4 f5'],
  },
  {
    id: 'd4-sidelines',
    name: 'Other 1.d4 lines',
    lines: ['d4 d5 Nf3 Nf6 e3 e6 Bd3 c5', 'd4 d5 e4 dxe4 Nc3 Nf6 f3', 'd4 Nf6 Bg5 Ne4 Bf4'],
  },
  {
    id: 'english',
    name: 'English Opening',
    lines: [
      'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5',
      'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7',
      'c4 Nf6 Nc3 e6 e4',
      'c4 e6 Nc3 d5 d4 Nf6',
    ],
  },
  {
    id: 'flank',
    name: 'Réti and flank openings',
    lines: [
      'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7',
      'Nf3 Nf6 c4 g6 Nc3 Bg7',
      'Nf3 d5 c4 e6',
      'Nf3 d5 d4 Nf6 c4 e6',
      'b3 e5 Bb2 Nc6 e3 d5',
      'f4 d5 Nf3 Nf6 e3 g6',
      'g3 d5 Bg2 Nf6 Nf3',
    ],
  },
];

export const BOOK_LINES: readonly string[] = OPENINGS.flatMap(opening => opening.lines);

/** Every opening line and every way of starting one, as space-separated SAN. */
const prefixes = new Set<string>();
for (const line of BOOK_LINES) {
  const moves = line.split(' ');
  for (let n = 1; n <= moves.length; n++) prefixes.add(moves.slice(0, n).join(' '));
}

/** True while `sanMoves`, the game so far, follows a known opening line. */
export const inBook = (sanMoves: string[]): boolean => prefixes.has(sanMoves.join(' '));

/**
 * The moves that keep the game inside one opening: for every line of it that
 * starts with `sanMoves`, the move that comes next. Empty once the game has
 * left the opening or run past the end of its lines.
 */
export function repertoireMoves(openingId: string, sanMoves: string[]): string[] {
  const opening = OPENINGS.find(o => o.id === openingId);
  if (!opening) return [];
  const played = sanMoves.join(' ');
  const next = new Set<string>();
  for (const line of opening.lines) {
    const moves = line.split(' ');
    const matches = moves.slice(0, sanMoves.length).join(' ') === played;
    if (matches && moves.length > sanMoves.length) next.add(moves[sanMoves.length]);
  }
  return [...next];
}
