// Bedroom (bed, nightstands, wardrobe, dresser, reading corner) and bathroom fixtures.
import * as THREE from 'three';
import { Kit, mat4 } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { finish, colBox, armchair, tableLamp, floorLamp, artwork, sideTable, snakePlant, trailingPlant } from './furniture.js';

export function buildBed(par, y0, x, z) {
  const M = palette(), k = new Kit(), out = {};
  const BW = 1.82, BL = 2.12;
  // frame: floating platform on a dark plinth
  k.box(M.blackMetal, BW - 0.1, 0.09, BL - 0.1, 0, 0.0, 0.0);
  k.box(M.walnut, BW + 0.08, 0.17, BL + 0.08, 0, 0.09, 0, { r: 0.012 });
  // headboard: padded channels spanning wider than the bed
  const HBW = 2.55, hz = -BL / 2 - 0.08;
  k.box(M.wallBlue, HBW, 1.3, 0.05, 0, 0.0, hz - 0.04, { r: 0.004 });
  const n = 7, cw = HBW / n;
  for (let i = 0; i < n; i++) k.pillow(M.charcoal, cw - 0.012, 1.12, 0.1, (i - (n - 1) / 2) * cw, 0.14, hz + 0.02, { e: 0.55, dimple: 0.03 });
  // mattress + sheets
  k.box(M.white, BW - 0.02, 0.27, BL - 0.02, 0, 0.24, 0.0, { r: 0.05, seg: 3 });
  k.cloth(M.linen, 1.98, 1.58, 0, 0, 0.27, (u, v) => {
    const eu = Math.min(u, 1 - u), ev = 1 - v;
    const sm = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
    const d = 0.27 * (1 - sm(0.0, 0.1, eu)) + 0.27 * (1 - sm(0.0, 0.07, ev));
    return 0.535 + 0.012 * Math.sin(u * 26 + v * 5) * Math.sin(v * 9 + 1) + 0.006 * Math.sin(u * 60) - d;
  }, { sw: 60, sh: 60 });
  // turned-back top sheet roll + pillows
  k.cyl(M.white, 0.055, 0.055, 1.86, 0, 0.6, -0.5, { rz: Math.PI / 2, cy: true, seg: 14 });
  const pil = [[-0.45, M.white], [0.45, M.white]];
  for (const [px, m] of pil) k.pillow(m, 0.66, 0.15, 0.44, px, 0.56, -0.86, { rx: -0.25, e: 0.55 });
  for (const [px, m] of [[-0.4, M.sage], [0.4, M.rust]]) k.pillow(m, 0.5, 0.12, 0.34, px, 0.64, -0.75, { rx: -0.65, ry: px * 0.3, e: 0.6 });
  k.pillow(M.mustard, 0.62, 0.11, 0.24, 0, 0.66, -0.6, { rx: -0.3, e: 0.6 });
  // folded throw at the foot
  k.pillow(M.charcoal, 1.85, 0.07, 0.42, 0, 0.55, 0.72, { e: 0.5, dimple: 0 });
  // nightstands (floating) with lamps
  for (const s of [-1, 1]) {
    const px = s * (BW / 2 + 0.5);
    k.box(M.walnut, 0.5, 0.3, 0.42, px, 0.3, hz + 0.25, { r: 0.01 });
    k.box(M.blackMetal, 0.5, 0.006, 0.42, px, 0.44, hz + 0.25);
    k.box(M.brass, 0.14, 0.008, 0.01, px, 0.42, hz + 0.47);
    k.box(M.blackMetal, 0.06, 0.28, 0.06, px, 0.02, hz + 0.25);
    tableLamp(k, M, px, 0.6, hz + 0.25, M.shade);
    k.box(M.paper, 0.2, 0.03, 0.14, px + 0.12 * s, 0.6, hz + 0.3, { ry: 0.3 * s });
  }
  // glass of water + phone
  k.cyl(pm('plain', { color: 0xdde8ee, rough: 0.05, transparent: true, opacity: 0.4, interior: true }), 0.03, 0.028, 0.1, BW / 2 + 0.36, 0.6, hz + 0.4, {});
  const g = finish(par, k, x, y0, z, 0);
  const TH = Math.PI / 2;
  g.rotation.y = TH;      // head against the west wall
  // sleeping spot (world) for the interaction
  out.group = g;
  // world positions of lamps: local (px, .85, hz+.25) rotated by -90deg: X = x + lz*(-1)*... compute directly
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
  k.box(M.walnut, W, 0.72, D, 0, 0.1, 0, { r: 0.008 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const cx = (c - 0.5) * (W / 2), cy = 0.15 + r * 0.24;
    k.box(M.blackMetal, W / 2 - 0.02, 0.005, 0.005, cx, cy - 0.005, D / 2 + 0.002);
    k.cyl(M.brass, 0.008, 0.008, 0.12, cx, cy + 0.12, D / 2 + 0.03, { rz: Math.PI / 2, cy: true, seg: 8 });
  }
  // round mirror on the wall above
  k.torus(M.brass, 0.42, 0.014, 0, 1.55, -0.2, { rx: 0 });
  k.cyl(pm('plain', { color: 0xdfe6ea, metal: 1, rough: 0.02, interior: true }), 0.42, 0.42, 0.006, 0, 1.55, -0.2, { rx: Math.PI / 2, cy: true, seg: 48 });
  // perfume, tray, jewellery box
  k.box(M.marbleD, 0.34, 0.015, 0.22, -0.4, 0.82, 0.0, { r: 0.004 });
  for (let i = 0; i < 3; i++) k.lathe(pm('plain', { color: [0xe8c98a, 0x7fa89a, 0xc47a68][i], rough: 0.08, physical: true, clearcoat: 1, interior: true }), [[0, 0], [0.025, 0], [0.028, 0.06 + i * 0.02], [0.012, 0.09 + i * 0.02], [0.01, 0.12 + i * 0.02]], -0.5 + i * 0.09, 0.835, 0.0);
  k.box(M.leather, 0.24, 0.1, 0.16, 0.45, 0.82, 0.0, { r: 0.01 });
  k.lathe(M.terracotta, [[0, 0], [0.06, 0], [0.08, 0.14], [0.05, 0.16]], 0.7, 0.82, 0.02);
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, W, D, ry, y0, y0 + 0.9);
  return g;
}

export function buildWardrobe(par, y0, x, z, ry, W = 2.9) {
  const M = palette(), k = new Kit();
  const H = 2.55, D = 0.62;
  k.box(M.walnutV, W, H, D, 0, 0, 0, { r: 0.004 });
  const n = 3, dw = W / n;
  const mirror = pm('plain', { color: 0xc8d0d4, metal: 1, rough: 0.03, interior: true });
  for (let i = 0; i < n; i++) {
    const cx = (i - 1) * dw;
    k.box(M.blackMetal, dw - 0.008, H - 0.06, 0.02, cx, 0.03, D / 2 + 0.006 + (i % 2) * 0.022);
    k.box(i === 1 ? M.oakV : mirror, dw - 0.09, H - 0.15, 0.004, cx, 0.075, D / 2 + 0.019 + (i % 2) * 0.022);
    k.cyl(M.brass, 0.006, 0.006, 0.45, cx + (i === 1 ? -0.06 : 0.08), 1.1, D / 2 + 0.06 + (i % 2) * 0.022, { cy: true, seg: 8 });
  }
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, W, D, ry, y0, y0 + H);
  return g;
}

export function buildReadingCorner(par, y0, x, z) {
  const M = palette();
  armchair(par, y0, x, z, Math.PI * 0.72, M.charcoal);
  const lamp = floorLamp(par, y0, x + 0.85, z - 0.6, Math.PI);
  const k = new Kit();
  sideTable(par, y0, x - 0.3, z + 0.85);
  return { lamp };
}

// ---------------------------------------------------------------- bathroom (x -49..-42, z 29..32.4)
export function buildBathroom(par, y0, ctx) {
  const M = palette(), k = new Kit(), out = {};
  const glass = pm('plain', { color: 0xcfe0e6, rough: 0.03, transparent: true, opacity: 0.22, metal: 0, interior: true, side: THREE.DoubleSide });
  // wall tiles: 0.01 skin in front of plaster (west wall x=-49, south wall z=32.4, and the north partition z=29 back face)
  k.box(M.tileBath, 0.012, 2.5, 3.35, -48.994, 0, 30.72);            // west
  k.box(M.tileBath, 6.95, 2.5, 0.012, -45.5, 0, 32.394);            // south
  k.box(M.tileBath, 6.95, 2.5, 0.012, -45.5, 0, 29.13);             // north partition (bath side)
  k.box(M.tileDark, 0.012, 2.5, 3.35, -42.13, 0, 30.72);           // east partition (bath side) dark accent
  // floor
  k.box(M.tileDark, 6.95, 0.02, 3.3, -45.5, 0, 30.75);
  // shower area (west end): glass screen + niche + rain head
  k.box(M.blackMetal, 0.03, 2.3, 0.03, -47.2, 0.02, 29.15);
  k.box(M.blackMetal, 0.03, 2.3, 0.03, -47.2, 0.02, 32.35);
  k.box(M.blackMetal, 0.03, 0.03, 3.2, -47.2, 2.3, 30.75);
  k.box(M.blackMetal, 0.03, 0.03, 3.2, -47.2, 0.02, 30.75);
  k.cyl(M.chrome, 0.16, 0.16, 0.012, -48.3, 2.35, 30.75, { seg: 32 });
  k.cyl(M.chrome, 0.012, 0.012, 0.5, -48.85, 2.1, 30.75, { seg: 8 });
  k.box(M.chrome, 0.3, 0.012, 0.012, -48.7, 2.35, 30.75);
  k.tube(M.chrome, [[-48.96, 1.2, 31.6], [-48.9, 1.0, 31.4], [-48.7, 0.85, 31.35]], 0.006, { seg: 10, radial: 4 });
  k.box(M.chrome, 0.18, 0.012, 0.18, -48.96, 1.2, 31.6);
  k.box(M.marbleW, 0.02, 0.32, 0.75, -48.985, 1.1, 30.2);              // niche shelf
  k.cyl(M.steel, 0.06, 0.06, 0.008, -48.3, 0.02, 30.75, { seg: 24 });     // drain
  // vanity along south wall: floating walnut + marble top + 2 vessel basins
  k.box(M.walnut, 3.0, 0.5, 0.5, -44.7, 0.42, 32.15, { r: 0.008 });
  k.box(M.marbleW, 3.06, 0.035, 0.54, -44.7, 0.92, 32.13, { r: 0.003 });
  for (const s of [-1, 1]) {
    k.lathe(M.ceramic, [[0.0, 0.0], [0.13, 0.0], [0.19, 0.11], [0.185, 0.115], [0.12, 0.02]], -44.7 + s * 0.7, 0.955, 32.1);
    k.tube(M.brass, [[-44.7 + s * 0.7, 0.955, 32.32], [-44.7 + s * 0.7, 1.18, 32.32], [-44.7 + s * 0.7, 1.22, 32.22], [-44.7 + s * 0.7, 1.18, 32.14]], 0.011, { seg: 16, radial: 8 });
    k.box(M.brass, 0.02, 0.02, 0.05, -44.7 + s * 0.7 + 0.05, 0.98, 32.32, { ry: 0.5 });
    k.box(M.walnut, 0.005, 0.4, 0.005, -44.7 + s * 0.7, 0.44, 31.9);
    k.cyl(M.brass, 0.007, 0.007, 0.14, -44.7 + s * 0.7 + 0.25, 0.75, 31.9, { rz: Math.PI / 2, cy: true, seg: 8 });
  }
  // mirror with backlight
  k.box(pm('plain', { color: 0xdfe6ea, metal: 1, rough: 0.025, interior: true }), 2.6, 1.1, 0.012, -44.7, 1.25, 32.385);
  k.box(M.ledCool, 2.66, 0.02, 0.01, -44.7, 2.37, 32.38);
  k.box(M.ledCool, 2.66, 0.02, 0.01, -44.7, 1.2, 32.38);
  // towels, soap, plant
  k.pillow(M.white, 0.32, 0.08, 0.22, -45.3, 0.96, 32.1, { e: 0.5 });
  k.lathe(M.blackCeramic, [[0, 0], [0.03, 0], [0.032, 0.16], [0.016, 0.18]], -43.55, 0.955, 32.15);
  snakePlant(k, M, -43.3, 0.955, 32.1, 8, 0.7);
  // toilet on the east partition side
  const tx = -42.75, tz = 30.75;
  k.lathe(M.ceramic, [[0, 0], [0.19, 0], [0.22, 0.1], [0.24, 0.32], [0.19, 0.4], [0, 0.4]], tx, 0, tz, { sx: 1.35, sz: 1 });
  k.box(M.ceramic, 0.2, 0.42, 0.42, -42.32, 0.3, tz, { r: 0.03, seg: 3 });
  k.lathe(M.ceramic, [[0.0, 0.4], [0.17, 0.41], [0.2, 0.4]], tx, 0.0, tz, { sx: 1.35, sz: 1 });
  k.box(M.chrome, 0.1, 0.008, 0.05, -42.28, 0.73, tz);
  // towel radiator
  for (let i = 0; i < 6; i++) k.cyl(M.chrome, 0.011, 0.011, 0.55, -47.55 + 0 * i, 1.0 + i * 0.16, 29.2 + 0.09, { rz: Math.PI / 2, cy: true, seg: 8 });
  k.pillow(M.white, 0.5, 0.06, 0.28, -47.55, 1.6, 29.24, { e: 0.5, dimple: 0 });
  // shelf with candles
  k.box(M.oak, 0.6, 0.03, 0.14, -43.6, 1.55, 29.2, { r: 0.004 });
  k.cyl(M.ceramic, 0.04, 0.04, 0.09, -43.8, 1.585, 29.2, { seg: 16 });
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
