/* Worldseed sound: a generative score in each world's own scale, plus wind, waves, night insects and cues. */
(() => {
"use strict";
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
};
const PROG = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]];

let ctx = null, master, musicBus, ambBus, verb, delay, noiseBuf, windGain, waveGain, cricketGain, on = false;
let cfg = { scale: "dorian", tempo: 72, root: 50 }, bar = 0, nextBar = 0, timer = null, vol = 0.7;

function impulse(sec = 3.2) {
  const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
  return b;
}
function noiseSrc(type = "bandpass", freq = 500, q = 0.7) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(ambBus); s.start();
  return { g, f };
}
function init() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.8; ambBus.connect(master);
  verb = ctx.createConvolver(); verb.buffer = impulse(); const vg = ctx.createGain(); vg.gain.value = 0.55; verb.connect(vg); vg.connect(master);
  delay = ctx.createDelay(1.5); delay.delayTime.value = 0.42; const fb = ctx.createGain(); fb.gain.value = 0.32; delay.connect(fb); fb.connect(delay); delay.connect(verb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wind = noiseSrc("bandpass", 420, 0.6); windGain = wind.g;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 180; lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
  const waves = noiseSrc("lowpass", 700, 0.3); waveGain = waves.g;
  const cr = ctx.createOscillator(); cr.frequency.value = 4700; const crA = ctx.createGain(); crA.gain.value = 0;
  const am = ctx.createOscillator(); am.frequency.value = 28; const amG = ctx.createGain(); amG.gain.value = 0.5; am.connect(amG); amG.connect(crA.gain);
  cricketGain = ctx.createGain(); cricketGain.gain.value = 0; cr.connect(crA); crA.connect(cricketGain); cricketGain.connect(ambBus); cr.start(); am.start();
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function note(midi, t, dur, type, gain, dest, attack = 0.02, cutoff = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = hz(midi);
  let n = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff; o.connect(f); n = f; }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(g); for (const d of dest) g.connect(d);
  o.start(t); o.stop(t + dur + 0.1);
}
function degree(sc, d, oct = 0) { const s = SCALES[sc] || SCALES.dorian; const n = s.length; return cfg.root + s[((d % n) + n) % n] + 12 * (oct + Math.floor(d / n)); }
function schedule() {
  if (!ctx || !on) return;
  const spb = 60 / cfg.tempo, barLen = spb * 4;
  while (nextBar < ctx.currentTime + 0.5) {
    const ch = PROG[bar % PROG.length], t = nextBar;
    for (const d of ch) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = hz(degree(cfg.scale, d)); o.detune.value = det;
      f.type = "lowpass"; f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + barLen * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + barLen * 1.25);
      o.connect(f); f.connect(g); g.connect(musicBus); g.connect(verb);
      o.start(t); o.stop(t + barLen * 1.3);
    }
    note(degree(cfg.scale, ch[0], -1), t, barLen * 1.1, "sine", 0.09, [musicBus], 0.3);
    for (let i = 0; i < 8; i++) {
      if (Math.random() < (cfg.tempo > 85 ? 0.42 : 0.3)) {
        const d = ch[Math.floor(Math.random() * 3)] + (Math.random() < 0.3 ? 1 : 0);
        note(degree(cfg.scale, d, 1 + (Math.random() < 0.25 ? 1 : 0)), t + i * spb / 2, spb * 1.6, "triangle", 0.05, [musicBus, delay], 0.005);
      }
    }
    nextBar += barLen; bar++;
  }
}

WS.Sound = {
  get on() { return on; },
  start() {
    if (!ctx) init();
    if (ctx.state === "suspended") ctx.resume();
    on = true; nextBar = ctx.currentTime + 0.2;
    master.gain.setTargetAtTime(vol, ctx.currentTime, 0.4);
    if (!timer) timer = setInterval(schedule, 120);
  },
  stop() { on = false; if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); },
  setMusic(m = {}) { cfg.scale = SCALES[m.scale] ? m.scale : "dorian"; cfg.tempo = Math.max(40, Math.min(130, m.tempo || 72)); cfg.root = 45 + (WS.hashStr(m.mood || m.scale || "x") % 10); },
  ambience({ wind = 0.3, water = 0, night = 0, rain = 0 } = {}) {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.05 + wind * 0.18 + rain * 0.25, t, 0.8);
    waveGain.gain.setTargetAtTime(water * 0.22, t, 0.8);
    cricketGain.gain.setTargetAtTime(night * 0.012 * (1 - rain), t, 1.2);
  },
  chime() {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    [0, 2, 4, 7].forEach((d, i) => note(degree(cfg.scale, d, 2), t + i * 0.11, 2.4, "sine", 0.07, [master, verb], 0.005));
  },
  blip(up = true) { if (!ctx || !on) return; const t = ctx.currentTime; note(degree(cfg.scale, up ? 4 : 0, 2), t, 0.4, "triangle", 0.05, [master, verb], 0.004); },
  thunder() {
    if (!ctx || !on) return;
    const t = ctx.currentTime + 0.4 + Math.random() * 1.2;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    s.connect(f); f.connect(g); g.connect(master); g.connect(verb); s.start(t); s.stop(t + 3.6);
  },
};
})();
