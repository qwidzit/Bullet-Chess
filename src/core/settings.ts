import type { OpponentChoice } from '../bots';

export type ColorChoice = 'white' | 'black' | 'random';

export interface Settings extends OpponentChoice {
  baseSec: number;
  incSec: number;
  color: ColorChoice;
  showLatency: boolean;
  sound: boolean;
}

export const BASE_OPTIONS = [30, 60, 90, 120];
export const INC_OPTIONS = [0, 1];

/** Slider ranges. Speed is a percentage of the measured real pace. */
export const RATING_STEP = 50;
export const SPEED_RANGE = { min: 50, max: 200, step: 10 };

const KEY = 'bullet-chess.settings';

const defaults: Settings = {
  baseSec: 60,
  incSec: 0,
  color: 'random',
  opponent: 'rated',
  rating: 1100,
  speedPct: 100,
  playStyle: 'balanced',
  showLatency: false,
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

export function timeControlLabel(baseSec: number, incSec: number): string {
  const minutes = baseSec / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}+${incSec}`;
}
