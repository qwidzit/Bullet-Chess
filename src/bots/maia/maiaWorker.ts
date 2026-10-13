// Background thread that runs the Maia networks, so neither the replay of the
// game nor the inference can ever stall the board.
import * as ort from 'onnxruntime-web/wasm';
import runtimeUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { encode, PLANES, type MoveKind } from './encode';

export interface MaiaRequest {
  id: number;
  /** Network to use, by the Lichess rating it was trained on (1100–1900). */
  level: number;
  /** Folder the app is served from; the networks are fetched below it. */
  assetBase: string;
  /** Absent for a warm-up request that only loads the network. */
  position?: { moves: string[]; fen: string };
}

export interface MovePrediction {
  uci: string;
  /** Probability that a player of this level picks the move. */
  p: number;
  kind: MoveKind;
}

export interface MaiaResponse {
  id: number;
  predictions?: MovePrediction[];
  error?: string;
}

const sessions = new Map<number, Promise<ort.InferenceSession>>();
let configured = false;

function session(level: number, assetBase: string): Promise<ort.InferenceSession> {
  if (!configured) {
    // One thread: the page is not cross-origin isolated, and the networks are tiny.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: new URL(runtimeUrl, self.location.href).href };
    configured = true;
  }
  let loading = sessions.get(level);
  if (!loading) {
    loading = ort.InferenceSession.create(`${assetBase}maia/maia-${level}.onnx`, {
      executionProviders: ['wasm'],
    });
    sessions.set(level, loading);
  }
  return loading;
}

async function predict(request: MaiaRequest): Promise<MovePrediction[] | undefined> {
  const net = await session(request.level, request.assetBase);
  if (!request.position) return undefined;

  const { planes, candidates } = encode(request.position.moves, request.position.fen);
  const input = new ort.Tensor('float32', planes, [1, PLANES, 8, 8]);
  const output = await net.run({ '/input/planes': input }, ['/output/policy']);
  const logits = output['/output/policy'].data as Float32Array;

  // Softmax over the legal moves only.
  const peak = Math.max(...candidates.map(c => logits[c.index]));
  const weights = candidates.map(c => Math.exp(logits[c.index] - peak));
  const total = weights.reduce((a, b) => a + b, 0);
  return candidates
    .map((c, i) => ({ uci: c.uci, p: weights[i] / total, kind: c.kind }))
    .sort((a, b) => b.p - a.p);
}

self.onmessage = (event: MessageEvent<MaiaRequest>) => {
  const { id } = event.data;
  predict(event.data).then(
    predictions => self.postMessage({ id, predictions } satisfies MaiaResponse),
    error => self.postMessage({ id, error: String(error) } satisfies MaiaResponse),
  );
};
