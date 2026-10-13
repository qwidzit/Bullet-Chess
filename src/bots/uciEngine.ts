/** One candidate move from a search, scored for the side to move. */
export interface EngineLine {
  move: string;
  /** Centipawns; forced mates are mapped to large values that shrink with distance. */
  cp: number;
}

export interface SearchResult {
  bestMove: string;
  /** Candidate moves, best first. As many as the MultiPV option allows. */
  lines: EngineLine[];
}

const INFO = /^info .*?\bdepth (\d+) .*?\bmultipv (\d+) score (cp|mate) (-?\d+)(?: (upperbound|lowerbound))?.*? pv (\S+)/;
const MATE_CP = 10_000;

/** Minimal UCI client for a Stockfish web worker. */
export class UciEngine {
  private worker: Worker | undefined;
  private ready: Promise<void> | undefined;
  private lineHandlers = new Set<(line: string) => void>();
  private searching: Promise<SearchResult> | undefined;

  constructor(private readonly url: string) {}

  init(): Promise<void> {
    this.ready ??= new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker(this.url);
        this.worker = worker;
        worker.onerror = e => reject(new Error(e.message || 'Engine failed to load'));
        worker.onmessage = e => {
          const text = typeof e.data === 'string' ? e.data : '';
          for (const line of text.split('\n')) {
            for (const handler of [...this.lineHandlers]) handler(line);
          }
        };
        void this.waitFor('uciok', 'uci')
          .then(() => this.waitFor('readyok', 'isready'))
          .then(resolve);
      } catch (error) {
        reject(error);
      }
    });
    return this.ready;
  }

  send(command: string): void {
    this.worker?.postMessage(command);
  }

  setOption(name: string, value: string | number): void {
    this.send(`setoption name ${name} value ${value}`);
  }

  /** Runs one search and resolves with the chosen move and the scored candidates. */
  async search(fen: string, go: string): Promise<SearchResult> {
    // The engine handles one search at a time; let a cancelled one drain first.
    if (this.searching) {
      this.send('stop');
      await this.searching.catch(() => undefined);
    }
    this.searching = new Promise<SearchResult>(resolve => {
      // Latest fully searched score per candidate slot, keyed by MultiPV index.
      const byRank = new Map<number, EngineLine & { depth: number }>();
      const handler = (line: string) => {
        const info = INFO.exec(line);
        if (info) {
          const [, depth, rank, kind, value, bound, move] = info;
          if (bound) return;
          const n = Number(value);
          const cp = kind === 'cp' ? n : Math.sign(n) * (MATE_CP - Math.abs(n) * 10);
          byRank.set(Number(rank), { move, cp, depth: Number(depth) });
          return;
        }
        if (!line.startsWith('bestmove')) return;
        this.lineHandlers.delete(handler);
        const deepest = Math.max(0, ...[...byRank.values()].map(l => l.depth));
        const lines = [...byRank.entries()]
          .filter(([, l]) => l.depth === deepest)
          .sort(([a], [b]) => a - b)
          .map(([, { move, cp }]) => ({ move, cp }));
        resolve({ bestMove: line.split(' ')[1] ?? '', lines });
      };
      this.lineHandlers.add(handler);
      this.send(`position fen ${fen}`);
      this.send(`go ${go}`);
    });
    const search = this.searching;
    try {
      return await search;
    } finally {
      if (this.searching === search) this.searching = undefined;
    }
  }

  stop(): void {
    if (this.searching) this.send('stop');
  }

  private waitFor(token: string, command: string): Promise<void> {
    return new Promise(resolve => {
      const handler = (line: string) => {
        if (!line.startsWith(token)) return;
        this.lineHandlers.delete(handler);
        resolve();
      };
      this.lineHandlers.add(handler);
      this.send(command);
    });
  }
}
