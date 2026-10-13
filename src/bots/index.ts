import { createRatedBot, type PlayStyle } from './maiaBot';
import { instantBot, scrambleBot } from './testBots';
import type { TimeStyle } from './timeStyles';
import type { Bot } from './types';

/** What the player picked to play against. */
export interface OpponentChoice {
  /** A human-like bot, or one of the two input speed tests. */
  opponent: 'rated' | 'instant' | 'scramble';
  /** Chess.com bullet rating the human-like bot should play at. */
  rating: number;
  /** Its speed, as a percentage of the real pace measured for such players. */
  speedPct: number;
  playStyle: PlayStyle;
  timeStyle: TimeStyle;
  /** Id of the opening it steers into, or 'any'. */
  opening: string;
}

export function opponentFor(choice: OpponentChoice): Bot {
  if (choice.opponent === 'instant') return instantBot;
  if (choice.opponent === 'scramble') return scrambleBot;
  return createRatedBot(choice);
}

export { MAX_RATING, MIN_RATING } from './levels';
export { ANY_OPENING, PLAY_STYLES, type PlayStyle } from './maiaBot';
export { TIME_STYLES, type TimeStyle } from './timeStyles';
export type { Bot, BotReply, BotRequest } from './types';
