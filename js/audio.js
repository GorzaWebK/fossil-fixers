// Every sound is made here with the Web Audio API: no audio files at all.
// Effects are short noise bursts and tones; the music is a slow, calm,
// generated loop of plucked notes over a soft pad, in a different key and
// mode for each region.

let ctx = null;
let sfxGain = null;
let musicGain = null;
let noiseBuf = null;
let vol = { sfx: 0.8, music: 0.5 };

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -12;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.gain.value = vol.sfx;
  musicGain.gain.value = vol.music * 0.45;
  sfxGain.connect(master);
  musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a click/tap: browsers only allow sound after the player does something. */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  if (musicMood && !musicTimer) startMusicClock();
}

function startMusicClock() {
  nextBeat = Math.max(nextBeat, ctx.currentTime + 0.1);
  musicTimer = setInterval(schedule, 200);
}

export function setVolumes(sfx, music) {
  vol = { sfx, music };
  if (!ctx) return;
  sfxGain.gain.setTargetAtTime(sfx, ctx.currentTime, 0.05);
  musicGain.gain.setTargetAtTime(music * 0.45, ctx.currentTime, 0.2);
}

// Sounds only start after the first click or key press (browsers block audio before that).
const ready = () => ctx !== null;

function noise({ dur = 0.2, freq = 1200, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, at = 0, sweep = 0 }) {
  if (!ready() || vol.sfx <= 0) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone({ freq = 440, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005, at = 0, slide = 0, out = null }) {
  if (!ready()) return;
  if (!out && vol.sfx <= 0) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone({ freq: 900, dur: 0.05, type: 'triangle', gain: 0.12 }); noise({ dur: 0.04, freq: 3000, gain: 0.08 }); },
  brush() { noise({ dur: 0.22, freq: 2600, q: 0.6, type: 'highpass', gain: 0.18, attack: 0.04, sweep: 0.6 }); },
  chisel() { tone({ freq: 2100 + Math.random() * 300, dur: 0.12, type: 'square', gain: 0.07 }); noise({ dur: 0.12, freq: 1800, q: 2, gain: 0.35 }); },
  pickaxe() { tone({ freq: 140, dur: 0.18, type: 'sine', gain: 0.5, slide: 0.5 }); noise({ dur: 0.35, freq: 600, q: 0.8, gain: 0.55, sweep: 0.4 }); },
  crumble() { for (let i = 0; i < 4; i++) noise({ dur: 0.08, freq: 400 + Math.random() * 900, q: 3, gain: 0.18, at: 0.05 + i * 0.05 + Math.random() * 0.03 }); },
  tapHollow() { tone({ freq: 220, dur: 0.5, type: 'sine', gain: 0.35, slide: 0.9 }); tone({ freq: 330, dur: 0.35, type: 'sine', gain: 0.15, at: 0.02 }); noise({ dur: 0.04, freq: 2000, gain: 0.1 }); },
  tapEcho() { tone({ freq: 300, dur: 0.25, type: 'sine', gain: 0.2, slide: 0.92 }); noise({ dur: 0.04, freq: 2000, gain: 0.12 }); },
  tapSolid() { tone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.15 }); noise({ dur: 0.05, freq: 2500, q: 3, gain: 0.25 }); },
  scan() { for (let i = 0; i < 3; i++) tone({ freq: 660 + i * 220, dur: 0.12, type: 'sine', gain: 0.12, at: i * 0.09 }); },
  probe() { noise({ dur: 0.4, freq: 900, q: 4, gain: 0.2, sweep: 0.3 }); tone({ freq: 500, dur: 0.1, type: 'triangle', gain: 0.1, at: 0.35 }); },
  clink() { // a bone pops free: bright, glassy, happy
    tone({ freq: 1568, dur: 0.6, type: 'sine', gain: 0.22 });
    tone({ freq: 2349, dur: 0.45, type: 'sine', gain: 0.12, at: 0.06 });
    tone({ freq: 3136, dur: 0.3, type: 'sine', gain: 0.07, at: 0.12 });
    noise({ dur: 0.03, freq: 6000, gain: 0.1 });
  },
  crack() { for (let i = 0; i < 5; i++) noise({ dur: 0.03, freq: 3000 + Math.random() * 2000, q: 6, gain: 0.3, at: i * 0.025 }); tone({ freq: 180, dur: 0.15, type: 'sawtooth', gain: 0.08, slide: 0.6 }); },
  deny() { tone({ freq: 180, dur: 0.12, type: 'triangle', gain: 0.15 }); tone({ freq: 150, dur: 0.14, type: 'triangle', gain: 0.15, at: 0.1 }); },
  pickup() { tone({ freq: 520, dur: 0.07, type: 'triangle', gain: 0.1, slide: 1.4 }); },
  drop() { tone({ freq: 300, dur: 0.08, type: 'triangle', gain: 0.1, slide: 0.7 }); },
  rotate() { noise({ dur: 0.07, freq: 2400, q: 1, gain: 0.12 }); },
  snap() { tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.18 }); tone({ freq: 1320, dur: 0.2, type: 'sine', gain: 0.12, at: 0.05 }); noise({ dur: 0.03, freq: 1500, q: 2, gain: 0.25 }); },
  page() { noise({ dur: 0.25, freq: 3500, q: 0.5, type: 'highpass', gain: 0.12, attack: 0.08, sweep: 0.5 }); },
  shutter() { noise({ dur: 0.05, freq: 4000, q: 1, gain: 0.35 }); noise({ dur: 0.06, freq: 2500, q: 1, gain: 0.3, at: 0.08 }); tone({ freq: 2000, dur: 0.6, type: 'sine', gain: 0.04, slide: 2, at: 0.1 }); },
  stamp() { tone({ freq: 90, dur: 0.2, type: 'sine', gain: 0.5, slide: 0.6, at: 0.3 }); noise({ dur: 0.1, freq: 500, gain: 0.35, at: 0.3 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.12, at: i * 0.12 })); },
};

// ------------------------------------------------------------------- music

const KEYS = {
  menu:    { root: 57, scale: [0, 2, 4, 7, 9] },        // A major pentatonic
  desert:  { root: 52, scale: [0, 3, 5, 7, 10] },       // E minor pentatonic
  sea:     { root: 55, scale: [0, 2, 4, 7, 9] },        // G major pentatonic
  jungle:  { root: 50, scale: [0, 2, 3, 7, 9] },        // D dorian-ish
  tundra:  { root: 53, scale: [0, 2, 4, 7, 11] },       // F, airy
  volcano: { root: 48, scale: [0, 3, 5, 7, 8] },        // C, a little darker (still calm)
  museum:  { root: 60, scale: [0, 4, 5, 7, 11] },       // C major-ish
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

let musicTimer = null;
let musicMood = null;
let nextBeat = 0;
let beat = 0;

function pluck(freq, t, gain) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o.type = 'sine';
  o2.type = 'triangle';
  o.frequency.value = freq;
  o2.frequency.value = freq * 2.003;
  const g = ctx.createGain();
  const g2 = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(gain * 0.25, t + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(musicGain);
  o2.connect(g2).connect(musicGain);
  o.start(t); o2.start(t);
  o.stop(t + 1.7); o2.stop(t + 0.5);
}

function pad(freqs, t, dur) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(musicGain);
  for (const fr of freqs) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
}

function schedule() {
  if (!ctx || !musicMood) return;
  const key = KEYS[musicMood] || KEYS.menu;
  const spb = 60 / 66; // slow: 66 beats a minute
  while (nextBeat < ctx.currentTime + 0.6) {
    const t = nextBeat;
    const bar = Math.floor(beat / 8);
    const degreeRoot = [0, 3, 1, 4][bar % 4];
    if (beat % 8 === 0) {
      const chord = [0, 2, 4].map((k) => key.root - 12 + key.scale[(degreeRoot + k) % 5] + (degreeRoot + k >= 5 ? 12 : 0));
      pad(chord.map(midi), t, spb * 8);
    }
    // melody: gentle, not every beat
    const r = Math.random();
    if (r < (beat % 2 === 0 ? 0.55 : 0.22)) {
      const step = Math.floor(Math.random() * 7);
      const n = key.root + key.scale[step % 5] + (step >= 5 ? 12 : 0);
      pluck(midi(n), t + (Math.random() < 0.2 ? spb / 2 : 0), 0.09);
    }
    if (beat % 4 === 0 && Math.random() < 0.4) pluck(midi(key.root - 12 + key.scale[degreeRoot]), t, 0.06);
    nextBeat += spb;
    beat++;
  }
}

/** Start (or change) the background music. mood: menu | museum | a region id. null stops it. */
export function setMusic(mood) {
  if (mood === musicMood) return;
  musicMood = mood;
  if (!mood) {
    clearInterval(musicTimer);
    musicTimer = null;
    return;
  }
  if (!ctx) return; // starts on the first click (unlockAudio)
  if (!musicTimer) startMusicClock();
}
