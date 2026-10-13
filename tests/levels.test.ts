import { describe, expect, it } from 'vitest';
import { dialsFor, LEVELS, MAX_RATING, MIN_RATING } from '../src/bots/levels';

describe('levels', () => {
  it('lists ratings in rising order, a hundred apart', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].rating - LEVELS[i - 1].rating).toBe(100);
    }
    expect(MIN_RATING).toBe(LEVELS[0].rating);
    expect(MAX_RATING).toBe(LEVELS.at(-1)!.rating);
  });

  it('plays tighter, never looser, as the rating rises', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].temperature).toBeLessThanOrEqual(LEVELS[i - 1].temperature);
      expect(LEVELS[i].care).toBeGreaterThanOrEqual(LEVELS[i - 1].care);
      expect(LEVELS[i].network).toBeGreaterThanOrEqual(LEVELS[i - 1].network);
    }
  });

  it('keeps 1100, the level fitted to real players, as plain Maia 1100', () => {
    expect(LEVELS.find(level => level.rating === 1100)).toEqual({
      rating: 1100,
      network: 1100,
      temperature: 1,
      care: 0,
    });
  });
});

describe('dialsFor', () => {
  it('returns a calibrated level unchanged', () => {
    for (const level of LEVELS) {
      const dials = dialsFor(level.rating);
      expect(dials.temperature).toBeCloseTo(level.temperature, 10);
      expect(dials.care).toBeCloseTo(level.care, 10);
      // All moves come from that level's own network.
      const network = dials.highShare === 1 ? dials.highNetwork : dials.lowNetwork;
      expect(network).toBe(level.network);
      expect([0, 1]).toContain(dials.highShare);
    }
  });

  it('blends halfway between two levels', () => {
    const dials = dialsFor(1350);
    expect(dials.lowNetwork).toBe(1500);
    expect(dials.highNetwork).toBe(1700);
    expect(dials.highShare).toBeCloseTo(0.5);
    // Temperature is blended on a log scale: the geometric mean of 0.86 and 0.76.
    expect(dials.temperature).toBeCloseTo(Math.sqrt(0.86 * 0.76), 10);
    expect(dials.care).toBeCloseTo(0.075);
  });

  it('clamps ratings outside the range', () => {
    expect(dialsFor(100)).toEqual(dialsFor(MIN_RATING));
    expect(dialsFor(3000)).toEqual(dialsFor(MAX_RATING));
  });
});
