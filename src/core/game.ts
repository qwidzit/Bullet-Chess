import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import { read as readFen, write as writeFen } from '@lichess-org/chessground/fen';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Move } from 'chess.js';
import type { Bot } from '../bots';
import { Clock, other, type Side } from './clock';
import type { LatencyMeter } from './latencyMeter';
import { applyPremove, premoveDests, type Premove } from './premoves';
import * as sounds from './sounds';

export type PlayerColor = 'white' | 'black';

export type EndReason =
  | 'checkmate'
  | 'timeout'
  | 'resignation'
  | 'stalemate'
  | 'insufficient material'
  | 'repetition'
  | '50-move rule'
  | 'timeout vs insufficient material';

export interface GameResult {
  winner: PlayerColor | null;
  reason: EndReason;
  /** Every move played, in UCI notation. */
  moves: string[];
  /** Time charged for each move, in ms. */
  times: number[];
}

export interface GameConfig {
  baseMs: number;
  incMs: number;
  playerColor: PlayerColor;
  bot: Bot;
}

export interface GameHooks {
  onEnd(result: GameResult): void;
  /** Called after every move actually played, by either side. */
  onMove?(move: Move): void;
  meter?: LatencyMeter;
}

const colorOf = (side: Side): PlayerColor => (side === 'w' ? 'white' : 'black');
const sideOf = (color: PlayerColor): Side => (color === 'white' ? 'w' : 'b');

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** How far a touch must travel, in squares, before it counts as dragging the piece. */
const DRAG_START_SQUARES = 0.25;

function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const move of chess.moves({ verbose: true }) as Move[]) {
    const from = dests.get(move.from);
    if (from) from.push(move.to);
    else dests.set(move.from, [move.to]);
  }
  return dests;
}

/** True when `side` could never deliver mate, so cannot win on time. */
function cannotMate(chess: Chess, side: Side): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter(piece => piece?.color === side && piece.type !== 'k');
  return pieces.length === 0 || (pieces.length === 1 && 'nb'.includes(pieces[0]!.type));
}

/**
 * One game against a bot: rules, clocks, board and premoves.
 *
 * Premoves are queued here rather than in chessground, which only holds one.
 * While the bot is to move the board shows a "virtual" position with every
 * queued premove already played, and accepts further moves on top of it.
 */
export class Game {
  readonly chess = new Chess();
  readonly clock: Clock;
  readonly cg: Api;
  result: GameResult | undefined;

  private readonly playerSide: Side;
  private premoves: Premove[] = [];
  private uciMoves: string[] = [];
  private moveTimes: number[] = [];
  private lastMove: Key[] | undefined;
  private lastMoveCaptured = false;
  private botTurnId = 0;
  private botTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly boardEl: HTMLElement,
    private readonly config: GameConfig,
    private readonly hooks: GameHooks,
  ) {
    this.playerSide = sideOf(config.playerColor);
    this.clock = new Clock(config.baseMs, config.incMs, side => this.flag(side));
    this.cg = Chessground(boardEl, {
      orientation: config.playerColor,
      coordinates: false,
      // Lets automated browser tests drive the board with synthetic events.
      trustAllEvents: import.meta.env.DEV,
      blockTouchScroll: true,
      // Marks the square under a dragged piece so it can be outlined.
      jsHover: true,
      animation: { enabled: true, duration: 90 },
      highlight: { lastMove: true, check: true },
      movable: {
        free: false,
        color: config.playerColor,
        showDests: true,
        events: { after: (orig, dest) => this.onBoardMove(orig, dest) },
      },
      premovable: { enabled: false },
      draggable: {
        enabled: true,
        showGhost: true,
        // A finger never lands perfectly still. Only treat a touch as a drag
        // once it has travelled a good part of a square, and never let
        // chessground drop that threshold to zero after the first drag.
        distance: Math.max(8, Math.round((boardEl.clientWidth / 8) * DRAG_START_SQUARES)),
        autoDistance: false,
      },
      selectable: { enabled: true },
      drawable: { enabled: false },
    });
    this.refreshBoard();
    // Capture phase, so a cancelling tap is seen before chessground reacts to it.
    boardEl.addEventListener('touchstart', this.onPointerDown, { capture: true, passive: false });
    boardEl.addEventListener('mousedown', this.onPointerDown, { capture: true });
  }

  get over(): boolean {
    return this.result !== undefined;
  }

  get turn(): Side {
    return this.chess.turn();
  }

  get queuedPremoves(): number {
    return this.premoves.length;
  }

  start(): void {
    this.config.bot.newGame();
    this.clock.start('w');
    sounds.play('start');
    if (this.playerSide === 'b') void this.requestBotMove();
  }

  resign(): void {
    if (!this.over) this.end(colorOf(other(this.playerSide)), 'resignation');
  }

  destroy(): void {
    this.botTurnId++;
    clearTimeout(this.botTimer);
    this.config.bot.cancel();
    this.clock.stop();
    this.boardEl.removeEventListener('touchstart', this.onPointerDown, { capture: true });
    this.boardEl.removeEventListener('mousedown', this.onPointerDown, { capture: true });
    this.cg.destroy();
  }

  /** Material on the board, in pawns, from White's point of view. */
  materialBalance(): number {
    let balance = 0;
    for (const piece of this.chess.board().flat()) {
      if (piece) balance += (piece.color === 'w' ? 1 : -1) * PIECE_VALUE[piece.type];
    }
    return balance;
  }

  kingSquare(color: PlayerColor): Key {
    return this.chess.findPiece({ type: 'k', color: sideOf(color) })[0];
  }

  cancelPremoves(): void {
    if (!this.premoves.length) return;
    this.premoves = [];
    this.refreshBoard();
  }

  /** A tap that is neither on one of your pieces nor completing a move clears the queue. */
  private onPointerDown = (e: TouchEvent | MouseEvent): void => {
    if (!this.premoves.length) return;
    const point = 'touches' in e ? e.touches[0] : e;
    if (!point) return;
    const key = this.cg.getKeyAtDomPos([point.clientX, point.clientY]);
    const piece = key && this.cg.state.pieces.get(key);
    if (this.cg.state.selected || piece?.color === this.config.playerColor) return;
    e.preventDefault();
    e.stopPropagation();
    this.cancelPremoves();
  };

  /** The player moved a piece on the board: a real move on their turn, a premove otherwise. */
  private onBoardMove(orig: Key, dest: Key): void {
    if (this.over) return;
    if (this.turn !== this.playerSide || this.premoves.length) {
      this.premoves.push({ from: orig, to: dest });
      sounds.play('premove');
      this.hooks.meter?.premoveSet();
      this.refreshBoard();
      return;
    }
    const played = this.applyMove(orig, dest, 'q');
    this.refreshBoard();
    if (!played) return;
    this.hooks.meter?.userMove(false);
    if (!this.checkGameEnd()) void this.requestBotMove();
  }

  private async requestBotMove(): Promise<void> {
    const turnId = ++this.botTurnId;
    const side = this.turn;
    const started = performance.now();
    let move: string;
    let thinkMs = 0;
    try {
      const reply = await this.config.bot.chooseMove({
        fen: this.chess.fen(),
        moves: [...this.uciMoves],
        ply: this.uciMoves.length,
        lastMove: this.lastMove ? { to: this.lastMove[1], captured: this.lastMoveCaptured } : null,
        ownMs: this.clock.timeLeft(side, started),
        opponentMs: this.clock.timeLeft(other(side), started),
        baseMs: this.config.baseMs,
        incMs: this.config.incMs,
      });
      move = reply.move;
      thinkMs = reply.thinkMs;
    } catch (error) {
      console.error('Bot failed to move', error);
      move = '';
    }
    if (turnId !== this.botTurnId || this.over) return;

    const computeMs = performance.now() - started;
    this.hooks.meter?.botComputed(computeMs);
    const wait = thinkMs - computeMs;
    if (wait > 2) this.botTimer = setTimeout(() => this.playBotMove(move, turnId), wait);
    else this.playBotMove(move, turnId);
  }

  private playBotMove(uci: string, turnId: number): void {
    if (turnId !== this.botTurnId || this.over) return;
    this.hooks.meter?.botMoveArrived(performance.now());

    let played = this.applyMove(uci.slice(0, 2), uci.slice(2, 4), uci[4] ?? 'q');
    if (!played && !this.over) {
      // A broken engine reply must not stall the game: play any legal move.
      const fallback = (this.chess.moves({ verbose: true }) as Move[])[0];
      played = this.applyMove(fallback.from, fallback.to, fallback.promotion ?? 'q');
    }
    if (!played) {
      this.refreshBoard();
      return;
    }
    if (!this.checkGameEnd()) this.playNextPremove();
  }

  /**
   * Tries the oldest queued premove against the position the bot just left.
   * If it is no longer legal the whole queue is dropped, as on chess.com,
   * since the later premoves were planned on top of it.
   */
  private playNextPremove(): void {
    const next = this.premoves.shift();
    if (next && this.applyMove(next.from, next.to, 'q')) {
      this.refreshBoard();
      this.hooks.meter?.userMove(true);
      if (!this.checkGameEnd()) void this.requestBotMove();
      return;
    }
    this.premoves = [];
    this.refreshBoard();
  }

  /** Plays a move for the side to move and presses its clock. */
  private applyMove(from: string, to: string, promotion: string): boolean {
    const now = performance.now();
    const side = this.turn;
    if (this.clock.timeLeft(side, now) <= 0) {
      this.clock.stop(now);
      this.flag(side);
      return false;
    }
    let move: Move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    this.moveTimes.push(Math.round(this.clock.press(side, now)));
    this.uciMoves.push(move.from + move.to + (move.promotion ?? ''));
    this.lastMove = [move.from, move.to];
    this.lastMoveCaptured = !!move.captured;
    sounds.play(this.chess.inCheck() ? 'check' : move.captured ? 'capture' : 'move');
    this.hooks.onMove?.(move);
    return true;
  }

  /** Redraws the board from the rules engine plus any queued premoves. */
  private refreshBoard(): void {
    const { chess, premoves } = this;
    const player = this.config.playerColor;
    const fen = chess.fen();
    const lastMove = this.lastMove;

    if (this.over) {
      this.cg.set({
        fen,
        turnColor: colorOf(this.turn),
        check: chess.inCheck(),
        lastMove,
        movable: { dests: new Map() },
        highlight: { custom: this.resultHighlights() },
      });
      return;
    }

    if (this.turn === this.playerSide && !premoves.length) {
      this.cg.set({
        fen,
        turnColor: player,
        check: chess.inCheck(),
        lastMove,
        movable: { dests: legalDests(chess) },
        highlight: { custom: new Map() },
      });
      return;
    }

    // Waiting for the bot: show the queue played out and let more be added.
    // Telling chessground it is the player's turn makes it treat each new
    // premove as an ordinary move, which is reported to onBoardMove.
    const pieces = readFen(fen);
    const marked = new Map<Key, string>();
    for (const premove of premoves) {
      applyPremove(pieces, premove);
      marked.set(premove.from, 'premove');
      marked.set(premove.to, 'premove');
    }
    const rights = chess.getCastlingRights(this.playerSide);
    this.cg.set({
      fen: writeFen(pieces),
      turnColor: player,
      check: chess.inCheck() ? colorOf(this.turn) : false,
      lastMove,
      movable: { dests: premoveDests(pieces, player, { kingSide: rights.k, queenSide: rights.q }) },
      highlight: { custom: marked },
    });
  }

  private resultHighlights(): Map<Key, string> {
    const marks = new Map<Key, string>();
    const winner = this.result?.winner;
    if (winner) {
      marks.set(this.kingSquare(winner), 'king-won');
      marks.set(this.kingSquare(winner === 'white' ? 'black' : 'white'), 'king-lost');
    }
    return marks;
  }

  private checkGameEnd(): boolean {
    if (this.over) return true;
    const chess = this.chess;
    if (chess.isCheckmate()) this.end(colorOf(other(this.turn)), 'checkmate');
    else if (chess.isStalemate()) this.end(null, 'stalemate');
    else if (chess.isInsufficientMaterial()) this.end(null, 'insufficient material');
    else if (chess.isThreefoldRepetition()) this.end(null, 'repetition');
    else if (chess.isDrawByFiftyMoves()) this.end(null, '50-move rule');
    return this.over;
  }

  private flag(side: Side): void {
    if (this.over) return;
    const opponent = other(side);
    if (cannotMate(this.chess, opponent)) this.end(null, 'timeout vs insufficient material');
    else this.end(colorOf(opponent), 'timeout');
  }

  private end(winner: PlayerColor | null, reason: EndReason): void {
    if (this.over) return;
    this.botTurnId++;
    clearTimeout(this.botTimer);
    this.config.bot.cancel();
    this.clock.stop();
    this.premoves = [];

    this.result = { winner, reason, moves: [...this.uciMoves], times: [...this.moveTimes] };

    // Chessground reports moves a moment after showing them, so the board can
    // be one move ahead of the game when the flag falls. Show the real position.
    this.refreshBoard();
    this.cg.stop();
    sounds.play('end');
    this.hooks.onEnd(this.result);
  }
}
