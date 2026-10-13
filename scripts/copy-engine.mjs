// Copies the single-threaded lite Stockfish build into public/engine so it is
// served as a plain worker script next to its .wasm file.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');

mkdirSync(dest, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log('Stockfish engine copied to public/engine');
