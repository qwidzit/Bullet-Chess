import { UciEngine } from './uciEngine';

/** The one Stockfish worker, shared by everything that needs an evaluation. */
export const engine = new UciEngine(
  `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
);
