import { loadHistory, outcomeOf, pgnOf, type SavedGame } from '../core/history';
import { timeControlLabel } from '../core/settings';
import { formatDate, h } from './dom';

const OUTCOME_LETTER = { win: 'W', loss: 'L', draw: 'D' };

/** Wins, losses and draws against each opponent rating, over the archived games. */
function scoreTable(games: SavedGame[]): HTMLElement | null {
  const byRating = new Map<number, { win: number; loss: number; draw: number }>();
  for (const game of games) {
    const rating = game.opponent.rating;
    if (rating === undefined) continue;
    const tally = byRating.get(rating) ?? { win: 0, loss: 0, draw: 0 };
    tally[outcomeOf(game)]++;
    byRating.set(rating, tally);
  }
  if (!byRating.size) return null;

  const rows = [...byRating.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rating, t]) => {
      const total = t.win + t.loss + t.draw;
      const score = Math.round((100 * (t.win + t.draw / 2)) / total);
      return h(
        'tr',
        {},
        h('th', { text: String(rating) }),
        h('td', { text: String(t.win) }),
        h('td', { text: String(t.loss) }),
        h('td', { text: String(t.draw) }),
        h('td', { text: `${score}%` }),
      );
    });
  return h(
    'table',
    { class: 'score-table' },
    h(
      'tr',
      {},
      h('th', { text: 'Bot rating' }),
      h('th', { text: 'Won' }),
      h('th', { text: 'Lost' }),
      h('th', { text: 'Drawn' }),
      h('th', { text: 'Your score' }),
    ),
    ...rows,
  );
}

function gameRow(game: SavedGame, onOpen: (game: SavedGame) => void): HTMLElement {
  const outcome = outcomeOf(game);
  const when = formatDate(game.playedAt, true);
  return h(
    'button',
    { class: 'game-row', onTap: () => onOpen(game) },
    h('span', { class: `outcome ${outcome}`, text: OUTCOME_LETTER[outcome] }),
    h(
      'span',
      { class: 'game-row-text' },
      h('span', { class: 'game-row-title', text: game.opponent.name }),
      h('span', {
        class: 'game-row-sub',
        // Pasted games may lack a time control or a stated ending; leave those out.
        text: [
          game.imported ? 'Imported' : '',
          game.baseSec ? timeControlLabel(game.baseSec, game.incSec) : '',
          game.reason,
          `${Math.ceil(game.moves.length / 2)} moves`,
          when,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    ),
  );
}

export function renderHistory(
  root: HTMLElement,
  onBack: () => void,
  onOpen: (game: SavedGame) => void,
): void {
  const games = loadHistory();
  const copyAll = h('button', {
    class: 'secondary small',
    text: 'Copy all PGN',
    onTap: () => {
      void navigator.clipboard
        ?.writeText(games.map(pgnOf).join('\n\n'))
        .then(() => (copyAll.textContent = 'Copied'))
        .catch(() => (copyAll.textContent = 'Copy failed'));
    },
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'history' },
      h(
        'div',
        { class: 'screen-head' },
        h('button', { class: 'secondary small', text: '‹ Back', onTap: onBack }),
        h('div', { class: 'screen-title' }, h('div', { text: 'Archive' })),
        games.length ? copyAll : null,
      ),
      games.length
        ? h(
            'div',
            { class: 'history-scroll' },
            scoreTable(games),
            h('h2', { text: `${games.length} ${games.length === 1 ? 'game' : 'games'}` }),
            ...games.map(game => gameRow(game, onOpen)),
          )
        : h('div', { class: 'empty', text: 'Nothing here yet. Tap Archive after a game to keep it.' }),
    ),
  );
}
