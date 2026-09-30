// Street-side architecture for the two shops. The shells in shops.js are plain boxes; this dresses their
// outsides: brick / porcelain-enamel cladding with real window reveals, pilasters, dentil cornices,
// parapets, downspouts, wall lamps, meters and conduit, a painted mural, loading doors and rooftop plant.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp, smooth } from '../core/util.js';
import { Kit, addCollider } from './kit.js';
import { pm } from '../gfx/materials.js';
import { canvasTex } from '../gfx/noise.js';
import { LightPool } from '../gfx/lights.js';

const VT = 0.06;                                   // brick veneer thickness

// A wall face: origin (x,z) at u=0 on the outer face, outward normal (nx,nz). u runs along the wall, v is
// height, w is the distance out of the face. Boxes are authored in (u,v,w) and placed in the world.
class Wall {
  constructor(K, x, z, nx, nz, len) {
    this.K = K; this.x = x; this.z = z; this.len = len; this.nx = nx; this.nz = nz;
    this.th = Math.atan2(nx, nz); this.tx = Math.cos(this.th); this.tz = -Math.sin(this.th);
  }
  P(u, w) { return [this.x + this.tx * u + this.nx * w, this.z + this.tz * u + this.nz * w]; }
  box(mat, u0, u1, v0, v1, w0, w1, o = {}) {
    const [x, z] = this.P((u0 + u1) / 2, (w0 + w1) / 2);
    return this.K.box(mat, u1 - u0, v1 - v0, w1 - w0, x, v0, z, { ry: this.th, ...o });
  }
  cyl(mat, r, v0, v1, u, w, o = {}) { const [x, z] = this.P(u, w); return this.K.cyl(mat, r, r, v1 - v0, x, v0, z, o); }
  sph(mat, r, u, v, w, o = {}) { const [x, z] = this.P(u, w); return this.K.sph(mat, r, x, v, z, o); }
  lathe(mat, pts, u, v, w, o = {}) { const [x, z] = this.P(u, w); return this.K.lathe(mat, pts, x, v, z, o); }
  tube(mat, pts, r, o = {}) { return this.K.tube(mat, pts.map(([u, v, w]) => { const [x, z] = this.P(u, w); return [x, v, z]; }), r, o); }
  strut(mat, a, b, r0, r1, o = {}) { const [ax, az] = this.P(a[0], a[2]), [bx, bz] = this.P(b[0], b[2]); return this.K.strut(mat, [ax, a[1], az], [bx, b[1], bz], r0, r1, o); }
  plane(mat, u0, u1, v0, v1, w, o = {}) { const [x, z] = this.P((u0 + u1) / 2, w); return this.K.plane(mat, u1 - u0, v1 - v0, x, (v0 + v1) / 2, z, { ry: this.th + (o.back ? Math.PI : 0) }); }
  // brick veneer over [v0,v1], leaving rectangular holes {u0,u1,v0,v1} open (windows, murals, doors)
  veneer(mat, v0, v1, w0, w1, holes = []) {
    const vs = [...new Set([v0, v1, ...holes.flatMap((h) => [h.v0, h.v1])])].filter((v) => v >= v0 - 1e-6 && v <= v1 + 1e-6).sort((a, b) => a - b);
    for (let i = 0; i < vs.length - 1; i++) {
      const a = vs[i], b = vs[i + 1];
      if (b - a < 1e-4) continue;
      const cut = holes.filter((h) => h.v0 <= a + 1e-4 && h.v1 >= b - 1e-4).sort((p, q) => p.u0 - q.u0);
      let u = 0;
      for (const h of cut) { if (h.u0 > u + 1e-4) this.box(mat, u, h.u0, a, b, w0, w1); u = Math.max(u, h.u1); }
      if (u < this.len - 1e-4) this.box(mat, u, this.len, a, b, w0, w1);
    }
  }
}

// ------------------------------------------------------------------------------------------------------
// the mural: a stylised painted market scene (drawn once, mapped onto painted brick so the courses show through)
// ------------------------------------------------------------------------------------------------------
function drawMural(c, w, h) {
  const R = rng(77);
  let g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#79c4e4'); g.addColorStop(0.5, '#d6efe6'); g.addColorStop(1, '#fbe8b4');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // sun + rays
  const sx = w * 0.84, sy = h * 0.27;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, a2 = a + 0.1;
    c.fillStyle = i % 2 ? 'rgba(255,238,160,0.34)' : 'rgba(255,214,110,0.22)';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(a) * 900, sy + Math.sin(a) * 900); c.lineTo(sx + Math.cos(a2) * 900, sy + Math.sin(a2) * 900); c.closePath(); c.fill();
  }
  g = c.createRadialGradient(sx, sy, 8, sx, sy, 96); g.addColorStop(0, '#fffbd0'); g.addColorStop(0.6, '#ffd75a'); g.addColorStop(1, '#f8a828');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, 92, 0, 7); c.fill();
  // clouds
  const cloud = (x, y, s) => { c.fillStyle = 'rgba(255,255,255,0.9)'; for (const [dx, dy, r] of [[0, 0, 42], [46, -16, 52], [96, 2, 44], [50, 14, 46], [-30, 12, 30], [130, 14, 30]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, 7); c.fill(); } };
  cloud(220, 118, 1.15); cloud(820, 78, 0.9); cloud(1320, 132, 1.05);
  // hills
  const hill = (base, amp, col, seed) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 12) c.lineTo(x, base + Math.sin(x * 0.0042 + seed) * amp + Math.sin(x * 0.0117 + seed * 2.3) * amp * 0.38); c.lineTo(w, h); c.closePath(); c.fill(); };
  hill(h * 0.5, 30, '#9cc86a', 1); hill(h * 0.6, 26, '#6faa4c', 2.6); hill(h * 0.71, 20, '#478a3c', 4.1);
  // crop rows
  c.strokeStyle = 'rgba(20,70,20,0.35)'; c.lineWidth = 3;
  for (let i = 0; i < 46; i++) { const x = (i / 45) * w; c.beginPath(); c.moveTo(w * 0.5 + (x - w * 0.5) * 0.18, h * 0.72); c.lineTo(x * 1.06 - w * 0.03, h); c.stroke(); }
  // produce
  const orb = (x, y, r, a, b, d) => { const gg = c.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.06, x, y, r * 1.06); gg.addColorStop(0, a); gg.addColorStop(0.55, b); gg.addColorStop(1, d); c.fillStyle = gg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const shadow = (x, y, rx, ry) => { c.fillStyle = 'rgba(15,45,15,0.3)'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };
  const leaf = (x, y, len, ang, c1, c2) => { c.save(); c.translate(x, y); c.rotate(ang); const gg = c.createLinearGradient(0, 0, len, 0); gg.addColorStop(0, c2); gg.addColorStop(1, c1); c.fillStyle = gg; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0); c.fill(); c.strokeStyle = 'rgba(0,60,0,0.4)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.9, 0); c.stroke(); c.restore(); };
  const gloss = (x, y, r) => { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.2, r * 0.11, -0.6, 0, 7); c.fill(); };
  const items = {
    tomato(x, y, r) { shadow(x + 6, y + r * 0.95, r * 0.95, r * 0.22); orb(x, y, r, '#ff8a76', '#e02a1e', '#780c0c'); for (let i = 0; i < 5; i++) leaf(x, y - r * 0.86, r * 0.34, -Math.PI / 2 + (i - 2) * 0.7, '#5bbb3a', '#2a7a20'); gloss(x, y, r); },
    orange(x, y, r) { shadow(x + 6, y + r * 0.95, r * 0.95, r * 0.22); orb(x, y, r, '#ffc86e', '#f28a12', '#9e4600'); c.fillStyle = 'rgba(150,70,0,0.28)'; for (let i = 0; i < 70; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r * 0.92; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2, 0, 7); c.fill(); } leaf(x + 4, y - r * 0.94, r * 0.5, -0.4, '#5bbb3a', '#2a7a20'); gloss(x, y, r); },
    apple(x, y, r) { shadow(x + 6, y + r * 0.95, r * 0.95, r * 0.22); orb(x, y, r, '#ff9a80', '#c81c1c', '#6a0808'); c.fillStyle = 'rgba(255,220,90,0.22)'; c.beginPath(); c.ellipse(x + r * 0.35, y + r * 0.1, r * 0.3, r * 0.55, 0.3, 0, 7); c.fill(); c.strokeStyle = '#5a3a1a'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - r * 0.8); c.quadraticCurveTo(x + 6, y - r * 1.15, x + 18, y - r * 1.25); c.stroke(); leaf(x + 10, y - r * 1.02, r * 0.6, -0.5, '#6cc24a', '#2a7a20'); gloss(x, y, r); },
    lemon(x, y, r) { shadow(x + 6, y + r * 0.8, r * 1.2, r * 0.2); c.save(); c.translate(x, y); c.rotate(-0.35); c.scale(1.32, 1, 1); orb(0, 0, r, '#fffbb0', '#f2d21a', '#a08600'); c.restore(); c.fillStyle = '#c8aa10'; c.beginPath(); c.arc(x - r * 1.28, y + r * 0.44, 7, 0, 7); c.arc(x + r * 1.24, y - r * 0.5, 7, 0, 7); c.fill(); leaf(x + 6, y - r * 0.9, r * 0.6, -0.6, '#6cc24a', '#2a7a20'); },
    carrot(x, y, s) { shadow(x + 10, y + 118 * s, 46 * s, 10 * s); for (let i = 0; i < 5; i++) leaf(x, y - 116 * s, 110 * s, -Math.PI / 2 + (i - 2) * 0.32, '#6cc24a', '#2a7a20'); const gg = c.createLinearGradient(x - 32 * s, 0, x + 32 * s, 0); gg.addColorStop(0, '#ff9a3a'); gg.addColorStop(0.5, '#f27a10'); gg.addColorStop(1, '#b84a00'); c.fillStyle = gg; c.beginPath(); c.moveTo(x - 32 * s, y - 118 * s); c.quadraticCurveTo(x, y - 136 * s, x + 32 * s, y - 118 * s); c.lineTo(x + 5 * s, y + 124 * s); c.quadraticCurveTo(x, y + 132 * s, x - 5 * s, y + 124 * s); c.closePath(); c.fill(); c.strokeStyle = 'rgba(140,60,0,0.4)'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { const yy = y - 80 * s + i * 24 * s; c.beginPath(); c.moveTo(x - (26 - i * 2.6) * s, yy); c.lineTo(x + (8 - i * 0.6) * s, yy + 6 * s); c.stroke(); } },
    eggplant(x, y, s) { shadow(x + 10, y + 108 * s, 66 * s, 12 * s); const gg = c.createLinearGradient(x - 62 * s, 0, x + 62 * s, 0); gg.addColorStop(0, '#7a4aaa'); gg.addColorStop(0.45, '#3a1a6a'); gg.addColorStop(1, '#1a0838'); c.fillStyle = gg; c.beginPath(); c.moveTo(x - 20 * s, y - 100 * s); c.bezierCurveTo(x - 90 * s, y - 20 * s, x - 78 * s, y + 104 * s, x, y + 108 * s); c.bezierCurveTo(x + 78 * s, y + 104 * s, x + 84 * s, y - 20 * s, x + 20 * s, y - 100 * s); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(x - 34 * s, y + 6 * s, 9 * s, 54 * s, 0.1, 0, 7); c.fill(); for (let i = 0; i < 6; i++) leaf(x, y - 98 * s, 58 * s, -Math.PI / 2 + (i - 2.5) * 0.55, '#5bbb3a', '#2a7a20'); c.strokeStyle = '#3a7a20'; c.lineWidth = 9 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - 100 * s); c.lineTo(x + 8 * s, y - 138 * s); c.stroke(); },
    corn(x, y, s) { shadow(x + 6, y + 110 * s, 52 * s, 10 * s); leaf(x, y + 30 * s, 120 * s, Math.PI / 2 + 0.55, '#7cd04a', '#3a8a20'); leaf(x, y + 30 * s, 120 * s, Math.PI / 2 - 0.55, '#6cc23a', '#2a7a20'); const gg = c.createLinearGradient(x - 40 * s, 0, x + 40 * s, 0); gg.addColorStop(0, '#ffe060'); gg.addColorStop(0.5, '#f2b81a'); gg.addColorStop(1, '#b07a00'); c.fillStyle = gg; c.beginPath(); c.ellipse(x, y - 30 * s, 40 * s, 92 * s, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(150,90,0,0.4)'; c.lineWidth = 2; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(x + i * 6 * s, y - 118 * s); c.lineTo(x + i * 6.6 * s, y + 56 * s); c.stroke(); } for (let j = 0; j < 16; j++) { c.beginPath(); c.moveTo(x - 38 * s, y - 116 * s + j * 11 * s); c.lineTo(x + 38 * s, y - 116 * s + j * 11 * s); c.stroke(); } },
    lettuce(x, y, r) { shadow(x + 8, y + r * 0.86, r * 1.05, r * 0.2); const cols = ['#2f7a2a', '#3f9a34', '#58b840', '#7fd45a', '#a6e884']; for (let i = 0; i < 5; i++) { const rr = r * (1 - i * 0.17); orb(x, y - i * 6, rr, cols[Math.min(4, i + 1)], cols[i], cols[Math.max(0, i - 1)]); } c.strokeStyle = 'rgba(20,80,20,0.4)'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.36; c.beginPath(); c.moveTo(x, y + r * 0.55); c.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); c.stroke(); } },
    pear(x, y, r) { shadow(x + 6, y + r * 1.2, r * 0.95, r * 0.2); orb(x, y + r * 0.3, r * 0.92, '#f2f8a0', '#a8c83a', '#5a7a10'); orb(x, y - r * 0.62, r * 0.55, '#f2f8a0', '#a8c83a', '#6a8a18'); c.strokeStyle = '#5a3a1a'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - r * 1.12); c.quadraticCurveTo(x + 4, y - r * 1.4, x + 14, y - r * 1.5); c.stroke(); leaf(x + 6, y - r * 1.1, r * 0.6, -0.5, '#6cc24a', '#2a7a20'); },
    pepper(x, y, r) { shadow(x + 6, y + r * 0.95, r, r * 0.2); const gg = c.createLinearGradient(x - r, 0, x + r, 0); gg.addColorStop(0, '#ffd84a'); gg.addColorStop(0.5, '#f0a808'); gg.addColorStop(1, '#a86a00'); c.fillStyle = gg; c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.8); c.bezierCurveTo(x - r * 1.3, y - r * 0.6, x - r * 1.1, y + r * 0.9, x - r * 0.3, y + r * 0.95); c.bezierCurveTo(x, y + r * 1.05, x + r * 0.3, y + r * 1.0, x + r * 0.5, y + r * 0.9); c.bezierCurveTo(x + r * 1.2, y + r * 0.8, x + r * 1.3, y - r * 0.6, x + r * 0.5, y - r * 0.8); c.closePath(); c.fill(); gloss(x, y, r); c.strokeStyle = '#3a8a20'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - r * 0.85); c.lineTo(x + 6, y - r * 1.2); c.stroke(); },
  };
  const row = [['lettuce', 130, 448, 108], ['tomato', 300, 468, 78], ['carrot', 452, 438, 0.95], ['orange', 620, 470, 74], ['eggplant', 770, 448, 0.9], ['apple', 940, 470, 80], ['corn', 1090, 442, 0.95], ['lemon', 1250, 486, 56], ['pepper', 1370, 470, 72], ['lettuce', 1520, 450, 96], ['pear', 1680, 462, 66], ['tomato', 1800, 474, 68], ['carrot', 1900, 446, 0.8], ['orange', 1990, 486, 50]];
  for (const [k, x, y, s] of row.sort((a, b) => a[2] - b[2])) items[k](x, y, s);
  // hand-lettered title
  c.save(); c.translate(70, 128); c.rotate(-0.03);
  c.font = 'italic 900 128px "Trebuchet MS", "Arial Black", Impact, sans-serif'; c.textBaseline = 'alphabetic';
  const title = 'FRESH · LOCAL · DAILY';
  c.lineJoin = 'round'; c.lineWidth = 26; c.strokeStyle = 'rgba(20,70,30,0.9)'; c.strokeText(title, 8, 9); c.fillStyle = 'rgba(20,70,30,0.9)'; c.fillText(title, 8, 9);
  c.lineWidth = 18; c.strokeStyle = '#ffffff'; c.strokeText(title, 0, 0);
  const tg = c.createLinearGradient(0, -100, 0, 10); tg.addColorStop(0, '#ffb43a'); tg.addColorStop(1, '#e8482a'); c.fillStyle = tg; c.fillText(title, 0, 0);
  c.restore();
}

// ------------------------------------------------------------------------------------------------------
export function buildShopExteriors(scene, glow, shops) {
  const out = { update: null };
  const par = new THREE.Group(); par.name = 'shopExteriors'; scene.add(par);
  const K = new Kit();
  const R = rng(3131);

  // materials (outdoor: no interior light volume, so the city's far-field sun shadows apply)
  const brick = pm('brick', { color: 0xa24a34, col2: 0x6a2c1e, wet: 1 });
  const stone = pm('concrete', { color: 0xcdc8ba, wet: 1 });
  const granite = pm('concrete', { color: 0x484b50, wet: 1 });
  const bronze = pm('metal', { color: 0x25282b, p: [0, 60, 0, 0], rough: 0.42 });
  const galv = pm('metal', { color: 0xaeb2b6, p: [1, 50, 0, 0], rough: 0.36 });
  const steel = pm('metal', { color: 0xd2d5d9, p: [1, 130, 0, 0], rough: 0.2 });
  const chrome = pm('plain', { color: 0xffffff, metal: 1, rough: 0.07 });
  const rubber = pm('rubber', { color: 0x111213 });
  const roofM = pm('concrete', { color: 0x6c6f72, wet: 1 });
  const winGlass = pm('plain', { color: 0x0b1620, rough: 0.05, metal: 0.35, physical: true, clearcoat: 1, ccRough: 0.02, env: 1.7, emissive: 0xffc98a, emissiveI: 0 });
  const paneGlass = pm('plain', { color: 0x12222e, rough: 0.03, glass: true, opacity: 0.2, env: 2.2, side: THREE.DoubleSide });
  const winBack = pm('plain', { color: 0x0a0d10, rough: 0.9, emissive: 0xffc07a, emissiveI: 0 });
  const blindM = pm('fabric', { color: 0xd8d0be, emissive: 0xffc98a, emissiveI: 0 });
  const bulb = pm('plain', { color: 0x050505, rough: 0.4, emissive: 0xffe2b0, emissiveI: 0 });
  const neonTeal = pm('plain', { color: 0x050807, rough: 0.3, emissive: 0x38f0d8, emissiveI: 2 });
  const neonPink = pm('plain', { color: 0x080506, rough: 0.3, emissive: 0xff3c8a, emissiveI: 2 });
  const blockGlass = pm('plain', { color: 0x9cc6cc, rough: 0.12, metal: 0.1, emissive: 0xffe2b0, emissiveI: 0, tag: 'blocks' });
  const exitSign = pm('plain', { color: 0x050505, rough: 0.4, emissive: 0x40ff70, emissiveI: 2.5 });
  const doorGreen = pm('paint', { color: 0x2c4a3a, rough: 0.5, wet: 1 });
  const doorGrey = pm('paint', { color: 0x565b60, rough: 0.5, wet: 1 });
  const yellow = pm('paint', { color: 0xe8b81c, rough: 0.5 });
  const redEnamel = pm('paint', { color: 0xc0281e, rough: 0.18, physical: true, clearcoat: 0.8, ccRough: 0.06, wet: 1 });
  const creamEnamel = pm('paint', { color: 0xf0e6cc, rough: 0.2, physical: true, clearcoat: 0.7, ccRough: 0.06, wet: 1 });
  const tealEnamel = pm('paint', { color: 0x2f9a92, rough: 0.2, physical: true, clearcoat: 0.6, ccRough: 0.08 });
  const dumpGreen = pm('paint', { color: 0x24513a, rough: 0.55, wet: 1 });
  const emitters = [];

  const muralTex = canvasTex(2048, 494, drawMural, { aniso: 8 });
  const mural = pm('brick', { color: 0xffffff, col2: 0xffffff, p: [1, 0, 0, 0], wet: 0.3, tag: 'grocery-mural' });
  mural.map = muralTex;

  // ------------------------------------------------------------------ reusable pieces
  const spans = (len, skip = []) => {                                   // [0,len] minus the skipped [a,b] ranges
    const out = []; let u = 0;
    for (const [a, b] of [...skip].sort((p, q) => p[0] - q[0])) { if (a > u) out.push([u, a]); u = Math.max(u, b); }
    if (u < len) out.push([u, len]);
    return out;
  };
  const plinth = (W, top = 0.62, mat = granite, skip = []) => {
    for (const [a, b] of spans(W.len, skip)) { W.box(mat, a, b, -0.06, top, 0, 0.09); W.box(stone, a - 0.02, b + 0.02, top - 0.05, top + 0.03, 0, 0.13); }
  };
  const cornice = (W, H) => {
    W.box(stone, -0.28, W.len + 0.28, H - 0.52, H - 0.44, 0, 0.09);
    W.box(stone, -0.28, W.len + 0.28, H - 0.44, H - 0.32, 0, 0.14);
    for (let u = -0.2; u < W.len + 0.1; u += 0.26) W.box(stone, u, u + 0.14, H - 0.32, H - 0.2, 0.1, 0.17);      // dentils
    W.box(stone, -0.28, W.len + 0.28, H - 0.2, H - 0.1, 0, 0.23);
    W.box(stone, -0.28, W.len + 0.28, H - 0.1, H, 0, 0.29);
  };
  const belt = (W, v, mat = stone) => { W.box(mat, 0, W.len, v, v + 0.13, VT, VT + 0.06); W.box(mat, 0, W.len, v + 0.13, v + 0.17, VT, VT + 0.09); };
  const pilaster = (W, u, wid, v0, v1, depth = 0.2) => {
    W.box(brick, u - wid / 2, u + wid / 2, v0, v1, VT, depth);
    W.box(stone, u - wid / 2 - 0.04, u + wid / 2 + 0.04, v0 - 0.02, v0 + 0.24, VT, depth + 0.04);
    W.box(stone, u - wid / 2 - 0.05, u + wid / 2 + 0.05, v1 - 0.2, v1, VT, depth + 0.06);
    W.box(stone, u - wid / 2 - 0.02, u + wid / 2 + 0.02, v1 - 0.27, v1 - 0.2, VT, depth + 0.03);
  };
  const windowUnit = (W, u0, u1, v0, v1, o = {}) => {
    const fw = 0.05;
    W.box(stone, u0 - 0.07, u1 + 0.07, v0 - 0.06, v0 + 0.02, 0, 0.14);                  // sill
    W.box(stone, u0 - 0.1, u1 + 0.1, v1, v1 + 0.14, 0, 0.1);                            // lintel
    W.box(stone, u0 - 0.05, u1 + 0.05, v1 + 0.14, v1 + 0.2, 0, 0.115);
    W.box(bronze, u0, u1, v0, v0 + fw, 0.004, 0.05); W.box(bronze, u0, u1, v1 - fw, v1, 0.004, 0.05);      // frame
    W.box(bronze, u0, u0 + fw, v0, v1, 0.004, 0.05); W.box(bronze, u1 - fw, u1, v0, v1, 0.004, 0.05);
    W.box(bronze, (u0 + u1) / 2 - 0.02, (u0 + u1) / 2 + 0.02, v0, v1, 0.004, 0.045);                       // mullion
    W.box(bronze, u0, u1, v0 + (v1 - v0) * 0.66 - 0.02, v0 + (v1 - v0) * 0.66 + 0.02, 0.004, 0.045);      // transom
    W.plane(winBack, u0 + fw, u1 - fw, v0 + fw, v1 - fw, 0.006);
    const bf = [0, 0.18, 0.34, 0.52][Math.floor(R() * 4)];
    if (bf > 0) W.plane(blindM, u0 + fw, u1 - fw, v1 - fw - (v1 - v0 - 2 * fw) * bf, v1 - fw, 0.009);
    if (bf > 0) W.box(bronze, u0 + fw, u1 - fw, v1 - fw - (v1 - v0 - 2 * fw) * bf - 0.02, v1 - fw - (v1 - v0 - 2 * fw) * bf, 0.009, 0.02);   // blind bar
    W.plane(paneGlass, u0 + fw, u1 - fw, v0 + fw, v1 - fw, 0.012);
    if (o.grille) for (let i = 1; i < 4; i++) W.box(bronze, u0 + fw + ((u1 - u0 - 2 * fw) * i) / 4 - 0.008, u0 + fw + ((u1 - u0 - 2 * fw) * i) / 4 + 0.008, v0 + fw, v1 - fw, 0.05, 0.065);
  };
  const downspout = (W, u, v1) => {
    W.box(galv, u - 0.13, u + 0.13, v1 - 0.62, v1 - 0.26, VT, 0.3, { r: 0.01 });                  // rainwater head
    W.box(galv, u - 0.1, u + 0.1, v1 - 0.26, v1 - 0.14, VT, 0.26);
    W.cyl(galv, 0.042, 0.14, v1 - 0.62, u, 0.115, { seg: 12 });
    for (let v = 0.5; v < v1 - 0.7; v += 1.15) W.cyl(galv, 0.05, v, v + 0.035, u, 0.115, { seg: 12 });   // clamps
    for (let v = 0.5; v < v1 - 0.7; v += 1.15) W.box(galv, u - 0.02, u + 0.02, v, v + 0.03, VT, 0.11);
    W.tube(galv, [[u, 0.16, 0.115], [u, 0.08, 0.14], [u, 0.05, 0.3], [u, 0.05, 0.52]], 0.042, { seg: 8, radial: 10 });   // shoe kicks the water out
    W.box(stone, u - 0.22, u + 0.22, -0.04, 0.03, 0.14, 0.7);                               // splash block
  };
  const wallLamp = (W, u, v, on = 1) => {                                                       // gooseneck barn light
    W.box(bronze, u - 0.07, u + 0.07, v - 0.07, v + 0.07, VT, VT + 0.05, { r: 0.01 });
    W.tube(bronze, [[u, v, VT + 0.04], [u, v, 0.3], [u, v + 0.14, 0.5], [u, v + 0.05, 0.66]], 0.016, { seg: 14, radial: 6 });
    W.lathe(pm('metal', { color: 0x1b1d20, p: [0, 60, 0, 0], rough: 0.4, side: THREE.DoubleSide }), [[0.29, 0.0], [0.28, 0.03], [0.24, 0.09], [0.15, 0.14], [0.05, 0.17], [0, 0.175]], u, v - 0.13, 0.7, { seg: 20 });
    W.sph(bulb, 0.055, u, v - 0.06, 0.7);
    const [x, z] = W.P(u, 0.75);
    const e = LightPool.add({ pos: new THREE.Vector3(x, v - 0.25, z), color: 0xffe2b8, intensity: 60 * on, distance: 9, on: false, priority: 0.85 });
    emitters.push(e);
  };
  const meter = (W, u, v) => {                                                                   // electric meter + disconnect on the wall, conduit up to the roof
    W.box(doorGrey, u - 0.28, u + 0.28, v, v + 0.78, VT, VT + 0.2, { r: 0.012 });
    W.box(doorGrey, u - 0.25, u + 0.25, v + 0.03, v + 0.75, VT + 0.2, VT + 0.215);
    W.cyl(pm('plain', { color: 0xd8dde0, rough: 0.12, glass: true, opacity: 0.25, side: THREE.DoubleSide }), 0.13, v + 0.28, v + 0.58, u, VT + 0.3, { seg: 16 });
    W.cyl(chrome, 0.15, v + 0.26, v + 0.28, u, VT + 0.3, { seg: 16 }); W.cyl(chrome, 0.15, v + 0.58, v + 0.6, u, VT + 0.3, { seg: 16 });
    W.box(bronze, u - 0.03, u + 0.03, v + 0.8, v + 0.84, VT, VT + 0.06);
    W.tube(galv, [[u, v + 0.78, VT + 0.06], [u, v + 1.2, VT + 0.06], [u, v + 2.6, VT + 0.06], [u, v + 3.4, VT + 0.06]], 0.02, { seg: 6, radial: 8 });
    for (let vv = v + 1.1; vv < v + 3.3; vv += 0.75) W.box(galv, u - 0.03, u + 0.03, vv, vv + 0.025, VT, VT + 0.08);
  };
  const louver = (W, u0, u1, v0, v1) => {
    W.box(galv, u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, VT, VT + 0.05);
    W.box(pm('plain', { color: 0x060708, rough: 0.9 }), u0, u1, v0, v1, VT + 0.05, VT + 0.06);
    const n = Math.max(3, Math.round((v1 - v0) / 0.075));
    for (let i = 0; i < n; i++) { const v = v0 + 0.03 + ((v1 - v0 - 0.06) * i) / (n - 1); W.box(galv, u0, u1, v - 0.012, v + 0.012, VT + 0.06, VT + 0.12, { rx: 0.5 }); }
  };
  const steelDoor = (W, u, o = {}) => {
    const wd = o.w ?? 1.0, ht = o.h ?? 2.15, leaf = o.mat ?? doorGrey;
    W.box(bronze, u - wd / 2 - 0.08, u + wd / 2 + 0.08, 0, ht + 0.08, 0, 0.08);                    // frame
    W.box(leaf, u - wd / 2, u + wd / 2, 0.03, ht, 0.02, 0.07, { r: 0.005 });
    W.box(steel, u - wd / 2 + 0.02, u + wd / 2 - 0.02, 0.04, 0.32, 0.07, 0.075);                    // kick plate
    W.box(bronze, u - wd / 2 + 0.16, u + wd / 2 - 0.16, ht - 0.62, ht - 0.2, 0.07, 0.078);          // vision panel
    W.plane(winGlass, u - wd / 2 + 0.18, u + wd / 2 - 0.18, ht - 0.6, ht - 0.22, 0.079);
    W.box(chrome, u + wd / 2 - 0.18, u + wd / 2 - 0.1, 1.0, 1.12, 0.07, 0.14, { r: 0.01 });        // lever
    W.box(steel, u - wd / 2 + 0.1, u + wd / 2 - 0.1, 0.98, 1.04, 0.07, 0.12);                       // push bar
    W.box(doorGrey, u + wd / 2 - 0.5, u + wd / 2 - 0.05, ht + 0.1, ht + 0.2, 0.05, 0.16);          // closer
    W.box(stone, u - wd / 2 - 0.3, u + wd / 2 + 0.3, -0.06, 0.06, 0.05, 0.6);                       // threshold slab
    W.box(exitSign, u - 0.24, u + 0.24, ht + 0.28, ht + 0.42, 0.04, 0.09);
  };

  // parapets, coping and rooftop plant (world coordinates)
  const parapet = (x0, x1, z0, z1, H, faceMat, hgt = 0.7) => {
    const y = H + 0.4, o = 0.3, t = 0.25;
    K.box(faceMat, x1 - x0 + 2 * o, hgt, t, (x0 + x1) / 2, y, z0 - o + t / 2);
    K.box(faceMat, x1 - x0 + 2 * o, hgt, t, (x0 + x1) / 2, y, z1 + o - t / 2);
    K.box(faceMat, t, hgt, z1 - z0 + 2 * o - 2 * t, x0 - o + t / 2, y, (z0 + z1) / 2);
    K.box(faceMat, t, hgt, z1 - z0 + 2 * o - 2 * t, x1 + o - t / 2, y, (z0 + z1) / 2);
    const cap = (w, d, x, z) => K.box(stone, w, 0.07, d, x, y + hgt, z);
    cap(x1 - x0 + 2 * o + 0.06, t + 0.08, (x0 + x1) / 2, z0 - o + t / 2); cap(x1 - x0 + 2 * o + 0.06, t + 0.08, (x0 + x1) / 2, z1 + o - t / 2);
    cap(t + 0.08, z1 - z0 + 2 * o - 2 * t, x0 - o + t / 2, (z0 + z1) / 2); cap(t + 0.08, z1 - z0 + 2 * o - 2 * t, x1 + o - t / 2, (z0 + z1) / 2);
  };
  const hvac = (x, y, z, ry = 0, w = 2.5, d = 1.25, h = 1.1) => {
    const L = (u, v, ww, dd, hh, mat, o = {}) => { const c = Math.cos(ry), s = Math.sin(ry); return K.box(mat, ww, hh, dd, x + u * c + v * s, y + (o.y ?? 0), z - u * s + v * c, { ry, ...o }); };
    L(0, 0, w + 0.24, d + 0.24, 0.3, roofM);                                                      // curb
    L(0, 0, w, d, h, galv, { y: y + 0.3 - y, r: 0.03 });
    for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) L(0, sd * (d / 2 + 0.012), w - 0.3, 0.02, 0.02, bronze, { y: 0.44 + i * 0.09 });     // louvre slats down the long sides
    for (const fx of [-w / 4, w / 4]) {
      L(fx, 0, 0.98, 0.98, 0.08, bronze, { y: 0.3 + h, r: 0.02 });
      L(fx, 0, 0.8, 0.8, 0.02, pm('plain', { color: 0x040405, rough: 0.9 }), { y: 0.3 + h + 0.08 });
      for (let i = 0; i < 6; i++) L(fx, 0, 0.9, 0.02, 0.02, chrome, { y: 0.3 + h + 0.1, ry: ry + (i * Math.PI) / 6 });
      L(fx, 0, 0.16, 0.16, 0.06, bronze, { y: 0.3 + h + 0.1 });
    }
    L(w / 2 + 0.06, 0, 0.12, 0.5, 0.6, doorGrey, { y: 0.5 });                                     // disconnect box
    L(-w / 2 + 0.3, d / 2 + 0.005, 0.5, 0.014, 0.7, doorGrey, { y: 0.4 });                        // service panel
  };
  const vent = (x, y, z, r = 0.11, hgt = 0.6) => {
    K.cyl(galv, r, r, hgt, x, y, z, { seg: 10 });
    K.cyl(galv, r * 1.9, r * 0.5, 0.14, x, y + hgt, z, { seg: 12 });
    K.cyl(bronze, r * 1.3, r * 1.3, 0.05, x, y + 0.04, z, { seg: 10 });
  };

  // =====================================================================================================
  // FRESHMART
  // =====================================================================================================
  {
    const H = 6.0, x0 = 18, x1 = 64, z0 = 12, z1 = 42;
    // ---- west wall (faces the cross street) ----
    const Wl = new Wall(K, x0, z0, -1, 0, z1 - z0);
    const wins = [[1.7, 3.3], [4.5, 6.1], [23.9, 25.5], [26.7, 28.3]];
    const holes = wins.map(([a, b]) => ({ u0: a, u1: b, v0: 1.15, v1: 3.05 }));
    holes.push({ u0: 8.1, u1: 21.9, v0: 0.95, v1: 4.25 });
    Wl.veneer(brick, 0.62, H - 0.5, 0, VT, holes);
    plinth(Wl); belt(Wl, 4.3); cornice(Wl, H);
    for (const [u, wid] of [[0.4, 0.8], [7.3, 0.6], [22.7, 0.6], [29.6, 0.8]]) pilaster(Wl, u, wid, 0.62, H - 0.5, 0.2);
    for (const [a, b] of wins) windowUnit(Wl, a, b, 1.15, 3.05);
    // mural in a stone frame
    Wl.plane(mural, 8.1, 21.9, 0.95, 4.25, VT - 0.002);
    Wl.box(stone, 7.98, 22.02, 0.9, 0.98, 0, VT + 0.06); Wl.box(stone, 7.98, 22.02, 4.22, 4.3, 0, VT + 0.06);
    Wl.box(stone, 7.98, 8.1, 0.9, 4.3, 0, VT + 0.06); Wl.box(stone, 21.9, 22.02, 0.9, 4.3, 0, VT + 0.06);
    // diaper pattern of stone lozenges in the frieze
    for (let u = 1.2; u < Wl.len - 0.6; u += 0.62) Wl.box(stone, u - 0.07, u + 0.07, 5.0, 5.14, VT, VT + 0.035, { rz: Math.PI / 4 });
    for (const u of [10.2, 15, 19.8]) wallLamp(Wl, u, 4.8);
    downspout(Wl, 0.95, H - 0.5); downspout(Wl, 29.05, H - 0.5);
    addCollider(x0 - 0.3, x0, z0, z1, 0, H + 0.4, 0);
    // ---- east wall (faces the car park) ----
    const We = new Wall(K, x1, z1, 1, 0, z1 - z0);
    const eholes = [{ u0: 2.4, u1: 3.6, v0: 0, v1: 2.35 }, { u0: 12.4, u1: 16.0, v0: 0, v1: 3.35 }, { u0: 20.0, u1: 22.4, v0: 3.4, v1: 4.5 }, { u0: 24.6, u1: 27.0, v0: 3.4, v1: 4.5 }];
    We.veneer(brick, 0.62, H - 0.5, 0, VT, eholes);
    plinth(We, 0.62, granite, [[2.3, 3.7], [12.2, 16.2]]); cornice(We, H); belt(We, 4.6);
    for (const u of [0.4, 5.2, 9.8, 18.2, 29.6]) pilaster(We, u, u === 0.4 || u === 29.6 ? 0.8 : 0.6, 0.62, H - 0.5, 0.2);
    steelDoor(We, 3.0, { mat: doorGreen });
    // loading dock: roll-up door with hood, guides, bumpers and bollards
    { const a = 12.4, b = 16.0;
      for (let v = 0.05; v < 3.3; v += 0.11) We.box(galv, a, b, v, v + 0.095, 0.01, 0.045);
      We.box(bronze, a - 0.14, a, 0, 3.5, 0, 0.1); We.box(bronze, b, b + 0.14, 0, 3.5, 0, 0.1);
      We.box(bronze, a - 0.14, b + 0.14, 3.35, 3.65, 0, 0.32, { r: 0.02 });
      We.box(rubber, a + 0.2, a + 0.6, 0.9, 1.5, 0.05, 0.22); We.box(rubber, b - 0.6, b - 0.2, 0.9, 1.5, 0.05, 0.22);
      We.box(stone, a - 0.3, b + 0.3, -0.06, 0.05, 0.05, 1.0);
      for (const u of [a - 0.2, (a + b) / 2, b + 0.2]) { We.cyl(yellow, 0.1, 0, 1.0, u, 1.5, { seg: 12 }); We.cyl(yellow, 0.105, 0.98, 1.02, u, 1.5, { seg: 12 }); }
      wallLamp(We, (a + b) / 2, 4.05);
    }
    louver(We, 20.0, 22.4, 3.4, 4.5); louver(We, 24.6, 27.0, 3.4, 4.5);
    meter(We, 7.5, 1.0);
    downspout(We, 0.95, H - 0.5); downspout(We, 29.05, H - 0.5);
    wallLamp(We, 3.0, 3.1); wallLamp(We, 28.4, 4.6);
    addCollider(x1, x1 + 0.3, z0, z1, 0, H + 0.4, 0);
    // ---- back wall (faces the car park to the south) ----
    const Wb = new Wall(K, x0, z1, 0, 1, x1 - x0);
    const bholes = [{ u0: 8.4, u1: 9.6, v0: 0, v1: 2.35 }, { u0: 31.4, u1: 32.6, v0: 0, v1: 2.35 }];
    Wb.veneer(brick, 0.62, H - 0.5, 0, VT, bholes);
    plinth(Wb, 0.62, granite, [[8.3, 9.7], [31.3, 32.7]]); cornice(Wb, H); belt(Wb, 4.6);
    for (let u = 0.4; u < Wb.len; u += 5.75) pilaster(Wb, u, u < 1 || u > Wb.len - 1 ? 0.8 : 0.6, 0.62, H - 0.5, 0.2);
    pilaster(Wb, Wb.len - 0.4, 0.8, 0.62, H - 0.5, 0.2);
    steelDoor(Wb, 9.0, { mat: doorGrey }); steelDoor(Wb, 32.0, { mat: doorGreen });
    wallLamp(Wb, 9.0, 3.2); wallLamp(Wb, 32.0, 3.2); wallLamp(Wb, 15.0, 4.3); wallLamp(Wb, 26.0, 4.3); wallLamp(Wb, 38.0, 4.3);
    meter(Wb, 14.0, 1.0); meter(Wb, 15.1, 1.0);
    louver(Wb, 18.8, 22.2, 3.3, 4.4); louver(Wb, 24.4, 27.8, 3.3, 4.4); louver(Wb, 35.8, 39.7, 3.3, 4.4);
    downspout(Wb, 1.05, H - 0.5); downspout(Wb, Wb.len - 1.05, H - 0.5);
    // dumpster enclosure by the back door
    { const dx = 22.0, dz = z1 + 1.6;
      K.box(dumpGreen, 2.1, 1.2, 1.2, dx, 0.12, dz, { r: 0.03 });
      K.box(pm('plastic', { color: 0x141516, rough: 0.6 }), 2.2, 0.09, 1.3, dx, 1.32, dz, { r: 0.03, ry: 0 });
      for (const sx of [-0.85, 0.85]) for (const sz of [-0.5, 0.5]) K.cyl(rubber, 0.07, 0.07, 0.12, dx + sx, 0, dz + sz, { seg: 10 });
      K.box(galv, 2.16, 0.05, 0.05, dx, 0.78, dz - 0.63);
      addCollider(dx - 1.1, dx + 1.1, dz - 0.65, dz + 0.65, 0, 1.4, 0);
    }
    addCollider(x0, x1, z1, z1 + 0.3, 0, H + 0.4, 0);
    // ---- front: brick piers beside the glazing, stone bulkhead under the glass, fascia panelling ----
    const Wf = new Wall(K, x1, z0, 0, -1, x1 - x0);
    Wf.box(brick, 0, 2.0, 0.62, H - 0.6, 0, VT); Wf.box(brick, Wf.len - 2.0, Wf.len, 0.62, H - 0.6, 0, VT);
    plinth(Wf); cornice(Wf, H);
    pilaster(Wf, 0.35, 0.7, 0.62, 4.3, 0.2); pilaster(Wf, Wf.len - 0.35, 0.7, 0.62, 4.3, 0.2); pilaster(Wf, 2.05, 0.3, 0.62, 3.6, 0.14); pilaster(Wf, Wf.len - 2.05, 0.3, 0.62, 3.6, 0.14);
    const bulk = pm('tile', { color: 0x3a3e42, col2: 0x1c1d20, p: [0.3, 0.3, 0.006, 0], wet: 1 });
    Wf.box(bulk, 2.0, 21.0, 0, 0.86, 0, 0.05); Wf.box(bulk, 25.0, Wf.len - 2.0, 0, 0.86, 0, 0.05);
    Wf.box(stone, 2.0, 21.0, 0.86, 0.9, 0, 0.09); Wf.box(stone, 25.0, Wf.len - 2.0, 0.86, 0.9, 0, 0.09);
    // fascia: aluminium composite panels with reveals, LED edge and a stone coping
    { const Wp = new Wall(K, x1 + 0.2, z0 - 0.35, 0, -1, x1 - x0 + 0.4);
      for (let u = 2.3; u < Wp.len - 1; u += 2.3) Wp.box(bronze, u - 0.008, u + 0.008, 4.4, 5.8, 0, 0.012);
      Wp.box(bronze, 0, Wp.len, 5.09, 5.11, 0, 0.012);
      Wp.box(stone, -0.05, Wp.len + 0.05, 5.8, 5.94, -0.02, 0.24);
      Wp.box(pm('plain', { color: 0x050505, emissive: 0xf4fff4, emissiveI: 3.2 }), 0, Wp.len, 4.3, 4.32, -0.3, 0.02);
    }
    parapet(x0, x1, z0, z1, H, brick, 0.75);

    // ---- rooftop plant ----
    hvac(30, 6.4, 20, 0.0); hvac(44, 6.4, 22, 0.0, 2.9); hvac(54, 6.4, 32, Math.PI / 2, 2.5, 1.25);
    for (const [x, z] of [[24, 34], [26.4, 35.4], [36, 38], [58, 16], [22, 16]]) vent(x, 6.4, z);
    // roof hatch + skylights
    K.box(roofM, 1.3, 0.85, 1.7, 38, 6.4, 32, { r: 0.02 }); K.box(doorGrey, 1.1, 0.06, 1.5, 38, 7.23, 32);
    for (const sx of [30, 34, 48, 52]) { K.box(bronze, 2.4, 0.3, 1.6, sx, 6.4, 26); K.box(pm('plain', { color: 0x0b1620, rough: 0.05, metal: 0.4, env: 1.5 }), 2.2, 0.06, 1.4, sx, 6.72, 26, { rx: 0.0 }); }
    // ladder up the east wall
    { const We2 = new Wall(K, x1, z1, 1, 0, z1 - z0);
      for (const u of [20.4, 21.0]) We2.box(galv, u - 0.02, u + 0.02, 0.4, H + 0.9, VT + 0.2, VT + 0.24);
      for (let v = 0.6; v < H + 0.8; v += 0.3) We2.box(galv, 20.4, 21.0, v, v + 0.025, VT + 0.2, VT + 0.24);
      for (const v of [1.0, 3.0, 5.0]) for (const u of [20.4, 21.0]) We2.box(galv, u - 0.02, u + 0.02, v, v + 0.05, VT, VT + 0.24);
    }
  }

  // =====================================================================================================
  // BIG STACK BURGERS (1950s diner: porcelain enamel, stainless, neon)
  // =====================================================================================================
  {
    const H = 4.6, x0 = 18, x1 = 52, z0 = -36, z1 = -12;
    const enamelWall = (W, o = {}) => {
      const len = W.len, n = Math.max(2, Math.round(len / 1.25)), gap = 0.014;
      for (const [a, b] of spans(len, o.skip || [])) W.box(steel, a, b, -0.06, 0.42, 0, 0.05);   // stainless kick rail
      for (let i = 0; i < n; i++) {
        const a = (i * len) / n + gap / 2, b = ((i + 1) * len) / n - gap / 2;
        if (o.skip && o.skip.some(([s0, s1]) => b > s0 && a < s1)) continue;
        W.box(redEnamel, a, b, 0.44, 3.08, 0.0, 0.03, { r: 0.006 });
        W.box(creamEnamel, a, b, 3.24, H - 0.3, 0.0, 0.03, { r: 0.006 });
      }
      W.box(chrome, 0, len, 3.08, 3.24, 0, 0.055, { r: 0.008 });                                // chrome waistband
      W.box(chrome, 0, len, 1.0, 1.035, 0.03, 0.045);                                           // pinstripe
      W.box(tealEnamel, 0, len, 3.3, 3.42, 0.03, 0.042);
      W.box(steel, 0, len, H - 0.3, H, 0, 0.09);                                                // stainless coping band
    };
    // west wall
    const Wl = new Wall(K, x0, z0, -1, 0, z1 - z0);
    enamelWall(Wl);
    for (const u of [9.4, 13.7, 18.0]) {
      // glass-block window strip
      Wl.box(chrome, u - 1.1, u + 1.1, 1.3, 2.7, 0.03, 0.07, { r: 0.01 });
      Wl.plane(blockGlass, u - 1.02, u + 1.02, 1.38, 2.62, 0.074);
      for (let i = 1; i < 8; i++) Wl.box(chrome, u - 1.02 + (2.04 * i) / 8 - 0.008, u - 1.02 + (2.04 * i) / 8 + 0.008, 1.38, 2.62, 0.074, 0.088);
      for (let j = 1; j < 5; j++) Wl.box(chrome, u - 1.02, u + 1.02, 1.38 + (1.24 * j) / 5 - 0.008, 1.38 + (1.24 * j) / 5 + 0.008, 0.074, 0.088);
    }
    // neon tubes: teal + pink, on stand-offs
    for (const W of [Wl]) {
      W.tube(neonTeal, [[0.3, 3.86, 0.12], [W.len - 0.3, 3.86, 0.12]], 0.02, { seg: 2, radial: 8 });
      W.tube(neonPink, [[0.3, 4.05, 0.12], [W.len - 0.3, 4.05, 0.12]], 0.02, { seg: 2, radial: 8 });
      for (let u = 0.6; u < W.len; u += 2.0) { W.box(chrome, u - 0.012, u + 0.012, 3.82, 4.09, 0.05, 0.12); }
    }
    downspout(Wl, 0.45, H - 0.3); downspout(Wl, Wl.len - 0.45, H - 0.3);
    wallLamp(Wl, 5.0, 3.55); wallLamp(Wl, 22.0, 3.55);
    addCollider(x0 - 0.3, x0, z0, z1, 0, H + 0.4, 0);
    // east wall
    const We = new Wall(K, x1, z1, 1, 0, z1 - z0);
    enamelWall(We, { skip: [[2.0, 3.2]] });
    steelDoor(We, 2.6, { mat: doorGrey });
    W_neon(We);
    function W_neon(W) { W.tube(neonTeal, [[0.3, 3.86, 0.12], [W.len - 0.3, 3.86, 0.12]], 0.02, { seg: 2, radial: 8 }); for (let u = 0.6; u < W.len; u += 2.0) W.box(chrome, u - 0.012, u + 0.012, 3.82, 3.9, 0.05, 0.12); }
    downspout(We, 0.45, H - 0.3); downspout(We, We.len - 0.45, H - 0.3);
    wallLamp(We, 2.6, 3.0); wallLamp(We, 15.0, 3.55);
    addCollider(x1, x1 + 0.3, z0, z1, 0, H + 0.4, 0);
    // back wall: service door, hood exhaust duct, grease bin, meters
    const Wb = new Wall(K, x1, z0, 0, -1, x1 - x0);
    enamelWall(Wb, { skip: [[24.0, 25.2]] });
    steelDoor(Wb, 24.6, { mat: doorGreen });
    for (const u of [12.0, 13.2]) meter(Wb, u, 1.0);
    wallLamp(Wb, 24.6, 3.1); wallLamp(Wb, 6.0, 3.55); wallLamp(Wb, 30.0, 3.55);
    louver(Wb, 16.5, 19.0, 2.6, 3.6);
    // stainless kitchen duct up the back wall
    { const u = 25.6 + 6.0;
      Wb.box(steel, u - 0.35, u + 0.35, 0.3, H + 1.0, VT, VT + 0.5, { r: 0.012 });
      for (let v = 1.0; v < H + 0.9; v += 1.4) Wb.box(chrome, u - 0.37, u + 0.37, v, v + 0.06, VT - 0.01, VT + 0.52);
      Wb.box(galv, u - 0.5, u + 0.5, 0.0, 0.3, VT, VT + 0.7, { r: 0.01 });
    }
    downspout(Wb, 0.45, H - 0.3); downspout(Wb, Wb.len - 0.45, H - 0.3);
    // dumpster + grease bin behind
    { const dx = 44.0, dz = z0 - 1.6;
      K.box(dumpGreen, 2.1, 1.2, 1.2, dx, 0.12, dz, { r: 0.03 }); K.box(pm('plastic', { color: 0x141516, rough: 0.6 }), 2.2, 0.09, 1.3, dx, 1.32, dz, { r: 0.03 });
      for (const sx of [-0.85, 0.85]) for (const sz of [-0.5, 0.5]) K.cyl(rubber, 0.07, 0.07, 0.12, dx + sx, 0, dz + sz, { seg: 10 });
      addCollider(dx - 1.1, dx + 1.1, dz - 0.65, dz + 0.65, 0, 1.4, 0);
      K.cyl(galv, 0.32, 0.32, 0.9, 38.5, 0, z0 - 0.9, { seg: 16 }); K.cyl(galv, 0.34, 0.34, 0.05, 38.5, 0.9, z0 - 0.9, { seg: 16 });
      K.cyl(galv, 0.32, 0.32, 0.9, 39.4, 0, z0 - 0.9, { seg: 16 }); K.cyl(galv, 0.34, 0.34, 0.05, 39.4, 0.9, z0 - 0.9, { seg: 16 });
    }
    addCollider(x0, x1, z0 - 0.3, z0, 0, H + 0.4, 0);
    // front: stainless corner posts and a neon rim under the sign band
    { const Wf = new Wall(K, x0, z1, 0, 1, x1 - x0);
      Wf.box(steel, 0, 0.12, -0.06, H - 0.2, 0, 0.14, { r: 0.02 }); Wf.box(steel, Wf.len - 0.12, Wf.len, -0.06, H - 0.2, 0, 0.14, { r: 0.02 });
      Wf.tube(neonTeal, [[2.2, 4.12, 0.28], [Wf.len - 2.2, 4.12, 0.28]], 0.022, { seg: 2, radial: 8 });
    }
    parapet(x0, x1, z0, z1, H, redEnamel, 0.42);
    // rooftop: kitchen exhaust fan over the hood, AC, vents
    { const fx = 26, fz = -34.2;
      K.box(roofM, 1.7, 0.35, 1.7, fx, 5.0, fz, { r: 0.02 });
      K.cyl(steel, 0.62, 0.7, 0.55, fx, 5.35, fz, { seg: 20 }); K.cyl(bronze, 0.72, 0.72, 0.06, fx, 5.9, fz, { seg: 20 }); K.cyl(galv, 0.5, 0.5, 0.35, fx, 5.96, fz, { seg: 20 });
      for (let i = 0; i < 6; i++) K.box(chrome, 0.9, 0.012, 0.03, fx, 6.32, fz, { ry: (i * Math.PI) / 6 });
      hvac(41, 5.0, -30, 0, 2.5, 1.25); hvac(45, 5.0, -18, Math.PI / 2, 2.2, 1.1);
      for (const [x, z] of [[22, -30], [23.4, -18], [48, -34]]) vent(x, 5.0, z);
    }
  }

  K.mesh(par, { occ: false, reflect: true });

  // ---------------------------------------------------------------------------------------- update
  out.update = () => {
    const night = G.u.uNight.value, dusk = 1 - smooth(0.1, 0.55, G.atmo ? G.atmo.day : 1);
    const lampOn = clamp(Math.max(night, dusk * 0.9), 0, 1);
    bulb.emissiveIntensity = lampOn * 9;
    winGlass.emissiveIntensity = lampOn * 0.5;
    winBack.emissiveIntensity = lampOn * 0.22;
    blindM.emissiveIntensity = lampOn * 0.75;
    neonTeal.emissiveIntensity = 1.6 + lampOn * 7;
    neonPink.emissiveIntensity = 1.6 + lampOn * 7;
    exitSign.emissiveIntensity = 2.5 + lampOn * 2;
    blockGlass.emissiveIntensity = 0.05 + lampOn * 0.7;
    const on = lampOn > 0.25;
    for (const e of emitters) e.on = on;
  };
  void glow; void shops; void R;
  return out;
}
