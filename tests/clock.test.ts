import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock, formatClock, MIN_MOVE_MS } from '../src/core/clock';

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('charges the mover for elapsed time and starts the other clock', () => {
    const clock = new Clock(60_000, 0, () => {});
    clock.start('w', 0);
    expect(clock.press('w', 1500)).toBe(1500);
    expect(clock.timeLeft('w', 1500)).toBe(58_500);
    expect(clock.runningSide).toBe('b');
    expect(clock.timeLeft('b', 2500)).toBe(59_000);
  });

  it('charges at least a tenth of a second, as chess.com does for premoves', () => {
    const clock = new Clock(60_000, 0, () => {});
    clock.start('w', 0);
    expect(clock.press('w', 3)).toBe(MIN_MOVE_MS);
    expect(clock.timeLeft('w', 3)).toBe(60_000 - MIN_MOVE_MS);
  });

  it('adds the increment after each move, half seconds included', () => {
    const clock = new Clock(60_000, 500, () => {});
    clock.start('w', 0);
    clock.press('w', 1000);
    expect(clock.timeLeft('w', 1000)).toBe(59_500);
  });

  it('ignores a press from the side whose clock is not running', () => {
    const clock = new Clock(60_000, 0, () => {});
    clock.start('w', 0);
    expect(clock.press('b', 500)).toBe(0);
    expect(clock.runningSide).toBe('w');
  });

  it('never reports less than zero', () => {
    const clock = new Clock(1000, 0, () => {});
    clock.start('w', 0);
    expect(clock.timeLeft('w', 5000)).toBe(0);
  });

  it('calls the flag handler when the running clock runs out', () => {
    const onFlag = vi.fn();
    const clock = new Clock(2000, 0, onFlag);
    clock.start('w');
    vi.advanceTimersByTime(1900);
    expect(onFlag).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onFlag).toHaveBeenCalledWith('w');
    expect(clock.runningSide).toBeNull();
  });

  it('does not flag a clock that was stopped in time', () => {
    const onFlag = vi.fn();
    const clock = new Clock(2000, 0, onFlag);
    clock.start('w');
    vi.advanceTimersByTime(1000);
    clock.stop();
    vi.advanceTimersByTime(5000);
    expect(onFlag).not.toHaveBeenCalled();
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds with time in hand', () => {
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(1_200_000)).toBe('20:00');
  });

  it('shows tenths under twenty seconds', () => {
    expect(formatClock(19_950)).toBe('0:20.0');
    expect(formatClock(5340)).toBe('0:05.4');
    expect(formatClock(0)).toBe('0:00.0');
  });
});
