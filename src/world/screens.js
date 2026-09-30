// Canvas-driven emissive screens (monitors, TV, kiosks, menu boards).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng } from '../core/util.js';

export const screens = [];

export function makeScreen(w, h, draw, { fps = 5, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const s = { c, ctx, tex, w, h, draw, fps, acc: 1, on: true, t: 0, level: 1.5 };
  s.mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false });
  s.setOn = (v) => { s.on = v; s.mat.color.setScalar(v ? s.level : 0.012); s.acc = 1; };
  draw(ctx, w, h, 0, s);
  tex.needsUpdate = true;
  screens.push(s);
  return s;
}

export function updateScreens(dt, t) {
  for (const s of screens) {
    if (!s.on || !s.visible) continue;
    s.acc += dt;
    if (s.acc < 1 / s.fps) continue;
    s.acc = 0;
    s.draw(s.ctx, s.w, s.h, t, s);
    s.tex.needsUpdate = true;
  }
}

// ---------------- trading terminal screen ----------------
const C = { bg: '#0b0f14', panel: '#111820', grid: '#1b2530', up: '#2fd27a', down: '#ff5468', txt: '#c9d6e2', dim: '#66788a', accent: '#4aa8ff' };

export function drawChartScreen(ctx, w, h, t, s) {
  const seed = s.seed ?? 1;
  const mode = s.mode ?? 0;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  const market = G.market;
  ctx.font = `${Math.round(h * 0.05)}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'top';
  if (mode === 0) {
    // candlestick chart of ticker `seed`
    const tk = market ? market.tickers[seed % market.tickers.length] : null;
    const hist = tk ? tk.hist : null;
    const R = rng(1000 + seed * 77);
    const n = 64;
    const pts = [];
    if (hist && hist.length > 10) {
      for (let i = Math.max(0, hist.length - n); i < hist.length; i++) pts.push(hist[i]);
    } else {
      let p = 100;
      for (let i = 0; i < n; i++) { const o = p; p *= 1 + (R() - 0.48) * 0.02; pts.push({ o, c: p, h: Math.max(o, p) * (1 + R() * 0.006), l: Math.min(o, p) * (1 - R() * 0.006) }); }
    }
    let lo = 1e9, hi = -1e9;
    for (const c of pts) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    const px = 26, py = h * 0.14, pw = w - 90, ph = h * 0.72;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) { const y = py + (ph * i) / 5; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); }
    const cw = pw / pts.length;
    pts.forEach((c, i) => {
      const x = px + i * cw + cw / 2;
      const y = (v) => py + ph - ((v - lo) / (hi - lo + 1e-9)) * ph;
      const up = c.c >= c.o;
      ctx.strokeStyle = ctx.fillStyle = up ? C.up : C.down;
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
      ctx.fillRect(x - cw * 0.32, Math.min(y(c.o), y(c.c)), cw * 0.64, Math.max(2, Math.abs(y(c.o) - y(c.c))));
    });
    ctx.fillStyle = C.txt;
    const name = tk ? tk.sym : ['NXG', 'ARC', 'BLM', 'HLX'][seed % 4];
    const last = pts[pts.length - 1].c, first = pts[0].o;
    ctx.fillText(`${name}  ${last.toFixed(2)}`, 22, h * 0.04);
    ctx.fillStyle = last >= first ? C.up : C.down;
    ctx.fillText(`${last >= first ? '+' : ''}${(((last - first) / first) * 100).toFixed(2)}%`, w * 0.62, h * 0.04);
    ctx.fillStyle = C.dim;
    for (let i = 0; i <= 5; i++) ctx.fillText((hi - ((hi - lo) * i) / 5).toFixed(1), px + pw + 6, py + (ph * i) / 5 - 8);
    // blinking cursor
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = C.accent; ctx.fillRect(w - 24, h * 0.04, 8, h * 0.05); }
  } else if (mode === 1) {
    // watchlist
    ctx.fillStyle = C.txt; ctx.fillText('WATCHLIST', 22, h * 0.04);
    const list = market ? market.tickers : [];
    list.slice(0, 8).forEach((tk, i) => {
      const y = h * (0.15 + i * 0.105);
      ctx.fillStyle = C.panel; ctx.fillRect(14, y - 4, w - 28, h * 0.09);
      ctx.fillStyle = C.txt; ctx.fillText(tk.sym, 26, y);
      ctx.fillStyle = C.dim; ctx.fillText(tk.name.slice(0, 14), w * 0.2, y);
      ctx.fillStyle = tk.chg >= 0 ? C.up : C.down;
      ctx.fillText(tk.price.toFixed(2), w * 0.66, y);
      ctx.fillText(`${tk.chg >= 0 ? '+' : ''}${(tk.chg * 100).toFixed(1)}%`, w * 0.84, y);
    });
    if (!list.length) { ctx.fillStyle = C.dim; ctx.fillText('connecting...', 22, h * 0.2); }
  } else {
    // news / portfolio
    ctx.fillStyle = C.txt; ctx.fillText('NEWS WIRE', 22, h * 0.04);
    const heads = market ? market.headlines.slice(-6).reverse() : [];
    ctx.font = `${Math.round(h * 0.042)}px ui-monospace, Consolas, monospace`;
    heads.forEach((hl, i) => { ctx.fillStyle = i === 0 ? C.accent : C.dim; ctx.fillText(hl.slice(0, 44), 22, h * (0.15 + i * 0.12)); });
    ctx.fillStyle = C.txt;
    ctx.fillText(market ? `EQUITY $${Math.round(market.equity()).toLocaleString()}` : '', 22, h * 0.9);
  }
}

// ---------------- TV picture ----------------
export function drawTV(ctx, w, h, t, s) {
  const ch = s.channel ?? 0;
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (ch === 0) {          // ambient "aurora" screensaver
    const a = t * 0.15;
    g.addColorStop(0, `hsl(${(200 + Math.sin(a) * 40) | 0} 70% 18%)`);
    g.addColorStop(0.5, `hsl(${(260 + Math.cos(a * 1.3) * 50) | 0} 65% 26%)`);
    g.addColorStop(1, `hsl(${(160 + Math.sin(a * 0.7) * 50) | 0} 70% 20%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const x = w * (0.5 + 0.4 * Math.sin(t * 0.21 + i * 1.7)), y = h * (0.5 + 0.35 * Math.cos(t * 0.17 + i * 2.3));
      const rg = ctx.createRadialGradient(x, y, 0, x, y, h * 0.55);
      rg.addColorStop(0, `hsla(${(140 + i * 45 + t * 6) % 360},80%,60%,0.35)`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
  } else {                  // "city news" ticker
    ctx.fillStyle = '#0c1a2e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e5fbf'; ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = '#e8eef8'; ctx.font = `${Math.round(h * 0.09)}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText('METRO NEWS 24', w * 0.05, h * 0.86);
    const line = G.market && G.market.headlines.length ? G.market.headlines[G.market.headlines.length - 1] : 'Skyline lights up as evening rush begins downtown';
    ctx.font = `${Math.round(h * 0.07)}px system-ui, sans-serif`; ctx.fillStyle = '#ffffff';
    const off = (t * 90) % (w + 900);
    ctx.fillText(line + '   •   ' + line, w - off, h * 0.5);
    ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(w * 0.06, h * 0.1, h * 0.03, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(h * 0.05)}px system-ui, sans-serif`; ctx.fillText('LIVE', w * 0.09, h * 0.1);
  }
  // scanline sheen
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
}
