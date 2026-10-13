import { Chess, type Move } from 'chess.js';
import type { MoveContext } from './timeModel';
import type { BotRequest } from './types';
import type { EngineLine } from './uciEngine';

/** Candidates scoring within this many centipawns of the best are "close". */
const CLOSE_CP = 40;
/** Non-pawn material (both sides, in pawns) at or below which it is an endgame. */
const ENDGAME_MATERIAL = 20;
const VALUE: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };

/**
 * Describes the decision the bot faces, for the time model. `lines` are the
 * engine's scored candidates (best first); `previousEvalCp` is the score the
 * bot saw on its last turn; `humanProbability` is how likely a player of the
 * bot's level is to choose the move, when that is known.
 */
export function describeMove(
  request: BotRequest,
  chosenUci: string,
  lines: EngineLine[],
  previousEvalCp: number | null,
  humanProbability: number | null = null,
): MoveContext {
  const chess = new Chess(request.fen);
  const legal = chess.moves({ verbose: true }) as Move[];
  const chosen = legal.find(m => m.from + m.to === chosenUci.slice(0, 4));

  let material = 0;
  for (const piece of chess.board().flat()) {
    if (piece) material += VALUE[piece.type] ?? 0;
  }

  const evalCp = lines[0]?.cp ?? null;
  return {
    ply: request.ply,
    ownMs: request.ownMs,
    opponentMs: request.opponentMs,
    baseMs: request.baseMs,
    incMs: request.incMs,

    forced: legal.length === 1,
    inCheck: chess.inCheck(),
    isCapture: !!chosen?.captured,
    isRecapture: !!chosen?.captured && !!request.lastMove?.captured && chosen.to === request.lastMove.to,
    captureOptions: legal.filter(m => m.captured).length,
    endgame: material <= ENDGAME_MATERIAL,

    evalCp,
    gapCp: lines.length > 1 ? lines[0].cp - lines[1].cp : null,
    closeChoices: lines.filter(line => lines[0].cp - line.cp <= CLOSE_CP).length,
    swingCp: evalCp !== null && previousEvalCp !== null ? evalCp - previousEvalCp : null,
    humanProbability,
  };
}
