import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { BOOK_LINES, inBook } from '../src/core/openingBook';
import { accuracyOf, classifyGame, lossOf, winChance, type GameReview } from '../src/core/review';

/**
 * A review with chosen scores (White's point of view, one per position) and,
 * optionally, the engine's best move and second-choice score per move.
 */
function review(cp: number[], best: string[] = [], second: (number | null)[] = []): GameReview {
  const moves = cp.length - 1;
  return {
    cp,
    best: Array.from({ length: moves }, (_, i) => best[i] ?? ''),
    second: Array.from({ length: moves }, (_, i) => second[i] ?? null),
  };
}

describe('winChance', () => {
  it('is even at a level score and symmetric around it', () => {
    expect(winChance(0)).toBe(50);
    expect(winChance(300) + winChance(-300)).toBeCloseTo(100);
  });

  it('rises with the score and flattens out when the game is decided', () => {
    expect(winChance(100)).toBeGreaterThan(winChance(0));
    expect(winChance(1000)).toBeGreaterThan(95);
    expect(winChance(100_000)).toBe(winChance(1500));
  });
});

describe('lossOf', () => {
  it('measures what the mover gave away, for either colour', () => {
    const r = review([0, -300, 0]);
    // White dropped from level to clearly worse; Black then gave it all back.
    expect(lossOf(r, 0)).toBeCloseTo(50 - winChance(-300));
    expect(lossOf(r, 1)).toBeCloseTo(winChance(300) - 50);
  });

  it('is zero for a move that improved the mover\'s position', () => {
    expect(lossOf(review([0, 200]), 0)).toBe(0);
  });
});

describe('opening book', () => {
  it('contains only legal lines, written the standard way', () => {
    for (const line of BOOK_LINES) {
      const chess = new Chess();
      for (const san of line.split(' ')) {
        expect(chess.move(san).san, `in "${line}"`).toBe(san);
      }
    }
  });

  it('recognises a game that follows a known line and one that leaves it', () => {
    expect(inBook(['e4'])).toBe(true);
    expect(inBook(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])).toBe(true);
    expect(inBook(['e4', 'e5', 'Ke2'])).toBe(false);
    expect(inBook(['a4'])).toBe(false);
  });
});

describe('classifyGame', () => {
  // Off-book from the first move, so the scores alone decide.
  const quiet = ['a2a3', 'a7a6', 'b2b3', 'b7b6', 'c2c3', 'c7c6'];

  it('calls opening theory Book until the game leaves it', () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'h2h4'];
    expect(classifyGame(moves, review([0, 0, 0, 0, 0, 0]))).toEqual(['book', 'book', 'book', 'book', 'best']);
  });

  it('ranks by winning chances lost, at chess.com\'s thresholds', () => {
    // White's three moves lose about 3, 7 and 13 points; Black's lose nothing.
    const cp = [0, -35, -35, -110, -110, -260, -260];
    const classes = classifyGame(quiet, review(cp));
    expect([classes[0], classes[2], classes[4]]).toEqual(['good', 'inaccuracy', 'mistake']);
    expect([classes[1], classes[3], classes[5]]).toEqual(['best', 'best', 'best']);
  });

  it('calls a move that throws the game away a Blunder', () => {
    expect(classifyGame(quiet.slice(0, 1), review([0, -400]))[0]).toBe('blunder');
  });

  it('tells Best from Excellent by whether it was the engine\'s choice', () => {
    // About one and a half points lost: inside the Excellent band.
    const cp = [0, -15];
    expect(classifyGame(quiet.slice(0, 1), review(cp, ['a2a3']))[0]).toBe('best');
    expect(classifyGame(quiet.slice(0, 1), review(cp, ['e2e4']))[0]).toBe('excellent');
    // A move that loses nothing at all is Best even if the engine preferred another.
    expect(classifyGame(quiet.slice(0, 1), review([0, 0], ['e2e4']))[0]).toBe('best');
  });

  it('calls a failure to punish a blunder a Miss, when the position stays fine', () => {
    // White blunders to -400; Black hands it straight back and is merely level.
    const classes = classifyGame(quiet.slice(0, 2), review([0, -400, 0]));
    expect(classes).toEqual(['blunder', 'miss']);
  });

  it('keeps it a Blunder when the chance missed leaves the player worse', () => {
    // Black had a won game and ends up clearly lost.
    const classes = classifyGame(quiet.slice(0, 2), review([0, -400, 300]));
    expect(classes[1]).toBe('blunder');
  });

  it('calls the only good move Great', () => {
    // The engine's choice holds the balance; its second choice loses.
    const r = review([0, 0], ['a2a3'], [-500]);
    expect(classifyGame(quiet.slice(0, 1), r)[0]).toBe('great');
    // With a reasonable alternative it is just Best.
    expect(classifyGame(quiet.slice(0, 1), review([0, 0], ['a2a3'], [-20]))[0]).toBe('best');
  });

  it('calls a sound piece sacrifice Brilliant', () => {
    // 6.Nxf7: the knight takes a pawn and can be taken by the king.
    const moves = 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 f6d5 g5f7'.split(' ');
    const sound = review(Array(moves.length + 1).fill(120), [...Array(10).fill(''), 'g5f7']);
    expect(classifyGame(moves, sound).at(-1)).toBe('brilliant');
    // The same sacrifice played from an already won position is not.
    const winning = review(Array(moves.length + 1).fill(900), [...Array(10).fill(''), 'g5f7']);
    expect(classifyGame(moves, winning).at(-1)).toBe('best');
  });

  it('does not call an even trade a sacrifice', () => {
    // 4.Bxc6 in the Exchange Spanish: bishop for knight, and it is recaptured.
    const moves = 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6 h2h3'.split(' ');
    const classes = classifyGame(moves, review(Array(moves.length + 1).fill(30)));
    expect(classes).not.toContain('brilliant');
  });
});

describe('accuracyOf', () => {
  it('scores a game with nothing given away at close to 100 for both', () => {
    const { white, black } = accuracyOf(review(Array(41).fill(20)));
    expect(white).toBeGreaterThan(99);
    expect(black).toBeGreaterThan(99);
  });

  it('scores the player who blundered lower', () => {
    // White gives away about a pawn and a half three times; Black never errs.
    const cp = [0];
    for (let i = 0; i < 40; i++) cp.push(cp[i] - (i % 2 === 0 && i % 12 === 0 ? 150 : 0));
    const { white, black } = accuracyOf(review(cp));
    expect(white).toBeLessThan(black);
    expect(white).toBeLessThan(95);
    expect(black).toBeGreaterThan(99);
  });

  it('stays between 0 and 100 for a wild game', () => {
    const cp = Array.from({ length: 61 }, (_, i) => (i % 2 ? 900 : -900));
    const { white, black } = accuracyOf(review(cp));
    for (const value of [white, black]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
