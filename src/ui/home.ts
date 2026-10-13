import { MAX_RATING, MIN_RATING, PLAY_STYLES, type OpponentChoice, type PlayStyle } from '../bots';
import {
  BASE_OPTIONS,
  INC_OPTIONS,
  RATING_STEP,
  saveSettings,
  SPEED_RANGE,
  timeControlLabel,
  type ColorChoice,
  type Settings,
} from '../core/settings';
import { chips, h, slider } from './dom';

const OPPONENTS: { value: OpponentChoice['opponent']; label: string; description: string }[] = [
  { value: 'rated', label: 'Human-like', description: '' },
  { value: 'instant', label: 'Instant', description: 'Speed test: replies in 0 ms' },
  { value: 'scramble', label: 'Scrambler', description: 'Speed test: replies in 0.1–0.3 s, like a time scramble' },
];

export function renderHome(
  root: HTMLElement,
  settings: Settings,
  onPlay: () => void,
  onHistory: () => void,
): void {
  const playButton = h('button', { class: 'primary play', onTap: onPlay });
  const description = h('div', { class: 'bot-desc' });
  // Rating, speed and style only apply to the human-like opponent.
  const tuning = h('div', { class: 'tuning' });

  const update = () => {
    saveSettings(settings);
    playButton.textContent = `Play ${timeControlLabel(settings.baseSec, settings.incSec)}`;
    const rated = settings.opponent === 'rated';
    tuning.hidden = !rated;
    description.textContent = rated
      ? (PLAY_STYLES.find(style => style.id === settings.playStyle)?.description ?? '')
      : (OPPONENTS.find(o => o.value === settings.opponent)?.description ?? '');
  };

  const toggle = (label: string, key: 'showLatency' | 'sound') => {
    const input = h('input', { attrs: { type: 'checkbox' } });
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      update();
    });
    return h('label', { class: 'toggle' }, input, label);
  };

  tuning.append(
    slider({
      label: 'Rating (chess.com bullet)',
      min: MIN_RATING,
      max: MAX_RATING,
      step: RATING_STEP,
      value: settings.rating,
      format: String,
      onChange: value => {
        settings.rating = value;
        update();
      },
    }),
    slider({
      label: 'Speed',
      ...SPEED_RANGE,
      value: settings.speedPct,
      // 100% is the pace real players near 1100 were measured at.
      format: value => (value === 100 ? '100% (real pace)' : `${value}%`),
      onChange: value => {
        settings.speedPct = value;
        update();
      },
    }),
    chips<PlayStyle>(
      PLAY_STYLES.map(style => ({ value: style.id, label: style.name })),
      settings.playStyle,
      value => {
        settings.playStyle = value;
        update();
      },
    ),
  );

  const options = h(
    'div',
    { class: 'home-scroll' },
    h(
      'div',
      { class: 'home-head' },
      h('h1', { text: 'Bullet Chess' }),
      h('button', { class: 'secondary small', text: 'History', onTap: onHistory }),
    ),
    h('h2', { text: 'Minutes' }),
    chips(
      BASE_OPTIONS.map(value => ({ value, label: String(value / 60) })),
      settings.baseSec,
      value => {
        settings.baseSec = value;
        update();
      },
    ),
    h('h2', { text: 'Increment (seconds)' }),
    chips(
      INC_OPTIONS.map(value => ({ value, label: `+${value}` })),
      settings.incSec,
      value => {
        settings.incSec = value;
        update();
      },
    ),
    h('h2', { text: 'Play as' }),
    chips<ColorChoice>(
      [
        { value: 'white', label: 'White' },
        { value: 'random', label: 'Random' },
        { value: 'black', label: 'Black' },
      ],
      settings.color,
      value => {
        settings.color = value;
        update();
      },
    ),
    h('h2', { text: 'Opponent' }),
    chips(
      OPPONENTS.map(({ value, label }) => ({ value, label })),
      settings.opponent,
      value => {
        settings.opponent = value;
        update();
      },
    ),
    tuning,
    description,
    h('div', { class: 'toggles' }, toggle('Latency readout', 'showLatency'), toggle('Sound', 'sound')),
  );
  root.replaceChildren(h('div', { class: 'home' }, options, playButton));
  update();
}
