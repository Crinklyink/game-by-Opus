// Detailed procedural furniture. Each builder creates a merged group (origin at the centre of
// the footprint on the floor, front facing local +z), adds it to `par`, registers colliders and
// returns handles. Dimensions are in metres and roughly match real products.
import * as THREE from 'three';
import { Kit, addCollider, leafGeometry, mat4 } from './kit.js';
import { cushion, throwPillow, leanPillow, turnedLeg, rrShape, rrPath, bookStack, mug, plate, stemGlass, branchVase, slats, flutes } from './shapes.js';
import { palette } from './palette.js';
import { canvasTex } from '../gfx/noise.js';
import { pm } from '../gfx/materials.js';
import { G } from '../core/G.js';
import { rng } from '../core/util.js';

export function finish(par, k, x, y, z, ry = 0, o = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = ry;
  par.add(g);
  k.mesh(g, o);                 // after positioning, so the kit's light occluders are registered in world space
  return g;
}

// collider for a rotated rectangle centred at (x,z)
export function colBox(x, z, w, d, ry, y0, y1, lv = 1) {
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = (c * w + s * d) / 2, hz = (s * w + c * d) / 2;
  return addCollider(x - hx, x + hx, z - hz, z + hz, y0, y1, lv);
}

// ------------------------------------------------------------------ seating
export function sofa(par, y0, x, z, ry, o = {}) {
  const M = palette(), k = new Kit();
  const W = o.W ?? 3.1, D = 1.02, body = o.mat ?? M.boucle;
  // walnut plinth + tapered brass-capped legs
  k.box(M.walnut, W - 0.12, 0.08, D - 0.12, 0, 0.12, 0, { r: 0.012, seg: 3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (W / 2 - 0.17), pz = sz * (D / 2 - 0.16);
    k.strut(M.walnut, [px, 0.14, pz], [px * 1.04, 0.0, pz * 1.05], 0.026, 0.016, { seg: 12 });
    k.cyl(M.brass, 0.018, 0.018, 0.02, px * 1.04, 0, pz * 1.05, { seg: 12 });
  }
  // stuffed base, track arms with rolled tops, tall back
  k.box(body, W - 0.06, 0.17, D - 0.02, 0, 0.14, 0, { r: 0.055, seg: 6 });
  for (const s2 of [-1, 1]) {
    k.box(body, 0.2, 0.42, D - 0.04, s2 * (W / 2 - 0.1), 0.14, 0, { r: 0.06, seg: 6 });
    k.cyl(body, 0.105, 0.105, D - 0.09, s2 * (W / 2 - 0.1), 0.6, 0, { rx: Math.PI / 2, cy: true, seg: 20 });
    k.sph(body, 0.105, s2 * (W / 2 - 0.1), 0.6, D / 2 - 0.045, { sz: 0.45, seg: 14, seg2: 10 });
  }
  k.box(body, W - 0.36, 0.5, 0.2, 0, 0.14, -D / 2 + 0.11, { r: 0.07, seg: 6 });
  // three deep seat cushions and three leaning back cushions, piped
  const cw = (W - 0.44) / 3;
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * cw;
    cushion(k, body, cw - 0.012, 0.17, 0.7, cx, 0.3, 0.13, { r: 0.05, crown: 0.028, pipe: body });
    cushion(k, body, cw - 0.03, 0.42, 0.17, cx, 0.4, -0.27, { rx: -0.3, r: 0.06, crown: 0.03, pipe: body, buttons: [1, 1] });
  }
  // throw pillows + folded knit blanket
  const SY = 0.5 + 0.0;                                                  // seat cushion top
  leanPillow(k, M.rust, 0.5, 0.15, 0.5, -W / 2 + 0.55, 0.14, SY, 0.5, { ry: 0.4 });
  leanPillow(k, M.sage, 0.42, 0.13, 0.42, -W / 2 + 0.9, 0.3, SY, 0.4, { ry: -0.3 });
  leanPillow(k, M.navy, 0.5, 0.14, 0.5, W / 2 - 0.55, 0.14, SY, 0.5, { ry: -0.35 });
  // knit throw folded on the right seat and draped over the rolled arm: a heightfield that follows seat -> arm top -> outside face
  { const x0 = W / 2 - 0.62, x1 = W / 2 + 0.03, sm = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
    const armC = W / 2 - 0.1, armR = 0.118;
    k.cloth(M.mustard, x1 - x0, 0.52, (x0 + x1) / 2, 0, 0.12, (u, v) => {
      const x = x0 + u * (x1 - x0);
      const seat = 0.512, dx = x - armC;
      const arm = Math.abs(dx) < armR ? 0.6 + Math.sqrt(armR * armR - dx * dx) : -1;           // over the round top of the arm
      const drop = dx > 0.06 ? 0.71 - (dx - 0.06) * 6.0 : -1;                                  // hanging down the outside
      let y = Math.max(seat + 0.01 * sm(0.4, 0.0, u), arm + 0.008, dx > 0.06 ? Math.max(drop, 0.33) : -1);
      y = Math.max(y, seat + 0.012) + 0.006 * Math.sin(v * 19 + u * 4) * sm(0.0, 0.3, u);
      return y;
    }, { sw: 60, sh: 24 }); }
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, W, D, ry, y0, y0 + 0.9);
  return g;
}

export function armchair(par, y0, x, z, ry, mat) {
  const M = palette(), k = new Kit();
  mat = mat ?? M.leather;
  // walnut frame: splayed tapered legs, side rails, arm boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 0.34, pz = sz * 0.34;
    k.strut(M.walnut, [px * 0.95, 0.3, pz * 0.95], [px * 1.12, 0.0, pz * 1.12], 0.024, 0.014, { seg: 12 });
    k.cyl(M.brass, 0.015, 0.015, 0.014, px * 1.12, 0, pz * 1.12, { seg: 10 });
  }
  for (const s2 of [-1, 1]) {
    k.box(M.walnut, 0.05, 0.05, 0.8, s2 * 0.375, 0.3, 0, { r: 0.012 });
    k.box(M.walnut, 0.075, 0.03, 0.62, s2 * 0.385, 0.6, 0.06, { r: 0.012 });
    k.strut(M.walnut, [s2 * 0.375, 0.32, 0.28], [s2 * 0.385, 0.6, 0.28], 0.016, 0.014);
    k.strut(M.walnut, [s2 * 0.375, 0.32, -0.16], [s2 * 0.385, 0.6, -0.16], 0.016, 0.014);
  }
  k.box(M.walnut, 0.76, 0.05, 0.05, 0, 0.3, -0.37, { r: 0.012 });
  k.box(M.walnut, 0.76, 0.05, 0.05, 0, 0.3, 0.37, { r: 0.012 });
  // sling seat, thick cushion, angled back with buttons
  cushion(k, mat, 0.68, 0.14, 0.7, 0, 0.34, 0.03, { r: 0.045, crown: 0.03, pipe: mat });
  cushion(k, mat, 0.72, 0.56, 0.16, 0, 0.42, -0.36, { rx: -0.36, r: 0.07, crown: 0.045, pipe: mat, buttons: [3, 2] });
  cushion(k, mat, 0.42, 0.16, 0.12, 0, 0.96, -0.51, { rx: -0.38, r: 0.05, crown: 0.02, pipe: mat });
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, 0.9, 0.9, ry, y0, y0 + 0.9);
  return g;
}

export function stool(k, M, x, z, h = 0.68) {
  cushion(k, M.leatherBlack, 0.4, 0.075, 0.4, x, h - 0.075, z, { r: 0.034, crown: 0.012, pipe: M.leatherBlack, seg: 6 });
  k.cyl(M.steel, 0.042, 0.042, 0.02, x, h - 0.095, z, { seg: 18 });
  k.cyl(M.steel, 0.02, 0.02, h - 0.1, x, 0.02, z, { seg: 14 });
  k.torus(M.steel, 0.16, 0.011, x, h * 0.36, z, { rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; k.strut(M.steel, [x, h * 0.36, z], [x + Math.cos(a) * 0.16, h * 0.36, z + Math.sin(a) * 0.16], 0.006, 0.006, { seg: 6 }); }
  k.cyl(M.steel, 0.2, 0.21, 0.014, x, 0, z, { seg: 32 });
  k.cyl(M.rubber, 0.2, 0.2, 0.004, x, 0, z, { seg: 32 });
}

export function diningChair(k, M, x, z, ry) {
  const kk = new Kit();
  const seatY = 0.44;
  // bentwood legs: rear legs sweep up into the back posts, front legs splay
  for (const sx of [-1, 1]) {
    kk.tube(M.walnut, [[sx * 0.225, 0.0, -0.25], [sx * 0.2, 0.22, -0.215], [sx * 0.195, seatY, -0.2], [sx * 0.2, 0.68, -0.215], [sx * 0.19, 0.87, -0.225]], 0.0155, { seg: 28, radial: 8 });
    kk.strut(M.walnut, [sx * 0.19, seatY - 0.02, 0.19], [sx * 0.225, 0.0, 0.245], 0.018, 0.012, { seg: 10 });
  }
  // seat frame, side + cross stretchers
  kk.box(M.walnut, 0.4, 0.045, 0.42, 0, seatY - 0.045, 0, { r: 0.012 });
  for (const sx of [-1, 1]) kk.strut(M.walnut, [sx * 0.21, 0.19, -0.23], [sx * 0.215, 0.19, 0.22], 0.008, 0.008, { seg: 6 });
  kk.strut(M.walnut, [-0.21, 0.19, -0.03], [0.21, 0.19, -0.03], 0.007, 0.007, { seg: 6 });
  // upholstered seat + curved back panel
  cushion(kk, M.linen, 0.44, 0.06, 0.44, 0, seatY - 0.005, 0.005, { r: 0.022, crown: 0.012, pipe: M.linen, seg: 4 });
  cushion(kk, M.linen, 0.36, 0.26, 0.04, 0, 0.6, -0.235, { rx: -0.1, r: 0.02, crown: 0.012, pipe: M.linen, seg: 4 });
  kk.box(M.walnut, 0.44, 0.045, 0.045, 0, 0.84, -0.225, { r: 0.016, rx: -0.1 });
  for (const [mat, arr] of kk.g) for (const geo of arr) k.push(mat, geo.clone(), mat4(x, 0, z, 0, ry, 0));
}

// ------------------------------------------------------------------ outdoor
export function bistroChair(k, M, x, z, ry) {
  const kk = new Kit();
  for (const sx of [-1, 1]) {
    kk.strut(M.blackMetal, [sx * 0.2, 0.44, 0.19], [sx * 0.235, 0, 0.27], 0.009, 0.007, { seg: 8 });
    kk.strut(M.blackMetal, [sx * 0.2, 0.44, -0.19], [sx * 0.225, 0, -0.28], 0.009, 0.007, { seg: 8 });
    kk.strut(M.blackMetal, [sx * 0.2, 0.44, -0.19], [sx * 0.23, 0.93, -0.27], 0.009, 0.009, { seg: 8 });
    kk.strut(M.blackMetal, [sx * 0.2, 0.44, -0.19], [sx * 0.2, 0.44, 0.19], 0.008, 0.008, { seg: 6 });
    kk.strut(M.blackMetal, [sx * 0.225, 0.2, 0.15], [sx * 0.225, 0.2, -0.17], 0.006, 0.006, { seg: 6 });
  }
  for (let i = 0; i < 6; i++) kk.box(M.oak, 0.45, 0.02, 0.06, 0, 0.44, 0.17 - i * 0.07, { r: 0.004 });
  for (let i = 0; i < 4; i++) kk.box(M.oak, 0.43, 0.06, 0.018, 0, 0.6 + i * 0.09, -0.21 - i * 0.014, { r: 0.004, rx: -0.13 });
  for (const [mat, arr] of kk.g) for (const geo of arr) k.push(mat, geo.clone(), mat4(x, 0, z, 0, ry, 0));
}

export function bistroTable(k, M, x, z) {
  k.lathe(M.blackMetal, [[0, 0.69], [0.36, 0.69], [0.375, 0.695], [0.38, 0.71], [0.375, 0.725], [0.36, 0.73], [0, 0.73]], x, 0, z, { seg: 40 });
  for (let i = 0; i < 6; i++) k.box(M.blackMetal, 0.004, 0.006, 0.7, x, 0.7, z, { ry: (i / 6) * Math.PI });
  k.cyl(M.blackMetal, 0.028, 0.03, 0.66, x, 0.03, z, { seg: 12 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; k.strut(M.blackMetal, [x, 0.06, z], [x + Math.cos(a) * 0.26, 0.0, z + Math.sin(a) * 0.26], 0.014, 0.009, { seg: 8 }); }
  k.lathe(M.blackMetal, [[0, 0.02], [0.09, 0.02], [0.1, 0.04], [0, 0.05]], x, 0, z, { seg: 16 });
}

// candle lantern: brass frame, glass panes, flame
export function lantern(k, M, x, y, z, s = 1) {
  const glassM = palette().glass;
  k.box(M.blackMetal, 0.2 * s, 0.014 * s, 0.2 * s, x, y, z, { r: 0.003 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(M.blackMetal, 0.006 * s, 0.006 * s, 0.32 * s, x + sx * 0.093 * s, y, z + sz * 0.093 * s, { seg: 6 });
  k.box(M.blackMetal, 0.22 * s, 0.014 * s, 0.22 * s, x, y + 0.32 * s, z, { r: 0.003 });
  k.cyl(M.blackMetal, 0.06 * s, 0.09 * s, 0.05 * s, x, y + 0.334 * s, z, { seg: 8 });
  k.torus(M.blackMetal, 0.05 * s, 0.005 * s, x, y + 0.395 * s, z, { rx: 0, seg: 12, seg2: 5 });
  k.box(glassM, 0.18 * s, 0.3 * s, 0.18 * s, x, y + 0.015 * s, z);
  k.cyl(pm('plain', { color: 0xf1ead8, rough: 0.6, interior: true }), 0.03 * s, 0.03 * s, 0.14 * s, x, y + 0.02 * s, z, { seg: 10 });
  k.cyl(M.flame, 0.006 * s, 0.01 * s, 0.03 * s, x, y + 0.165 * s, z, { seg: 6 });
}

// ------------------------------------------------------------------ tables
const cover = (c) => pm('paint', { color: c, rough: 0.55, interior: true });
const GLASS = () => palette().glass;

export function coffeeTable(par, y0, x, z) {
  const M = palette(), k = new Kit();
  // bevelled marble slab, brass rim, two-tier drum base
  k.lathe(M.marbleW, [[0, 0.385], [0.5, 0.385], [0.516, 0.39], [0.522, 0.402], [0.516, 0.416], [0.5, 0.42], [0, 0.42]], 0, 0, 0, { seg: 64 });
  k.lathe(M.brass, [[0.49, 0.375], [0.53, 0.376], [0.535, 0.384], [0.5, 0.388], [0.49, 0.386]], 0, 0, 0, { seg: 64 });
  k.lathe(M.brass, [[0, 0.02], [0.31, 0.02], [0.33, 0.03], [0.3, 0.05], [0.28, 0.36], [0.3, 0.375], [0, 0.375]], 0, 0, 0, { seg: 44 });
  for (const yy of [0.12, 0.25]) k.torus(M.brass, 0.294, 0.006, 0, yy, 0, { seg: 44, seg2: 6 });
  k.lathe(M.marbleD, [[0, 0], [0.4, 0], [0.42, 0.012], [0.4, 0.024], [0, 0.024]], 0, 0.0, 0, { seg: 44 });
  // art books, candle in a glass, stone bowl, remote, coaster
  const cy = bookStack(k, M.paper, [{ c: M.navy, w: 0.32, d: 0.23, h: 0.034 }, { c: M.rust, w: 0.28, d: 0.2, h: 0.028, j: -1 }, { c: cover(0xd8d0bd), w: 0.24, d: 0.17, h: 0.022 }], -0.14, 0.42, 0.08, 0.3);
  k.sph(M.brass, 0.032, -0.14, cy + 0.028, 0.08, { sy: 0.9 });
  k.cyl(M.ceramic, 0.052, 0.05, 0.085, 0.24, 0.42, -0.12, { seg: 24 });
  k.cyl(pm('plain', { color: 0xf1ead8, rough: 0.6, interior: true }), 0.044, 0.044, 0.07, 0.24, 0.425, -0.12, { seg: 20 });
  k.cyl(M.flame, 0.0035, 0.006, 0.02, 0.24, 0.5, -0.12, { seg: 6 });
  k.lathe(M.blackCeramic, [[0.0, 0], [0.08, 0.005], [0.13, 0.05], [0.14, 0.07], [0.125, 0.07], [0.075, 0.03], [0, 0.02]], -0.05, 0.42, -0.24, { seg: 32 });
  for (let i = 0; i < 3; i++) k.sph(M.marbleW, 0.034, -0.05 + (i - 1) * 0.048, 0.465, -0.24 + (i % 2) * 0.02, { sy: 0.7 });
  k.box(M.plasticB, 0.05, 0.02, 0.16, 0.28, 0.42, 0.2, { r: 0.008, ry: 0.5 });
  k.cyl(M.leatherBlack, 0.05, 0.05, 0.006, 0.02, 0.42, 0.28, { seg: 20 });
  const g = finish(par, k, x, y0, z, 0);
  colBox(x, z, 1.05, 1.05, 0, y0, y0 + 0.45);
  return g;
}

export function sideTable(par, y0, x, z, o = {}) {
  const M = palette(), k = new Kit();
  k.lathe(M.walnut, [[0, 0.5], [0.22, 0.5], [0.238, 0.505], [0.24, 0.515], [0.235, 0.528], [0, 0.53]], 0, 0, 0, { seg: 40 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    k.strut(M.brass, [Math.cos(a) * 0.12, 0.5, Math.sin(a) * 0.12], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], 0.014, 0.009, { seg: 10 });
  }
  k.torus(M.brass, 0.17, 0.005, 0, 0.2, 0, { seg: 36, seg2: 6 });
  mug(k, M.ceramic, 0.06, 0.53, 0.02, { r: 0.04, h: 0.09, ry: 0.4, liquid: pm('plain', { color: 0x2a170c, rough: 0.2, interior: true }) });
  k.lathe(M.terracotta, [[0, 0], [0.04, 0], [0.05, 0.08], [0.045, 0.085], [0, 0.08]], -0.09, 0.53, -0.05, {});
  const g = finish(par, k, x, y0, z, 0);
  colBox(x, z, 0.5, 0.5, 0, y0, y0 + 0.55);
  return g;
}

export function diningTable(par, y0, x, z, ry) {
  const M = palette(), k = new Kit();
  const shape = new THREE.Shape();
  const a = 1.15, b = 0.5;
  for (let i = 0; i <= 96; i++) { const t = (i / 96) * Math.PI * 2; const px = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 0.62) * a, py = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.8) * b; if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py); }
  k.extrude(M.oak, shape, 0.038, 0, 0.72, 0, { rx: Math.PI / 2, bevel: 0.009, seg: 6 });
  const inner = new THREE.Shape();
  for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; const px = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 0.62) * (a - 0.12), py = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.8) * (b - 0.1); if (i === 0) inner.moveTo(px, py); else inner.lineTo(px, py); }
  k.extrude(M.walnut, inner, 0.05, 0, 0.7, 0, { rx: Math.PI / 2 });                // apron under the top
  for (const sx of [-1, 1]) {
    k.lathe(M.blackMetal, [[0.05, 0], [0.3, 0.0], [0.32, 0.012], [0.3, 0.026], [0.09, 0.075], [0.06, 0.12], [0.056, 0.6], [0.09, 0.66], [0.2, 0.685], [0.28, 0.69], [0.0, 0.69]], sx * 0.62, 0, 0, { sx: 1, sz: 0.42, seg: 40 });
    k.cyl(M.brass, 0.062, 0.062, 0.012, sx * 0.62, 0.3, 0, { seg: 24, sz: 1 });
  }
  // table runner, vase with branches, fruit bowl, candles, two place settings
  k.box(pm('fabric', { color: 0xd8cfbd, interior: true }), 1.5, 0.004, 0.28, 0.0, 0.7585, 0.0, { r: 0.002 });
  const rr = rng(88);
  const leafG = leafGeometry(0.09, 0.035, 0.3, 0.2, 5, 0);
  branchVase(k, M.ceramic, M.walnut, M.leafLight, -0.34, 0.76, 0.02, rr, { h: 0.3, n: 5, len: 0.62, leafGeo: leafG });
  k.lathe(M.brass, [[0, 0], [0.09, 0.01], [0.16, 0.06], [0.17, 0.07], [0.155, 0.07], [0.08, 0.025], [0, 0.02]], 0.36, 0.76, 0.05, { seg: 32 });
  const lem = pm('plain', { color: 0xe3c229, rough: 0.5, interior: true });
  const lim = pm('plain', { color: 0x7fa832, rough: 0.5, interior: true });
  for (let i = 0; i < 6; i++) { const a2 = i * 1.05; k.sph(i % 3 ? lem : lim, 0.038, 0.36 + Math.cos(a2) * 0.06, 0.83 + (i % 2) * 0.03, 0.05 + Math.sin(a2) * 0.06, { sy: 0.85 }); }
  for (const cx of [0.02, 0.1]) { k.cyl(M.brass, 0.022, 0.026, 0.016, cx, 0.76, -0.06, { seg: 14 }); k.cyl(pm('plain', { color: 0xefe6cf, rough: 0.6, interior: true }), 0.011, 0.011, 0.11 - (cx > 0.05 ? 0.03 : 0), cx, 0.776, -0.06, { seg: 8 }); k.cyl(M.flame, 0.0025, 0.004, 0.014, cx, 0.886 - (cx > 0.05 ? 0.03 : 0), -0.06, { seg: 5 }); }
  const gl = GLASS();
  for (const [px, pz, rot] of [[-0.75, 0.32, 0], [0.75, -0.32, Math.PI]]) {
    plate(k, M.ceramic, px, 0.76, pz, 0.12);
    plate(k, M.ceramic, px, 0.778, pz, 0.078, { deep: 0.022 });
    stemGlass(k, gl, px + 0.14 * Math.cos(rot), 0.76, pz - 0.16 * Math.cos(rot) - 0.02, 1);
    k.box(pm('fabric', { color: 0x6c7a62, interior: true }), 0.15, 0.014, 0.15, px, 0.762, pz + 0.22 * Math.cos(rot), { r: 0.004, ry: 0.2 });
    for (const dx of [-0.17, 0.17]) k.box(M.steel, 0.012, 0.004, 0.17, px + dx, 0.76, pz, { ry: rot });
  }
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, 2.4, 1.1, ry, y0, y0 + 0.8);
  return g;
}

// ------------------------------------------------------------------ media wall
export function tvUnit(par, y0, x, z, ry, screen) {
  const M = palette(), k = new Kit();
  const W = 2.2;
  // floating walnut credenza: carcass, fluted door fronts, brass recessed pulls, shadow gap under
  k.box(M.walnut, W, 0.03, 0.42, 0, 0.5, 0, { r: 0.008 });
  k.box(M.walnut, W, 0.03, 0.42, 0, 0.26, 0, { r: 0.008 });
  for (const sx of [-1, 1]) k.box(M.walnut, 0.03, 0.27, 0.42, sx * (W / 2 - 0.015), 0.26, 0, { r: 0.006 });
  k.box(M.blackMetal, W - 0.06, 0.25, 0.02, 0, 0.26, -0.2);
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * (W / 3);
    if (i === 1) {
      for (let d = 0; d < 2; d++) { k.box(M.walnut, W / 3 - 0.02, 0.115, 0.024, cx, 0.285 + d * 0.125, 0.215, { r: 0.004 }); k.box(M.brass, 0.14, 0.008, 0.006, cx, 0.34 + d * 0.125 - 0.02, 0.232); }
    } else {
      k.box(M.walnut, W / 3 - 0.02, 0.24, 0.024, cx, 0.27, 0.215, { r: 0.004 });
      flutes(k, M.walnut, W / 3 - 0.05, 0.22, cx, 0.28, 0.232, 12, 0.0085);
      k.box(M.brass, 0.008, 0.12, 0.008, cx + (i === 0 ? 0.24 : -0.24), 0.33, 0.235);
    }
  }
  k.box(M.blackMetal, W - 0.1, 0.02, 0.36, 0, 0.245, 0, { r: 0.004 });
  // TV (thin bezel) + slim feet, soundbar with grille dots
  const TVW = 1.46, TVH = 0.84, ty = 0.98;
  k.box(M.plasticB, TVW, TVH, 0.028, 0, ty, -0.1, { r: 0.008, seg: 3 });
  k.box(M.plasticB, TVW * 0.5, 0.02, 0.06, 0, ty - 0.02, -0.12, { r: 0.006 });
  k.box(M.blackMetal, 1.0, 0.065, 0.085, 0, 0.53, 0.02, { r: 0.022, seg: 4 });
  k.box(pm('fabric', { color: 0x1c1d20, rough: 1, interior: true }), 0.94, 0.05, 0.004, 0, 0.538, 0.064);
  k.box(M.steel, 0.5, 0.003, 0.004, 0, 0.565, 0.0655);
  // console objects: sculptural terracotta vase with dried stems, coffee-table book, brass orb
  const rr = rng(21);
  const leafG = leafGeometry(0.06, 0.025, 0.2, 0.1, 4, 0);
  branchVase(k, M.terracotta, M.walnut, M.leafLight, -0.85, 0.53, 0.0, rr, { h: 0.27, n: 4, len: 0.5, leafGeo: leafG, bloom: pm('plain', { color: 0xd8c9a2, rough: 0.9, interior: true }) });
  bookStack(k, M.paper, [{ c: cover(0x2e3a34), w: 0.28, d: 0.2, h: 0.03 }, { c: cover(0xd9d0be), w: 0.24, d: 0.18, h: 0.024, j: -1 }], 0.72, 0.53, 0.02, 0.2);
  k.sph(M.brass, 0.065, 0.72, 0.628, 0.02, {});
  k.lathe(M.ceramic, [[0, 0], [0.045, 0], [0.05, 0.05], [0.03, 0.09], [0.028, 0.1], [0, 0.1]], 0.32, 0.53, 0.0, {});
  const g = finish(par, k, x, y0, z, ry);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(TVW - 0.03, TVH - 0.03), screen.mat);
  sc.position.set(0, ty + TVH / 2, -0.083);
  g.add(sc);
  screen.visible = true;
  colBox(x, z, W, 0.5, ry, y0, y0 + 0.75);
  return { group: g, screenMesh: sc };
}

// ------------------------------------------------------------------ lighting
export function pendant(par, x, y, z, ceilingY, M, glowRef) {
  const k = new Kit();
  const drop = ceilingY - y;
  k.cyl(M.brass, 0.055, 0.055, 0.022, 0, drop - 0.022, 0, { seg: 20 });
  k.cyl(M.brass, 0.018, 0.018, 0.03, 0, drop - 0.05, 0, { seg: 12 });
  k.cyl(M.blackMetal, 0.0028, 0.0028, drop - 0.2, 0, 0.2, 0, { seg: 5 });
  k.cyl(M.brass, 0.022, 0.03, 0.05, 0, 0.32, 0, { seg: 14 });          // socket cap above the globe
  const g = new THREE.Group();
  k.mesh(g, { occ: false });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 28), new THREE.MeshPhysicalMaterial({ color: 0xfff2dd, roughness: 0.04, transparent: true, opacity: 0.26, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.17;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), M.bulb);
  core.position.y = 0.17;
  // filament coil
  const fil = new Kit();
  fil.tube(M.brass, [[0, 0.14, 0], [0.02, 0.15, 0.01], [-0.02, 0.165, -0.01], [0.02, 0.18, 0.01], [-0.02, 0.195, -0.01], [0, 0.205, 0]], 0.0018, { seg: 20, radial: 4 });
  fil.mesh(g, { occ: false });
  g.add(glass, core);
  g.position.set(x, y, z);
  par.add(g);
  return { group: g, core };
}

export function floorLamp(par, y0, x, z, ry = 0) {
  const M = palette(), k = new Kit();
  k.lathe(M.marbleW, [[0, 0], [0.18, 0], [0.19, 0.012], [0.19, 0.03], [0.17, 0.05], [0.04, 0.062], [0, 0.062]], 0, 0, 0, { seg: 40 });
  k.cyl(M.brass, 0.03, 0.036, 0.04, 0, 0.055, 0, { seg: 16 });
  k.tube(M.brass, [[0, 0.09, 0], [0, 1.2, 0], [0.15, 1.75, 0.02], [0.55, 1.95, 0.05], [0.95, 1.78, 0.06], [1.05, 1.55, 0.06]], 0.0115, { seg: 48, radial: 10 });
  k.torus(M.brass, 0.014, 0.004, 0, 1.0, 0, { rx: Math.PI / 2, seg: 12, seg2: 5 });
  // domed brass shade with a rolled rim and a matte liner
  k.lathe(M.brass, [[0.0, 0.215], [0.06, 0.21], [0.16, 0.19], [0.24, 0.13], [0.275, 0.05], [0.28, 0.0], [0.272, -0.004], [0.262, 0.03], [0.22, 0.1], [0.14, 0.16], [0.05, 0.19], [0, 0.192]], 1.05, 1.36, 0.06, { seg: 48 });
  k.cyl(M.brass, 0.02, 0.02, 0.05, 1.05, 1.53, 0.06, { seg: 10 });
  const g = finish(par, k, x, y0, z, ry);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), M.bulb);
  bulb.position.set(1.05, 1.44, 0.06);
  g.add(bulb);
  colBox(x, z, 0.4, 0.4, 0, y0, y0 + 2.0);
  return { group: g, bulb, lightPos: new THREE.Vector3(x + Math.cos(ry) * 1.05, y0 + 1.42, z - Math.sin(ry) * 1.05 + 0.06) };
}

export function tableLamp(k, M, x, y, z, shadeMat) {
  // ceramic gourd base, brass neck, pleated-drum shade with brass finial
  k.lathe(M.ceramic, [[0, 0], [0.055, 0], [0.07, 0.02], [0.085, 0.07], [0.078, 0.12], [0.045, 0.165], [0.02, 0.19], [0.02, 0.2], [0, 0.2]], x, y, z, { seg: 28 });
  k.cyl(M.brass, 0.019, 0.022, 0.05, x, y + 0.19, z, { seg: 12 });
  k.cyl(M.brass, 0.005, 0.005, 0.09, x, y + 0.24, z, { seg: 6 });
  k.lathe(shadeMat ?? M.shade, [[0.115, 0], [0.155, 0.0], [0.12, 0.22], [0.108, 0.22]], x, y + 0.23, z, { seg: 40 });
  k.torus(M.brass, 0.116, 0.003, x, y + 0.451, z, { seg: 36, seg2: 4 });
  k.sph(M.brass, 0.014, x, y + 0.47, z, { seg: 10, seg2: 8 });
}

// ------------------------------------------------------------------ art
// Procedural paintings: layered gradients + directional brush strokes + canvas weave, so they read as real art up close.
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function strokes(ctx, R, n, colorAt, o = {}) {
  const { len = 40, wid = 9, angAt = () => 0, alpha = [0.35, 0.8], region = null } = o;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = R() * ctx.canvas.width, y = R() * ctx.canvas.height;
    if (region && !region(x, y)) continue;
    const a = angAt(x, y) + (R() - 0.5) * 0.35, l = len * (0.5 + R()), w = wid * (0.5 + R() * 0.9);
    ctx.strokeStyle = colorAt(x, y, R); ctx.globalAlpha = alpha[0] + R() * (alpha[1] - alpha[0]); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2);
    ctx.quadraticCurveTo(x + Math.sin(a) * w * 0.6, y - Math.cos(a) * w * 0.6, x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
const mountains = (ctx, cw, base, amp, rough, seed) => {
  ctx.beginPath(); ctx.moveTo(0, base + 400);
  for (let x = 0; x <= cw; x += 6) {
    const y = Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.017 + seed * 2.3) * amp * 0.45 + Math.sin(x * 0.05 + seed * 5) * rough;
    ctx.lineTo(x, base - Math.abs(y));
  }
  ctx.lineTo(cw, base + 400); ctx.closePath();
};

function paintingTexture(kind, w, h) {
  return canvasTex(1024, Math.round(1024 * h / w), (ctx, cw, ch) => {
    const R = rng(kind * 911 + 7);
    if (kind === 0) {                 // harbour at sunset
      const g = ctx.createLinearGradient(0, 0, 0, ch * 0.62);
      g.addColorStop(0, '#24325a'); g.addColorStop(0.35, '#6b4a7a'); g.addColorStop(0.7, '#e0714a'); g.addColorStop(1, '#f7c06a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      const sx = cw * 0.64, sy = ch * 0.5;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, ch * 0.5); glow.addColorStop(0, 'rgba(255,238,190,0.95)'); glow.addColorStop(0.25, 'rgba(255,200,130,0.5)'); glow.addColorStop(1, 'rgba(255,160,90,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(sx, sy, ch * 0.065, 0, 7); ctx.fill();
      strokes(ctx, R, 900, (x, y) => hsl(18 + (y / ch) * 30 + R() * 14, 70, 55 + R() * 22), { len: 120, wid: 14, alpha: [0.12, 0.35], region: (x, y) => y < ch * 0.58 });
      ctx.fillStyle = '#2b2440'; mountains(ctx, cw, ch * 0.585, 18, 5, 1.7); ctx.fill();
      const sea = ctx.createLinearGradient(0, ch * 0.58, 0, ch); sea.addColorStop(0, '#d9824f'); sea.addColorStop(0.18, '#7d5a73'); sea.addColorStop(1, '#1c2542');
      ctx.fillStyle = sea; ctx.fillRect(0, ch * 0.58, cw, ch * 0.42);
      strokes(ctx, R, 1400, (x, y) => (Math.abs(x - sx) < 70 + (y - ch * 0.58) * 0.25 && R() < 0.8) ? hsl(34 + R() * 10, 90, 62 + R() * 22) : hsl(236 + R() * 20, 35, 22 + (1 - (y - ch * 0.58) / (ch * 0.42)) * 24 + R() * 10), { len: 70, wid: 6, alpha: [0.25, 0.75], region: (x, y) => y > ch * 0.585 });
      ctx.fillStyle = '#17142a';                                            // sailboat
      ctx.beginPath(); ctx.moveTo(cw * 0.3, ch * 0.76); ctx.lineTo(cw * 0.42, ch * 0.76); ctx.lineTo(cw * 0.405, ch * 0.79); ctx.lineTo(cw * 0.315, ch * 0.79); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cw * 0.365, ch * 0.755); ctx.lineTo(cw * 0.365, ch * 0.6); ctx.lineTo(cw * 0.41, ch * 0.75); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cw * 0.355, ch * 0.755); ctx.lineTo(cw * 0.355, ch * 0.64); ctx.lineTo(cw * 0.32, ch * 0.75); ctx.fill();
    } else if (kind === 1) {          // mid-century geometry on warm paper
      ctx.fillStyle = '#efe4cf'; ctx.fillRect(0, 0, cw, ch);
      const cols = ['#c4633a', '#2f4858', '#e2b04a', '#7d8f69', '#1b1b1d', '#d99a8c'];
      const shapes = [];
      for (let i = 0; i < 9; i++) shapes.push({ c: cols[i % cols.length], x: R() * cw * 0.75 + cw * 0.05, y: R() * ch * 0.7 + ch * 0.05, s: cw * (0.1 + R() * 0.2), t: i % 3 });
      for (const s of shapes) {
        ctx.fillStyle = 'rgba(40,30,20,0.18)'; ctx.beginPath();
        if (s.t === 0) ctx.arc(s.x + s.s / 2 + 5, s.y + s.s / 2 + 6, s.s / 2, 0, 7); else if (s.t === 1) ctx.rect(s.x + 5, s.y + 6, s.s, s.s * 0.7); else ctx.arc(s.x + s.s / 2 + 5, s.y + s.s / 2 + 6, s.s / 2, Math.PI, 0);
        ctx.fill(); ctx.fillStyle = s.c; ctx.beginPath();
        if (s.t === 0) ctx.arc(s.x + s.s / 2, s.y + s.s / 2, s.s / 2, 0, 7); else if (s.t === 1) ctx.rect(s.x, s.y, s.s, s.s * 0.7); else ctx.arc(s.x + s.s / 2, s.y + s.s / 2, s.s / 2, Math.PI, 0);
        ctx.fill();
      }
      ctx.strokeStyle = '#1b1b1d'; ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(R() * cw, R() * ch); ctx.lineTo(R() * cw, R() * ch); ctx.stroke(); }
      strokes(ctx, R, 500, () => 'rgba(120,90,60,1)', { len: 30, wid: 2, alpha: [0.03, 0.08] });
    } else if (kind === 2) {          // flowing topography
      const g = ctx.createLinearGradient(0, 0, cw, ch); g.addColorStop(0, '#0f1d28'); g.addColorStop(1, '#1d3544');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      for (let j = 0; j < 34; j++) {
        ctx.strokeStyle = j === 17 ? '#e5b660' : `hsl(${168 + j * 2.2} 42% ${30 + j * 1.2}%)`; ctx.lineWidth = j === 17 ? 5 : 2.6; ctx.beginPath();
        for (let x = 0; x <= cw; x += 8) { const y = ch * 0.05 + j * ch * 0.027 + Math.sin(x * 0.007 + j * 0.45) * 38 + Math.sin(x * 0.019 + j * 0.9) * 13 + Math.sin(x * 0.0026 + j * 0.1) * 60; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else if (kind === 3) {          // alpine lake
      const g = ctx.createLinearGradient(0, 0, 0, ch * 0.55); g.addColorStop(0, '#a9c4de'); g.addColorStop(1, '#f2e4d0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      strokes(ctx, R, 500, () => hsl(30 + R() * 20, 50, 85 + R() * 10), { len: 160, wid: 18, alpha: [0.2, 0.5], region: (x, y) => y < ch * 0.4 });
      [[0.42, '#8a9fc0', 70, 4], [0.5, '#5f7ba3', 55, 6], [0.58, '#3d5a7d', 44, 8]].forEach(([b, c, a, r], i) => { ctx.fillStyle = c; mountains(ctx, cw, ch * b, a, r, 2 + i * 1.9); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 18; i++) { const x = R() * cw, y = ch * (0.3 + R() * 0.14); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 22, y + 36); ctx.lineTo(x + 22, y + 36); ctx.fill(); }
      const mist = ctx.createLinearGradient(0, ch * 0.5, 0, ch * 0.64); mist.addColorStop(0, 'rgba(240,235,225,0)'); mist.addColorStop(0.6, 'rgba(240,235,225,0.75)'); mist.addColorStop(1, 'rgba(240,235,225,0)');
      ctx.fillStyle = mist; ctx.fillRect(0, ch * 0.5, cw, ch * 0.14);
      const lake = ctx.createLinearGradient(0, ch * 0.62, 0, ch); lake.addColorStop(0, '#5d7ea2'); lake.addColorStop(1, '#1f3550');
      ctx.fillStyle = lake; ctx.fillRect(0, ch * 0.62, cw, ch * 0.38);
      strokes(ctx, R, 900, (x, y) => hsl(212 + R() * 14, 38, 38 + (1 - (y / ch)) * 38 + R() * 10), { len: 90, wid: 5, alpha: [0.2, 0.55], region: (x, y) => y > ch * 0.63 });
      ctx.fillStyle = '#16251f';                                            // pines
      for (let i = 0; i < 26; i++) {
        const x = (i / 25) * cw + (R() - 0.5) * 30, hh = ch * (0.13 + R() * 0.16), by = ch * 0.69 + R() * 6;
        for (let t = 0; t < 4; t++) { const ww = hh * (0.18 + t * 0.07), yy = by - hh + t * hh * 0.27; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x - ww, yy + hh * 0.36); ctx.lineTo(x + ww, yy + hh * 0.36); ctx.fill(); }
      }
      ctx.fillRect(0, ch * 0.69, cw, ch * 0.02);
    } else if (kind === 4) {          // botanical print
      ctx.fillStyle = '#f0e8d6'; ctx.fillRect(0, 0, cw, ch);
      strokes(ctx, R, 700, () => 'rgba(150,120,80,1)', { len: 50, wid: 2, alpha: [0.03, 0.09] });
      const leaf = (x, y, s, ang, c1, c2) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        const g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-s * 0.7, -s * 0.15, -s * 0.8, -s * 0.8, 0, -s); ctx.bezierCurveTo(s * 0.8, -s * 0.8, s * 0.7, -s * 0.15, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(240,232,214,1)'; ctx.lineCap = 'round';                               // monstera slits painted in the paper colour
        for (let i = 0; i < 5; i++) { const yy = -s * (0.22 + i * 0.14); for (const sd of [-1, 1]) { ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(sd * s * 0.62 * (1 - Math.abs(yy / s + 0.5) * 0.5), yy - s * 0.05); ctx.lineTo(sd * s * 0.1, yy); ctx.stroke(); } }
        ctx.strokeStyle = 'rgba(235,245,205,0.7)'; ctx.lineWidth = s * 0.014; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.96); ctx.stroke();
        ctx.restore();
      };
      leaf(cw * 0.34, ch * 0.96, ch * 0.78, -0.18, '#2c5d3a', '#4f8a54'); leaf(cw * 0.66, ch * 0.98, ch * 0.62, 0.3, '#21492f', '#3d7a48'); leaf(cw * 0.5, ch * 0.98, ch * 0.45, 0.05, '#4f8a54', '#78ad69');
      ctx.fillStyle = '#d9a35c'; ctx.beginPath(); ctx.arc(cw * 0.78, ch * 0.2, ch * 0.09, 0, 7); ctx.fill();
    } else {                          // city at night
      const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#171a3a'); g.addColorStop(0.6, '#5a3a6e'); g.addColorStop(1, '#e58a6a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 110; i++) { ctx.fillStyle = `rgba(255,255,240,${0.2 + R() * 0.7})`; ctx.fillRect(R() * cw, R() * ch * 0.45, 2, 2); }
      ctx.fillStyle = '#f4ecd2'; ctx.beginPath(); ctx.arc(cw * 0.78, ch * 0.2, ch * 0.07, 0, 7); ctx.fill();
      for (let layer = 0; layer < 3; layer++) {
        const shade = ['#3b2d55', '#261c3d', '#120d22'][layer]; let x = -10;
        while (x < cw) {
          const bw = 40 + R() * 80, bh = ch * (0.25 + R() * 0.3 - layer * 0.05), by = ch - bh - layer * 14 + 40;
          ctx.fillStyle = shade; ctx.fillRect(x, by, bw, ch - by);
          if (layer > 0) for (let wy = by + 14; wy < ch - 30; wy += 16) for (let wx = x + 8; wx < x + bw - 10; wx += 14) if (R() < 0.38) { ctx.fillStyle = R() < 0.7 ? '#ffd88a' : '#9fd6ff'; ctx.fillRect(wx, wy, 6, 8); }
          x += bw + R() * 6;
        }
      }
    }
    // canvas weave + vignette
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#000';
    for (let y = 0; y < ch; y += 4) ctx.fillRect(0, y, cw, 1);
    for (let x = 0; x < cw; x += 4) ctx.fillRect(x, 0, 1, ch);
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
  }, { aniso: 8 });
}

// Framed picture: stepped frame profile, a mat board for the print styles, and a lightly varnished canvas.
// (x, y) = bottom-centre on the wall, front faces local +z; w x h is the picture opening (the frame adds 4.5 cm around it).
export function artwork(par, x, y, z, ry, w, h, kind, frame = 'walnut') {
  const M = palette(), k = new Kit();
  const fm = frame === 'brass' ? M.brass : frame === 'black' ? M.blackMetal : M.walnut;
  const matted = kind === 1 || kind === 2 || kind === 4;
  const f = 0.045, t = 0.04, lip = 0.014;
  const ow = w + 2 * f, oh = h + 2 * f;
  const rail = (rw, rh, rx, ry0, rz, rt) => k.box(fm, rw, rh, rt, rx, ry0, rz, { r: 0.004, seg: 2 });
  rail(ow, f, 0, -f, 0, t); rail(ow, f, 0, h, 0, t); rail(f, oh - 2 * f, -w / 2 - f / 2, 0, 0, t); rail(f, oh - 2 * f, w / 2 + f / 2, 0, 0, t);
  rail(w + lip, lip, 0, h - lip, t * 0.5, 0.01); rail(w + lip, lip, 0, 0, t * 0.5, 0.01); rail(lip, h - 2 * lip, -w / 2 + lip / 2, lip, t * 0.5, 0.01); rail(lip, h - 2 * lip, w / 2 - lip / 2, lip, t * 0.5, 0.01);
  k.box(M.blackMetal, w + 0.01, h + 0.01, 0.01, 0, 0, -t / 2 + 0.005);               // backing board
  const g = finish(par, k, x, y, z, ry, { receive: true });
  const mw = matted ? Math.min(w, h) * 0.1 : 0;
  if (matted) {                                                                       // mat board
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * lip, h - 2 * lip), pm('paint', { color: 0xf3eee2, rough: 0.9, interior: true }));
    mm.position.set(0, h / 2, -t / 2 + 0.012); g.add(mm);
    const bev = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * lip - 2 * mw + 0.012, h - 2 * lip - 2 * mw + 0.012), pm('paint', { color: 0xfffdf6, rough: 0.9, interior: true }));
    bev.position.set(0, h / 2, -t / 2 + 0.0135); g.add(bev);
  }
  const aw = w - 2 * lip - 2 * mw, ah = h - 2 * lip - 2 * mw;
  const cmat = pm('plain', { color: 0xffffff, rough: 0.5, interior: true, physical: true, clearcoat: 0.55, ccRough: 0.35 }).clone();
  cmat.map = paintingTexture(kind, aw, ah); cmat.needsUpdate = true;
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), cmat);
  cm.position.set(0, h / 2, -t / 2 + 0.014 + (matted ? 0.004 : 0)); g.add(cm);
  return g;
}

// ------------------------------------------------------------------ plants
function leafCluster(k, M, mats, cx, cy, cz, count, len, wid, spreadY, r, o = {}) {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, tilt = o.tilt ?? (0.5 + r() * 0.6);
    const l = len * (0.7 + r() * 0.5);
    const geo = leafGeometry(l, wid * (0.8 + r() * 0.4), o.droop ?? 0.35, 0.3, 9, o.heart ?? 0);
    const m4 = mat4(cx + Math.cos(a) * 0.03, cy + r() * spreadY, cz + Math.sin(a) * 0.03, -tilt + 0.2, a, 0);
    // face outward: leaf points along +z, rotate about x for elevation then y for heading
    k.push(mats[i % mats.length], geo, m4);
  }
}

const monsteraMats = () => [
  pm('foliage', { color: 0x2a6a38, col2: 0x15452a, side: THREE.DoubleSide, alphaTest: 0.5, p: [1, 0, 0, 0], interior: true }),
  pm('foliage', { color: 0x3c7d3c, col2: 0x1f5a2c, side: THREE.DoubleSide, alphaTest: 0.5, p: [1, 0, 0, 0], interior: true }),
  pm('foliage', { color: 0x1f5230, col2: 0x113a22, side: THREE.DoubleSide, alphaTest: 0.5, p: [1, 0, 0, 0], interior: true }),
];

function ribbedPot(k, mat, saucerMat, r0, h, ribs = 0) {
  const pts = [[0, 0.012], [r0 * 0.78, 0.012], [r0 * 0.86, 0.03], [r0 * 1.0, h * 0.88], [r0 * 1.07, h * 0.96], [r0 * 1.09, h], [r0 * 0.95, h], [r0 * 0.93, h - 0.02], [0, h - 0.06]];
  k.lathe(mat, pts, 0, 0, 0, { seg: 40 });
  k.lathe(saucerMat, [[0, 0], [r0 * 0.9, 0], [r0 * 1.12, 0.014], [r0 * 1.16, 0.028], [r0 * 1.1, 0.028], [r0 * 0.9, 0.012], [0, 0.012]], 0, 0, 0, { seg: 40 });
  for (let i = 0; i < ribs; i++) k.torus(mat, r0 * (0.9 + 0.1 * (i / ribs)), 0.004, 0, h * (0.2 + 0.6 * (i / ribs)) + 0.02, 0, { seg: 40, seg2: 4 });
}

export function monstera(par, y0, x, z, scale = 1, seed = 1) {
  const M = palette(), k = new Kit(), r = rng(seed * 313), ML = monsteraMats();
  ribbedPot(k, M.terracotta, M.terracotta, 0.2, 0.4, 3);
  k.cyl(M.soil, 0.19, 0.19, 0.012, 0, 0.36, 0, { seg: 24 });
  for (let i = 0; i < 6; i++) k.sph(M.marbleW, 0.02 + r() * 0.012, Math.cos(i * 1.1) * 0.12, 0.37, Math.sin(i * 1.1) * 0.12, { sy: 0.6, seg: 8, seg2: 6 });
  for (let i = 0; i < 22; i++) {
    const a = r() * 6.28, h = 0.3 + r() * 0.62, out = 0.1 + r() * 0.36;
    const sx = Math.cos(a) * 0.03, sz = Math.sin(a) * 0.03;
    const ex = Math.cos(a) * out, ez = Math.sin(a) * out;
    k.tube(M.leafLight, [[sx, 0.37, sz], [sx * 3 + ex * 0.25, 0.37 + h * 0.62, sz * 3 + ez * 0.25], [ex, 0.37 + h, ez]], 0.0085, { seg: 14, radial: 5 });
    const len = 0.3 + r() * 0.2, wid = len * (0.62 + r() * 0.1);
    const geo = leafGeometry(len, wid * 0.5, 0.5 + r() * 0.2, 0.32, 12, 1.0);
    k.push(ML[i % 3], geo, mat4(ex, 0.37 + h, ez, 0.25 + r() * 0.5, Math.PI / 2 - a + (r() - 0.5) * 0.7, (r() - 0.5) * 0.3));
  }
  const g = finish(par, k, x, y0, z, 0);
  g.scale.setScalar(scale);
  colBox(x, z, 0.45 * scale, 0.45 * scale, 0, y0, y0 + 1.5 * scale);
  return g;
}

export function fiddleFig(par, y0, x, z, scale = 1, seed = 2) {
  const M = palette(), k = new Kit(), r = rng(seed * 77);
  ribbedPot(k, M.blackCeramic, M.blackCeramic, 0.23, 0.46, 0);
  k.cyl(M.soil, 0.22, 0.22, 0.012, 0, 0.42, 0, { seg: 24 });
  k.tube(M.walnut, [[0, 0.42, 0], [0.02, 1.0, 0.01], [-0.02, 1.6, 0.03], [0.03, 2.1, 0.0]], 0.022, { seg: 24, radial: 7 });
  for (let b = 0; b < 3; b++) k.tube(M.walnut, [[0.01, 1.0 + b * 0.32, 0.01], [0.1 * (b % 2 ? 1 : -1), 1.15 + b * 0.32, 0.1], [0.2 * (b % 2 ? 1 : -1), 1.3 + b * 0.32, 0.16]], 0.009, { seg: 8, radial: 5 });
  for (let i = 0; i < 46; i++) {
    const t = i / 46, h = 0.85 + t * 1.3, a = i * 2.4 + r();
    const rad = 0.03 + Math.sin(t * 3.14) * 0.22;
    const geo = leafGeometry(0.26 + r() * 0.1, 0.11 + r() * 0.04, 0.3, 0.22, 9, 0.9);
    k.push(i % 4 ? M.leaf : M.leafLight, geo, mat4(Math.cos(a) * rad * 0.4, h, Math.sin(a) * rad * 0.4, 0.8 - t * 0.45, Math.PI / 2 - a, 0));
  }
  const g = finish(par, k, x, y0, z, 0);
  g.scale.setScalar(scale);
  colBox(x, z, 0.5 * scale, 0.5 * scale, 0, y0, y0 + 2.2 * scale);
  return g;
}

export function snakePlant(k, M, x, y, z, seed = 3, s = 1) {
  const r = rng(seed * 19);
  k.lathe(M.ceramic, [[0, 0], [0.09, 0], [0.11, 0.24], [0.12, 0.27], [0.105, 0.27], [0.1, 0.24], [0, 0.22]], x, y, z, { seg: 28 });
  k.torus(M.ceramic, 0.108, 0.005, x, y + 0.245, z, { rx: Math.PI / 2, seg: 28, seg2: 4 });
  k.cyl(M.soil, 0.1, 0.1, 0.01, x, y + 0.23, z, { seg: 16 });
  for (let i = 0; i < 15; i++) {
    const a = r() * 6.28, h = (0.3 + r() * 0.55) * s;
    const geo = leafGeometry(h, 0.042 + r() * 0.02, 0.05, 0.45, 9, 0);
    k.push(i % 2 ? M.leaf : M.leafDark, geo, mat4(x + Math.cos(a) * 0.035, y + 0.25, z + Math.sin(a) * 0.035, -1.3 + r() * 0.2, a, 0));
  }
}

export function trailingPlant(k, M, x, y, z, seed = 5) {
  const r = rng(seed * 41);
  k.lathe(M.ceramic, [[0, 0], [0.08, 0], [0.1, 0.16], [0.105, 0.18], [0.09, 0.18], [0, 0.15]], x, y, z);
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, len = 0.35 + r() * 0.45;
    const pts = [[x, y + 0.17, z], [x + Math.cos(a) * 0.12, y + 0.16, z + Math.sin(a) * 0.12], [x + Math.cos(a) * 0.17, y - len * 0.5, z + Math.sin(a) * 0.17], [x + Math.cos(a) * 0.15, y - len, z + Math.sin(a) * 0.15]];
    k.tube(M.leafLight, pts, 0.004, { seg: 14, radial: 4 });
    for (let j = 1; j < 8; j++) {
      const t = j / 8, py = y + 0.15 - t * (len + 0.15), rr = 0.12 + t * 0.06;
      k.push(M.leaf, leafGeometry(0.07, 0.04, 0.2, 0.2, 4, 0.5), mat4(x + Math.cos(a) * rr, py, z + Math.sin(a) * rr, 1.2, a + r(), 0));
    }
  }
}

// ------------------------------------------------------------------ rugs & misc
export function rug(par, y0, x, z, w, d, ry, set) {
  const M = palette();
  const mat = pm('rug', { color: set.color, col2: set.col2, p: [set.freq ?? 1.6, w / 2, d / 2, 0], interior: true });
  const geo = new THREE.BoxGeometry(w, 0.018, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y0 + 0.009, z); m.rotation.y = ry;
  m.receiveShadow = true;
  par.add(m);
  return m;
}

// books for shelves: instanced boxes with per-instance colour
export function bookRun(par, y0, x, y, z, ry, len, h, depth, r, palette2) {
  const list = [];
  let cx = 0;
  while (cx < len - 0.04) {
    const w = 0.022 + r() * 0.04, bh = h * (0.65 + r() * 0.35), tilt = r() < 0.05 ? 0.25 : 0;
    if (cx + w > len) break;
    list.push({ x: cx + w / 2, w, h: bh, d: depth * (0.75 + r() * 0.25), c: palette2[Math.floor(r() * palette2.length)], tilt });
    cx += w + 0.002;
    if (r() < 0.06) cx += 0.1 + r() * 0.25; // gap (a plant or a vase stands here)
  }
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, pm('book', { color: 0xffffff, rough: 0.6, interior: true }), list.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  list.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x - len / 2, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, b.tilt)), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.set(b.c));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  g.position.set(x, y, z); g.rotation.y = ry;
  par.add(g);
  return { g, list, end: cx };
}

export function paintingRig() { /* placeholder to keep import list stable */ }
