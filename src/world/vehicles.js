// Detailed instanced vehicles. Each car type is authored from lofted cross-sections (body, glass,
// roof), wheels (tyre lathe + spoked rim + brake disc), lights, plates, mirrors, grille and even a
// driver silhouette, then rendered as InstancedMeshes (one per part) so 60 cars cost ~50 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/G.js';
import { pm } from '../gfx/materials.js';
import { canvasTex } from '../gfx/noise.js';

const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const clean = (g) => { g = nonIdx(g); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
const merge = (arr) => (arr.length ? mergeGeometries(arr.map(clean), false) : null);
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m); return g;
};
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);

// ---- loft: rings of [x,y,z] points (same count per ring) -> closed tube with fan caps ----
function loft(rings, from = 0, to = null, cap = true) {
  const n = rings[0].length;
  to = to ?? n - 1;
  const pos = [], idx = [];
  const cols = to - from + 1;
  rings.forEach((r) => { for (let i = from; i <= to; i++) pos.push(...r[i]); });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  if (cap) {
    const cap0 = (ringIdx, flip) => {
      const base = ringIdx * cols;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < cols; i++) { cx += pos[(base + i) * 3]; cy += pos[(base + i) * 3 + 1]; cz += pos[(base + i) * 3 + 2]; }
      const ci = pos.length / 3; pos.push(cx / cols, cy / cols, cz / cols);
      for (let i = 0; i < cols - 1; i++) flip ? idx.push(ci, base + i + 1, base + i) : idx.push(ci, base + i, base + i + 1);
    };
    cap0(0, false); cap0(rings.length - 1, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// half profile as (yFrac, wFrac) pairs -> full ring
const HALF = [[0, 0], [0, 0.78], [0.1, 0.95], [0.32, 1.0], [0.6, 1.0], [0.82, 0.975], [0.94, 0.9], [1.0, 0.72], [1.0, 0.36], [1.0, 0]];
function bodyRing(x, y0, top, halfW) {
  const pts = [];
  // right side (z>0) bottom-centre -> top-centre, then left side back down
  for (const [yf, wf] of HALF) pts.push([x, y0 + yf * (top - y0), wf * halfW]);
  for (let i = HALF.length - 2; i >= 0; i--) { const [yf, wf] = HALF[i]; pts.push([x, y0 + yf * (top - y0), -wf * halfW]); }
  return pts;
}
// greenhouse ring: from left belt, up to roof, over, down to right belt (open at the bottom)
function glassRing(x, belt, roof, wBase, wRoof) {
  const p = [];
  const s = [[belt - 0.02, wBase], [belt + 0.46 * (roof - belt), wBase - 0.42 * (wBase - wRoof)], [roof - 0.02, wRoof + 0.02], [roof, wRoof * 0.6], [roof + 0.005, 0]];
  for (const [y, w] of s) p.push([x, y, -w]);         // left going up
  for (let i = s.length - 2; i >= 0; i--) p.push([x, s[i][0], s[i][1]]);   // right coming down
  return p;
}

function interp(tbl, x) {
  if (x <= tbl[0][0]) return tbl[0];
  for (let i = 0; i < tbl.length - 1; i++) if (x <= tbl[i + 1][0]) {
    const a = tbl[i], b = tbl[i + 1], t = (x - a[0]) / (b[0] - a[0]);
    return a.map((v, k) => v + (b[k] - v) * t);
  }
  return tbl[tbl.length - 1];
}

// -------------------------------------------------------------------------------------------------
// type specs
// -------------------------------------------------------------------------------------------------
const SPECS = {
  sedan: {
    len: 4.8, wid: 1.82, y0: 0.2, hw: 0.9, belt: 0.985, wheelR: 0.335, axleF: 1.45, axleR: -1.38, track: 0.79,
    body: [[-2.4, 0.80, 0.6], [-2.32, 0.88, 0.86], [-2.1, 0.95, 0.97], [-1.6, 0.97, 1.0], [-1.0, 0.985, 1.0], [0.4, 0.985, 1.0], [0.95, 0.96, 1.0], [1.5, 0.87, 1.0], [2.05, 0.80, 0.99], [2.32, 0.73, 0.93], [2.4, 0.62, 0.8]],
    glass: [[-1.42, 0.99, 0.82, 0.78], [-1.15, 1.28, 0.83, 0.62], [-0.55, 1.42, 0.85, 0.66], [0.35, 1.42, 0.85, 0.66], [0.8, 1.35, 0.85, 0.64], [1.15, 1.0, 0.86, 0.78]],
    seatX: [-0.75, 0.35], driverX: 0.32, roofH: 1.42,
  },
  hatch: {
    len: 4.15, wid: 1.76, y0: 0.2, hw: 0.87, belt: 0.99, wheelR: 0.32, axleF: 1.25, axleR: -1.15, track: 0.77,
    body: [[-2.07, 0.82, 0.62], [-2.0, 0.92, 0.9], [-1.5, 0.99, 1.0], [-0.9, 0.99, 1.0], [0.3, 0.99, 1.0], [0.8, 0.96, 1.0], [1.35, 0.86, 1.0], [1.85, 0.8, 0.99], [2.03, 0.72, 0.92], [2.08, 0.62, 0.78]],
    glass: [[-1.75, 1.08, 0.82, 0.76], [-1.5, 1.44, 0.83, 0.66], [-0.6, 1.5, 0.84, 0.67], [0.3, 1.5, 0.84, 0.67], [0.7, 1.42, 0.84, 0.65], [1.0, 1.02, 0.85, 0.78]],
    seatX: [-0.7, 0.25], driverX: 0.22, roofH: 1.5,
  },
  suv: {
    len: 4.75, wid: 1.95, y0: 0.3, hw: 0.97, belt: 1.15, wheelR: 0.39, axleF: 1.45, axleR: -1.4, track: 0.86,
    body: [[-2.37, 1.0, 0.62], [-2.3, 1.1, 0.9], [-2.1, 1.15, 0.98], [-1.0, 1.16, 1.0], [0.6, 1.15, 1.0], [1.15, 1.12, 1.0], [1.65, 1.02, 1.0], [2.15, 0.94, 0.98], [2.32, 0.84, 0.92], [2.38, 0.72, 0.8]],
    glass: [[-2.15, 1.18, 0.9, 0.8], [-1.95, 1.65, 0.93, 0.76], [-0.5, 1.74, 0.94, 0.76], [0.45, 1.74, 0.94, 0.76], [0.95, 1.66, 0.93, 0.74], [1.3, 1.16, 0.93, 0.8]],
    seatX: [-1.0, 0.1], driverX: 0.05, roofH: 1.74,
  },
  van: {
    len: 5.3, wid: 1.95, y0: 0.3, hw: 0.97, belt: 1.2, wheelR: 0.36, axleF: 1.75, axleR: -1.65, track: 0.84,
    body: [[-2.65, 1.5, 0.94], [-2.5, 1.8, 1.0], [-0.9, 1.95, 1.0], [0.8, 1.95, 1.0], [1.4, 1.5, 1.0], [2.05, 1.05, 0.98], [2.55, 0.9, 0.9], [2.65, 0.7, 0.75]],
    glass: [[0.9, 1.5, 0.94, 0.9], [1.25, 1.85, 0.94, 0.88], [1.5, 1.9, 0.94, 0.86], [1.9, 1.5, 0.95, 0.9], [2.1, 1.15, 0.95, 0.92]],
    seatX: [1.3, 1.5], driverX: 1.5, roofH: 1.95,
  },
};

function buildParts(name, S) {
  const parts = { body: [], trim: [], chrome: [], glass: [], roof: [], arch: [], head: [], tail: [], brake: [], plate: [], interior: [], driver: [], sign: [] };
  // lower body
  const xs = []; for (let i = 0; i <= 44; i++) xs.push(-S.len / 2 + (S.len * i) / 44);
  const rings = xs.map((x) => { const [, top, ws] = interp(S.body, x); return bodyRing(x, S.y0, top, S.hw * ws); });
  parts.body.push(loft(rings));
  // sill/skirt trim and black lower valance
  parts.trim.push(box(S.len * 0.66, 0.09, S.wid * 1.005, 0.05, S.y0 + 0.03, 0));
  // greenhouse glass + roof paint
  const gx = []; const g0 = S.glass[0][0], g1 = S.glass[S.glass.length - 1][0];
  for (let i = 0; i <= 26; i++) gx.push(g0 + ((g1 - g0) * i) / 26);
  const gr = gx.map((x) => { const [, roof, wb, wr] = interp(S.glass, x); return glassRing(x, S.belt, roof, wb * 0.99, wr); });
  parts.glass.push(loft(gr, 0, 2, false)); parts.glass.push(loft(gr, 6, 8, false));
  parts.roof.push(loft(gr, 2, 6, false));
  // pillars (black B-pillar, body-coloured A/C)
  const rf = S.roofH;
  parts.trim.push(box(0.09, rf - S.belt, S.wid * 0.92, S.seatX[1] - 0.45, S.belt, 0));
  // door seams, handles and mirrors
  for (const sgn of [-1, 1]) {
    const zc = sgn * (S.hw * 1.0 + 0.002);
    for (const dx of [S.seatX[0] * 0.9 - 0.45, S.seatX[1] - 0.45, S.seatX[1] + 0.5]) parts.trim.push(box(0.012, S.belt - S.y0 - 0.22, 0.008, dx, S.y0 + 0.17, zc));
    for (const dx of [S.seatX[1] - 0.15, S.seatX[0] * 0.9 + 0.32]) parts.chrome.push(box(0.16, 0.022, 0.015, dx, S.belt - 0.17, zc));
    parts.trim.push(box(0.16, 0.1, 0.06, S.seatX[1] + 0.42, S.belt + 0.03, sgn * (S.hw + 0.04)));
    parts.trim.push(box(0.05, 0.02, 0.12, S.seatX[1] + 0.35, S.belt - 0.01, sgn * (S.hw - 0.02)));
    // wheel arches (dark discs on the body side)
    for (const ax of [S.axleF, S.axleR]) parts.arch.push(T(new THREE.CylinderGeometry(S.wheelR * 1.3, S.wheelR * 1.3, 0.02, 24), ax, S.wheelR, sgn * (S.hw + 0.0), Math.PI / 2, 0, 0));
    // head + tail lights
    const nx = S.len / 2 - 0.13;
    parts.head.push(box(0.05, 0.06, 0.3, nx, S.y0 + 0.5, sgn * (S.hw * 0.62), 0, 0, 0));
    parts.head.push(box(0.03, 0.025, 0.2, nx + 0.02, S.y0 + 0.42, sgn * (S.hw * 0.66)));
    parts.trim.push(box(0.06, 0.13, 0.34, nx - 0.02, S.y0 + 0.48, sgn * (S.hw * 0.62)));
    parts.tail.push(box(0.05, 0.09, 0.36, -nx, S.y0 + 0.62, sgn * (S.hw * 0.66)));
    parts.brake.push(box(0.06, 0.06, 0.26, -nx - 0.005, S.y0 + 0.62, sgn * (S.hw * 0.64)));
    parts.chrome.push(T(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), -S.len / 2 + 0.05, S.y0 + 0.02, sgn * (S.hw * 0.55), 0, 0, Math.PI / 2));
  }
  // grille, bumper valance, rear licence plate area, wipers, shark-fin antenna
  parts.trim.push(box(0.05, 0.16, S.wid * 0.5, S.len / 2 - 0.05, S.y0 + 0.36, 0));
  for (let i = 0; i < 4; i++) parts.chrome.push(box(0.02, 0.012, S.wid * 0.46, S.len / 2 - 0.02, S.y0 + 0.3 + i * 0.04, 0));
  parts.trim.push(box(0.07, 0.11, S.wid * 0.9, S.len / 2 - 0.08, S.y0 + 0.02, 0));
  parts.trim.push(box(0.07, 0.11, S.wid * 0.9, -S.len / 2 + 0.06, S.y0 + 0.02, 0));
  parts.plate.push(T(new THREE.PlaneGeometry(0.52, 0.14), S.len / 2 - 0.02, S.y0 + 0.28, 0, 0, Math.PI / 2, 0));
  parts.plate.push(T(new THREE.PlaneGeometry(0.52, 0.14), -S.len / 2 + 0.01, S.y0 + 0.5, 0, 0, -Math.PI / 2, 0));
  parts.trim.push(box(0.4, 0.008, 0.02, S.glass[S.glass.length - 2][0] + 0.15, S.belt + (name === 'van' ? 0.5 : 0.36), 0, 0, 0, -0.4));
  parts.trim.push(box(0.15, 0.04, 0.06, S.glass[1][0] + 0.5, S.roofH + 0.03, 0));
  if (name === 'sedan') parts.sign.push(box(0.4, 0.14, 0.9, 0.0, S.roofH + 0.03, 0));
  // interior silhouettes: seats, dash, wheel, driver
  const seatY = S.y0 + 0.36;
  for (const sx of S.seatX) for (const sgn of [-1, 1]) {
    parts.interior.push(box(0.5, 0.1, 0.5, sx, seatY, sgn * 0.4));
    parts.interior.push(box(0.1, 0.55, 0.48, sx - 0.26, seatY + 0.1, sgn * 0.4, 0, 0, -0.12));
  }
  parts.interior.push(box(0.5, 0.2, S.wid * 0.85, S.glass[S.glass.length - 1][0] - 0.25, S.belt - 0.05, 0));
  parts.interior.push(T(new THREE.TorusGeometry(0.17, 0.014, 6, 16), S.driverX + 0.42, S.belt + 0.02, -0.4, 0, Math.PI / 2, 0, 1, 1, 1).rotateY(0));
  parts.driver.push(T(new THREE.SphereGeometry(0.11, 10, 8), S.driverX, S.belt + 0.42, -0.4));
  parts.driver.push(box(0.22, 0.42, 0.3, S.driverX - 0.05, seatY + 0.26, -0.4));
  // wheels
  const wheels = { tire: [], rim: [], disc: [] };
  const R = S.wheelR, W = 0.22;
  const prof = [[0.0, -W / 2], [R - 0.13, -W / 2], [R - 0.045, -W * 0.5 + 0.01], [R, -W * 0.25], [R + 0.004, 0], [R, W * 0.25], [R - 0.045, W * 0.5 - 0.01], [R - 0.13, W / 2], [0.0, W / 2]];
  const tireGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28); tireGeo.rotateX(Math.PI / 2);
  wheels.tire.push(tireGeo);
  const rimR = R - 0.06;
  wheels.rim.push(T(new THREE.CylinderGeometry(rimR, rimR, 0.03, 26), 0, 0, W / 2 - 0.02, Math.PI / 2, 0, 0));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; wheels.rim.push(box(rimR * 0.9, 0.05, 0.028, Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, W / 2 - 0.005, 0, 0, a)); }
  wheels.rim.push(T(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), 0, 0, W / 2 + 0.005, Math.PI / 2, 0, 0));
  wheels.disc.push(T(new THREE.CylinderGeometry(R * 0.72, R * 0.72, 0.02, 24), 0, 0, W / 2 - 0.09, Math.PI / 2, 0, 0));
  return { parts, wheels };
}

// -------------------------------------------------------------------------------------------------
// instanced car type
// -------------------------------------------------------------------------------------------------
let plateTex = null;
function getPlateAtlas() {
  if (plateTex) return plateTex;
  plateTex = canvasTex(512, 256, (c, w, h) => {
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 128, y = Math.floor(i / 4) * 64;
      c.fillStyle = i % 5 === 0 ? '#f2c230' : '#eef0f2'; c.fillRect(x, y, 128, 64);
      c.strokeStyle = '#1b2a4a'; c.lineWidth = 3; c.strokeRect(x + 3, y + 3, 122, 58);
      c.fillStyle = '#1b2a4a'; c.font = 'bold 30px ui-monospace, Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const s = letters[(i * 7) % 23] + letters[(i * 11 + 3) % 23] + letters[(i * 5 + 1) % 23] + '·' + String(1000 + ((i * 7919) % 9000));
      c.fillText(s.slice(0, 8), x + 64, y + 34);
    }
  });
  return plateTex;
}

export class CarType {
  constructor(scene, name, capacity) {
    const S = SPECS[name];
    this.name = name; this.S = S; this.cap = capacity; this.n = 0;
    const { parts, wheels } = buildParts(name, S);
    const paint = pm('paint', { color: 0xffffff, rough: 0.28, metal: 0.45, physical: true, clearcoat: 1, ccRough: 0.04, wet: 1, side: THREE.DoubleSide });
    const trimM = pm('plastic', { color: 0x101112, rough: 0.5, wet: 1 });
    const chromeM = pm('plain', { color: 0xd8dade, metal: 1, rough: 0.12 });
    const glassM = pm('plain', { color: 0x05080b, metal: 0.55, rough: 0.05, physical: true, clearcoat: 1, ccRough: 0.02, side: THREE.DoubleSide });
    const archM = pm('plain', { color: 0x040404, rough: 0.95 });
    const inM = pm('plain', { color: 0x1a1b1e, rough: 0.9 });
    const tireM = pm('rubber', { color: 0x141414, wet: 0.6 });
    const rimM = pm('metal', { color: 0xc9cdd2, p: [2, 80, 0, 0], rough: 0.3 });
    const discM = pm('plain', { color: 0x5b5d61, metal: 1, rough: 0.5 });
    const lightBasic = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const headM = lightBasic(new THREE.Color(4, 3.8, 3.2)), tailM = lightBasic(new THREE.Color(2.4, 0.08, 0.05)), brakeM = lightBasic(new THREE.Color(5, 0.1, 0.06));
    const signM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.0), toneMapped: false });
    const driverM = pm('plain', { color: 0x3b3835, rough: 0.9 });
    const plateM = new THREE.MeshBasicMaterial({ map: getPlateAtlas(), color: new THREE.Color(0.85, 0.85, 0.85), toneMapped: false });

    const mk = (geoms, mat, count, o = {}) => {
      const g = merge(geoms);
      if (!g) return null;
      const im = new THREE.InstancedMesh(g, mat, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = o.shadow ?? true; im.receiveShadow = true; im.frustumCulled = false;
      im.layers.enable(1);
      if (o.color) { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < count; i++) im.setColorAt(i, c); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      im.count = 0;
      scene.add(im);
      return im;
    };
    const N = capacity;
    this.mesh = {
      body: mk(parts.body, paint, N, { color: true }), roof: mk(parts.roof, paint, N, { color: true }),
      trim: mk(parts.trim, trimM, N), chrome: mk(parts.chrome, chromeM, N, { shadow: false }),
      glass: mk(parts.glass, glassM, N, { shadow: false }), arch: mk(parts.arch, archM, N, { shadow: false }),
      interior: mk(parts.interior, inM, N, { shadow: false }), driver: mk(parts.driver, driverM, N, { shadow: false }),
      head: mk(parts.head, headM, N, { color: true, shadow: false }), tail: mk(parts.tail, tailM, N, { color: true, shadow: false }), brake: mk(parts.brake, brakeM, N, { color: true, shadow: false }),
      sign: name === 'sedan' ? mk(parts.sign, signM, N, { color: true, shadow: false }) : null,
      tire: mk(wheels.tire, tireM, N * 4), rim: mk(wheels.rim, rimM, N * 4, { shadow: false }), disc: mk(wheels.disc, discM, N * 4, { shadow: false }),
    };
    // plates need per-instance atlas cell -> use a UV-offset instanced attribute
    const plateGeo = merge(parts.plate);
    const plates = new THREE.InstancedMesh(plateGeo, plateM, N);
    const cell = new Float32Array(N * 2);
    plates.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    plateM.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * 0.25 + vec2(aCell.x, 3.0 - aCell.y) * 0.25;\n#endif');
    };
    plateM.customProgramCacheKey = () => 'plate';
    plates.frustumCulled = false; plates.count = 0; plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plates.layers.enable(1);
    this.mesh.plate = plates; this.plateCell = cell;
    scene.add(plates);
    this.wheelLocal = [];
    for (const [ax, sg] of [[S.axleF, 1], [S.axleF, -1], [S.axleR, 1], [S.axleR, -1]]) this.wheelLocal.push({ x: ax, z: sg * S.track, sg, front: ax === S.axleF });
    this._m = new THREE.Matrix4(); this._w = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this.mesh.sedanSign = this.mesh.sign;
  }

  // allocate an instance slot; returns index
  alloc() { return this.n++; }
  finish() { for (const k in this.mesh) { const m = this.mesh[k]; if (!m) continue; m.count = (k === 'tire' || k === 'rim' || k === 'disc') ? this.n * 4 : this.n; } }

  // place car i. m = world matrix (position+heading). spin = wheel rotation, steer = front wheel yaw
  set(i, m, spin, steer, opts) {
    const M = this.mesh;
    const setAll = (im) => { if (im) im.setMatrixAt(i, m); };
    for (const k of ['body', 'roof', 'trim', 'chrome', 'glass', 'arch', 'interior', 'head', 'tail', 'brake', 'plate', 'sign']) setAll(M[k]);
    if (M.driver) { if (opts.driver) M.driver.setMatrixAt(i, m); else M.driver.setMatrixAt(i, this._zero || (this._zero = new THREE.Matrix4().makeScale(0, 0, 0))); }
    for (let w = 0; w < 4; w++) {
      const wl = this.wheelLocal[w];
      this._e.set(0, wl.front ? steer : 0, 0);
      this._q.setFromEuler(this._e);
      this._w.compose(this._v.set(wl.x, this.S.wheelR, wl.z), this._q, this._s);
      // spin about the wheel axle (local z) : rotate mesh geometry lathe (already oriented along z)
      const spinM = new THREE.Matrix4().makeRotationZ(-spin * wl.sg * 0 - spin);
      const wm = new THREE.Matrix4().multiplyMatrices(m, this._w);
      const side = wl.sg < 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null;
      if (side) wm.multiply(side);
      const spinned = wm.clone().multiply(spinM);
      M.tire.setMatrixAt(i * 4 + w, wm); M.rim.setMatrixAt(i * 4 + w, spinned); M.disc.setMatrixAt(i * 4 + w, wm);
    }
  }

  setColor(i, hex) { const c = this._c.set(hex); this.mesh.body.setColorAt(i, c); this.mesh.roof.setColorAt(i, c); }
  setLights(i, head, tail, brake) {
    const M = this.mesh; const c = this._c;
    M.head.setColorAt(i, c.setScalar(head)); M.tail.setColorAt(i, c.setScalar(tail)); M.brake.setColorAt(i, c.setScalar(brake));
  }
  setSign(i, on) { if (this.mesh.sign) this.mesh.sign.setColorAt(i, this._c.setScalar(on ? 1 : 0)); }
  setPlate(i, cell) { this.plateCell[i * 2] = cell % 4; this.plateCell[i * 2 + 1] = Math.floor(cell / 4) % 4; }
  flush() {
    for (const k in this.mesh) {
      const m = this.mesh[k]; if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.mesh.plate.geometry.attributes.aCell.needsUpdate = true;
  }
}

export const CAR_COLORS = [0x1c1f24, 0xe8e9ea, 0x8b1c1c, 0x1e3a5f, 0x5a6068, 0xc0c4c9, 0x2c5b3a, 0xd9a21b, 0x3b2a20, 0x7b8fa0, 0x9c2f2f, 0x121316, 0xf0f0ee, 0xb0651f];
