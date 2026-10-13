import type { MaiaRequest, MaiaResponse, MovePrediction } from './maiaWorker';

export type { MovePrediction } from './maiaWorker';

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (r: MaiaResponse) => void; reject: (e: Error) => void }>();

function send(level: number, position?: MaiaRequest['position']): Promise<MaiaResponse> {
  if (!worker) {
    worker = new Worker(new URL('./maiaWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<MaiaResponse>) => {
      const waiting = pending.get(event.data.id);
      pending.delete(event.data.id);
      if (event.data.error) waiting?.reject(new Error(event.data.error));
      else waiting?.resolve(event.data);
    };
    worker.onerror = event => {
      for (const waiting of pending.values()) waiting.reject(new Error(event.message || 'Maia worker failed'));
      pending.clear();
    };
  }
  const id = nextId++;
  const assetBase = new URL(import.meta.env.BASE_URL, location.href).href;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, level, assetBase, position } satisfies MaiaRequest);
  });
}

/** Loads a network ahead of time so the first move is not delayed by it. */
export async function loadMaia(level: number): Promise<void> {
  await send(level);
}

/** Every legal move with the probability a player of `level` chooses it, likeliest first. */
export async function predictMoves(level: number, moves: string[], fen: string): Promise<MovePrediction[]> {
  return (await send(level, { moves, fen })).predictions ?? [];
}
