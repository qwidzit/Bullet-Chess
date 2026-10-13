import { Chess, type Move } from 'chess.js';
import { policyIndex } from './policyIndex';

// Input layout expected by the Maia networks (Leela's "classical" format):
// the last 8 positions, 13 planes each, then 8 planes of game state. Every
// plane is an 8x8 grid seen from the side to move, its own back rank first.
const HISTORY = 8;
const PLANES_PER_POSITION = 13;
const STATE_BASE = HISTORY * PLANES_PER_POSITION;
export const PLANES = STATE_BASE + 8;

const PIECE_PLANE: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

type Board = ReturnType<Chess['board']>;

interface Snapshot {
  board: Board;
  /** The position has occurred earlier in the game. */
  repeated: boolean;
}

export interface Candidate {
  uci: string;
  /** Where this move's score sits in the network output. */
  index: number;
  /** What kind of move it is, for bots that favour a way of playing. */
  kind: MoveKind;
}

export interface MoveKind {
  capture: boolean;
  check: boolean;
  castle: boolean;
  /** A pawn move that is not a capture. */
  pawnPush: boolean;
}

export interface Encoded {
  planes: Float32Array;
  candidates: Candidate[];
}

/** Position identity for repetition: placement, turn, castling and en passant. */
const positionKey = (chess: Chess): string => chess.fen().split(' ').slice(0, 4).join(' ');

/**
 * Replays the game and returns the recent positions, newest first. Falls back
 * to the bare position when the moves do not lead to `fen` (a game set up from
 * a custom position), in which case there is no history to show the network.
 */
function recentPositions(uciMoves: string[], fen: string): { chess: Chess; recent: Snapshot[] } {
  const chess = new Chess();
  const seen = new Map<string, number>();
  const snapshots: Snapshot[] = [];
  const record = () => {
    const key = positionKey(chess);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    snapshots.push({ board: chess.board(), repeated: count > 0 });
    if (snapshots.length > HISTORY) snapshots.shift();
  };

  let replayed = true;
  record();
  try {
    for (const uci of uciMoves) {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
      record();
    }
  } catch {
    replayed = false;
  }
  if (replayed && positionKey(chess) === fen.split(' ').slice(0, 4).join(' ')) {
    return { chess, recent: snapshots.reverse() };
  }
  const bare = new Chess(fen);
  return { chess: bare, recent: [{ board: bare.board(), repeated: false }] };
}

/** Turns a game into network input plus the legal moves to read back out. */
export function encode(uciMoves: string[], fen: string): Encoded {
  const { chess, recent } = recentPositions(uciMoves, fen);
  const mover = chess.turn();
  const black = mover === 'b';
  const planes = new Float32Array(PLANES * 64);
  const fill = (plane: number, value = 1) => planes.fill(value, plane * 64, plane * 64 + 64);

  recent.forEach((snapshot, age) => {
    const base = age * PLANES_PER_POSITION;
    for (let row = 0; row < 8; row++) {
      for (let file = 0; file < 8; file++) {
        const piece = snapshot.board[row][file];
        if (!piece) continue;
        // chess.js lists rank 8 first; the network wants the mover's rank 1 first.
        const rank = black ? row : 7 - row;
        const plane = base + PIECE_PLANE[piece.type] + (piece.color === mover ? 0 : 6);
        planes[plane * 64 + rank * 8 + file] = 1;
      }
    }
    if (snapshot.repeated) fill(base + 12);
  });

  const [, , castling, , halfmoves] = chess.fen().split(' ');
  const ours = black ? 'kq' : 'KQ';
  const theirs = black ? 'KQ' : 'kq';
  if (castling.includes(ours[1])) fill(STATE_BASE);
  if (castling.includes(ours[0])) fill(STATE_BASE + 1);
  if (castling.includes(theirs[1])) fill(STATE_BASE + 2);
  if (castling.includes(theirs[0])) fill(STATE_BASE + 3);
  if (black) fill(STATE_BASE + 4);
  fill(STATE_BASE + 5, Number(halfmoves));
  fill(STATE_BASE + 7);

  const candidates = (chess.moves({ verbose: true }) as Move[]).map(move => {
    const uci = move.from + move.to + (move.promotion ?? '');
    const castle = move.isKingsideCastle() ? 'k' : move.isQueensideCastle() ? 'q' : null;
    const kind: MoveKind = {
      capture: !!move.captured,
      check: /[+#]$/.test(move.san),
      castle: castle !== null,
      pawnPush: move.piece === 'p' && !move.captured,
    };
    return { uci, index: policyIndex(uci, black, castle), kind };
  });
  return { planes, candidates };
}
