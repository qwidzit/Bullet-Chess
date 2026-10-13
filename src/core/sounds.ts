// Sounds are synthesised once into buffers at startup: no asset files, and
// playback is a single buffer start with no decoding on the hot path.

export type SoundName = 'move' | 'capture' | 'check' | 'premove' | 'start' | 'end' | 'lowTime';

let ctx: AudioContext | undefined;
let enabled = true;
const buffers = new Map<SoundName, AudioBuffer>();

function render(seconds: number, sample: (t: number) => number): AudioBuffer {
  const rate = ctx!.sampleRate;
  const buffer = ctx!.createBuffer(1, Math.ceil(seconds * rate), rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = sample(i / rate);
  return buffer;
}

/** A short wooden knock: filtered noise click plus a low thump. */
function knock(pitch: number, brightness: number): (t: number) => number {
  let lp = 0;
  return t => {
    lp += brightness * (Math.random() * 2 - 1 - lp);
    const click = lp * Math.exp(-t * 90);
    const thump = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 45);
    return 0.9 * click + 0.6 * thump;
  };
}

const tone = (freq: number, decay: number) => (t: number) =>
  Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay) * Math.min(1, t * 400);

function build(): void {
  const move = knock(190, 0.35);
  const capture = knock(240, 0.7);
  buffers.set('move', render(0.09, t => 0.7 * move(t)));
  const premove = knock(320, 0.5);
  buffers.set('premove', render(0.06, t => 0.3 * premove(t)));
  buffers.set(
    'capture',
    render(0.14, t => 0.8 * capture(t) + (t > 0.035 ? 0.5 * capture(t - 0.035) : 0)),
  );
  buffers.set('check', render(0.16, t => 0.35 * tone(660, 22)(t) + 0.5 * move(t)));
  buffers.set('start', render(0.25, t => 0.3 * tone(520, 14)(t)));
  buffers.set(
    'end',
    render(0.5, t => 0.3 * tone(520, 9)(t) + (t > 0.16 ? 0.3 * tone(390, 9)(t - 0.16) : 0)),
  );
  buffers.set('lowTime', render(0.12, t => 0.3 * tone(980, 30)(t)));
}

/** Must be called from a user gesture: browsers keep audio suspended until then. */
export function unlock(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      build();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = undefined;
  }
}

export function setEnabled(on: boolean): void {
  enabled = on;
}

export function play(name: SoundName): void {
  const buffer = buffers.get(name);
  if (!enabled || !ctx || !buffer || ctx.state !== 'running') return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}
