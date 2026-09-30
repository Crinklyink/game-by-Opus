// Fully procedural audio (no files): layered city ambience, traffic, rain, wind, thunder,
// foley (footsteps, doors, cash, eating...), elevator, and a lo-fi radio / diner jukebox generator.
import { clamp, lerp } from '../core/util.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null; this.ready = false;
    this.vol = { master: 0.85, music: 0.55, sfx: 0.9, amb: 0.85 };
    this.radioOn = true; this.jukeOn = false;
    this.zone = { name: 'apartment', indoor: true };
    this.muted = false;
    this.step = 0; this.nextT = 0; this.preset = 'lofi';
    this._lastRain = 0;
  }

  // must be called from a user gesture
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const N = this.nodes = {};
    N.master = ctx.createGain(); N.master.gain.value = this.vol.master;
    N.comp = ctx.createDynamicsCompressor(); N.comp.threshold.value = -16; N.comp.ratio.value = 4; N.comp.attack.value = 0.01; N.comp.release.value = 0.25;
    N.master.connect(N.comp); N.comp.connect(ctx.destination);
    N.amb = ctx.createGain(); N.amb.gain.value = this.vol.amb; N.amb.connect(N.master);
    N.sfx = ctx.createGain(); N.sfx.gain.value = this.vol.sfx; N.sfx.connect(N.master);
    N.musicBus = ctx.createGain(); N.musicBus.gain.value = 0; N.musicLP = ctx.createBiquadFilter(); N.musicLP.type = 'lowpass'; N.musicLP.frequency.value = 3200;
    N.musicBus.connect(N.musicLP); N.musicLP.connect(N.master);
    // noise buffers
    const mk = (type) => {
      const len = ctx.sampleRate * 4, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let last = 0, b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          if (type === 'white') d[i] = w;
          else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
          else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
        }
      }
      return b;
    };
    this.buf = { white: mk('white'), pink: mk('pink'), brown: mk('brown') };
    // vinyl crackle loop
    { const len = ctx.sampleRate * 6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * (0.4 + Math.random()) : 0) + (Math.random() * 2 - 1) * 0.004; this.buf.crackle = b; }
    const loop = (buf, filters, gainVal = 0) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random() * 2;
      let node = s; const chain = [];
      for (const [type, f, q] of filters) { const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; if (q) bq.Q.value = q; node.connect(bq); node = bq; chain.push(bq); }
      const g = ctx.createGain(); g.gain.value = gainVal; node.connect(g); g.connect(N.amb); s.start();
      return { src: s, g, chain };
    };
    N.rumble = loop(this.buf.brown, [['lowpass', 260]], 0);
    N.city = loop(this.buf.pink, [['bandpass', 700, 0.4]], 0);
    N.traffic = loop(this.buf.pink, [['bandpass', 520, 0.6], ['lowpass', 1400]], 0);
    N.rain = loop(this.buf.white, [['highpass', 900], ['lowpass', 7500]], 0);
    N.rainLow = loop(this.buf.pink, [['lowpass', 420]], 0);
    N.wind = loop(this.buf.pink, [['bandpass', 380, 1.3]], 0);
    N.hum = { g: ctx.createGain() }; N.hum.g.gain.value = 0; N.hum.g.connect(N.amb);
    for (const f of [60, 120, 180]) { const o = ctx.createOscillator(); o.frequency.value = f; o.type = 'sine'; const gg = ctx.createGain(); gg.gain.value = f === 60 ? 0.5 : 0.15; o.connect(gg); gg.connect(N.hum.g); o.start(); }
    N.elev = { g: ctx.createGain() }; N.elev.g.gain.value = 0; N.elev.g.connect(N.amb);
    { const o = ctx.createOscillator(); o.frequency.value = 52; o.type = 'triangle'; o.connect(N.elev.g); o.start(); const o2 = ctx.createOscillator(); o2.frequency.value = 104.5; o2.type = 'sine'; const g2 = ctx.createGain(); g2.gain.value = 0.3; o2.connect(g2); g2.connect(N.elev.g); o2.start(); }
    // engine tone
    N.engG = ctx.createGain(); N.engG.gain.value = 0; N.eng = ctx.createOscillator(); N.eng.type = 'sawtooth'; N.eng.frequency.value = 50; N.engLP = ctx.createBiquadFilter(); N.engLP.type = 'lowpass'; N.engLP.frequency.value = 220;
    N.eng.connect(N.engLP); N.engLP.connect(N.engG); N.engG.connect(N.amb); N.eng.start();
    // crackle for the radio
    N.crack = ctx.createBufferSource(); N.crack.buffer = this.buf.crackle; N.crack.loop = true; N.crackG = ctx.createGain(); N.crackG.gain.value = 0.5;
    { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; N.crack.connect(hp); hp.connect(N.crackG); N.crackG.connect(N.musicBus); N.crack.start(); }
    // reverb-ish delay for music
    N.delay = ctx.createDelay(1); N.delay.delayTime.value = 0.31; N.fb = ctx.createGain(); N.fb.gain.value = 0.28; N.dLP = ctx.createBiquadFilter(); N.dLP.type = 'lowpass'; N.dLP.frequency.value = 1800;
    N.delay.connect(N.dLP); N.dLP.connect(N.fb); N.fb.connect(N.delay); N.dLP.connect(N.musicBus);
    N.musicIn = ctx.createGain(); N.musicIn.connect(N.musicBus); N.musicIn.connect(N.delay);
    this.ready = true;
    this.nextT = ctx.currentTime + 0.2;
    this._schedTimer = setInterval(() => this._scheduler(), 90);
    this._birdT = 5; this._sirenT = 40;
  }

  setVolume(k, v) { this.vol[k] = v; if (!this.ready) return; const N = this.nodes; if (k === 'master') N.master.gain.value = v; if (k === 'amb') N.amb.gain.value = v; if (k === 'sfx') N.sfx.gain.value = v; }
  setMuted(m) { this.muted = m; if (this.ready) this.nodes.master.gain.value = m ? 0 : this.vol.master; }
  toggleRadio() { this.radioOn = !this.radioOn; G_toast(this.radioOn ? 'Radio on - lo-fi beats' : 'Radio off'); return this.radioOn; }
  toggleJuke() { this.jukeOn = !this.jukeOn; G_toast(this.jukeOn ? 'Jukebox: doo-wop shuffle' : 'Jukebox off'); }

  // ---------------- per-frame mixing ----------------
  update(dt, s) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, N = this.nodes, t = ctx.currentTime;
    const z = s.zone; this.zone = z;
    const set = (param, v, tc = 0.35) => param.setTargetAtTime(v, t, tc);
    const high = clamp((s.y - 20) / 100, 0, 1);          // altitude attenuation for street noise
    const outdoors = z.indoor ? 0 : 1;
    const bal = z.name === 'balcony' ? 1 : 0;
    const apt = z.name === 'apartment' ? 1 : 0;
    const hall = z.name === 'hall' || z.name === 'elevator' ? 1 : 0;
    const shop = z.name === 'burger' || z.name === 'grocery' || z.name === 'lobby' ? 1 : 0;
    const street = outdoors * (1 - high * 0.85) * (bal ? 1.0 : 1);
    const muff = outdoors ? 1 : apt ? 0.16 : shop ? 0.09 : 0.03;      // how much of the outside leaks in
    set(N.rumble.g.gain, (0.34 * (0.35 + 0.65 * (1 - high * 0.6)) * muff) * (1 + s.storm * 0.3));
    set(N.city.g.gain, 0.10 * muff * (0.5 + 0.5 * s.night) * (1 - high * 0.5) + (bal ? 0.05 : 0));
    // traffic from nearby cars
    let tr = 0, near = null, nd = 1e9;
    for (const c of s.cars || []) { const d = Math.max(3, c.d); tr += (0.05 + c.v * 0.006) / Math.pow(1 + d * 0.11, 1.6); if (d < nd) { nd = d; near = c; } }
    set(N.traffic.g.gain, clamp(tr * 0.9, 0, 0.5) * (outdoors ? 1 : muff * 1.2) * (1 - high * 0.75) + (high > 0.4 ? 0.02 * muff * (1 - 0.5 * apt) : 0), 0.15);
    if (near && nd < 40) { set(N.eng.frequency, 34 + near.v * 3.6, 0.2); set(N.engLP.frequency, 160 + near.v * 12, 0.3); set(N.engG.gain, (outdoors ? 0.05 : 0.01) * clamp(1 - nd / 40, 0, 1) * (near.v > 0.5 ? 1 : 0.4), 0.2); } else set(N.engG.gain, 0, 0.3);
    // rain
    const rain = s.rain;
    const rainOut = outdoors ? 1 : (apt ? 0.22 : shop ? 0.12 : 0.03);
    const canopy = s.sheltered ? 0.55 : 1;
    set(N.rain.g.gain, rain * 0.42 * rainOut * canopy, 0.4);
    set(N.rain.chain[0].frequency, outdoors ? 900 : 1600, 0.5);
    set(N.rain.chain[1].frequency, outdoors ? 7500 : 3600, 0.5);
    set(N.rainLow.g.gain, rain * 0.32 * rainOut * (0.6 + 0.4 * s.storm), 0.5);
    // wind (strong on the balcony / high up / storms)
    const windBase = 0.02 + (bal ? 0.16 : 0) + high * 0.05 * outdoors + s.storm * 0.14 * (outdoors ? 1 : 0.25);
    set(N.wind.g.gain, windBase * (0.7 + 0.3 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1)), 0.6);
    set(N.wind.chain[0].frequency, 300 + 250 * (0.5 + 0.5 * Math.sin(t * 0.23)) + s.storm * 300, 0.8);
    // interior hums
    set(N.hum.g.gain, (apt ? 0.012 : 0) + (shop ? 0.015 : 0), 0.6);
    set(N.elev.g.gain, z.name === 'elevator' && s.riding ? 0.075 : 0, 0.5);
    // radio / jukebox level by location
    let musicK = 0;
    if (this.jukeOn && z.name === 'burger') musicK = 0.85;
    else if (this.radioOn && (apt || bal || hall)) musicK = apt ? 1 : hall ? 0.18 : 0.3;
    this._musicK = musicK;
    set(N.musicBus.gain, musicK * this.vol.music * 0.55, 0.5);
    set(N.musicLP.frequency, 2600 + 1800 * musicK - (bal ? 800 : 0), 0.5);
    this.preset = z.name === 'burger' ? 'diner' : 'lofi';
    // occasional one-shots
    this._birdT -= dt; this._sirenT -= dt; this._dripT = (this._dripT || 0) - dt;
    if (this._birdT <= 0) { this._birdT = 3 + Math.random() * 9; if (outdoors && s.day > 0.6 && rain < 0.2 && z.name !== 'balcony') this._chirp(); }
    if (this._sirenT <= 0) { this._sirenT = 60 + Math.random() * 80; if (s.night > 0.3 || Math.random() < 0.3) this._siren(muff * (1 - high * 0.4)); }
    if (rain > 0.15 && outdoors && this._dripT <= 0) { this._dripT = 0.06 + Math.random() * 0.25 / (rain + 0.2); this._drop(0.02 * rain); }
  }

  // ---------------- one shots ----------------
  _env(g, t0, a, d, peak) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  _noiseShot(dur, type, f, q, vol, out) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.buf.white; s.loopStart = Math.random() * 3;
    const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q || 0.7;
    const g = ctx.createGain(); this._env(g, t, 0.004, dur, vol);
    s.connect(bq); bq.connect(g); g.connect(out || this.nodes.sfx); s.start(t, Math.random() * 3, dur + 0.05);
    return { s, bq, g };
  }
  _tone(freq, dur, vol, type = 'sine', out, glideTo) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.006, dur, vol);
    o.connect(g); g.connect(out || this.nodes.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  footstep(surface = 'wood', k = 1) {
    if (!this.ready) return;
    const v = 0.11 * k * (0.8 + Math.random() * 0.4);
    if (surface === 'wood') { this._noiseShot(0.09, 'bandpass', 380 + Math.random() * 120, 1.2, v * 1.1); this._tone(110 + Math.random() * 20, 0.08, v * 0.5, 'sine'); }
    else if (surface === 'tile') { this._noiseShot(0.06, 'bandpass', 1600 + Math.random() * 500, 1.6, v * 0.9); this._tone(260, 0.05, v * 0.25, 'triangle'); }
    else if (surface === 'carpet') this._noiseShot(0.09, 'lowpass', 300, 0.6, v * 0.6);
    else if (surface === 'metal') { this._noiseShot(0.07, 'bandpass', 900, 3, v * 0.7); this._tone(520, 0.12, v * 0.2, 'triangle'); }
    else if (surface === 'wet') { this._noiseShot(0.11, 'lowpass', 1100, 0.5, v * 0.9); this._noiseShot(0.07, 'highpass', 3000, 0.5, v * 0.5); }
    else if (surface === 'grass') this._noiseShot(0.12, 'bandpass', 1400, 0.4, v * 0.5);
    else { this._noiseShot(0.08, 'lowpass', 900, 0.7, v); this._noiseShot(0.05, 'highpass', 2600, 0.5, v * 0.4); }   // pavement
  }
  click() { this._noiseShot(0.02, 'bandpass', 3200, 2, 0.12); }
  blip(up = true) { this._tone(up ? 620 : 520, 0.09, 0.07, 'sine', null, up ? 940 : 380); }
  door(open) { this._noiseShot(0.25, 'bandpass', open ? 500 : 380, 0.7, 0.1); setTimeout(() => this._tone(open ? 190 : 140, 0.08, 0.1, 'sine'), 190); }
  ding() { this._tone(880, 0.9, 0.09, 'sine'); setTimeout(() => this._tone(660, 1.2, 0.08, 'sine'), 260); }
  elevatorStart() { this._noiseShot(0.6, 'lowpass', 300, 0.6, 0.06); }
  elevatorStop() { this._noiseShot(0.5, 'lowpass', 240, 0.6, 0.05); }
  cash() { this._tone(1320, 0.5, 0.08, 'sine'); setTimeout(() => this._tone(1980, 0.7, 0.07, 'sine'), 80); this._noiseShot(0.05, 'highpass', 5000, 0.5, 0.06); }
  eat() { for (let i = 0; i < 6; i++) setTimeout(() => this._noiseShot(0.05, 'bandpass', 1400 + Math.random() * 1600, 1.5, 0.09), i * 170); }
  sizzle(seconds = 2.5) { const r = this._noiseShot(seconds, 'highpass', 3600, 0.5, 0.08); if (r) { r.g.gain.cancelScheduledValues(0); const t = this.ctx.currentTime; r.g.gain.setValueAtTime(0.0001, t); r.g.gain.linearRampToValueAtTime(0.1, t + 0.2); r.g.gain.linearRampToValueAtTime(0.05, t + seconds * 0.8); r.g.gain.linearRampToValueAtTime(0.0001, t + seconds); } }
  water(seconds = 2) { const r = this._noiseShot(seconds, 'bandpass', 2400, 0.5, 0.07); if (r) { const t = this.ctx.currentTime; r.g.gain.cancelScheduledValues(0); r.g.gain.setValueAtTime(0.0001, t); r.g.gain.linearRampToValueAtTime(0.09, t + 0.25); r.g.gain.linearRampToValueAtTime(0.0001, t + seconds); } }
  coffee() { this.water(1.2); setTimeout(() => this._noiseShot(2.2, 'lowpass', 500, 2, 0.08), 500); setTimeout(() => this._tone(1000, 0.2, 0.05, 'sine'), 3000); }
  type() { for (let i = 0; i < 5; i++) setTimeout(() => this._noiseShot(0.02, 'bandpass', 2400 + Math.random() * 800, 2, 0.05), i * 90); }
  beep(n = 3) { for (let i = 0; i < n; i++) setTimeout(() => this._tone(1000, 0.12, 0.06, 'square'), i * 220); }
  yawn() { this._tone(280, 0.9, 0.05, 'sawtooth', null, 180); }
  growl() { this._tone(70, 1.0, 0.09, 'sawtooth', null, 45); }
  thunder(strength = 0.6) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 3.5 + strength * 3;
    const s = ctx.createBufferSource(); s.buffer = this.buf.brown; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * strength, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp); lp.connect(g); g.connect(this.nodes.amb); s.start(t, Math.random() * 2, dur + 0.1);
  }
  horn(x, y, z, k = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = 0.05 * k * (this._hornAtt || 1);
    const g = ctx.createGain(); this._env(g, t, 0.02, 0.5, vol);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.zone.indoor ? 500 : 2400;
    for (const f of [415, 520]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.6); }
    lp.connect(g); g.connect(this.nodes.sfx);
  }
  _chirp() {
    if (!this.ready) return;
    const n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) setTimeout(() => this._tone(base * (1 + Math.random() * 0.2), 0.09, 0.015, 'sine', this.nodes.amb, base * 1.35), i * 140);
  }
  _siren(vol) {
    if (!this.ready || vol < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 760;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.014 * vol, t + 3.5); g.gain.linearRampToValueAtTime(0.0001, t + 9);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) { pan.pan.setValueAtTime(-0.8, t); pan.pan.linearRampToValueAtTime(0.8, t + 9); }
    o.connect(lp); lp.connect(g); pan ? (g.connect(pan), pan.connect(this.nodes.amb)) : g.connect(this.nodes.amb);
    o.start(t); lfo.start(t); o.stop(t + 9.5); lfo.stop(t + 9.5);
  }
  _drop(v) { this._tone(1500 + Math.random() * 2500, 0.03, v, 'sine', this.nodes.amb, 700 + Math.random() * 500); }

  // ---------------- lo-fi music ----------------
  _scheduler() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    if (this._musicK < 0.02) { this.nextT = Math.max(this.nextT, ctx.currentTime + 0.1); return; }
    const bpm = this.preset === 'diner' ? 96 : 76, sd = 60 / bpm / 4;
    while (this.nextT < ctx.currentTime + 0.35) {
      const sw = (this.step % 2 === 1 ? sd * 0.24 : 0);
      this._musicStep(this.step, this.nextT + sw, sd);
      this.nextT += sd; this.step = (this.step + 1) % 64;
    }
  }
  _ep(freq, t, dur, vel) {
    const ctx = this.ctx, N = this.nodes;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = freq; mod.frequency.value = freq * (this.preset === 'diner' ? 2 : 1);
    car.detune.value = (Math.random() - 0.5) * 14; mg.gain.setValueAtTime(freq * 1.7 * vel, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
    mod.connect(mg); mg.connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g); g.connect(N.musicIn); car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  _bass(freq, t, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.nodes.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  _drum(kind, t, vel) {
    const ctx = this.ctx, N = this.nodes;
    if (kind === 'kick') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13); g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(N.musicBus); o.start(t); o.stop(t + 0.25); }
    else {
      const s = ctx.createBufferSource(); s.buffer = this.buf.white; const bq = ctx.createBiquadFilter(), g = ctx.createGain();
      if (kind === 'snare') { bq.type = 'bandpass'; bq.frequency.value = 1800; bq.Q.value = 0.8; g.gain.setValueAtTime(0.28 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); }
      else { bq.type = 'highpass'; bq.frequency.value = 7000; g.gain.setValueAtTime(0.09 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, kind === 'open' ? t + 0.18 : t + 0.04); }
      s.connect(bq); bq.connect(g); g.connect(N.musicBus); s.start(t, Math.random() * 3, 0.25);
    }
  }
  _musicStep(step, t, sd) {
    const diner = this.preset === 'diner';
    const chords = diner
      ? [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]
      : [[50, 53, 57, 60, 64], [55, 59, 62, 64, 65], [48, 52, 55, 59, 62], [45, 48, 52, 55, 59]];
    const bars = Math.floor(step / 16), pos = step % 16;
    const ch = chords[bars % 4];
    if (pos === 0 || (pos === 10 && !diner) || (diner && pos === 8)) { ch.forEach((n, i) => this._ep(midi(n), t + i * 0.014 + Math.random() * 0.01, sd * (diner ? 8 : 12), 0.7 + Math.random() * 0.25)); }
    if (!diner && pos === 6) this._ep(midi(ch[3] + 12), t, sd * 4, 0.45);
    if (pos === 0) this._bass(midi(ch[0] - 12), t, sd * 6);
    if (pos === (diner ? 8 : 10)) this._bass(midi(ch[0] - 12 + (diner ? 7 : 0)), t, sd * 4);
    if (pos === 0 || pos === (diner ? 8 : 10)) this._drum('kick', t, 0.9);
    if (pos === 4 || pos === 12) this._drum('snare', t, pos === 12 ? 1 : 0.8);
    if (pos % 2 === 0) this._drum('hat', t, 0.5 + (pos % 4 === 0 ? 0.3 : 0) + Math.random() * 0.1);
    if (pos === 14) this._drum('open', t, 0.6);
  }
}

let G_toast = (m) => { try { window.__G?.game?.toast?.(m); } catch (e) { /* ignore */ } };
