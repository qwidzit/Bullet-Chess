import type { OpponentChoice } from '../bots';

export type ColorChoice = 'white' | 'black' | 'random';

export interface Settings extends OpponentChoice {
  baseSec: number;
  incSec: number;
  color: ColorChoice;
  sound: boolean;
}

/** Starting times the slider stops at, in seconds: 30 seconds to 20 minutes. */
export const BASE_OPTIONS = [30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 540, 600, 720, 900, 1200];
/** Increments the slider stops at, in seconds. Zero is kept: most bullet is played without one. */
export const INC_OPTIONS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];

/** Slider ranges. Speed is a percentage of the measured real pace. */
export const RATING_STEP = 50;
export const SPEED_RANGE = { min: 5, max: 200, step: 5 };

const KEY = 'bullet-chess.settings';

const defaults: Settings = {
  baseSec: 60,
  incSec: 0,
  color: 'random',
  opponent: 'rated',
  rating: 1100,
  speedPct: 100,
  playStyle: 'balanced',
  sound: true,
};

export function loadSettings(): Settings {
  const settings: Settings = { ...defaults };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    // Keep only settings that still exist, with a value of the right type.
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (typeof stored[key] === typeof defaults[key]) {
        (settings as unknown as Record<string, unknown>)[key] = stored[key];
      }
    }
  } catch {
    // Unreadable storage: start from the defaults.
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; settings then just last for the session.
  }
}

/** "1+0", "0.5+0", "10+5": minutes, then seconds added per move. */
export function timeControlLabel(baseSec: number, incSec: number): string {
  return `${Number((baseSec / 60).toFixed(2))}+${incSec}`;
}

/** "30 sec", "1.5 min", "20 min". */
export function durationLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} sec` : `${Number((seconds / 60).toFixed(2))} min`;
}
