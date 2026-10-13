import type { MoveContext } from './timeModel';

export interface BotRequest {
  fen: string;
  /** Moves played so far in UCI notation, e.g. "e2e4". */
  moves: string[];
  /** Half-moves played so far. */
  ply: number;
  /** The opponent's move that led to this position, if any. */
  lastMove: { to: string; captured: boolean } | null;
  /** Milliseconds on each clock at the moment the bot is asked. */
  ownMs: number;
  opponentMs: number;
  /** The time control: starting time and increment per move. */
  baseMs: number;
  incMs: number;
}

export interface BotReply {
  /** UCI move, e.g. "e7e8q". */
  move: string;
  /**
   * How long the bot should appear to think, measured from the request.
   * The game waits out whatever the computation itself did not use.
   * Zero means the bot "premoved": it replies the instant it can.
   */
  thinkMs: number;
  /** What the time model saw, for tuning and diagnostics. */
  context?: MoveContext;
}

export interface Bot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Loads engines or models. Safe to call more than once. */
  init(): Promise<void>;
  newGame(): void;
  chooseMove(request: BotRequest): Promise<BotReply>;
  /** Abandons any search in progress. */
  cancel(): void;
}
