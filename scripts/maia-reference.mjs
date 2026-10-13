// Development tool: asks the reference engine (lc0) for Maia's raw move
// probabilities in a set of test positions, so the app's own Maia pipeline can
// be checked against them.
//   node scripts/maia-reference.mjs <path-to-lc0.exe> <weights.pb.gz> <out.json>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [lc0Path, weights, outFile] = process.argv.slice(2);

/** Move sequences from the starting position, chosen to exercise the encoding. */
export const POSITIONS = {
  start: '',
  blackReply: 'e2e4',
  castlingAvailable: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5',
  lostCastling: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 f6d5 g5f7 e8f7',
  whitePromotion: 'h2h4 g7g5 h4g5 h7h6 g5h6 g8f6 h6h7 f6g8',
  blackPromotion: 'a2a3 h7h5 g2g4 h5g4 h2h3 g4h3 g1f3 h3h2 f3g1',
  repetition: 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8',
  blackCastling: 'e2e4 e7e5 g1f3 g8f6 b1c3 f8c5 d2d3',
};

const engine = spawn(lc0Path, [
  `--weights=${weights}`,
  '--verbose-move-stats=true',
  // Raw network output: lc0 otherwise sharpens or flattens the policy.
  '--policy-softmax-temp=1',
  '--threads=1',
]);

let buffer = '';
let onLine = () => {};
engine.stdout.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();
  for (const line of lines) onLine(line);
});
engine.stderr.on('data', () => {});

function search(moves) {
  return new Promise(resolve => {
    const priors = {};
    onLine = line => {
      // e.g. "info string e2e4  (322 ) N: 0 (+ 0) (P: 33.20%) ..."
      const stat = /^info string (\S+)\s+\(\s*\d+\s*\).*?\(P:\s*([\d.]+)%\)/.exec(line);
      if (stat && stat[1] !== 'node') priors[stat[1]] = Number(stat[2]) / 100;
      if (line.startsWith('bestmove')) resolve(priors);
    };
    engine.stdin.write(`position startpos${moves ? ` moves ${moves}` : ''}\n`);
    engine.stdin.write('go nodes 1\n');
  });
}

const reference = {};
for (const [name, moves] of Object.entries(POSITIONS)) {
  reference[name] = { moves, priors: await search(moves) };
}
engine.stdin.write('quit\n');
writeFileSync(outFile, JSON.stringify(reference, null, 1));
console.log(`Wrote ${Object.keys(reference).length} positions to ${outFile}`);
for (const [name, { priors }] of Object.entries(reference)) {
  const top = Object.entries(priors).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(name.padEnd(18), top.map(([m, p]) => `${m} ${(p * 100).toFixed(1)}%`).join('  '));
}
