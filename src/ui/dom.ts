type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  onTap?: (e: Event) => void;
  attrs?: Record<string, string>;
}

/** Creates an element with optional class, text, click handler and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.onTap) el.addEventListener('click', props.onTap);
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const child of children) if (child) el.append(child);
  return el;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "13 Oct" or "13 Oct, 21:03". Written out by hand so the app reads the same
 * in English whatever language the device is set to.
 */
export function formatDate(ms: number, withTime = false): string {
  const date = new Date(ms);
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (!withTime) return day;
  return `${day}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A labelled slider that shows its current value beside the label. */
export function slider(options: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}): HTMLElement {
  const value = h('span', { class: 'slider-value', text: options.format(options.value) });
  const input = h('input', {
    attrs: {
      type: 'range',
      min: String(options.min),
      max: String(options.max),
      step: String(options.step),
      'aria-label': options.label,
    },
  });
  input.value = String(options.value);
  input.addEventListener('input', () => {
    value.textContent = options.format(Number(input.value));
    options.onChange(Number(input.value));
  });
  return h(
    'div',
    { class: 'slider' },
    h('div', { class: 'slider-head' }, h('span', { text: options.label }), value),
    input,
  );
}

/** A row of mutually exclusive choices. */
export function chips<T>(
  options: { value: T; label: string }[],
  selected: T,
  onSelect: (value: T) => void,
): HTMLElement {
  const row = h('div', { class: 'chips' });
  const buttons = options.map(option => {
    const button = h('button', {
      class: 'chip',
      text: option.label,
      onTap: () => {
        for (const b of buttons) b.classList.remove('selected');
        button.classList.add('selected');
        onSelect(option.value);
      },
    });
    if (option.value === selected) button.classList.add('selected');
    return button;
  });
  row.append(...buttons);
  return row;
}
