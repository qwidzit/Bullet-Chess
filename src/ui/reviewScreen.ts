import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Move } from 'chess.js';
import { deleteGame, isArchived, outcomeOf, pgnOf, saveGame, type SavedGame } from '../core/history';
import {
  accuracyOf,
  classifyGame,
  MOVE_CLASSES,
  reviewGame,
  winChance,
  type GameReview,
  type MoveClass,
} from '../core/review';
import { timeControlLabel } from '../core/settings';
import { boardImage } from './boardTheme';
import { chancesChart, timeChart, type Chart, type EvalMark } from './charts';
import { formatDate, h } from './dom';
import { statsTable } from './statsTable';

const MAX_BOARD_PX = 400;

interface Step {
  fen: string;
  move?: Move;
}

/** Steps through a finished game with engine verdicts and time spent per move. */
export class ReviewScreen {
  private readonly steps: Step[];
  private readonly cg: Api;
  private readonly charts: Chart[] = [];
  private review: GameReview | undefined;
  /** The rank of every move, once the engine has been through the game. */
  private classes: MoveClass[] | undefined;
  private ply: number;
  private cancelled = false;

  private readonly boardEl = h('div', { class: 'board' });
  private readonly badges = h('div', { class: 'badges' });
  private readonly frame = h('div', { class: 'board-frame' }, this.boardEl, this.badges);
  private readonly readout = h('div', { class: 'readout' });
  private readonly summary = h('div', { class: 'review-summary' });
  private readonly chancesSlot = h('div', { class: 'chart-slot' });
  private readonly timeSlot = h('div', { class: 'chart-slot' });
  private readonly movesEl = h('div', { class: 'moves' });
  private readonly moveEls: HTMLElement[] = [];

  constructor(
    root: HTMLElement,
    private readonly game: SavedGame,
    private readonly onBack: () => void,
  ) {
    // Replay once to get every position and the notation of every move.
    const chess = new Chess();
    this.steps = [{ fen: chess.fen() }];
    for (const uci of game.moves) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
      this.steps.push({ fen: chess.fen(), move });
    }
    this.ply = this.steps.length - 1;

    const outcome = outcomeOf(game);
    const headline = outcome === 'draw' ? 'Draw' : outcome === 'win' ? 'You won' : 'You lost';
    const date = formatDate(game.playedAt);
    const copy = h('button', {
      class: 'secondary small',
      text: 'Copy PGN',
      onTap: () => {
        void navigator.clipboard
          ?.writeText(pgnOf(game))
          .then(() => (copy.textContent = 'Copied'))
          .catch(() => (copy.textContent = 'Copy failed'));
      },
    });
    // An archived game can be deleted; any other can be archived from here.
    const keep: HTMLButtonElement = isArchived(game.id)
      ? h('button', {
          class: 'secondary small',
          text: 'Delete',
          onTap: () => {
            // Two taps, like resigning: the first arms the button.
            if (!keep.classList.contains('confirm')) {
              keep.classList.add('confirm');
              keep.textContent = 'Confirm?';
              return;
            }
            deleteGame(game.id);
            this.onBack();
          },
        })
      : h('button', {
          class: 'secondary small',
          text: 'Archive',
          onTap: () => {
            saveGame(game);
            keep.textContent = 'Archived';
            keep.disabled = true;
          },
        });

    const step = (label: string, title: string, to: () => number) =>
      h('button', { class: 'secondary step', text: label, onTap: () => this.show(to()), attrs: { 'aria-label': title } });

    this.buildMoveList();
    const el = h(
      'div',
      { class: 'review' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'secondary small', text: '‹ Back', onTap: onBack }),
        h(
          'div',
          { class: 'screen-title' },
          h('div', { text: `${headline} by ${game.reason}` }),
          h('div', {
            class: 'screen-sub',
            text: `${game.opponent.name} · ${timeControlLabel(game.baseSec, game.incSec)} · ${date}`,
          }),
        ),
      ),
      h('div', { class: 'board-wrap' }, this.frame),
      h(
        'div',
        { class: 'steps' },
        step('⏮', 'First move', () => 0),
        step('◀', 'Previous move', () => this.ply - 1),
        step('▶', 'Next move', () => this.ply + 1),
        step('⏭', 'Last move', () => this.steps.length - 1),
      ),
      this.readout,
      this.movesEl,
      h('h2', { text: 'Your winning chances' }),
      this.chancesSlot,
      h(
        'div',
        { class: 'legend' },
        h('span', { class: 'key dot blunder' }),
        'Your blunders',
        h('span', { class: 'key diamond miss' }),
        'misses',
        h('span', { class: 'key triangle mistake' }),
        'mistakes',
      ),
      h('h2', { text: 'Seconds per move' }),
      this.timeSlot,
      h(
        'div',
        { class: 'legend' },
        h('span', { class: 'key you' }),
        'You',
        h('span', { class: 'key them' }),
        game.opponent.name,
      ),
      this.summary,
      game.stats ? h('h2', { text: 'Your handling' }) : null,
      game.stats ? statsTable(game.stats) : null,
      h('div', { class: 'review-actions' }, copy, keep),
    );
    root.replaceChildren(el);

    // The time chart's slot spans the content width, padding excluded.
    const size = Math.floor(Math.min(this.timeSlot.clientWidth, MAX_BOARD_PX) / 8) * 8;
    this.frame.style.width = this.frame.style.height = `${size}px`;
    this.boardEl.style.setProperty('--board-image', boardImage(game.playerColor));
    this.cg = Chessground(this.boardEl, {
      orientation: game.playerColor,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: true, duration: 90 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false },
    });

    const width = this.timeSlot.clientWidth;
    this.addChart(this.timeSlot, timeChart(width, game.times, game.playerColor === 'white', ply => this.show(ply)));
    this.chancesSlot.textContent = 'Analysing…';
    this.show(this.ply);
    void this.analyse(width);
  }

  dispose(): void {
    this.cancelled = true;
    this.cg.destroy();
  }

  private get playerIsWhite(): boolean {
    return this.game.playerColor === 'white';
  }

  private addChart(slot: HTMLElement, chart: Chart): void {
    slot.replaceChildren(chart.el);
    this.charts.push(chart);
    chart.select(this.ply);
  }

  private buildMoveList(): void {
    this.steps.forEach((step, ply) => {
      if (!step.move) return;
      if (ply % 2 === 1) {
        this.movesEl.append(h('span', { class: 'move-number', text: `${(ply + 1) / 2}.` }));
      }
      const el = h('span', { class: 'move', text: step.move.san, onTap: () => this.show(ply) });
      this.moveEls[ply] = el;
      this.movesEl.append(el);
    });
  }

  /** Engine verdicts: reuse stored ones, otherwise compute and store them. */
  private async analyse(width: number): Promise<void> {
    let review = this.game.review;
    // Stored verdicts from an older version of the app lack the second-choice scores.
    if (!review?.second || review.cp.length !== this.game.moves.length + 1) {
      const computed = await reviewGame(this.game.moves, {
        isCancelled: () => this.cancelled,
        onProgress: (done, total) => (this.chancesSlot.textContent = `Analysing… ${done} of ${total}`),
      });
      if (!computed || this.cancelled) return;
      review = computed;
      this.game.review = review;
      // Keep the verdicts with the game, but only if the player archived it.
      if (isArchived(this.game.id)) saveGame(this.game);
    }
    this.review = review;
    this.classes = classifyGame(this.game.moves, review);

    const sign = this.playerIsWhite ? 1 : -1;
    const marks: EvalMark[] = [];
    this.classes.forEach((cls, i) => {
      this.moveEls[i + 1]?.classList.add(cls);
      const mine = (i % 2 === 0) === this.playerIsWhite;
      if (mine && (cls === 'blunder' || cls === 'mistake' || cls === 'miss')) marks.push({ move: i, verdict: cls });
    });
    this.addChart(
      this.chancesSlot,
      chancesChart(width, review.cp.map(cp => winChance(sign * cp)), marks, ply => this.show(ply)),
    );
    this.renderSummary(review, this.classes);
    this.show(this.ply);
  }

  /** Accuracy for both players, then how many moves of each rank each made. */
  private renderSummary(review: GameReview, classes: MoveClass[]): void {
    const accuracy = accuracyOf(review);
    const mine = this.playerIsWhite ? accuracy.white : accuracy.black;
    const theirs = this.playerIsWhite ? accuracy.black : accuracy.white;
    const count = (cls: MoveClass, own: boolean) =>
      classes.filter((c, i) => c === cls && ((i % 2 === 0) === this.playerIsWhite) === own).length;
    const seconds = (own: boolean) => {
      const times = this.game.times.filter((_, i) => ((i % 2 === 0) === this.playerIsWhite) === own);
      return times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2) : '–';
    };

    this.summary.replaceChildren(
      h(
        'div',
        { class: 'accuracy' },
        h('div', {}, h('div', { class: 'accuracy-value', text: mine.toFixed(1) }), h('div', { text: 'You' })),
        h('div', { class: 'accuracy-label', text: 'Accuracy' }),
        h(
          'div',
          {},
          h('div', { class: 'accuracy-value', text: theirs.toFixed(1) }),
          h('div', { text: this.game.opponent.name }),
        ),
      ),
      h(
        'table',
        {},
        ...MOVE_CLASSES.map(({ id, name, mark }) =>
          h(
            'tr',
            {},
            h('td', { text: String(count(id, true)) }),
            h('th', {}, h('span', { class: `rank ${id}`, text: mark }), name),
            h('td', { text: String(count(id, false)) }),
          ),
        ),
        h('tr', {}, h('td', { text: seconds(true) }), h('th', { text: 'Seconds per move' }), h('td', { text: seconds(false) })),
      ),
    );
  }

  /** Shows the position after `ply` half-moves. */
  private show(ply: number): void {
    this.moveEls[this.ply]?.classList.remove('current');
    this.ply = Math.min(this.steps.length - 1, Math.max(0, ply));
    const { fen, move } = this.steps[this.ply];

    const check = new Chess(fen).inCheck();
    this.cg.set({
      fen,
      turnColor: fen.split(' ')[1] === 'w' ? 'white' : 'black',
      lastMove: move ? ([move.from, move.to] as Key[]) : undefined,
      check,
    });
    for (const chart of this.charts) chart.select(this.ply);

    const el = this.moveEls[this.ply];
    if (el) {
      el.classList.add('current');
      this.movesEl.scrollLeft = el.offsetLeft - this.movesEl.clientWidth / 2;
    }
    this.readout.textContent = this.describe();
    this.placeBadge();
  }

  /** Pins the move's rank to the corner of the square it landed on, as chess.com does. */
  private placeBadge(): void {
    const { move } = this.steps[this.ply];
    const cls = this.classes?.[this.ply - 1];
    const rank = MOVE_CLASSES.find(c => c.id === cls);
    if (!move || !rank) {
      this.badges.replaceChildren();
      return;
    }
    const file = move.to.charCodeAt(0) - 97;
    const row = Number(move.to[1]) - 1;
    const badge = h('div', { class: `badge rank ${rank.id}` }, h('span', { text: rank.mark }));
    badge.style.setProperty('--col', String(this.playerIsWhite ? file : 7 - file));
    badge.style.setProperty('--row', String(this.playerIsWhite ? 7 - row : row));
    this.badges.replaceChildren(badge);
  }

  /** One line about the move that led to the position on the board. */
  private describe(): string {
    const { move } = this.steps[this.ply];
    if (!move) return 'Starting position';
    const index = this.ply - 1;
    const number = `${Math.floor(index / 2) + 1}${index % 2 === 0 ? '.' : '…'}`;
    const parts = [`${number} ${move.san}`, `${((this.game.times[index] ?? 0) / 1000).toFixed(1)} s`];
    const cls = this.classes?.[index];
    if (this.review && cls) {
      parts.push(MOVE_CLASSES.find(c => c.id === cls)!.name);
      const best = this.review.best[index];
      // For a move that lost something, name the engine's choice, in the
      // notation of the position before the move.
      const lacking = cls === 'inaccuracy' || cls === 'mistake' || cls === 'miss' || cls === 'blunder';
      if (lacking && best && best !== this.game.moves[index]) {
        try {
          const san = new Chess(this.steps[index].fen).move({
            from: best.slice(0, 2),
            to: best.slice(2, 4),
            promotion: best[4] ?? 'q',
          }).san;
          parts.push(`best was ${san}`);
        } catch {
          // An unusable engine line just leaves the suggestion out.
        }
      }
    }
    return parts.join(' · ');
  }
}
