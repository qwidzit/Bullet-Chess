import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Move } from 'chess.js';
import { deleteGame, outcomeOf, pgnOf, saveGame, type SavedGame } from '../core/history';
import { lossOf, reviewGame, verdictOf, winChance, type GameReview, type Verdict } from '../core/review';
import { timeControlLabel } from '../core/settings';
import { boardImage } from './boardTheme';
import { chancesChart, timeChart, type Chart, type EvalMark } from './charts';
import { formatDate, h } from './dom';

const MAX_BOARD_PX = 400;

const VERDICT_TEXT: Record<Verdict, string> = {
  good: '',
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  blunder: 'blunder',
};

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
  private ply: number;
  private cancelled = false;

  private readonly boardEl = h('div', { class: 'board' });
  private readonly frame = h('div', { class: 'board-frame' }, this.boardEl);
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
    const remove = h('button', {
      class: 'secondary small',
      text: 'Delete',
      onTap: () => {
        // Two taps, like resigning: the first arms the button.
        if (!remove.classList.contains('confirm')) {
          remove.classList.add('confirm');
          remove.textContent = 'Confirm?';
          return;
        }
        deleteGame(game.id);
        this.onBack();
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
        h('span', { class: 'key dot mistake' }),
        'Your mistakes',
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
      h('div', { class: 'review-actions' }, copy, remove),
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
    if (!review || review.cp.length !== this.game.moves.length + 1) {
      const computed = await reviewGame(this.game.moves, {
        isCancelled: () => this.cancelled,
        onProgress: (done, total) => (this.chancesSlot.textContent = `Analysing… ${done} of ${total}`),
      });
      if (!computed || this.cancelled) return;
      review = computed;
      this.game.review = review;
      saveGame(this.game);
    }
    this.review = review;

    const sign = this.playerIsWhite ? 1 : -1;
    const marks: EvalMark[] = [];
    const counts = { you: { blunder: 0, mistake: 0 }, them: { blunder: 0, mistake: 0 } };
    this.game.moves.forEach((_, i) => {
      const verdict = verdictOf(lossOf(review, i));
      if (verdict !== 'blunder' && verdict !== 'mistake') return;
      const mine = (i % 2 === 0) === this.playerIsWhite;
      counts[mine ? 'you' : 'them'][verdict]++;
      this.moveEls[i + 1]?.classList.add(verdict);
      if (mine) marks.push({ move: i, verdict });
    });
    this.addChart(
      this.chancesSlot,
      chancesChart(width, review.cp.map(cp => winChance(sign * cp)), marks, ply => this.show(ply)),
    );
    this.renderSummary(counts);
    this.show(this.ply);
  }

  private renderSummary(counts: Record<'you' | 'them', { blunder: number; mistake: number }>): void {
    const seconds = (mine: boolean) => {
      const own = this.game.times.filter((_, i) => ((i % 2 === 0) === this.playerIsWhite) === mine);
      return own.length ? (own.reduce((a, b) => a + b, 0) / own.length / 1000).toFixed(2) : '–';
    };
    const row = (label: string, you: string | number, them: string | number) =>
      h('tr', {}, h('th', { text: label }), h('td', { text: String(you) }), h('td', { text: String(them) }));
    this.summary.replaceChildren(
      h(
        'table',
        {},
        h('tr', {}, h('th', {}), h('th', { text: 'You' }), h('th', { text: this.game.opponent.name })),
        row('Blunders', counts.you.blunder, counts.them.blunder),
        row('Mistakes', counts.you.mistake, counts.them.mistake),
        row('Seconds per move', seconds(true), seconds(false)),
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
  }

  /** One line about the move that led to the position on the board. */
  private describe(): string {
    const { move } = this.steps[this.ply];
    if (!move) return 'Starting position';
    const index = this.ply - 1;
    const number = `${Math.floor(index / 2) + 1}${index % 2 === 0 ? '.' : '…'}`;
    const parts = [`${number} ${move.san}`, `${((this.game.times[index] ?? 0) / 1000).toFixed(1)} s`];
    if (this.review) {
      const verdict = verdictOf(lossOf(this.review, index));
      if (verdict !== 'good') {
        parts.push(VERDICT_TEXT[verdict]);
        const best = this.review.best[index];
        // Name the engine's choice, in the notation of the position before the move.
        if (best && best !== this.game.moves[index]) {
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
    }
    return parts.join(' · ');
  }
}
