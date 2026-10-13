import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_PROFILE, thinkTime, type MoveContext, type Random, type TimeProfile } from '../src/bots/timeModel';
import { TIME_STYLES, timeProfileFor } from '../src/bots/timeStyles';
import { OPENINGS, repertoireMoves } from '../src/core/openingBook';

function seeded(seed = 1): Random {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const quiet: MoveContext = {
  ply: 40,
  ownMs: 40_000,
  opponentMs: 40_000,
  baseMs: 60_000,
  incMs: 0,
  forced: false,
  inCheck: false,
  isCapture: false,
  isRecapture: false,
  captureOptions: 1,
  endgame: false,
  evalCp: 20,
  gapCp: 30,
  closeChoices: 1,
  swingCp: 0,
  humanProbability: 0.3,
};

/** Average think time, premoves included as zero, in one situation. */
function average(profile: TimeProfile, context: Partial<MoveContext> = {}): number {
  const random = seeded(9);
  let total = 0;
  for (let i = 0; i < 3000; i++) total += thinkTime({ ...quiet, ...context }, profile, 1, random);
  return total / 3000;
}

describe('clock styles', () => {
  it('leaves Natural exactly as measured', () => {
    expect(timeProfileFor('natural', 100)).toEqual({ ...DEFAULT_TIME_PROFILE, tempo: 1 });
  });

  it('has a profile for every style on offer', () => {
    for (const { id } of TIME_STYLES) expect(timeProfileFor(id, 100).baseMs).toBeGreaterThan(0);
  });

  it('turns the speed setting into tempo for any style', () => {
    expect(timeProfileFor('thinker', 200).tempo).toBe(0.5);
    expect(timeProfileFor('speedster', 50).tempo).toBe(2);
  });

  it('makes the Speedster quicker and the Thinker slower than Natural, with time in hand', () => {
    const natural = average(timeProfileFor('natural', 100));
    expect(average(timeProfileFor('speedster', 100))).toBeLessThan(natural * 0.75);
    expect(average(timeProfileFor('thinker', 100))).toBeGreaterThan(natural * 1.15);
  });

  it('makes the Scrambler ordinary with time in hand but much quicker when low', () => {
    const natural = timeProfileFor('natural', 100);
    const scrambler = timeProfileFor('scrambler', 100);
    expect(average(scrambler) / average(natural)).toBeCloseTo(1, 1);
    expect(average(scrambler, { ownMs: 4000 })).toBeLessThan(average(natural, { ownMs: 4000 }) * 0.6);
  });

  it('leaves the Thinker just as slow when low on time, which is why it flags', () => {
    const natural = average(timeProfileFor('natural', 100), { ownMs: 6000 });
    expect(average(timeProfileFor('thinker', 100), { ownMs: 6000 })).toBeGreaterThan(natural);
  });
});

describe('repertoireMoves', () => {
  it('offers the first move of the opening', () => {
    expect(repertoireMoves('sicilian', [])).toEqual(['e4']);
    expect(repertoireMoves('london', [])).toEqual(['d4']);
  });

  it('offers every continuation its lines contain', () => {
    expect(repertoireMoves('sicilian', ['e4']).sort()).toEqual(['c5']);
    expect(repertoireMoves('sicilian', ['e4', 'c5']).sort()).toEqual(['Bc4', 'Nc3', 'Nf3', 'c3', 'd4', 'f4']);
    expect(repertoireMoves('italian', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']).sort()).toEqual([
      'Bc5',
      'Be7',
      'Nd4',
      'Nf6',
      'd6',
    ]);
  });

  it('has nothing once the game leaves the opening', () => {
    expect(repertoireMoves('sicilian', ['d4'])).toEqual([]);
    expect(repertoireMoves('sicilian', ['e4', 'e5'])).toEqual([]);
  });

  it('has nothing past the end of a line', () => {
    expect(repertoireMoves('sicilian', ['e4', 'c5', 'Bc4', 'e6'])).toEqual([]);
  });

  it('has nothing for an unknown opening or for "any"', () => {
    expect(repertoireMoves('any', [])).toEqual([]);
    expect(repertoireMoves('no-such-opening', ['e4'])).toEqual([]);
  });

  it('gives every opening a distinct id, a name and at least one line', () => {
    expect(new Set(OPENINGS.map(o => o.id)).size).toBe(OPENINGS.length);
    for (const opening of OPENINGS) {
      expect(opening.name).not.toBe('');
      expect(opening.lines.length).toBeGreaterThan(0);
    }
  });
});
