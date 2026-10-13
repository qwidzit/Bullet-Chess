import { opponentFor } from '../bots';
import { formatClock, type Side } from '../core/clock';
import { Game, type EndReason, type GameResult, type PlayerColor } from '../core/game';
import { pgnOf, saveGame, type SavedGame } from '../core/history';
import { LatencyMeter } from '../core/latencyMeter';
import { timeControlLabel, type Settings } from '../core/settings';
import * as sounds from '../core/sounds';
import { boardImage } from './boardTheme';
import { h } from './dom';

const LOW_TIME_MS = 10_000;
const MAX_BOARD_PX = 560;

const ICONS = {
  crown: '<path d="M3 18 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 11z"/>',
  clock:
    '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
    '<path d="M12 8.5V13l3 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  flag: '<path d="M6 3h2v18H6zM8 4h11l-3 4 3 4H8z"/>',
};

function badge(kind: 'won' | 'lost' | 'draw', content: string): HTMLElement {
  const el = h('div', { class: `badge ${kind}` });
  el.innerHTML = content.startsWith('<')
    ? `<svg viewBox="0 0 24 24" fill="currentColor">${content}</svg>`
    : `<span>${content}</span>`;
  return el;
}

function loserIcon(reason: EndReason): string {
  if (reason === 'timeout') return ICONS.clock;
  if (reason === 'resignation') return ICONS.flag;
  return '#';
}

interface PlayerBar {
  bar: HTMLElement;
  name: HTMLElement;
  material: HTMLElement;
  clock: HTMLElement;
}

/** The playing screen: board, both clocks, controls and the result dialog. */
export class GameScreen {
  private game: Game | undefined;
  private meter: LatencyMeter | undefined;
  private raf = 0;
  private meterTimer: ReturnType<typeof setInterval> | undefined;
  private resignTimer: ReturnType<typeof setTimeout> | undefined;
  private lowTimeWarned = false;
  private disposed = false;

  private readonly el: HTMLElement;
  private readonly boardEl = h('div', { class: 'board' });
  private readonly badges = h('div', { class: 'badges' });
  private readonly frame = h('div', { class: 'board-frame' }, this.boardEl, this.badges);
  private readonly boardWrap = h('div', { class: 'board-wrap' }, this.frame);
  private readonly latencyEl = h('pre', { class: 'latency' });
  private readonly movesEl = h('div', { class: 'moves' });
  private lastMoveEl: HTMLElement | undefined;
  private readonly status = h('div', { class: 'status' });
  private readonly resultEl = h('div', { class: 'result' });
  private readonly resignButton = h('button', { class: 'secondary', text: 'Resign', onTap: () => this.onResign() });
  // Only offered between games, so a stray tap can never abandon one.
  private readonly rematchButton = h('button', { class: 'primary', text: 'Rematch', onTap: () => void this.newGame() });
  private readonly menuButton = h('button', { class: 'secondary', text: 'Menu', onTap: () => this.onExit() });
  private readonly bars: Record<'top' | 'bottom', PlayerBar>;
  private shownClock: Record<Side, string> = { w: '', b: '' };
  private playerColor: PlayerColor = 'white';

  constructor(
    root: HTMLElement,
    private readonly settings: Settings,
    private readonly onExit: () => void,
    private readonly onReview: (game: SavedGame) => void,
  ) {
    const bar = (isBot: boolean): PlayerBar => {
      const name = h('span', { class: 'name' });
      const material = h('span', { class: 'material' });
      const clock = h('span', { class: 'clock' });
      const avatar = h('span', { class: isBot ? 'avatar' : 'avatar you' });
      const who = h('div', { class: 'who' }, avatar, h('div', { class: 'who-text' }, name, material));
      return { bar: h('div', { class: 'player-bar' }, who, clock), name, material, clock };
    };
    this.bars = { top: bar(true), bottom: bar(false) };

    this.el = h(
      'div',
      { class: 'game' },
      this.latencyEl,
      this.bars.top.bar,
      this.boardWrap,
      this.bars.bottom.bar,
      this.movesEl,
      h('div', { class: 'controls' }, this.resignButton, this.status, this.rematchButton, this.menuButton),
      this.resultEl,
    );
    root.replaceChildren(this.el);

    if (settings.showLatency) {
      this.meter = new LatencyMeter();
      this.meter.attach();
    } else {
      this.latencyEl.hidden = true;
    }
    window.addEventListener('resize', this.sizeBoard);
    this.sizeBoard();
    void this.newGame();
  }

  get inProgress(): boolean {
    return !!this.game && !this.game.over;
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.sizeBoard);
    cancelAnimationFrame(this.raf);
    clearInterval(this.meterTimer);
    clearTimeout(this.resignTimer);
    this.meter?.detach();
    this.game?.destroy();
  }

  /** Keeps the board a whole number of pixels per square, so pieces stay sharp. */
  private sizeBoard = (): void => {
    let others = 0;
    for (const child of this.el.children) {
      if (child !== this.boardWrap && child !== this.resultEl) others += (child as HTMLElement).offsetHeight;
    }
    const available = Math.min(this.el.clientWidth, this.el.clientHeight - others, MAX_BOARD_PX);
    const size = Math.max(160, Math.floor(available / 8) * 8);
    this.frame.style.width = this.frame.style.height = `${size}px`;
  };

  private async newGame(): Promise<void> {
    const { settings } = this;
    const bot = opponentFor(settings);
    this.playerColor =
      settings.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : settings.color;
    const botColor: PlayerColor = this.playerColor === 'white' ? 'black' : 'white';

    this.game?.destroy();
    this.game = undefined;
    this.resultEl.replaceChildren();
    this.resultEl.classList.remove('shown');
    this.badges.replaceChildren();
    this.movesEl.replaceChildren();
    this.lastMoveEl = undefined;
    this.lowTimeWarned = false;
    this.shownClock = { w: '', b: '' };
    this.resetResign();
    this.setPlaying(false);
    this.rematchButton.hidden = true;

    this.boardEl.style.setProperty('--board-image', boardImage(this.playerColor));
    this.bars.top.name.textContent = bot.name;
    this.bars.bottom.name.textContent = `You · ${timeControlLabel(settings.baseSec, settings.incSec)}`;
    this.bars.top.clock.className = `clock ${botColor}`;
    this.bars.bottom.clock.className = `clock ${this.playerColor}`;
    this.status.textContent = 'Loading…';

    const game = new Game(
      this.boardEl,
      {
        baseMs: settings.baseSec * 1000,
        incMs: settings.incSec * 1000,
        playerColor: this.playerColor,
        bot,
      },
      {
        onEnd: result => this.showResult(result),
        onMove: move => {
          this.renderMaterial();
          this.addMove(move.san, move.color === 'w');
        },
        meter: this.meter,
      },
    );
    this.game = game;
    // Handle for automated tests and console debugging; stripped from release builds.
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
    this.renderClocks();
    this.renderMaterial();

    try {
      await bot.init();
    } catch (error) {
      console.error(error);
      this.status.textContent = 'Engine failed to load';
      return;
    }
    if (this.disposed || this.game !== game) return;

    this.status.textContent = '';
    this.setPlaying(true);
    this.meter?.start();
    game.start();

    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.renderClocks();
      if (!game.over && this.game === game) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    clearInterval(this.meterTimer);
    if (this.meter) {
      this.meterTimer = setInterval(() => {
        this.latencyEl.textContent = this.meter!.lines().join('\n');
      }, 250);
    }
  }

  private renderClocks(): void {
    const game = this.game;
    if (!game) return;
    const now = performance.now();
    const playerSide: Side = this.playerColor === 'white' ? 'w' : 'b';
    for (const side of ['w', 'b'] as const) {
      const { clock } = this.bars[side === playerSide ? 'bottom' : 'top'];
      const left = game.clock.timeLeft(side, now);
      const text = formatClock(left);
      // Touch the DOM only when the visible text changes.
      if (text !== this.shownClock[side]) {
        this.shownClock[side] = text;
        clock.textContent = text;
        clock.classList.toggle('low', left < LOW_TIME_MS);
      }
      clock.classList.toggle('active', game.clock.runningSide === side);
      if (side === playerSide && left < LOW_TIME_MS && !this.lowTimeWarned && !game.over) {
        this.lowTimeWarned = true;
        sounds.play('lowTime');
      }
    }
  }

  /** Shows the material lead, chess.com style, next to whoever is ahead. */
  private renderMaterial(): void {
    if (!this.game) return;
    const balance = this.game.materialBalance() * (this.playerColor === 'white' ? 1 : -1);
    this.bars.bottom.material.textContent = balance > 0 ? `+${balance}` : '';
    this.bars.top.material.textContent = balance < 0 ? `+${-balance}` : '';
  }

  /** Appends a move to the strip under the board and keeps the newest in view. */
  private addMove(san: string, byWhite: boolean): void {
    if (byWhite) {
      const number = this.movesEl.querySelectorAll('.move-number').length + 1;
      this.movesEl.append(h('span', { class: 'move-number', text: `${number}.` }));
    } else if (!this.lastMoveEl) {
      // Only when a game starts from a position with Black to move.
      this.movesEl.append(h('span', { class: 'move-number', text: '1…' }));
    }
    this.lastMoveEl?.classList.remove('current');
    this.lastMoveEl = h('span', { class: 'move current', text: san });
    this.movesEl.append(this.lastMoveEl);
    // Deferred so the scroll's layout work never lands inside move handling.
    requestAnimationFrame(() => (this.movesEl.scrollLeft = this.movesEl.scrollWidth));
  }

  private setPlaying(playing: boolean): void {
    this.resignButton.hidden = !playing;
    this.menuButton.hidden = playing;
  }

  private onResign(): void {
    if (!this.inProgress) return;
    if (this.resignButton.classList.contains('confirm')) {
      this.game!.resign();
      return;
    }
    // First tap arms the button; a second tap within three seconds resigns.
    this.resignButton.classList.add('confirm');
    this.resignButton.textContent = 'Confirm?';
    this.resignTimer = setTimeout(() => this.resetResign(), 3000);
  }

  private resetResign(): void {
    clearTimeout(this.resignTimer);
    this.resignButton.classList.remove('confirm');
    this.resignButton.textContent = 'Resign';
  }

  /** Stores the finished game in the history. */
  private keep(result: GameResult): SavedGame {
    const { settings } = this;
    const rated = settings.opponent === 'rated';
    const saved: SavedGame = {
      id: `${Date.now()}`,
      playedAt: Date.now(),
      baseSec: settings.baseSec,
      incSec: settings.incSec,
      playerColor: this.playerColor,
      opponent: {
        name: this.bars.top.name.textContent ?? '',
        rating: rated ? settings.rating : undefined,
        speedPct: rated ? settings.speedPct : undefined,
      },
      winner: result.winner,
      reason: result.reason,
      moves: result.moves,
      times: result.times,
    };
    // A game with no moves at all (resigned at once) is not worth keeping.
    if (result.moves.length) saveGame(saved);
    return saved;
  }

  private showResult(result: GameResult): void {
    this.renderClocks();
    this.resetResign();
    this.setPlaying(false);
    this.rematchButton.hidden = false;
    this.meter?.stop();
    clearInterval(this.meterTimer);
    this.showBadges(result);

    const saved = this.keep(result);
    const won = result.winner === this.playerColor;
    const headline = result.winner === null ? 'Draw' : won ? 'You Won!' : 'You Lost';
    const close = () => this.resultEl.classList.remove('shown');
    const copy = h('button', {
      class: 'link',
      text: 'Copy PGN',
      onTap: () => {
        void navigator.clipboard
          ?.writeText(pgnOf(saved))
          .then(() => (copy.textContent = 'Copied'))
          .catch(() => (copy.textContent = 'Copy failed'));
      },
    });

    const card = h(
      'div',
      { class: 'result-card' },
      h(
        'div',
        { class: `result-head${won ? ' won' : ''}` },
        h('div', { class: 'result-title', text: headline }),
        h('div', { class: 'result-reason', text: `by ${result.reason}` }),
        h('button', { class: 'close', text: '×', onTap: close, attrs: { 'aria-label': 'Close' } }),
      ),
      h(
        'div',
        { class: 'result-body' },
        this.meter ? this.latencyReport() : null,
        h('button', { class: 'primary big', text: 'Rematch', onTap: () => void this.newGame() }),
        h(
          'div',
          { class: 'result-row' },
          h('button', { class: 'secondary big', text: 'Review', onTap: () => this.onReview(saved) }),
          h('button', { class: 'secondary big', text: 'New Game', onTap: () => this.onExit() }),
        ),
        copy,
      ),
    );
    // Tapping outside the card closes it, to look at the final position.
    this.resultEl.onclick = e => {
      if (e.target === this.resultEl) close();
    };
    this.resultEl.replaceChildren(card);
    this.resultEl.classList.add('shown');
  }

  /** Marks each king's square with the outcome: crown for the winner, cause for the loser. */
  private showBadges(result: GameResult): void {
    const game = this.game!;
    const place = (color: PlayerColor, el: HTMLElement) => {
      const key = game.kingSquare(color);
      const file = key.charCodeAt(0) - 97;
      const rank = Number(key[1]) - 1;
      const white = this.playerColor === 'white';
      el.style.setProperty('--col', String(white ? file : 7 - file));
      el.style.setProperty('--row', String(white ? 7 - rank : rank));
      this.badges.append(el);
    };
    if (result.winner === null) {
      place('white', badge('draw', '½'));
      place('black', badge('draw', '½'));
    } else {
      place(result.winner, badge('won', ICONS.crown));
      place(result.winner === 'white' ? 'black' : 'white', badge('lost', loserIcon(result.reason)));
    }
  }

  private latencyReport(): HTMLElement {
    const { verdict, rows } = this.meter!.summary();
    const title =
      verdict === 'pass'
        ? 'Speed test: pass'
        : verdict === 'fail'
          ? 'Speed test: too slow'
          : 'Speed test: play at least 10 moves';
    return h(
      'div',
      { class: `report ${verdict}` },
      h('div', { class: 'report-title', text: title }),
      ...rows.map(row =>
        h(
          'div',
          { class: `report-row${row.ok === undefined ? '' : row.ok ? ' ok' : ' bad'}` },
          h('span', { text: row.label }),
          h('span', { text: row.value }),
        ),
      ),
    );
  }
}
