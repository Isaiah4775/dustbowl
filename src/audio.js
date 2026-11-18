import { clamp } from './util.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  get ready() {
    return Boolean(this.ctx && !this.muted);
  }

  out(node, pan = 0) {
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p);
      p.connect(this.master);
    } else {
      node.connect(this.master);
    }
  }

  noise({ dur = 0.08, vol = 0.4, pan = 0, type = 'bandpass', freq = 1600, q = 1, rate = 1 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    this.out(g, pan);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({ f0 = 440, f1 = null, dur = 0.15, vol = 0.15, pan = 0, type = 'sine', delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    this.out(g, pan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shoot({ vol = 0.4, pan = 0, enemy = false } = {}) {
    this.noise({ dur: 0.075, vol: vol * 0.9, pan, freq: enemy ? 1300 : 1900, q: 0.8, rate: enemy ? 0.85 : 1.05 });
    this.tone({ f0: enemy ? 150 : 190, f1: 60, dur: 0.06, vol: vol * 0.45, pan, type: 'triangle' });
  }

  impact({ vol = 0.15, pan = 0 } = {}) {
    this.noise({ dur: 0.05, vol, pan, freq: 3200, q: 2, rate: 1.4 });
  }

  hit({ vol = 0.3 } = {}) {
    this.tone({ f0: 1500, f1: 2100, dur: 0.06, vol, type: 'sine' });
  }

  hurt({ vol = 0.4 } = {}) {
    this.noise({ dur: 0.16, vol: vol * 0.8, type: 'lowpass', freq: 600, q: 0.7 });
    this.tone({ f0: 130, f1: 60, dur: 0.18, vol: vol * 0.6, type: 'sawtooth' });
  }

  down({ vol = 0.3 } = {}) {
    this.tone({ f0: 420, f1: 90, dur: 0.3, vol, type: 'square' });
  }

  reload() {
    this.noise({ dur: 0.04, vol: 0.2, freq: 800, q: 4 });
  }

  reloadDone() {
    this.noise({ dur: 0.05, vol: 0.24, freq: 1300, q: 4 });
    this.tone({ f0: 240, f1: 180, dur: 0.06, vol: 0.1, type: 'square' });
  }

  pickup() {
    this.tone({ f0: 740, dur: 0.08, vol: 0.18 });
    this.tone({ f0: 1100, dur: 0.1, vol: 0.14, delay: 0.07 });
  }

  empty() {
    this.noise({ dur: 0.03, vol: 0.16, freq: 2200, q: 5 });
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ f0: f, dur: 0.22, vol: 0.14, type: 'triangle', delay: i * 0.12 }));
  }

  lose() {
    [392, 330, 262].forEach((f, i) => this.tone({ f0: f, dur: 0.3, vol: 0.14, type: 'triangle', delay: i * 0.15 }));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
