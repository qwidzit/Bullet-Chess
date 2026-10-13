import type { PlayerColor } from '../core/game';

export const LIGHT = '#ebecd0';
export const DARK = '#739552';

/**
 * The board as one background image: green squares with the coordinates
 * drawn inside the edge squares, in the colour of the opposite square.
 * Returned as a CSS url() value.
 */
export function boardImage(orientation: PlayerColor): string {
  const white = orientation === 'white';
  const parts: string[] = [
    `<rect width="800" height="800" fill="${LIGHT}"/>`,
    `<path fill="${DARK}" d="`,
  ];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2) parts.push(`M${col * 100} ${row * 100}h100v100h-100z`);
    }
  }
  parts.push('"/>');

  const text = (x: number, y: number, anchor: string, label: string, onDark: boolean) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${onDark ? LIGHT : DARK}">${label}</text>`;
  for (let i = 0; i < 8; i++) {
    // Ranks run down the left edge, files along the bottom edge.
    const rank = white ? 8 - i : i + 1;
    const file = 'abcdefgh'[white ? i : 7 - i];
    parts.push(text(5, i * 100 + 24, 'start', String(rank), i % 2 === 1));
    parts.push(text(i * 100 + 94, 792, 'end', file, (7 + i) % 2 === 1));
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" shape-rendering="crispEdges" ` +
    `font-family="system-ui,sans-serif" font-size="22" font-weight="700">${parts.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
