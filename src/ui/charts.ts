// The two review charts, drawn as SVG. They share a horizontal scale (one
// slot per move pair) so a move sits at the same x in both.
//
// Colours are per entity, not per chart: the player is blue wherever they
// appear, the opponent orange. Blunder and mistake markers use reserved
// status colours and are always named in the legend beside them.

const PLOT_LEFT = 30;
const PLOT_RIGHT = 8;

const NS = 'http://www.w3.org/2000/svg';

function svg(width: number, height: number, body: string): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('class', 'chart');
  el.innerHTML = body;
  return el;
}

/** Reports the horizontal position of a touch or drag, as a 0–1 share of the plot. */
function onScrub(el: SVGSVGElement, width: number, handler: (share: number, upperHalf: boolean) => void): void {
  const report = (e: PointerEvent) => {
    const box = el.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * width;
    const share = (x - PLOT_LEFT) / (width - PLOT_LEFT - PLOT_RIGHT);
    handler(Math.min(1, Math.max(0, share)), e.clientY - box.top < box.height / 2);
  };
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    report(e);
  });
  el.addEventListener('pointermove', e => {
    if (e.buttons || e.pointerType === 'touch') report(e);
  });
}

export interface Chart {
  el: SVGSVGElement;
  /** Moves the crosshair to the position after `ply` half-moves. */
  select(ply: number): void;
}

export interface EvalMark {
  /** Index of the move (0 is White's first). */
  move: number;
  verdict: 'mistake' | 'blunder';
}

/**
 * The player's winning chances after every move, 0–100. `chances` has one
 * entry for the starting position and one per move.
 */
export function chancesChart(
  width: number,
  chances: number[],
  marks: EvalMark[],
  onSelect: (ply: number) => void,
): Chart {
  const height = 104;
  const top = 8;
  const bottom = height - 8;
  const plies = chances.length - 1;
  const plotWidth = width - PLOT_LEFT - PLOT_RIGHT;
  const x = (ply: number) => PLOT_LEFT + (plies ? (ply / plies) * plotWidth : 0);
  const y = (chance: number) => bottom - (chance / 100) * (bottom - top);

  const points = chances.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`);
  const grid = [0, 50, 100]
    .map(
      v =>
        `<line class="${v === 50 ? 'axis' : 'grid'}" x1="${PLOT_LEFT}" x2="${width - PLOT_RIGHT}" y1="${y(v)}" y2="${y(v)}"/>` +
        `<text class="tick" x="${PLOT_LEFT - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}%</text>`,
    )
    .join('');
  const dots = marks
    .map(
      m =>
        `<circle class="mark ${m.verdict}" cx="${x(m.move + 1).toFixed(1)}" cy="${y(chances[m.move + 1]).toFixed(1)}" r="4"/>`,
    )
    .join('');

  const el = svg(
    width,
    height,
    `${grid}
     <polygon class="area you" points="${x(0)},${bottom} ${points.join(' ')} ${x(plies)},${bottom}"/>
     <polyline class="line you" points="${points.join(' ')}"/>
     ${dots}
     <line class="crosshair" y1="${top}" y2="${bottom}"/>
     <circle class="cursor you" r="4.5"/>`,
  );
  const crosshair = el.querySelector('.crosshair')!;
  const cursor = el.querySelector('.cursor')!;
  onScrub(el, width, share => onSelect(Math.round(share * plies)));

  return {
    el,
    select(ply) {
      crosshair.setAttribute('x1', String(x(ply)));
      crosshair.setAttribute('x2', String(x(ply)));
      cursor.setAttribute('cx', String(x(ply)));
      cursor.setAttribute('cy', String(y(chances[ply])));
    },
  };
}

/**
 * Seconds spent on every move: the player's bars rise from the centre line,
 * the opponent's hang below it, on the same scale.
 */
export function timeChart(
  width: number,
  times: number[],
  playerIsWhite: boolean,
  onSelect: (ply: number) => void,
): Chart {
  const height = 132;
  const top = 8;
  const bottom = height - 18;
  const middle = (top + bottom) / 2;
  const plies = times.length;
  const moves = Math.ceil(plies / 2);
  const plotWidth = width - PLOT_LEFT - PLOT_RIGHT;
  const slot = moves ? plotWidth / moves : plotWidth;
  const bar = Math.max(1.5, Math.min(24, slot - 2));

  // A scale ending on a whole number of seconds, with at most three gridlines a side.
  const longest = Math.max(2, Math.ceil(Math.max(0, ...times) / 1000));
  const step = Math.ceil(longest / 3);
  const max = step * Math.ceil(longest / step);
  const reach = (ms: number) => (Math.min(ms / 1000, max) / max) * (middle - top);

  let grid = `<line class="axis" x1="${PLOT_LEFT}" x2="${width - PLOT_RIGHT}" y1="${middle}" y2="${middle}"/>`;
  for (let s = step; s <= max; s += step) {
    const offset = (s / max) * (middle - top);
    for (const gy of [middle - offset, middle + offset]) {
      grid +=
        `<line class="grid" x1="${PLOT_LEFT}" x2="${width - PLOT_RIGHT}" y1="${gy}" y2="${gy}"/>` +
        `<text class="tick" x="${PLOT_LEFT - 6}" y="${gy + 3.5}" text-anchor="end">${s}s</text>`;
    }
  }
  // Move numbers along the bottom, sparse enough never to collide.
  const every = moves > 60 ? 20 : moves > 25 ? 10 : 5;
  for (let m = every; m <= moves; m += every) {
    grid += `<text class="tick" x="${PLOT_LEFT + (m - 0.5) * slot}" y="${height - 4}" text-anchor="middle">${m}</text>`;
  }

  const radius = Math.min(2, bar / 2);
  const bars = times
    .map((ms, ply) => {
      const mine = (ply % 2 === 0) === playerIsWhite;
      const h = Math.max(1, reach(ms));
      const bx = PLOT_LEFT + Math.floor(ply / 2) * slot + (slot - bar) / 2;
      const by = mine ? middle - h : middle;
      // Rounded at the data end only; square where the bar meets the centre line.
      const r = Math.min(radius, h);
      const path = mine
        ? `M${bx},${middle} v${-(h - r)} q0,${-r} ${r},${-r} h${bar - 2 * r} q${r},0 ${r},${r} v${h - r} z`
        : `M${bx},${by} v${h - r} q0,${r} ${r},${r} h${bar - 2 * r} q${r},0 ${r},${-r} v${-(h - r)} z`;
      return `<path class="bar ${mine ? 'you' : 'them'}" data-ply="${ply + 1}" d="${path}"/>`;
    })
    .join('');

  const el = svg(width, height, `${grid}${bars}<line class="crosshair" y1="${top}" y2="${bottom}"/>`);
  const crosshair = el.querySelector('.crosshair')!;
  let lit: Element | null = null;
  onScrub(el, width, (share, upperHalf) => {
    if (!moves) return;
    const move = Math.min(moves - 1, Math.floor(share * moves));
    // The upper half holds the player's bars, the lower half the opponent's.
    const whiteMove = upperHalf === playerIsWhite;
    onSelect(Math.min(plies, move * 2 + (whiteMove ? 1 : 2)));
  });

  return {
    el,
    select(ply) {
      lit?.classList.remove('lit');
      lit = el.querySelector(`[data-ply="${ply}"]`);
      lit?.classList.add('lit');
      const cx = PLOT_LEFT + (Math.max(0, Math.ceil(ply / 2) - 0.5)) * slot;
      crosshair.setAttribute('x1', String(cx));
      crosshair.setAttribute('x2', String(cx));
    },
  };
}
