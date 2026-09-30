// Detailed procedural furniture. Each builder creates a merged group (origin at the centre of
// the footprint on the floor, front facing local +z), adds it to `par`, registers colliders and
// returns handles. Dimensions are in metres and roughly match real products.
import * as THREE from 'three';
import { Kit, addCollider, leafGeometry, mat4 } from './kit.js';
import { palette } from './palette.js';
import { canvasTex } from '../gfx/noise.js';
import { pm } from '../gfx/materials.js';
import { G } from '../core/G.js';
import { rng } from '../core/util.js';

export function finish(par, k, x, y, z, ry = 0, o = {}) {
  const g = new THREE.Group();
  k.mesh(g, o);
  g.position.set(x, y, z); g.rotation.y = ry;
  par.add(g);
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
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(M.brass, 0.02, 0.013, 0.12, sx * (W / 2 - 0.15), 0, sz * (D / 2 - 0.14));
  k.box(M.blackMetal, W - 0.06, 0.05, D - 0.06, 0, 0.11, 0, { r: 0.01 });
  k.box(body, W, 0.17, D, 0, 0.14, 0, { r: 0.05, seg: 3 });
  k.box(body, W, 0.62, 0.26, 0, 0.14, -D / 2 + 0.13, { r: 0.07, seg: 3 });
  for (const s of [-1, 1]) k.box(body, 0.24, 0.5, D, s * (W / 2 - 0.12), 0.14, 0, { r: 0.07, seg: 3 });
  const cw = (W - 0.48) / 3;
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * cw;
    k.pillow(body, cw - 0.015, 0.19, 0.74, cx, 0.29, 0.1, { e: 0.5 });
    k.pillow(body, cw - 0.02, 0.5, 0.2, cx, 0.3, -0.26, { rx: -0.22, e: 0.5 });
  }
  k.pillow(M.rust, 0.46, 0.46, 0.15, -W / 2 + 0.52, 0.38, 0.12, { rx: -0.42, ry: 0.35, e: 0.6 });
  k.pillow(M.sage, 0.42, 0.42, 0.14, -W / 2 + 0.74, 0.38, 0.2, { rx: -0.35, ry: -0.25, e: 0.6 });
  k.pillow(M.navy, 0.46, 0.46, 0.15, W / 2 - 0.5, 0.38, 0.12, { rx: -0.42, ry: -0.3, e: 0.6 });
  k.pillow(M.mustard, 0.62, 0.05, 0.9, W / 2 - 1.0, 0.47, 0.05, { ry: 0.12, e: 0.6, dimple: 0 });      // folded throw
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, W, D, ry, y0, y0 + 0.9);
  return g;
}

export function armchair(par, y0, x, z, ry, mat) {
  const M = palette(), k = new Kit();
  mat = mat ?? M.leather;
  k.box(mat, 0.86, 0.18, 0.86, 0, 0.26, 0, { r: 0.05, seg: 3 });
  k.pillow(mat, 0.62, 0.17, 0.66, 0, 0.42, 0.06, { e: 0.55 });
  k.box(mat, 0.86, 0.52, 0.22, 0, 0.3, -0.32, { r: 0.08, seg: 3, rx: -0.14 });
  for (const s of [-1, 1]) k.box(mat, 0.14, 0.24, 0.72, s * 0.36, 0.44, 0.02, { r: 0.05, seg: 3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(M.walnut, 0.016, 0.026, 0.3, sx * 0.33, 0, sz * 0.33, { rx: -sz * 0.08, rz: sx * 0.08 });
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, 0.9, 0.9, ry, y0, y0 + 0.9);
  return g;
}

export function stool(k, M, x, z, h = 0.68) {
  k.cyl(M.leatherBlack, 0.19, 0.19, 0.07, x, h - 0.07, z, { seg: 28 });
  k.cyl(M.steel, 0.02, 0.02, h - 0.07, x, 0, z);
  k.torus(M.steel, 0.16, 0.012, x, h * 0.36, z, { rx: Math.PI / 2 });
  k.cyl(M.steel, 0.2, 0.2, 0.012, x, 0, z, { seg: 24 });
}

export function diningChair(k, M, x, z, ry) {
  const kk = new Kit();
  // local chair, facing +z
  kk.box(M.charcoal, 0.46, 0.06, 0.44, 0, 0.44, 0, { r: 0.02 });
  kk.pillow(M.linen, 0.42, 0.06, 0.4, 0, 0.5, 0.0, { e: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.cyl(M.walnut, 0.012, 0.02, 0.44, sx * 0.19, 0, sz * 0.18, { rx: sz * 0.05, rz: -sx * 0.05 });
  // curved backrest: arc of a torus segment
  const shape = new THREE.Shape(); shape.moveTo(-0.22, 0); shape.lineTo(0.22, 0); shape.lineTo(0.2, 0.34); shape.quadraticCurveTo(0, 0.4, -0.2, 0.34); shape.closePath();
  kk.extrude(M.walnut, shape, 0.035, 0, 0.5, -0.2, { bevel: 0.006 });
  kk.pillow(M.linen, 0.36, 0.26, 0.03, 0, 0.56, -0.17, { e: 0.6, dimple: 0.02 });
  for (const sx of [-1, 1]) kk.cyl(M.walnut, 0.011, 0.015, 0.55, sx * 0.2, 0.44, -0.2, { rx: -0.06 });
  // merge into parent kit with transform
  for (const [mat, arr] of kk.g) for (const geo of arr) k.push(mat, geo.clone(), mat4(x, 0, z, 0, ry, 0));
}

// ------------------------------------------------------------------ tables
export function coffeeTable(par, y0, x, z) {
  const M = palette(), k = new Kit();
  k.cyl(M.marbleW, 0.52, 0.52, 0.035, 0, 0.385, 0, { seg: 56 });
  k.cyl(M.brass, 0.535, 0.535, 0.012, 0, 0.38, 0, { seg: 56 });
  k.cyl(M.brass, 0.3, 0.34, 0.38, 0, 0, 0, { seg: 40 });
  k.cyl(M.marbleD, 0.34, 0.34, 0.02, 0, 0, 0, { seg: 40 });
  // books
  k.box(M.paper, 0.3, 0.035, 0.22, -0.1, 0.42, 0.06, { ry: 0.3, r: 0.004 });
  k.box(M.navy, 0.305, 0.008, 0.225, -0.1, 0.42, 0.06, { ry: 0.3 });
  k.box(M.paper, 0.26, 0.03, 0.2, -0.1, 0.455, 0.06, { ry: 0.05, r: 0.004 });
  k.box(M.rust, 0.265, 0.008, 0.205, -0.1, 0.455, 0.06, { ry: 0.05 });
  // candle in glass + flame
  k.cyl(M.ceramic, 0.05, 0.05, 0.08, 0.22, 0.42, -0.1, { seg: 24 });
  k.cyl(M.flame, 0.004, 0.006, 0.02, 0.22, 0.5, -0.1, { seg: 6 });
  // bowl with three stones
  k.lathe(M.blackCeramic, [[0.0, 0], [0.08, 0.005], [0.13, 0.05], [0.14, 0.07], [0.125, 0.07], [0.075, 0.03], [0, 0.02]], -0.05, 0.42, -0.2);
  for (let i = 0; i < 3; i++) k.sph(M.marbleW, 0.035, -0.05 + (i - 1) * 0.05, 0.47, -0.2 + (i % 2) * 0.02, { sy: 0.7 });
  const g = finish(par, k, x, y0, z, 0);
  colBox(x, z, 1.05, 1.05, 0, y0, y0 + 0.45);
  return g;
}

export function sideTable(par, y0, x, z, o = {}) {
  const M = palette(), k = new Kit();
  k.cyl(M.walnut, 0.24, 0.24, 0.03, 0, 0.5, 0, { seg: 32 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.cyl(M.brass, 0.012, 0.016, 0.52, Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, { rx: Math.sin(a) * 0.1, rz: -Math.cos(a) * 0.1 });
  }
  const g = finish(par, k, x, y0, z, 0);
  colBox(x, z, 0.5, 0.5, 0, y0, y0 + 0.55);
  return g;
}

export function diningTable(par, y0, x, z, ry) {
  const M = palette(), k = new Kit();
  const shape = new THREE.Shape();
  const a = 1.15, b = 0.5;
  for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; const px = Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 0.62) * a, py = Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 0.8) * b; if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py); }
  k.extrude(M.oak, shape, 0.04, 0, 0.72, 0, { rx: Math.PI / 2, bevel: 0.006 });
  k.extrude(M.oak, shape, 0.03, 0, 0.685, 0, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) {
    k.lathe(M.blackMetal, [[0.05, 0], [0.32, 0.005], [0.34, 0.03], [0.09, 0.09], [0.06, 0.6], [0.16, 0.7], [0.3, 0.71]], sx * 0.62, 0, 0, { sx: 1, sz: 0.4 });
  }
  // centre decor: vase, bowl of lemons
  k.lathe(M.ceramic, [[0, 0], [0.06, 0], [0.09, 0.12], [0.05, 0.24], [0.03, 0.3], [0.036, 0.31], [0.028, 0.3]], -0.3, 0.76, 0);
  k.tube(M.leaf, [[-0.3, 1.02, 0], [-0.26, 1.3, 0.04], [-0.2, 1.45, 0.06]], 0.004, { seg: 10, radial: 4 });
  k.lathe(M.brass, [[0, 0], [0.09, 0.01], [0.16, 0.06], [0.17, 0.07], [0.155, 0.07], [0.08, 0.025], [0, 0.02]], 0.35, 0.76, 0.05);
  const lem = pm('plain', { color: 0xe3c229, rough: 0.5, interior: true });
  for (let i = 0; i < 5; i++) { const a2 = i * 1.26; k.sph(lem, 0.038, 0.35 + Math.cos(a2) * 0.06, 0.83 + (i % 2) * 0.03, 0.05 + Math.sin(a2) * 0.06, { sy: 0.85 }); }
  const g = finish(par, k, x, y0, z, ry);
  colBox(x, z, 2.4, 1.1, ry, y0, y0 + 0.8);
  return g;
}

// ------------------------------------------------------------------ media wall
export function tvUnit(par, y0, x, z, ry, screen) {
  const M = palette(), k = new Kit();
  const W = 2.2;
  k.box(M.walnut, W, 0.36, 0.42, 0, 0.32, 0, { r: 0.012 });
  for (let i = 0; i < 3; i++) {
    const cx = (i - 1) * (W / 3);
    k.box(M.blackMetal, 0.006, 0.3, 0.005, cx - W / 6, 0.35, 0.212);
    k.cyl(M.brass, 0.008, 0.008, 0.16, cx, 0.5, 0.235, { rz: Math.PI / 2, cy: true });
  }
  k.box(M.blackMetal, W - 0.1, 0.02, 0.36, 0, 0.3, 0, { r: 0.004 });
  // TV (thin bezel) and screen plane, soundbar
  const TVW = 1.46, TVH = 0.84, ty = 0.98;
  k.box(M.plasticB, TVW, TVH, 0.03, 0, ty, -0.1, { r: 0.006 });
  k.box(M.plasticB, 1.0, 0.07, 0.09, 0, 0.7, 0.02, { r: 0.02 });
  k.box(M.steel, 0.6, 0.004, 0.005, 0, 0.72, 0.066);
  // objects on the console
  k.lathe(M.terracotta, [[0, 0], [0.09, 0], [0.11, 0.2], [0.07, 0.25], [0.06, 0.26]], -0.85, 0.5, 0, {});
  k.box(M.paper, 0.26, 0.04, 0.19, 0.7, 0.5, 0.02, { ry: 0.2, r: 0.004 });
  k.box(M.charcoal, 0.265, 0.01, 0.195, 0.7, 0.5, 0.02, { ry: 0.2 });
  k.sph(M.brass, 0.07, 0.72, 0.6, 0.02, {});
  const g = finish(par, k, x, y0, z, ry);
  // screen plane
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
  k.cyl(M.brass, 0.05, 0.05, 0.02, 0, drop - 0.02, 0);
  k.cyl(M.blackMetal, 0.003, 0.003, drop - 0.2, 0, 0.2, 0);
  const g = new THREE.Group();
  k.mesh(g);
  // glass globe with inner glowing sphere
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xfff2dd, roughness: 0.05, transparent: true, opacity: 0.28, metalness: 0, clearcoat: 1 }));
  glass.position.y = 0.17;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), M.bulb);
  core.position.y = 0.17;
  g.add(glass, core);
  g.position.set(x, y, z);
  par.add(g);
  return { group: g, core };
}

export function floorLamp(par, y0, x, z, ry = 0) {
  const M = palette(), k = new Kit();
  k.cyl(M.marbleW, 0.16, 0.18, 0.05, 0, 0, 0, { seg: 32 });
  k.tube(M.brass, [[0, 0.05, 0], [0, 1.2, 0], [0.15, 1.75, 0.02], [0.55, 1.95, 0.05], [0.95, 1.78, 0.06], [1.05, 1.55, 0.06]], 0.011, { seg: 40, radial: 8 });
  k.lathe(M.brass, [[0.0, 0], [0.24, 0.02], [0.27, 0.16], [0.24, 0.2], [0.0, 0.2]], 1.05, 1.36, 0.06, { seg: 40 });
  const g = finish(par, k, x, y0, z, ry);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), M.bulb);
  bulb.position.set(1.05, 1.44, 0.06);
  g.add(bulb);
  colBox(x, z, 0.4, 0.4, 0, y0, y0 + 2.0);
  return { group: g, bulb, lightPos: new THREE.Vector3(x + Math.cos(ry) * 1.05, y0 + 1.42, z - Math.sin(ry) * 1.05 + 0.06) };
}

export function tableLamp(k, M, x, y, z, shadeMat) {
  k.lathe(M.brass, [[0, 0], [0.07, 0], [0.075, 0.015], [0.03, 0.05], [0.028, 0.2], [0.02, 0.28]], x, y, z);
  k.lathe(shadeMat ?? M.shade, [[0.1, 0], [0.145, 0.0], [0.115, 0.2], [0.10, 0.2]], x, y + 0.24, z, { seg: 32 });
}

// ------------------------------------------------------------------ art
function paintingTexture(kind, w, h) {
  return canvasTex(512, Math.round(512 * h / w), (ctx, cw, ch) => {
    const R = rng(kind * 911 + 7);
    if (kind === 0) {                 // sunset abstract
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#1f2d4d'); g.addColorStop(0.55, '#d1683b'); g.addColorStop(1, '#f2b45a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#f7e0a0'; ctx.beginPath(); ctx.arc(cw * 0.62, ch * 0.52, ch * 0.16, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(20,20,35,${0.5 + i * 0.12})`; ctx.beginPath(); ctx.moveTo(0, ch * (0.62 + i * 0.1)); for (let x = 0; x <= cw; x += 16) ctx.lineTo(x, ch * (0.6 + i * 0.1) + Math.sin(x * 0.02 + i * 2) * 14 + R() * 4); ctx.lineTo(cw, ch); ctx.lineTo(0, ch); ctx.fill(); }
    } else if (kind === 1) {          // geometric
      ctx.fillStyle = '#efe6d4'; ctx.fillRect(0, 0, cw, ch);
      const cols = ['#c4633a', '#2f4858', '#e2b04a', '#7d8f69', '#1b1b1d'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % cols.length]; const x = R() * cw * 0.8, y = R() * ch * 0.8, s = 40 + R() * 150; if (i % 2) { ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, 7); ctx.fill(); } else ctx.fillRect(x, y, s, s * (0.5 + R())); }
    } else {                          // line art / topography
      ctx.fillStyle = '#16232e'; ctx.fillRect(0, 0, cw, ch);
      for (let j = 0; j < 26; j++) { ctx.strokeStyle = `hsl(${170 + j * 3} 40% ${35 + j}%)`; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x <= cw; x += 8) { const y = ch * 0.08 + j * ch * 0.034 + Math.sin(x * 0.014 + j * 0.5) * 18 + Math.sin(x * 0.04 + j) * 6; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    }
    // canvas weave + vignette
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < ch; y += 3) ctx.fillRect(0, y, cw, 1);
  });
}

export function artwork(par, x, y, z, ry, w, h, kind, frame = 'walnut') {
  const M = palette(), k = new Kit();
  const fm = frame === 'brass' ? M.brass : frame === 'black' ? M.blackMetal : M.walnut;
  const t = 0.035;
  k.box(fm, w + 0.06, 0.03, t, 0, -0.03, 0);
  k.box(fm, w + 0.06, 0.03, t, 0, h, 0);
  k.box(fm, 0.03, h + 0.06, t, -w / 2 - 0.015, -0.03, 0);
  k.box(fm, 0.03, h + 0.06, t, w / 2 + 0.015, -0.03, 0);
  k.box(M.blackMetal, w, h, 0.012, 0, 0, -0.012);
  const g = finish(par, k, x, y, z, ry, { receive: true });
  const tex = paintingTexture(kind, w, h);
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm('plain', { color: 0xffffff, rough: 0.8, interior: true }));
  cm.material = cm.material.clone(); cm.material.map = tex; cm.material.needsUpdate = true;
  cm.position.set(0, h / 2, 0.006);
  g.add(cm);
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

export function monstera(par, y0, x, z, scale = 1, seed = 1) {
  const M = palette(), k = new Kit(), r = rng(seed * 313);
  k.lathe(M.terracotta, [[0, 0], [0.16, 0], [0.2, 0.36], [0.215, 0.4], [0.19, 0.4], [0.19, 0.36], [0, 0.34]], 0, 0, 0);
  k.cyl(M.soil, 0.19, 0.19, 0.01, 0, 0.35, 0, { seg: 20 });
  for (let i = 0; i < 12; i++) {
    const a = r() * 6.28, h = 0.35 + r() * 0.45, out = 0.15 + r() * 0.3;
    const sx = Math.cos(a) * 0.03, sz = Math.sin(a) * 0.03;
    const ex = Math.cos(a) * out, ez = Math.sin(a) * out;
    k.tube(M.leafLight, [[sx, 0.36, sz], [sx * 3 + ex * 0.2, 0.36 + h * 0.6, sz * 3 + ez * 0.2], [ex, 0.36 + h, ez]], 0.008, { seg: 12, radial: 5 });
    const geo = leafGeometry(0.34 + r() * 0.12, 0.2 + r() * 0.06, 0.55, 0.3, 10, 1.0);
    // leaf hangs from the stem tip, pointing outward and down
    k.push(i % 3 ? M.leaf : M.leafDark, geo, mat4(ex, 0.36 + h, ez, 0.35 + r() * 0.4, Math.PI / 2 - a + (r() - 0.5) * 0.6, 0));
  }
  const g = finish(par, k, x, y0, z, 0);
  g.scale.setScalar(scale);
  colBox(x, z, 0.45 * scale, 0.45 * scale, 0, y0, y0 + 1.5 * scale);
  return g;
}

export function fiddleFig(par, y0, x, z, scale = 1, seed = 2) {
  const M = palette(), k = new Kit(), r = rng(seed * 77);
  k.lathe(M.blackCeramic, [[0, 0], [0.19, 0], [0.24, 0.4], [0.25, 0.46], [0.22, 0.46], [0.22, 0.42], [0, 0.4]], 0, 0, 0, {});
  k.cyl(M.soil, 0.22, 0.22, 0.01, 0, 0.42, 0, { seg: 20 });
  k.tube(M.walnut, [[0, 0.42, 0], [0.02, 1.0, 0.01], [-0.02, 1.6, 0.03], [0.03, 2.1, 0.0]], 0.022, { seg: 20, radial: 6 });
  for (let i = 0; i < 26; i++) {
    const h = 0.9 + (i / 26) * 1.3, a = i * 2.4 + r();
    const geo = leafGeometry(0.28 + r() * 0.1, 0.16 + r() * 0.05, 0.28, 0.22, 8, 0.6);
    k.push(i % 4 ? M.leaf : M.leafLight, geo, mat4(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05, 0.85 - (i / 26) * 0.5, Math.PI / 2 - a, 0));
  }
  const g = finish(par, k, x, y0, z, 0);
  g.scale.setScalar(scale);
  colBox(x, z, 0.5 * scale, 0.5 * scale, 0, y0, y0 + 2.2 * scale);
  return g;
}

export function snakePlant(k, M, x, y, z, seed = 3, s = 1) {
  const r = rng(seed * 19);
  k.lathe(M.ceramic, [[0, 0], [0.09, 0], [0.11, 0.24], [0.12, 0.27], [0.105, 0.27], [0.1, 0.24], [0, 0.22]], x, y, z);
  k.cyl(M.soil, 0.1, 0.1, 0.01, x, y + 0.23, z, { seg: 16 });
  for (let i = 0; i < 11; i++) {
    const a = r() * 6.28, h = (0.35 + r() * 0.5) * s;
    const geo = leafGeometry(h, 0.045 + r() * 0.02, 0.06, 0.4, 8, 0);
    k.push(i % 2 ? M.leaf : M.leafDark, geo, mat4(x + Math.cos(a) * 0.03, y + 0.25, z + Math.sin(a) * 0.03, -1.35 + r() * 0.15, a, 0));
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
  const mesh = new THREE.InstancedMesh(geo, pm('paint', { color: 0xffffff, rough: 0.7, interior: true }), list.length);
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
