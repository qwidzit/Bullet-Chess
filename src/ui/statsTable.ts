import type { PlayerStats } from '../core/game';
import { h } from './dom';

/** How the player handled the board and clock in one game. */
export function statsTable(stats: PlayerStats): HTMLElement {
  const rows: [string, string][] = [
    ['Average speed', `${stats.movesPerSec.toFixed(2)} moves/s`],
    ['Fastest second', `${stats.peakMovesPerSec} ${stats.peakMovesPerSec === 1 ? 'move' : 'moves'}`],
    ['Premoves played', `${stats.premovesPlayed} of ${stats.premovesQueued} queued`],
    ['Longest premove chain', String(stats.bestPremoveStreak)],
    ['Longest move', `${(stats.longestMoveMs / 1000).toFixed(1)} s`],
  ];
  return h(
    'div',
    { class: 'stats' },
    ...rows.map(([label, value]) =>
      h('div', { class: 'stats-row' }, h('span', { text: label }), h('span', { text: value })),
    ),
  );
}
