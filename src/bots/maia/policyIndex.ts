// The network scores 1858 possible moves, always written from the side to
// move's point of view (its own back rank is rank 1). This rebuilds that fixed
// list: every queen or knight move from every square, then the promotions.

const FILES = 'abcdefgh';

function buildMoves(): string[] {
  const moves: string[] = [];
  for (let from = 0; from < 64; from++) {
    const fromFile = from % 8;
    const fromRank = from >> 3;
    for (let to = 0; to < 64; to++) {
      if (to === from) continue;
      const df = Math.abs((to % 8) - fromFile);
      const dr = Math.abs((to >> 3) - fromRank);
      const queenLike = df === 0 || dr === 0 || df === dr;
      const knightLike = (df === 1 && dr === 2) || (df === 2 && dr === 1);
      if (queenLike || knightLike) {
        moves.push(`${FILES[fromFile]}${fromRank + 1}${FILES[to % 8]}${(to >> 3) + 1}`);
      }
    }
  }
  // Promotions to queen, rook and bishop have their own entries. A knight
  // promotion is the plain pawn move already listed above.
  for (let file = 0; file < 8; file++) {
    for (const toFile of [file - 1, file, file + 1]) {
      if (toFile < 0 || toFile > 7) continue;
      for (const piece of 'qrb') moves.push(`${FILES[file]}7${FILES[toFile]}8${piece}`);
    }
  }
  return moves;
}

export const POLICY_SIZE = 1858;

const moves = buildMoves();
if (moves.length !== POLICY_SIZE) throw new Error(`Policy table has ${moves.length} moves`);

const indexByMove = new Map(moves.map((move, index) => [move, index]));

/** Swaps a square or move between White's and Black's point of view. */
const flipRanks = (move: string): string => move.replace(/[1-8]/g, rank => String(9 - Number(rank)));

/**
 * Position of a move in the network's output.
 * `uci` is ordinary UCI ("e1g1", "e7e8q"); `castle` marks castling moves.
 */
export function policyIndex(uci: string, blackToMove: boolean, castle: 'k' | 'q' | null): number {
  let from = uci.slice(0, 2);
  let to = uci.slice(2, 4);
  // The network writes castling as the king capturing its own rook.
  if (castle) to = `${castle === 'k' ? 'h' : 'a'}${to[1]}`;
  if (blackToMove) {
    from = flipRanks(from);
    to = flipRanks(to);
  }
  const promotion = uci[4] && uci[4] !== 'n' ? uci[4] : '';
  const index = indexByMove.get(from + to + promotion);
  if (index === undefined) throw new Error(`Move ${uci} is not in the policy table`);
  return index;
}
