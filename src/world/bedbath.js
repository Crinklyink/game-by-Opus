// Bedroom (bed, nightstands, wardrobe, dresser, reading corner) and bathroom fixtures.
import * as THREE from 'three';
import { Kit, mat4, leafGeometry } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { rng } from '../core/util.js';
import { G } from '../core/G.js';
import { finish, colBox, armchair, tableLamp, floorLamp, artwork, sideTable, snakePlant, trailingPlant } from './furniture.js';
import { cushion, throwPillow, leanPillow, pullBar, knob, bookStack, mug, branchVase, flutes, slats, turnedLeg, shakerDoor, slabDoor } from './shapes.js';

const cover = (c) => pm('paint', { color: c, rough: 0.55, interior: true });

export function buildBed(par, y0, x, z) {
  const M = palette(), k = new Kit(), out = {};
  const BW = 1.82, BL = 2.12;
  // frame: floating platform on a dark plinth, brass toe-kick trim
  k.box(M.blackMetal, BW - 0.1, 0.09, BL - 0.1, 0, 0.0, 0.0);
  k.box(M.walnut, BW + 0.08, 0.17, BL + 0.08, 0, 0.09, 0, { r: 0.014, seg: 3 });
  k.box(M.brass, BW + 0.09, 0.006, BL + 0.09, 0, 0.095, 0);
  // headboard: walnut backboard with padded vertical channels spanning wider than the bed
  const HBW = 2.55, hz = -BL / 2 - 0.08;
  k.box(M.walnut, HBW + 0.04, 1.3, 0.05, 0, 0.0, hz - 0.045, { r: 0.006 });
  const n = 7, cw = HBW / n;
  for (let i = 0; i < n; i++) cushion(k, M.charcoal, cw - 0.014, 0.1, 1.12, (i - (n - 1) / 2) * cw, 0.7 - 0.05, hz + 0.0, { rx: Math.PI / 2, r: 0.04, crown: 0.02, seg: 5, pipe: M.charcoal });
  // mattress with piped border, then the linens
  cushion(k, M.white, BW - 0.02, 0.27, BL - 0.04, 0, 0.24, 0.0, { r: 0.055, crown: 0.012, bulge: 0.008, pipe: M.white, seg: 6 });
  k.cloth(M.linen, 1.98, 1.66, 0, 0, 0.27, (u, v) => {
    const eu = Math.min(u, 1 - u), ev = 1 - v;
    const sm = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
    const d = 0.27 * (1 - sm(0.0, 0.1, eu)) + 0.27 * (1 - sm(0.0, 0.07, ev));
    const fold = 0.014 * Math.sin(u * 22 + v * 5) * Math.sin(v * 8 + 1) + 0.007 * Math.sin(u * 55 + v * 3) + 0.005 * Math.sin(v * 31 + u * 9);
    const crease = -0.012 * Math.exp(-Math.pow((v - 0.36) * 22, 2));                 // where the top sheet turns back
    return 0.538 + fold + crease - d;
  }, { sw: 84, sh: 84 });
  // knit throw across the foot of the bed, lying on the duvet and falling over the foot edge (cloth heightfield, not a slab)
  { const sm = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
    k.cloth(M.charcoal, 1.62, 0.78, 0, 0, BL / 2 - 0.22, (u, v) => {
      const z = (v - 0.5) * 0.78 + BL / 2 - 0.22, over = z - (BL / 2 - 0.04);
      const top = 0.566 + 0.008 * Math.sin(u * 23 + v * 5) + 0.004 * Math.sin(u * 61);
      return over > 0 ? Math.max(0.3, top - over * 7.5 - 0.02 * sm(0.0, 0.04, over)) : top - 0.01 * sm(-0.06, 0.0, over);
    }, { sw: 60, sh: 30 }); }
  // pillows: euros stand against the headboard, sleepers lean on them, accents + a lumbar in front (every one rests on the mattress or the pillow behind it)
  const PY = 0.54;                                         // mattress / sheet surface
  for (const px of [-0.46, 0.46]) {
    leanPillow(k, M.linen, 0.62, 0.15, 0.62, px, -0.923, PY, 1.1, { e: 0.6 });
    leanPillow(k, M.white, 0.72, 0.17, 0.5, px * 1.02, -0.52, PY, 0.45, { e: 0.55, ry: px * 0.04 });
  }
  for (const [px, m, ry] of [[-0.36, M.sage, 0.25], [0.4, M.rust, -0.25]]) leanPillow(k, m, 0.46, 0.12, 0.34, px, -0.40, PY, 0.6, { ry, e: 0.6 });
  leanPillow(k, M.mustard, 0.56, 0.11, 0.24, 0.02, -0.25, PY, 0.35, { e: 0.6 });
  // nightstands (floating) with drawer, open shelf, lamps and things
  const rr = rng(404);
  for (const s of [-1, 1]) {
    const px = s * (BW / 2 + 0.5), pz = hz + 0.25;
    k.box(M.walnut, 0.5, 0.3, 0.42, px, 0.3, pz, { r: 0.01, seg: 3 });
    k.box(M.blackMetal, 0.52, 0.008, 0.44, px, 0.44, pz);
    k.box(M.walnut, 0.46, 0.13, 0.02, px, 0.44 - 0.16, pz + 0.215, { r: 0.004 });            // drawer front
    pullBar(k, M.brass, px, 0.44 - 0.09, pz + 0.225, 0.14, false);
    k.box(M.blackMetal, 0.44, 0.11, 0.36, px, 0.31, pz - 0.02);                                 // open cubby
    k.box(M.blackMetal, 0.06, 0.28, 0.06, px, 0.02, pz);
    tableLamp(k, M, px, 0.6, pz, M.shade);
    bookStack(k, M.paper, [{ c: cover(s > 0 ? 0x6d3b2a : 0x2c3d52), w: 0.2, d: 0.14, h: 0.03 }, { c: cover(0xd8ceb8), w: 0.18, d: 0.13, h: 0.02, j: -1 }], px + 0.12 * s, 0.6, pz + 0.08, 0.3 * s);
  }
  const glass = M.glass;
  k.lathe(glass, [[0, 0], [0.03, 0], [0.032, 0.1], [0.028, 0.1], [0.026, 0.006], [0, 0.006]], -(BW / 2 + 0.5) - 0.13, 0.6, hz + 0.34, { seg: 16 });
  k.box(M.plasticB, 0.075, 0.008, 0.155, BW / 2 + 0.36, 0.6, hz + 0.42, { r: 0.006, ry: 0.4 });          // phone
  // slippers on the floor
  for (const s of [-1, 1]) { k.box(M.linen, 0.1, 0.045, 0.27, s * 0.95 - 1.1 * 0, 0.0, 0.85, { r: 0.02, ry: s * 0.15 }); k.box(M.sage, 0.1, 0.02, 0.1, s * 0.95, 0.045, 0.78, { r: 0.008, ry: s * 0.15 }); }
  const TH = Math.PI / 2;
  const g = finish(par, k, x, y0, z, TH);      // head against the west wall
  out.group = g;
  const rot = (lx, ly, lz) => new THREE.Vector3(x + lx * Math.cos(TH) + lz * Math.sin(TH), y0 + ly, z + (-lx * Math.sin(TH) + lz * Math.cos(TH)));
  out.lampPos = [rot(-(BW / 2 + 0.5), 0.86, hz + 0.25), rot(BW / 2 + 0.5, 0.86, hz + 0.25)];
  out.bedPos = rot(0, 0.9, 0.2);
  colBox(x, z, 2.7, 2.6, 0, y0, y0 + 0.75);
  return out;
}

export function buildDresser(par, y0, x, z, ry) {
  const M = palette(), k = new Kit();
  const W = 1.6, D = 0.46;
  k.box(M.blackMetal, W - 0.1, 0.1, D - 0.08, 0, 0, 0);
  k.box(M.walnut, W, 0.03, D, 0, 0.1, 0, { r: 0.006 });
  k.box(M.walnut, W, 0.03, D, 0, 0.79, 0, { r: 0.006 });
  for (const s of [-1, 1]) k.box(M.walnut, 0.03, 0.66, D, s * (W / 2 - 0.015), 0.13, 0, { r: 0.006 });
  k.box(M.blackMetal, W - 0.06, 0.66, D - 0.04, 0, 0.13, -0.01);
  // six fluted drawer fronts with brass pulls
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const cx = (c - 0.5) * (W / 2 - 0.02), cy = 0.14 + r * 0.215, dw = W / 2 - 0.05;
    k.box(M.walnut, dw, 0.2, 0.022, cx, cy, D / 2 + 0.005, { r: 0.004 });
    flutes(k, M.walnut, dw - 0.04, 0.17, cx, cy + 0.015, D / 2 + 0.018, 13, 0.0075);
    pullBar(k, M.brass, cx, cy + 0.1, D / 2 + 0.014, 0.1, false);
  }
  // round mirror on the wall above, brass frame with a bevelled glass
  const mm = pm('plain', { color: 0xdfe6ea, metal: 1, rough: 0.02, interior: true });
  k.torus(M.brass, 0.42, 0.014, 0, 1.55, -0.222, { rx: 0, seg: 64, seg2: 8 });
  k.torus(M.brass, 0.405, 0.005, 0, 1.55, -0.212, { rx: 0, seg: 64, seg2: 5 });
  // the glass is a real planar mirror (src/gfx/mirrors.js); world transform of the dresser's local frame:
  { const c = Math.cos(ry), sn = Math.sin(ry), lz = -0.213;
    G.mirrors?.add(par, { name: 'dresser', pos: [x + lz * sn, y0 + 1.55, z + lz * c], normal: [sn, 0, c], quads: [{ w: 0.82, h: 0.82, round: true }], res: 900, room: { x0: -49.2, x1: -41.8, z0: 20.3, z1: 29.1, y0: y0 - 1, y1: y0 + 3.8 } }); }
  // tray with perfumes, jewellery box, framed photo, small plant
  k.box(M.marbleD, 0.34, 0.015, 0.22, -0.4, 0.82, 0.0, { r: 0.004 });
  k.box(M.brass, 0.35, 0.02, 0.005, -0.4, 0.83, 0.11);
  for (let i = 0; i < 3; i++) {
    const pmat = pm('plain', { color: [0xe8c98a, 0x7fa89a, 0xc47a68][i], rough: 0.06, physical: true, clearcoat: 1, transparent: true, opacity: 0.85, interior: true });
    k.lathe(pmat, [[0, 0], [0.025, 0], [0.028, 0.06 + i * 0.02], [0.012, 0.09 + i * 0.02], [0.01, 0.12 + i * 0.02], [0.0, 0.12 + i * 0.02]], -0.5 + i * 0.09, 0.835, 0.0, { seg: 16 });
    k.sph(M.brass, 0.011, -0.5 + i * 0.09, 0.835 + 0.13 + i * 0.02, 0.0, {});
  }
  k.box(M.leather, 0.24, 0.1, 0.16, 0.45, 0.82, 0.0, { r: 0.012, seg: 3 });
  k.box(M.brass, 0.05, 0.012, 0.02, 0.45, 0.9, 0.08);
  k.box(M.walnut, 0.16, 0.2, 0.014, 0.12, 0.82, -0.05, { r: 0.004, rx: -0.15 });
  k.box(pm('plain', { color: 0xc9b99a, rough: 0.6, interior: true }), 0.13, 0.17, 0.004, 0.12, 0.835, -0.041, { rx: -0.15 });
  k.lathe(M.terracotta, [[0, 0], [0.05, 0], [0.065, 0.12], [0.06, 0.13], [0.0, 0.12]], 0.7, 0.82, 0.02, { seg: 20 });
  for (let i = 0; i < 7; i++) { const a = i * 0.9; k.push(M.leaf, leafGeometry(0.16, 0.05, 0.3, 0.2, 6, 0), mat4(0.7 + Math.cos(a) * 0.02, 0.94, 0.02 + Math.sin(a) * 0.02, -0.4 - (i % 3) * 0.2, a, 0)); }
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, W, D, ry, y0, y0 + 0.9);
  return g;
}

export function buildWardrobe(par, y0, x, z, ry, W = 2.9) {
  const M = palette(), k = new Kit();
  const H = 2.55, D = 0.62;
  k.box(M.walnutV, W, H, D, 0, 0, 0, { r: 0.004 });
  k.box(M.walnut, W + 0.05, 0.05, D + 0.03, 0, H, 0, { r: 0.006 });                       // cornice
  k.box(M.blackMetal, W - 0.02, 0.06, D - 0.04, 0, -0.0, 0.0);                             // toe-kick shadow
  const n = 3, dw = W / n;
  const mirrorPanels = [];
  for (let i = 0; i < n; i++) {
    const cx = (i - 1) * dw, oz = D / 2 + 0.006 + (i % 2) * 0.022;
    k.box(M.blackMetal, dw - 0.008, H - 0.06, 0.02, cx, 0.03, oz);
    if (i === 1) {
      k.box(M.oakV, dw - 0.09, H - 0.15, 0.006, cx, 0.075, oz + 0.013);
      for (let j = 0; j < 4; j++) k.box(M.walnut, 0.006, H - 0.15, 0.008, cx - dw / 2 + 0.09 + j * ((dw - 0.18) / 3), 0.075, oz + 0.018);
    } else {
      mirrorPanels.push({ dx: cx, w: dw - 0.09, lz: oz + 0.0185 });
      k.box(M.blackMetal, dw - 0.06, 0.02, 0.008, cx, 0.06, oz + 0.014); k.box(M.blackMetal, dw - 0.06, 0.02, 0.008, cx, H - 0.09, oz + 0.014);
    }
    pullBar(k, M.brass, cx + (i === 1 ? -0.16 : 0.2), 0.9, oz + 0.004, 0.42, true);
  }
  const g = finish(par, k, x, y0, z, ry);
  if (mirrorPanels.length) {                                   // both mirrored doors lie in one plane -> one reflection
    const c = Math.cos(ry), sn = Math.sin(ry), lz = mirrorPanels[0].lz;
    G.mirrors?.add(par, { name: 'wardrobe', pos: [x + lz * sn, y0 + 0.075 + (H - 0.15) / 2, z + lz * c], normal: [sn, 0, c], quads: mirrorPanels.map((p) => ({ dx: p.dx, w: p.w, h: H - 0.15 })), res: 1600, room: { x0: -49.2, x1: -41.8, z0: 20.3, z1: 29.1, y0: y0 - 1, y1: y0 + 3.8 } });
  }
  colBox(x, z, W, D, ry, y0, y0 + H);
  return g;
}

export function buildReadingCorner(par, y0, x, z) {
  const M = palette();
  armchair(par, y0, x, z, -Math.PI * 0.28, M.charcoal);          // faces out of the corner into the room
  const lamp = floorLamp(par, y0, x + 0.85, z - 0.6, Math.PI);
  const k = new Kit();
  sideTable(par, y0, x - 0.55, z - 0.5);
  // throw + book on the armchair
  const kk = new Kit();
  kk.cloth(M.rust, 0.5, 0.7, 0, 0, 0, (u, v) => 0.012 * Math.sin(u * 16) + (v > 0.55 ? -Math.pow((v - 0.55) / 0.45, 1.5) * 0.3 : 0), { sw: 20, sh: 26 });
  finish(par, kk, x - 0.1, y0 + 0.5, z - 0.12, -Math.PI * 0.28 + 0.1);
  return { lamp };
}

// ---------------------------------------------------------------- bathroom (x -49..-42, z 29..32.4)
export function buildBathroom(par, y0, ctx) {
  const M = palette(), k = new Kit(), out = {};
  const glass = M.glass;
  const towelW = pm('fabric', { color: 0xf3f0ea, interior: true }), towelG = pm('fabric', { color: 0x7d8d78, interior: true });
  // wall tiles: 0.01 skin in front of plaster (west wall x=-49, south wall z=32.4, and the north partition z=29 back face)
  k.box(M.tileBath, 0.012, 2.5, 3.35, -48.994, 0, 30.72);            // west
  k.box(M.tileBath, 6.95, 2.5, 0.012, -45.5, 0, 32.394);            // south
  k.box(M.tileBath, 3.675, 2.5, 0.012, -47.1375, 0, 29.13);         // north partition (bath side), cut around the door opening (x -45.3..-44.2, 2.4 high)
  k.box(M.tileBath, 2.175, 2.5, 0.012, -43.1125, 0, 29.13);
  k.box(M.tileBath, 1.1, 0.1, 0.012, -44.75, 2.4, 29.13);
  k.box(M.tileDark, 0.012, 2.5, 3.35, -42.13, 0, 30.72);           // east partition (bath side) dark accent
  k.box(M.marbleW, 6.95, 0.03, 0.03, -45.5, 2.5, 32.38);           // tile-top ledge
  k.box(M.tileDark, 6.95, 0.02, 3.3, -45.5, 0, 30.75);             // floor
  // shower area (west end): glass screen with hardware, niche, rain head, handheld bar, thermostatic valve
  k.box(M.blackMetal, 0.03, 2.3, 0.03, -47.2, 0.02, 29.15);
  k.box(M.blackMetal, 0.03, 2.3, 0.03, -47.2, 0.02, 32.35);
  k.box(M.blackMetal, 0.03, 0.03, 3.2, -47.2, 2.3, 30.75);
  k.box(M.blackMetal, 0.03, 0.03, 3.2, -47.2, 0.02, 30.75);
  k.box(M.blackMetal, 0.028, 2.3, 0.028, -47.2, 0.02, 30.1);
  pullBar(k, M.blackMetal, -47.17, 1.05, 30.13, 0.5, true);
  k.strut(M.chrome, [-48.93, 2.35, 30.75], [-48.3, 2.35, 30.75], 0.011, 0.011);
  k.cyl(M.chrome, 0.16, 0.14, 0.02, -48.3, 2.33, 30.75, { seg: 40 });
  k.cyl(pm('plain', { color: 0x9aa0a4, metal: 1, rough: 0.3, interior: true }), 0.145, 0.145, 0.003, -48.3, 2.328, 30.75, { seg: 32 });
  k.cyl(M.chrome, 0.012, 0.012, 0.5, -48.9, 1.3, 30.75, { seg: 8 });
  k.box(M.chrome, 0.05, 0.05, 0.12, -48.95, 1.2, 31.6, { r: 0.008 });
  k.cyl(M.chrome, 0.028, 0.028, 0.02, -48.94, 1.15, 31.6, { rz: Math.PI / 2, cy: true, seg: 18 });
  k.cyl(M.chrome, 0.028, 0.028, 0.02, -48.94, 1.25, 31.6, { rz: Math.PI / 2, cy: true, seg: 18 });
  k.tube(M.chrome, [[-48.96, 1.2, 31.6], [-48.9, 1.0, 31.4], [-48.7, 0.85, 31.35]], 0.006, { seg: 10, radial: 4 });
  k.box(M.marbleW, 0.02, 0.32, 0.75, -48.985, 1.1, 30.2);              // niche shelf
  const nm = [0xe8dcc0, 0x7fa89a, 0xd8845c];
  nm.forEach((c, i) => k.lathe(pm('plain', { color: c, rough: 0.2, interior: true }), [[0, 0], [0.028, 0], [0.03, 0.14 - i * 0.02], [0.014, 0.16 - i * 0.02], [0.014, 0.18 - i * 0.02], [0, 0.18 - i * 0.02]], -48.94, 1.1, 29.95 + i * 0.09, { seg: 14 }));
  k.cyl(M.steel, 0.06, 0.06, 0.008, -48.3, 0.02, 30.75, { seg: 24 });     // drain
  for (let i = 0; i < 6; i++) k.box(M.steel, 0.12, 0.0035, 0.003, -48.3, 0.0265, 30.75 - 0.05 + i * 0.02);
  // vanity along south wall: floating walnut + marble top + 2 vessel basins with drawers
  k.box(M.walnut, 3.0, 0.5, 0.5, -44.7, 0.42, 32.15, { r: 0.008 });
  for (const s of [-1, 1]) for (const d of [0, 1]) {
    k.box(M.walnut, 1.44, 0.22, 0.02, -44.7 + s * 0.75, 0.44 + d * 0.24, 31.895, { r: 0.004 });
    flutes(k, M.walnut, 1.38, 0.19, -44.7 + s * 0.75, 0.455 + d * 0.24, 31.882, 26, 0.0085);
    pullBar(k, M.brass, -44.7 + s * 0.75, 0.6 + d * 0.24, 31.9, 0.2, false);
  }
  k.box(M.marbleW, 3.06, 0.035, 0.54, -44.7, 0.92, 32.13, { r: 0.004, seg: 3 });
  k.box(M.marbleW, 3.06, 0.14, 0.02, -44.7, 0.955, 32.37, { r: 0.002 });            // splash back
  for (const s of [-1, 1]) {
    const bx = -44.7 + s * 0.7;
    k.lathe(M.ceramic, [[0.0, 0.0], [0.09, 0.0], [0.12, 0.012], [0.19, 0.11], [0.192, 0.118], [0.184, 0.118], [0.12, 0.028], [0.0, 0.02]], bx, 0.955, 32.1, { seg: 40 });
    k.torus(M.chrome, 0.045, 0.004, bx, 0.958, 32.1, { rx: Math.PI / 2, seg: 20, seg2: 5 });
    k.tube(M.brass, [[bx, 0.955, 32.32], [bx, 1.18, 32.32], [bx, 1.22, 32.22], [bx, 1.18, 32.14]], 0.011, { seg: 16, radial: 8 });
    k.cyl(M.brass, 0.03, 0.03, 0.02, bx, 0.955, 32.32, { seg: 16 });
    k.box(M.brass, 0.02, 0.02, 0.05, bx + 0.05, 0.98, 32.32, { ry: 0.5 });
  }
  // mirror with backlight, a shelf, wall lights
  G.mirrors?.add(par, { name: 'bath', pos: [-44.7, y0 + 1.8, 32.374], normal: [0, 0, -1], quads: [{ w: 2.6, h: 1.1 }], res: 1700, room: { x0: -49.2, x1: -41.8, z0: 27.5, z1: 32.4, y0: y0 - 1, y1: y0 + 3.8 } });
  k.box(M.blackMetal, 2.6, 1.1, 0.01, -44.7, 1.25, 32.388);                                  // backing behind the glass
  k.box(M.brass, 2.66, 0.012, 0.014, -44.7, 2.35, 32.383); k.box(M.brass, 2.66, 0.012, 0.014, -44.7, 1.2, 32.383);
  k.box(M.ledCool, 2.62, 0.016, 0.01, -44.7, 2.36, 32.38);
  k.box(M.ledCool, 2.62, 0.016, 0.01, -44.7, 1.205, 32.38);
  // towels, soap, toothbrush cup, plant, tissues
  k.pillow(towelW, 0.32, 0.08, 0.22, -45.3, 0.96, 32.1, { e: 0.5 });
  k.pillow(towelW, 0.3, 0.05, 0.2, -45.3, 1.04, 32.1, { e: 0.5, ry: 0.4 });
  k.lathe(M.blackCeramic, [[0, 0], [0.03, 0], [0.032, 0.16], [0.016, 0.18], [0.012, 0.19], [0.0, 0.19]], -43.55, 0.955, 32.15, { seg: 16 });
  k.cyl(M.chrome, 0.004, 0.004, 0.06, -43.55, 1.13, 32.15, { seg: 6 });
  k.lathe(M.ceramic, [[0, 0], [0.032, 0], [0.036, 0.09], [0.031, 0.09], [0, 0.005]], -44.05, 0.955, 32.15, { seg: 16 });
  for (let i = 0; i < 3; i++) k.strut(pm('plain', { color: [0x3a7fc0, 0xe8e8e8, 0x4a9a6a][i], rough: 0.4, interior: true }), [-44.05 + (i - 1) * 0.01, 1.04, 32.15], [-44.05 + (i - 1) * 0.022, 1.16, 32.15 + (i - 1) * 0.01], 0.0045, 0.0045, { seg: 5 });
  snakePlant(k, M, -43.3, 0.955, 32.1, 8, 0.7);
  // toilet on the east partition side: bowl, rim, seat + lid, cistern with dual flush, hinge caps
  const tx = -42.78, tz = 30.75;
  k.lathe(M.ceramic, [[0, 0], [0.13, 0], [0.19, 0.04], [0.21, 0.16], [0.235, 0.34], [0.245, 0.4], [0.2, 0.41], [0.19, 0.36], [0.12, 0.2], [0, 0.1]], tx, 0, tz, { sx: 1.5, sz: 1, seg: 40 });
  k.lathe(M.plasticW, [[0.17, 0.4], [0.235, 0.402], [0.245, 0.418], [0.235, 0.432], [0.17, 0.43], [0.14, 0.42]], tx, 0, tz, { sx: 1.5, sz: 1, seg: 40 });
  k.lathe(M.plasticW, [[0.0, 0.442], [0.225, 0.436], [0.243, 0.432], [0.24, 0.45], [0.0, 0.46]], tx + 0.02, 0, tz, { sx: 1.44, sz: 0.94, seg: 40, rx: 0, rz: 0.0 });
  k.box(M.ceramic, 0.2, 0.44, 0.44, -42.31, 0.3, tz, { r: 0.035, seg: 4 });
  k.box(M.ceramic, 0.21, 0.02, 0.46, -42.305, 0.73, tz, { r: 0.008 });
  k.cyl(M.chrome, 0.026, 0.026, 0.008, -42.31, 0.745, tz - 0.06, { seg: 16 });
  k.cyl(M.chrome, 0.026, 0.026, 0.008, -42.31, 0.745, tz + 0.06, { seg: 16 });
  k.cyl(M.chrome, 0.012, 0.012, 0.05, -42.34, 0.12, tz + 0.08, { rz: Math.PI / 2, cy: true, seg: 8 });
  // towel radiator with hung towels; hooks; bath mat; bin
  for (let i = 0; i < 7; i++) k.cyl(M.chrome, 0.011, 0.011, 0.55, -47.55, 1.0 + i * 0.13, 29.29, { rz: Math.PI / 2, cy: true, seg: 8 });
  for (const sx of [-47.83, -47.27]) k.cyl(M.chrome, 0.014, 0.014, 0.9, sx, 1.0, 29.29, { seg: 8 });
  k.pillow(towelW, 0.5, 0.05, 0.3, -47.55, 1.55, 29.33, { e: 0.5, dimple: 0, rx: 0.1 });
  k.pillow(towelG, 0.46, 0.05, 0.3, -47.55, 1.25, 29.33, { e: 0.5, dimple: 0, rx: 0.1 });
  for (let i = 0; i < 2; i++) { k.cyl(M.brass, 0.008, 0.008, 0.03, -46.4 + i * 0.16, 1.7, 29.14, { rx: Math.PI / 2, cy: true, seg: 8 }); k.sph(M.brass, 0.014, -46.4 + i * 0.16, 1.7, 29.16, { seg: 8, seg2: 6 }); }
  k.pillow(towelG, 0.18, 0.5, 0.05, -46.4, 1.28, 29.19, { e: 0.55, dimple: 0 });
  k.box(pm('fabric', { color: 0xd8d2c4, interior: true }), 0.9, 0.018, 0.55, -45.4, 0.02, 31.55, { r: 0.008, ry: 0.06 });
  k.lathe(M.blackCeramic, [[0, 0], [0.11, 0], [0.13, 0.28], [0.125, 0.29], [0.0, 0.02]], -43.15, 0.02, 31.75, { seg: 18 });
  // shelf with candles + glass jar
  k.box(M.oak, 0.6, 0.03, 0.14, -43.6, 1.55, 29.2, { r: 0.006 });
  k.cyl(M.ceramic, 0.04, 0.04, 0.09, -43.8, 1.585, 29.2, { seg: 16 });
  k.cyl(pm('plain', { color: 0xf1ead8, rough: 0.6, interior: true }), 0.034, 0.034, 0.05, -43.8, 1.59, 29.2, { seg: 14 });
  k.cyl(M.ceramic, 0.03, 0.03, 0.07, -43.65, 1.585, 29.2, { seg: 14 });
  k.lathe(pm('plain', { color: 0xdde8ee, rough: 0.05, transparent: true, opacity: 0.4, interior: true }), [[0, 0], [0.036, 0], [0.038, 0.12], [0.034, 0.125], [0, 0.125]], -43.42, 1.58, 29.2, { seg: 14 });
  const g = finish(par, k, 0, y0, 0, 0);
  // glass door / screen for the shower
  const gm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.28, 3.15), glass);
  gm.position.set(-47.2, y0 + 1.16, 30.75);
  par.add(gm);
  colBox(-43.0, 30.75, 0.9, 0.9, 0, y0, y0 + 1);
  colBox(-44.7, 32.15, 3.0, 0.5, 0, y0, y0 + 1);
  colBox(-48.6, 30.75, 0.7, 3.2, 0, y0, y0 + 0.3);
  out.group = g;
  out.vanityPos = new THREE.Vector3(-44.7, y0 + 1.3, 31.8);
  out.showerPos = new THREE.Vector3(-48.1, y0 + 1.2, 30.75);
  out.toiletPos = new THREE.Vector3(-43.2, y0 + 0.5, tz);
  out.mirrorLightPos = new THREE.Vector3(-44.7, y0 + 2.2, 31.6);
  return out;
}
