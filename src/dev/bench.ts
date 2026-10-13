// Development tool, not part of the app: a queue of bot measurements that
// keeps running in the page while results are read back piece by piece.
//   const { bench } = await import('/src/dev/bench.ts');
//   bench.add([{ name: 'anchor', a: { rating: 1100 }, games: 24 }]);
//   await bench.wait(40_000); bench.report();

import { createMaiaBot, createRatedBot, type MaiaStyle, type PlayStyle } from '../bots/maiaBot';
import { DEFAULT_TIME_PROFILE, type TimeProfile } from '../bots/timeModel';
import { measureBots } from './calibrate';

/** Either a bot as the app would build it, or an experimental configuration. */
export type BotSpec =
  | { rating: number; speedPct?: number; playStyle?: PlayStyle }
  | {
      /** Maia network, by its Lichess rating. */
      level: number;
      style?: Partial<MaiaStyle>;
      timing?: Partial<TimeProfile>;
    };

export interface Job {
  name: string;
  a: BotSpec;
  /** Opponent; omitted for self-play. */
  b?: BotSpec;
  games: number;
  baseSec?: number;
  incSec?: number;
  /** Score every move for accuracy as well. Off by default for matches. */
  judge?: boolean;
}

type Measured = Awaited<ReturnType<typeof measureBots>>;

function make(spec: BotSpec) {
  if ('rating' in spec) return createRatedBot(spec.rating, spec.speedPct, spec.playStyle);
  return createMaiaBot(spec.level, spec.style, { ...DEFAULT_TIME_PROFILE, ...spec.timing });
}

/** One line per job: accuracy and pace for self-play, the score for a match. */
function line(job: Job, r: Measured): string {
  const f = r.first;
  const s = r.second;
  const games = r.score.first + r.score.second + r.score.draws;
  const tail = `onTime ${r.score.endedOnTimePct}% len ${r.score.avgLength}`;
  if (job.b) {
    const pct = (100 * (r.score.first + r.score.draws / 2)) / games;
    // The Elo gap a score implies, capped so a whitewash stays finite.
    const p = Math.min(0.97, Math.max(0.03, pct / 100));
    const elo = Math.round(400 * Math.log10(p / (1 - p)));
    const blunders = f.all.moves ? ` | blunders ${f.all.blundersPct}% v ${s.all.blundersPct}%` : '';
    return (
      `score ${r.score.first}-${r.score.second}-${r.score.draws} = ${pct.toFixed(0)}% (${elo >= 0 ? '+' : ''}${elo} Elo)` +
      `${blunders} | ${tail}`
    );
  }
  const avg = (x: number, y: number) => ((x + y) / 2).toFixed(1);
  const t = f.secondsPerMove;
  return (
    `loss ${avg(f.all.avgLoss, s.all.avgLoss)} | mistakes ${avg(f.all.mistakesPct, s.all.mistakesPct)}%` +
    ` | blunders ${avg(f.all.blundersPct, s.all.blundersPct)}%` +
    ` | secs open ${t.opening} recap ${t.recapture} other ${t.other} hurried ${t.hurried}` +
    ` | clock ${Object.values(f.clockLeftAfterMove).join('/')} | ${tail}` +
    ` | n ${f.all.moves + s.all.moves}`
  );
}

const queue: Job[] = [];
const results: Record<string, string> = {};
let running: { name: string; done: number; of: number } | null = null;

async function run(): Promise<void> {
  while (queue.length) {
    const job = queue.shift()!;
    const progress = { name: job.name, done: 0, of: job.games };
    running = progress;
    try {
      const measured = await measureBots(
        make(job.a),
        make(job.b ?? job.a),
        job.baseSec ?? 60,
        job.incSec ?? 0,
        job.games,
        done => (progress.done = done),
        job.judge ?? !job.b,
      );
      results[job.name] = line(job, measured);
    } catch (error) {
      results[job.name] = `failed: ${String(error)}`;
    }
  }
  running = null;
}

export const bench = {
  add(jobs: Job[]): void {
    queue.push(...jobs);
    if (!running) void run();
  },
  /** Resolves when the queue is empty or `ms` has passed, whichever is first. */
  async wait(ms: number): Promise<void> {
    const start = performance.now();
    while ((running || queue.length) && performance.now() - start < ms) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  },
  report(): string {
    return JSON.stringify({ running, queued: queue.length, results }, null, 1);
  },
};
