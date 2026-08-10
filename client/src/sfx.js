// 音（WebAudio で その場で作るので、音声ファイルは いらない）
let ctx = null;
let enabled = true;
let master = null;
let engineOsc = null;
let engineGain = null;

export function setSound(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? 0.28 : 0;
}

/** 音は「ユーザーが なにかを さわった あと」でないと 鳴らせない決まりがある */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.28 : 0;
  master.connect(ctx.destination);
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'square', gain = 0.5, delay = 0 }) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.3, delay = 0, hp = 300 }) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  count: () => tone({ freq: 520, dur: 0.14, type: 'triangle', gain: 0.5 }),
  go: () => {
    tone({ freq: 780, dur: 0.16, type: 'triangle', gain: 0.6 });
    tone({ freq: 1180, dur: 0.3, type: 'triangle', gain: 0.5, delay: 0.12 });
  },
  coin: () => {
    tone({ freq: 1200, dur: 0.06, type: 'square', gain: 0.25 });
    tone({ freq: 1700, dur: 0.09, type: 'square', gain: 0.22, delay: 0.05 });
  },
  item: () => {
    tone({ freq: 600, to: 1400, dur: 0.22, type: 'sawtooth', gain: 0.3 });
  },
  boost: () => {
    noise({ dur: 0.45, gain: 0.35, hp: 500 });
    tone({ freq: 300, to: 1200, dur: 0.35, type: 'sawtooth', gain: 0.3 });
  },
  hit: () => {
    noise({ dur: 0.3, gain: 0.4, hp: 150 });
    tone({ freq: 260, to: 70, dur: 0.35, type: 'square', gain: 0.35 });
  },
  shield: () => tone({ freq: 900, to: 1500, dur: 0.3, type: 'sine', gain: 0.3 }),
  thunder: () => {
    noise({ dur: 0.5, gain: 0.45, hp: 900 });
    tone({ freq: 140, to: 60, dur: 0.5, type: 'sawtooth', gain: 0.3 });
  },
  lap: () => {
    tone({ freq: 700, dur: 0.1, type: 'triangle', gain: 0.4 });
    tone({ freq: 1050, dur: 0.14, type: 'triangle', gain: 0.4, delay: 0.09 });
  },
  finish: () => {
    [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.45, delay: i * 0.11 }));
  },
  buy: () => {
    tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.3 });
    tone({ freq: 1320, dur: 0.12, type: 'square', gain: 0.3, delay: 0.07 });
  },
  error: () => tone({ freq: 200, dur: 0.18, type: 'square', gain: 0.3 }),
  click: () => tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.22 }),
  wall: () => noise({ dur: 0.12, gain: 0.25, hp: 200 }),
};

/** エンジン音（速さに あわせて 高さを かえる） */
export function engine(on, speedRatio) {
  if (!ctx || !enabled) return;
  if (on && !engineOsc) {
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineGain).connect(master);
    engineOsc.start();
  }
  if (!on) {
    if (engineOsc) {
      try {
        engineGain.gain.value = 0;
        engineOsc.stop(ctx.currentTime + 0.05);
      } catch { /* noop */ }
      engineOsc = null;
      engineGain = null;
    }
    return;
  }
  const r = Math.max(0, Math.min(1.4, speedRatio));
  engineOsc.frequency.value = 55 + r * 130;
  engineGain.gain.value = 0.035 + r * 0.05;
}
