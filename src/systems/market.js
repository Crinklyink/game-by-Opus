// A small, cozy stock-market simulation: 8 fictional companies, geometric random walks with a
// shared market factor, sector beta, scheduled news that moves prices, trading hours, candles.
import { rng, clamp } from '../core/util.js';

const OPEN = 9.5, CLOSE = 16.0, TICK = 5 / 60;      // ticks every 5 game-minutes
const CANDLE_TICKS = 3;                              // 15-minute candles

const TICKERS = [
  { sym: 'NXG', name: 'NexGrid Power', sector: 'energy', price: 84.2, vol: 0.011, drift: 0.00002, beta: 0.7 },
  { sym: 'ARC', name: 'Arclight Labs', sector: 'tech', price: 212.6, vol: 0.016, drift: 0.00004, beta: 1.3 },
  { sym: 'BLM', name: 'Bloom Foods', sector: 'consumer', price: 46.8, vol: 0.009, drift: 0.00002, beta: 0.5 },
  { sym: 'HLX', name: 'Helix Biotech', sector: 'health', price: 138.4, vol: 0.02, drift: 0.00003, beta: 0.8 },
  { sym: 'MTR', name: 'Metro Rail Corp', sector: 'industrial', price: 61.3, vol: 0.008, drift: 0.00001, beta: 0.6 },
  { sym: 'ORB', name: 'Orbital Systems', sector: 'tech', price: 305.0, vol: 0.021, drift: 0.00005, beta: 1.5 },
  { sym: 'VLT', name: 'Volt Motors', sector: 'auto', price: 97.5, vol: 0.017, drift: 0.00002, beta: 1.2 },
  { sym: 'HRB', name: 'Harbor Bank', sector: 'finance', price: 52.1, vol: 0.009, drift: 0.00002, beta: 0.9 },
];

const NEWS = [
  { t: (s) => `${s.name} wins a multi-year city contract`, k: 0.05 },
  { t: (s) => `${s.name} beats quarterly earnings estimates`, k: 0.065 },
  { t: (s) => `${s.name} guides lower on softer demand`, k: -0.06 },
  { t: (s) => `Regulators open a probe into ${s.name}`, k: -0.075 },
  { t: (s) => `Analysts upgrade ${s.name} to Buy`, k: 0.035 },
  { t: (s) => `${s.name} announces a surprise buyback`, k: 0.04 },
  { t: (s) => `Supply hiccup hits ${s.name} production`, k: -0.04 },
  { t: (s) => `${s.name} unveils a breakthrough product`, k: 0.08 },
];

const gauss = (R) => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export class Market {
  constructor(seed = 8801) {
    this.R = rng(seed);
    this.tickers = TICKERS.map((t) => ({ ...t, open: t.price, chg: 0, hist: [], cur: null, impulse: 0, spread: 0.0008 }));
    this.headlines = ['Welcome to Meridian Markets - trading hours 9:30 AM to 4:00 PM'];
    this.cash = 0;
    this.pos = {};                // sym -> { shares, avg }
    this.accum = 0; this.lastHour = 7; this.day = 1;
    this.trend = 0;               // market-wide factor (slow mean-reverting)
    this.pending = [];            // scheduled news {hour, ...}
    this.eq0 = null;
    this.trades = [];
    this.warm(60);
    this.scheduleDay(1);
  }

  isOpen(h) { return h >= OPEN && h < CLOSE; }
  price(sym) { return this.tickers.find((t) => t.sym === sym).price; }
  T(sym) { return this.tickers.find((t) => t.sym === sym); }

  // pre-roll some history so charts aren't empty
  warm(n) {
    for (let i = 0; i < n * CANDLE_TICKS; i++) this._tick(true);
    for (const t of this.tickers) { t.open = t.price; t.chg = 0; }
  }

  scheduleDay(day) {
    this.pending = [];
    const R = this.R, n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const tk = this.tickers[Math.floor(R() * this.tickers.length)];
      const ev = NEWS[Math.floor(R() * NEWS.length)];
      this.pending.push({ hour: 8 + R() * 8, sym: tk.sym, text: ev.t(tk), k: ev.k * (0.7 + R() * 0.6), fired: false });
    }
    this.pending.sort((a, b) => a.hour - b.hour);
  }

  _tick(silent = false) {
    const R = this.R;
    this.trend += (0 - this.trend) * 0.02 + gauss(R) * 0.0016;
    for (const t of this.tickers) {
      let r = t.drift + t.vol * 0.55 * gauss(R) + t.beta * this.trend;
      if (t.impulse) { const take = t.impulse * 0.35; r += take; t.impulse -= take; if (Math.abs(t.impulse) < 1e-4) t.impulse = 0; }
      t.price = Math.max(1, t.price * Math.exp(r));
      const c = t.cur || (t.cur = { o: t.price, h: t.price, l: t.price, c: t.price, n: 0 });
      c.h = Math.max(c.h, t.price); c.l = Math.min(c.l, t.price); c.c = t.price; c.n++;
      if (c.n >= CANDLE_TICKS) { t.hist.push({ o: c.o, h: c.h, l: c.l, c: c.c }); if (t.hist.length > 240) t.hist.shift(); t.cur = null; }
      t.chg = t.price / t.open - 1;
    }
  }

  // advance by game minutes at absolute hour h (0..24) of `day`
  advance(dtMinutes, hour, day) {
    if (day !== this.day) { this.day = day; this.scheduleDay(day); for (const t of this.tickers) { const gap = 1 + gauss(this.R) * t.vol * 0.8 + t.beta * this.trend * 0.5; t.price = Math.max(1, t.price * gap); t.open = t.price; t.chg = 0; } this.headlines.push(`Day ${day}: futures ${this.trend >= 0 ? 'edge higher' : 'point lower'} ahead of the open`); }
    this.accum += dtMinutes / 60;
    // fire news
    for (const p of this.pending) if (!p.fired && hour >= p.hour) {
      p.fired = true; this.headlines.push(p.text);
      const t = this.T(p.sym); t.impulse += p.k * 0.6;
      if (this.headlines.length > 40) this.headlines.shift();
    }
    while (this.accum >= TICK) {
      this.accum -= TICK;
      if (this.isOpen(hour)) this._tick();
    }
    this.lastHour = hour;
  }

  equity() { let e = this.cash; for (const s in this.pos) e += this.pos[s].shares * this.price(s); return e; }
  holdings() { return Object.entries(this.pos).filter(([, p]) => p.shares > 0).map(([sym, p]) => ({ sym, ...p, price: this.price(sym), value: p.shares * this.price(sym), pl: (this.price(sym) - p.avg) * p.shares })); }

  buy(sym, n, cash) {
    const t = this.T(sym); const px = t.price * (1 + t.spread);
    const cost = px * n;
    if (n <= 0 || cost > cash + 1e-6) return { ok: false, msg: 'Not enough cash' };
    const p = this.pos[sym] || (this.pos[sym] = { shares: 0, avg: 0 });
    p.avg = (p.avg * p.shares + cost) / (p.shares + n); p.shares += n;
    this.trades.push({ sym, n, px, side: 'buy' });
    return { ok: true, cost, px };
  }
  sell(sym, n) {
    const t = this.T(sym); const p = this.pos[sym];
    if (!p || p.shares < n || n <= 0) return { ok: false, msg: 'Not enough shares' };
    const px = t.price * (1 - t.spread); const proceeds = px * n;
    p.shares -= n; if (p.shares === 0) p.avg = 0;
    this.trades.push({ sym, n, px, side: 'sell' });
    return { ok: true, proceeds, px };
  }
  serialize() { return { pos: this.pos, prices: this.tickers.map((t) => [t.sym, t.price, t.open]), hist: this.tickers.map((t) => t.hist.slice(-120)), trend: this.trend, headlines: this.headlines.slice(-12), day: this.day }; }
  restore(d) {
    if (!d) return;
    this.pos = d.pos || {};
    d.prices?.forEach(([s, p, o]) => { const t = this.T(s); if (t) { t.price = p; t.open = o; t.chg = p / o - 1; } });
    d.hist?.forEach((h, i) => { if (this.tickers[i] && h) this.tickers[i].hist = h; });
    this.trend = d.trend || 0; this.headlines = d.headlines || this.headlines; this.day = d.day || 1;
  }
}
