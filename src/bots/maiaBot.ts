import { Chess } from 'chess.js';
import { OPENINGS, repertoireMoves } from '../core/openingBook';
import { engine } from './engine';
import { dialsFor } from './levels';
import type { MoveKind } from './maia/encode';
import { loadMaia, predictMoves, type MovePrediction } from './maia/maiaClient';
import { describeMove } from './moveContext';
import { DEFAULT_TIME_PROFILE, drawGamePace, thinkTime, type TimeProfile } from './timeModel';
import { timeProfileFor, type TimeStyle } from './timeStyles';
import type { Bot, BotReply, BotRequest } from './types';
import type { EngineLine } from './uciEngine';

/**
 * How a Maia bot turns the network's move probabilities into a move.
 *
 * Maia supplies the instinct: what a player of that level is likely to play,
 * and the bot samples from that. `care` is the strength dial on top: the
 * chance that the bot notices its intended move loses material and picks
 * another. It is deliberately not tied to thinking time. In real bullet games
 * long thinks go with more blunders, not fewer, because they happen in hard
 * positions; the network already reproduces that on its own.
 */
export interface MaiaStyle {
  /** Sampling temperature. Below 1 favours the likeliest moves, above 1 flattens. */
  temperature: number;
  /** Moves less likely than this are never played: the network's long tail is noise. */
  minProbability: number;
  /** Chance per move of a second look that catches a blunder (0 to 1). */
  care: number;
  /** A second look rejects moves that lose more than this many centipawns. */
  blunderCp: number;
  /** How many replacement moves a second look will consider. */
  retries: number;
  /** Stockfish search depth for judging the position. */
  depth: number;
}

export const DEFAULT_MAIA_STYLE: MaiaStyle = {
  temperature: 1,
  minProbability: 0.02,
  care: 0,
  blunderCp: 250,
  retries: 2,
  depth: 8,
};

/** A way of playing: how much likelier each kind of move becomes. */
export type PlayStyle = 'balanced' | 'aggressive' | 'solid';

type Leaning = Partial<Record<keyof MoveKind, number>>;

/**
 * Multipliers on a move's probability by kind. They tilt the bot's taste
 * without teaching it anything, so they also shift its strength a little;
 * the rating calibration was done with 'balanced'.
 */
const LEANINGS: Record<PlayStyle, Leaning> = {
  balanced: {},
  aggressive: { capture: 1.5, check: 1.8, pawnPush: 1.2, castle: 0.8 },
  solid: { castle: 2, check: 0.8, pawnPush: 0.8 },
};

export const PLAY_STYLES: { id: PlayStyle; name: string; description: string }[] = [
  { id: 'balanced', name: 'Balanced', description: 'Plays the way people of this rating usually do' },
  { id: 'aggressive', name: 'Aggressive', description: 'Leans towards captures, checks and pawn pushes' },
  { id: 'solid', name: 'Solid', description: 'Castles early and avoids loosening pawn moves' },
];

function lean(moves: MovePrediction[], leaning: Leaning): MovePrediction[] {
  const kinds = Object.keys(leaning) as (keyof MoveKind)[];
  if (!kinds.length) return moves;
  const tilted = moves.map(move => {
    let p = move.p;
    for (const kind of kinds) if (move.kind[kind]) p *= leaning[kind]!;
    return { ...move, p };
  });
  const total = tilted.reduce((sum, move) => sum + move.p, 0);
  return tilted.map(move => ({ ...move, p: move.p / total })).sort((a, b) => b.p - a.p);
}

/** Draws a move at random, weighted by probability and reshaped by temperature. */
function sample(moves: MovePrediction[], style: MaiaStyle): MovePrediction {
  const pool = moves.filter(m => m.p >= style.minProbability);
  if (!pool.length) return moves[0];
  const weights = pool.map(m => Math.pow(m.p, 1 / style.temperature));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Which Maia networks a bot draws its moves from, and in what proportion. */
interface Networks {
  low: number;
  high: number;
  /** Share of moves taken from `high`. */
  highShare: number;
}

class MaiaBot implements Bot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Score the bot saw on its previous move, to notice when the game turns. */
  private previousEvalCp: number | null = null;
  /** How quick the bot happens to be in the current game. */
  private gamePace = 1;
  /** False once the game has left the bot's repertoire, so it stops looking. */
  private inRepertoire = true;

  constructor(
    private readonly networks: Networks,
    private readonly style: MaiaStyle,
    private readonly timing: TimeProfile,
    private readonly leaning: Leaning,
    label: { id: string; name: string; description: string },
    /** Opening the bot steers into while the game allows it; null for none. */
    private readonly openingId: string | null = null,
  ) {
    this.id = label.id;
    this.name = label.name;
    this.description = label.description;
  }

  async init(): Promise<void> {
    const { low, high } = this.networks;
    await Promise.all([engine.init(), loadMaia(low), loadMaia(high)]);
  }

  newGame(): void {
    this.previousEvalCp = null;
    this.gamePace = drawGamePace(this.timing);
    this.inRepertoire = this.openingId !== null;
    engine.send('ucinewgame');
    engine.setOption('Skill Level', 20);
    // Several scored candidates per search: the time model reads the position's
    // difficulty from how far apart they are.
    engine.setOption('MultiPV', 4);
  }

  cancel(): void {
    engine.stop();
  }

  async chooseMove(request: BotRequest): Promise<BotReply> {
    const { style, networks } = this;
    const network = Math.random() < networks.highShare ? networks.high : networks.low;
    const [predicted, analysis] = await Promise.all([
      predictMoves(network, request.moves, request.fen),
      engine.search(request.fen, `depth ${style.depth}`),
    ]);
    const moves = lean(predicted, this.leaning);

    // A repertoire move, when there is one, is played without further thought.
    const prepared = this.repertoireMove(request.moves);
    let choice = moves.find(m => m.uci === prepared) ?? sample(moves, style);
    if (choice.uci !== prepared && Math.random() < style.care) {
      choice = await this.secondLook(request.fen, moves, choice, analysis.lines);
    }

    const context = describeMove(request, choice.uci, analysis.lines, this.previousEvalCp, choice.p);
    this.previousEvalCp = context.evalCp;
    return { move: choice.uci, thinkMs: thinkTime(context, this.timing, this.gamePace), context };
  }

  /**
   * The next move of the bot's opening, in UCI, if the game so far follows one
   * of its lines. Works for either colour: the bot simply continues whichever
   * line both players are on. Null when there is no repertoire or it has ended.
   */
  private repertoireMove(uciMoves: string[]): string | null {
    if (!this.inRepertoire || !this.openingId) return null;
    const chess = new Chess();
    const san: string[] = [];
    try {
      for (const uci of uciMoves) {
        san.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' }).san);
      }
    } catch {
      // A game that did not start from the usual position has no opening to follow.
      this.inRepertoire = false;
      return null;
    }
    const options = repertoireMoves(this.openingId, san);
    if (!options.length) {
      this.inRepertoire = false;
      return null;
    }
    const move = chess.move(options[Math.floor(Math.random() * options.length)]);
    return move.from + move.to + (move.promotion ?? '');
  }

  /** Swaps a move that loses material for another candidate, if one holds up. */
  private async secondLook(
    fen: string,
    moves: MovePrediction[],
    first: MovePrediction,
    lines: EngineLine[],
  ): Promise<MovePrediction> {
    const best = lines[0]?.cp;
    if (best === undefined) return first;

    let choice = first;
    let remaining = moves;
    for (let attempt = 0; ; attempt++) {
      const known = lines.find(line => line.move === choice.uci);
      const cp =
        known?.cp ??
        (await engine.search(fen, `depth ${this.style.depth} searchmoves ${choice.uci}`)).lines[0]?.cp;
      if (cp === undefined || best - cp <= this.style.blunderCp) return choice;
      if (attempt >= this.style.retries) return choice;

      remaining = remaining.filter(m => m !== choice);
      if (!remaining.length) return choice;
      choice = sample(remaining, this.style);
    }
  }
}

/** Builds a Maia bot on one network with a custom style or pace, for calibration experiments. */
export function createMaiaBot(
  network: number,
  style: Partial<MaiaStyle> = {},
  timing: TimeProfile = DEFAULT_TIME_PROFILE,
): Bot {
  return new MaiaBot(
    { low: network, high: network, highShare: 0 },
    { ...DEFAULT_MAIA_STYLE, ...style },
    timing,
    {},
    { id: `maia-${network}`, name: `Maia ${network}`, description: 'Experimental configuration' },
  );
}

/** Everything that defines a human-like opponent. */
export interface BotOptions {
  /** Chess.com bullet rating to play at. */
  rating: number;
  /** Percentage of the style's normal pace: 200 moves twice as fast, 50 half as fast. */
  speedPct?: number;
  playStyle?: PlayStyle;
  timeStyle?: TimeStyle;
  /** Id of an opening to steer into, or 'any' for none. */
  opening?: string;
}

export const ANY_OPENING = 'any';

/** Builds the opponent for a rating, a speed and the chosen characters. */
export function createRatedBot({
  rating,
  speedPct = 100,
  playStyle = 'balanced',
  timeStyle = 'natural',
  opening = ANY_OPENING,
}: BotOptions): Bot {
  const dials = dialsFor(rating);
  const chosen = OPENINGS.find(o => o.id === opening);
  // The name lists whatever differs from an ordinary opponent of that rating.
  const extras = [
    speedPct !== 100 ? `${speedPct}% speed` : '',
    playStyle !== 'balanced' ? playStyle : '',
    timeStyle !== 'natural' ? timeStyle : '',
    chosen?.name ?? '',
  ].filter(Boolean);
  return new MaiaBot(
    { low: dials.lowNetwork, high: dials.highNetwork, highShare: dials.highShare },
    { ...DEFAULT_MAIA_STYLE, temperature: dials.temperature, care: dials.care },
    timeProfileFor(timeStyle, speedPct),
    LEANINGS[playStyle],
    {
      id: `rated-${rating}`,
      name: `Bot ${rating}${extras.length ? ` (${extras.join(', ')})` : ''}`,
      description: `Plays like a chess.com bullet player rated about ${rating}`,
    },
    chosen?.id ?? null,
  );
}
