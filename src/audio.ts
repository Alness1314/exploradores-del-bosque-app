// Ambiente opcional. Si existe una grabación libre en public/audio/forest-ambience.ogg se usa en bucle; si no, se genera
// un viento suave con Web Audio. Nada depende del sonido para avanzar.
const AMBIENT_URL = `${import.meta.env.BASE_URL}audio/forest-ambience.ogg`;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;

function windBuffer(c: AudioContext): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

async function recordedAmbience(c: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(AMBIENT_URL);
    if (!res.ok || /text\/html/i.test(res.headers.get('content-type') ?? '')) return null;
    return await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function startAmbient(volume: number) {
  if (ctx) return;
  const c = new AudioContext();
  ctx = c;
  gain = c.createGain();
  gain.gain.value = volume;
  gain.connect(c.destination);

  const recorded = await recordedAmbience(c);
  if (ctx !== c) return; // se apagó mientras cargaba

  const src = c.createBufferSource();
  src.loop = true;
  if (recorded) {
    src.buffer = recorded;
    src.connect(gain);
  } else {
    src.buffer = windBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    src.connect(filter).connect(gain);
  }
  src.start();
  source = src;
}

export function setAmbientVolume(volume: number) {
  if (gain) gain.gain.value = volume;
}

export function stopAmbient() {
  source?.stop();
  void ctx?.close();
  ctx = null;
  gain = null;
  source = null;
}

/** Campanilla breve al registrar un hallazgo; solo suena si el ambiente está activado. */
export function chime() {
  if (!ctx || !gain) return;
  const c = ctx;
  const now = c.currentTime;
  [660, 880, 1320].forEach((f, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, now + i * 0.09);
    g.gain.linearRampToValueAtTime(0.12, now + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.6);
    osc.connect(g).connect(c.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.65);
  });
}
