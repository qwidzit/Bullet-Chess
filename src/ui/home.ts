import {
  ANY_OPENING,
  MAX_RATING,
  MIN_RATING,
  PLAY_STYLES,
  TIME_STYLES,
  type OpponentChoice,
  type PlayStyle,
  type TimeStyle,
} from '../bots';
import { OPENINGS } from '../core/openingBook';
import {
  BASE_OPTIONS,
  durationLabel,
  INC_OPTIONS,
  RATING_STEP,
  saveSettings,
  SPEED_RANGE,
  timeControlLabel,
  type ColorChoice,
  type Settings,
} from '../core/settings';
import { chips, h, slider } from './dom';

/** A slider over an uneven list of values, such as starting times. */
function stops(
  label: string,
  values: number[],
  current: number,
  format: (value: number) => string,
  onChange: (value: number) => void,
): HTMLElement {
  // Start on the stop nearest the saved value, in case the list has changed since.
  const nearest = values.reduce((best, v, i) => (Math.abs(v - current) < Math.abs(values[best] - current) ? i : best), 0);
  return slider({
    label,
    min: 0,
    max: values.length - 1,
    step: 1,
    value: nearest,
    format: index => format(values[index]),
    onChange: index => onChange(values[index]),
  });
}

const OPPONENTS:{ value: OpponentChoice['opponent']; label: string; description: string }[] = [
  { value: 'rated', label: 'Human-like', description: '' },
  { value: 'instant', label: 'Instant', description: 'Speed test: replies in 0 ms' },
  { value: 'scramble', label: 'Scrambler', description: 'Speed test: replies in 0.1–0.3 s, like a time scramble' },
];

export function renderHome(
  root: HTMLElement,
  settings: Settings,
  onPlay: () => void,
  onHistory: () => void,
  onImport: () => void,
): void {
  const playButton = h('button', { class: 'primary play', onTap: onPlay });
  const description = h('div', { class: 'bot-desc' });
  // Rating, speed and style only apply to the human-like opponent.
  const tuning = h('div', { class: 'tuning' });

  const styleNote = h('div', { class: 'bot-desc' });
  const clockNote = h('div', { class: 'bot-desc' });

  // The bot follows the chosen opening for as long as both sides stay in it.
  const openingSelect = h('select', { class: 'select', attrs: { 'aria-label': 'Opening' } });
  for (const { id, name } of [{ id: ANY_OPENING, name: 'Any opening' }, ...OPENINGS]) {
    const option = h('option', { text: name, attrs: { value: id } });
    option.selected = id === settings.opening;
    openingSelect.append(option);
  }
  openingSelect.addEventListener('change', () => {
    settings.opening = openingSelect.value;
    update();
  });

  const update = () => {
    saveSettings(settings);
    playButton.textContent = `Play ${timeControlLabel(settings.baseSec, settings.incSec)}`;
    const rated = settings.opponent === 'rated';
    tuning.hidden = !rated;
    description.textContent = rated ? '' : (OPPONENTS.find(o => o.value === settings.opponent)?.description ?? '');
    styleNote.textContent = PLAY_STYLES.find(style => style.id === settings.playStyle)?.description ?? '';
    clockNote.textContent = TIME_STYLES.find(style => style.id === settings.timeStyle)?.description ?? '';
  };

  const sound = h('input', { attrs: { type: 'checkbox' } });
  sound.checked = settings.sound;
  sound.addEventListener('change', () => {
    settings.sound = sound.checked;
    update();
  });

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
    h('div', { class: 'tuning-label', text: 'Playing style' }),
    chips<PlayStyle>(
      PLAY_STYLES.map(style => ({ value: style.id, label: style.name })),
      settings.playStyle,
      value => {
        settings.playStyle = value;
        update();
      },
    ),
    styleNote,
    h('div', { class: 'tuning-label', text: 'Clock style' }),
    chips<TimeStyle>(
      TIME_STYLES.map(style => ({ value: style.id, label: style.name })),
      settings.timeStyle,
      value => {
        settings.timeStyle = value;
        update();
      },
    ),
    clockNote,
    h('div', { class: 'tuning-label', text: 'Opening' }),
    openingSelect,
  );

  const options = h(
    'div',
    { class: 'home-scroll' },
    h(
      'div',
      { class: 'home-head' },
      h('h1', { text: 'Bullet Chess' }),
      h(
        'div',
        { class: 'home-links' },
        h('button', { class: 'secondary small', text: 'Analyse', onTap: onImport }),
        h('button', { class: 'secondary small', text: 'Archive', onTap: onHistory }),
      ),
    ),
    h('h2', { text: 'Time control' }),
    h(
      'div',
      { class: 'tuning' },
      stops('Starting time', BASE_OPTIONS, settings.baseSec, durationLabel, value => {
        settings.baseSec = value;
        update();
      }),
      stops('Added per move', INC_OPTIONS, settings.incSec, value => `+${value} sec`, value => {
        settings.incSec = value;
        update();
      }),
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
    h('div', { class: 'toggles' }, h('label', { class: 'toggle' }, sound, 'Sound')),
  );
  root.replaceChildren(h('div', { class: 'home' }, options, playButton));
  update();
}
