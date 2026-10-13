import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import * as ort from 'onnxruntime-web/wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { encode, PLANES } from '../src/bots/maia/encode';
import { POLICY_SIZE, policyIndex } from '../src/bots/maia/policyIndex';

describe('policyIndex', () => {
  it('follows the order of the network output', () => {
    expect(policyIndex('a1b1', false, null)).toBe(0);
    expect(policyIndex('a1h8', false, null)).toBe(22);
    expect(policyIndex('b1a1', false, null)).toBe(23);
    expect(policyIndex('a7a8q', false, null)).toBe(1792);
    expect(policyIndex('h7h8b', false, null)).toBe(POLICY_SIZE - 1);
  });

  it('writes Black moves from Black\'s side of the board', () => {
    expect(policyIndex('e7e5', true, null)).toBe(policyIndex('e2e4', false, null));
    expect(policyIndex('g8f6', true, null)).toBe(policyIndex('g1f3', false, null));
    expect(policyIndex('h2g1q', true, null)).toBe(policyIndex('h7g8q', false, null));
  });

  it('writes castling as the king taking its own rook', () => {
    expect(policyIndex('e1g1', false, 'k')).toBe(policyIndex('e1h1', false, null));
    expect(policyIndex('e1c1', false, 'q')).toBe(policyIndex('e1a1', false, null));
    expect(policyIndex('e8g8', true, 'k')).toBe(policyIndex('e1h1', false, null));
  });

  it('treats a knight promotion as the plain pawn move', () => {
    expect(policyIndex('e7e8n', false, null)).toBe(policyIndex('e7e8', false, null));
    expect(policyIndex('e7e8q', false, null)).not.toBe(policyIndex('e7e8', false, null));
  });

  it('rejects a move no piece could make', () => {
    expect(() => policyIndex('a1b4', false, null)).toThrow();
  });
});

describe('encode', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const plane = (planes: Float32Array, index: number) => [...planes.subarray(index * 64, index * 64 + 64)];
  const count = (planes: Float32Array, index: number) => plane(planes, index).filter(v => v !== 0).length;

  it('lays out the starting position for White', () => {
    const { planes, candidates } = encode([], START);
    expect(planes.length).toBe(PLANES * 64);
    // Our pawns on our second rank, theirs on their second rank.
    expect(plane(planes, 0).slice(8, 16)).toEqual(Array(8).fill(1));
    expect(count(planes, 0)).toBe(8);
    expect(plane(planes, 6).slice(48, 56)).toEqual(Array(8).fill(1));
    // One king each, on e1 and e8.
    expect(plane(planes, 5).indexOf(1)).toBe(4);
    expect(plane(planes, 11).indexOf(1)).toBe(60);
    // No earlier positions, all four castling rights, White to move, edges plane.
    expect(count(planes, 13)).toBe(0);
    for (const p of [104, 105, 106, 107, 111]) expect(count(planes, p)).toBe(64);
    expect(count(planes, 108)).toBe(0);
    expect(candidates).toHaveLength(20);
    expect(new Set(candidates.map(c => c.index)).size).toBe(20);
  });

  it('turns the board round for Black and keeps the previous position', () => {
    const chess = new Chess();
    chess.move('e4');
    const { planes } = encode(['e2e4'], chess.fen());
    // Black to move: its pawns are now "ours", on the near second rank.
    expect(plane(planes, 0).slice(8, 16)).toEqual(Array(8).fill(1));
    expect(count(planes, 108)).toBe(64);
    // White's e-pawn stands on e4: file 4, fifth rank counted from Black's side.
    expect(plane(planes, 6)[4 * 8 + 4]).toBe(1);
    // The position before it is in the next block, with that pawn still at home.
    expect(plane(planes, 13 + 6)[6 * 8 + 4]).toBe(1);
    expect(count(planes, 13 + 6)).toBe(8);
  });

  it('records lost castling rights and moves since a capture or pawn move', () => {
    const { planes } = encode([], 'r3k2r/8/8/8/8/8/8/R3K2R w Kq - 7 20');
    expect(count(planes, 104)).toBe(0); // our queen side
    expect(count(planes, 105)).toBe(64); // our king side
    expect(count(planes, 106)).toBe(64); // their queen side
    expect(count(planes, 107)).toBe(0); // their king side
    expect(plane(planes, 109)[0]).toBe(7);
  });

  it('marks a position that has occurred before', () => {
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const { planes } = encode(moves, START);
    expect(count(planes, 12)).toBe(64);
  });

  it('describes each candidate move', () => {
    const { candidates } = encode([], 'r3k2r/8/8/3p4/4P3/8/8/R3K2R w KQkq - 0 1');
    const kind = (uci: string) => candidates.find(c => c.uci === uci)?.kind;
    expect(kind('e4d5')).toMatchObject({ capture: true, pawnPush: false });
    expect(kind('e4e5')).toMatchObject({ capture: false, pawnPush: true });
    expect(kind('e1g1')).toMatchObject({ castle: true });
    expect(kind('a1a8')).toMatchObject({ capture: true, check: true });
  });
});

/**
 * The whole pipeline against the reference engine: lc0's own move
 * probabilities for these positions were recorded by scripts/maia-reference.mjs.
 */
describe.each([1100, 1900])('Maia %i against lc0', level => {
  let session: ort.InferenceSession;
  const reference: Record<string, { moves: string; priors: Record<string, number> }> = JSON.parse(
    readFileSync(`models/reference/maia-${level}.json`, 'utf8'),
  );

  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmBinary = readFileSync(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'));
    session = await ort.InferenceSession.create(readFileSync(`public/maia/maia-${level}.onnx`));
  });

  it.each(Object.keys(reference))('matches in the "%s" position', async name => {
    const moves = reference[name].moves ? reference[name].moves.split(' ') : [];
    const chess = new Chess();
    for (const uci of moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });

    const { planes, candidates } = encode(moves, chess.fen());
    const output = await session.run({ '/input/planes': new ort.Tensor('float32', planes, [1, PLANES, 8, 8]) });
    const logits = output['/output/policy'].data as Float32Array;
    const peak = Math.max(...candidates.map(c => logits[c.index]));
    const weights = candidates.map(c => Math.exp(logits[c.index] - peak));
    const total = weights.reduce((a, b) => a + b, 0);

    // lc0 names castling as king-takes-rook and leaves the "n" off knight promotions.
    const lc0Name = (c: (typeof candidates)[number]) =>
      c.kind.castle ? c.uci.slice(0, 2) + (c.uci[2] === 'g' ? 'h' : 'a') + c.uci[3] : c.uci;
    expect(candidates).toHaveLength(Object.keys(reference[name].priors).length);
    candidates.forEach((candidate, i) => {
      const expected = reference[name].priors[lc0Name(candidate)];
      expect(expected, `lc0 has no entry for ${candidate.uci}`).toBeDefined();
      // lc0 prints two decimals of a percentage.
      expect(Math.abs(weights[i] / total - expected)).toBeLessThan(0.002);
    });
  });
});
