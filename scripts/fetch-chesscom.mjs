// Development tool: downloads a player's public bullet games from chess.com
// and reduces them to what calibration needs. Player names are dropped; only
// ratings, moves and clock readings are kept.
//   node scripts/fetch-chesscom.mjs <username> <out.json>
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const [username, outFile] = process.argv.slice(2);
const headers = { 'User-Agent': 'BulletChessTrainer/0.1 (personal practice app)' };
const api = path => fetch(`https://api.chess.com/pub/player/${username}/${path}`, { headers }).then(r => r.json());

const CLOCK = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g;

const { archives } = await api('games/archives');
const games = [];
for (const url of archives) {
  const month = url.split('/games/')[1];
  const { games: monthly } = await api(`games/${month}`);
  for (const game of monthly ?? []) {
    if (game.time_class !== 'bullet' || game.rules !== 'chess' || !game.pgn) continue;
    const [base, inc = '0'] = game.time_control.split('+');
    const chess = new Chess();
    try {
      chess.loadPgn(game.pgn);
    } catch {
      continue;
    }
    const moves = chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
    // One clock reading per move, in order: time left after that move.
    const clocks = [...game.pgn.matchAll(CLOCK)].map(
      ([, h, m, s]) => Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000),
    );
    if (moves.length < 10 || clocks.length !== moves.length) continue;
    games.push({
      month,
      baseMs: Number(base) * 1000,
      incMs: Number(inc) * 1000,
      ratings: { w: game.white.rating, b: game.black.rating },
      results: { w: game.white.result, b: game.black.result },
      player: game.white.username.toLowerCase() === username.toLowerCase() ? 'w' : 'b',
      moves,
      clocks,
    });
  }
}

writeFileSync(outFile, JSON.stringify(games));
const count = (key, value) => games.filter(g => g[key] === value).length;
console.log(`${games.length} bullet games saved to ${outFile}`);
console.log('time controls:', [...new Set(games.map(g => `${g.baseMs / 1000}+${g.incMs / 1000}`))]
  .map(tc => `${tc} x${games.filter(g => `${g.baseMs / 1000}+${g.incMs / 1000}` === tc).length}`).join(', '));
const ratings = games.flatMap(g => [g.ratings.w, g.ratings.b]).sort((a, b) => a - b);
console.log(`ratings: min ${ratings[0]}, median ${ratings[ratings.length >> 1]}, max ${ratings.at(-1)}`);
console.log('months:', [...new Set(games.map(g => g.month))].join(' '), '| as white:', count('player', 'w'));
const ends = {};
for (const g of games) for (const r of [g.results.w, g.results.b]) ends[r] = (ends[r] ?? 0) + 1;
console.log('results:', JSON.stringify(ends));
