// Detailed instanced vehicles. Each car type is authored procedurally:
//  - a dense lofted body with real wheel-arch cavities, a shoulder crease, crowned panels and baked-in
//    ambient occlusion (vertex colours) under the sills and inside the arches,
//  - a separate greenhouse whose glass, pillars, gaskets and roof are cut in the shader (window masks in
//    metres), so the glass is genuinely see-through onto a modelled interior,
//  - shaped head / tail lamps with reflector, lens and DRL, bumpers, grille, mirrors, handles, plates,
//  - wheels: tyre lathe, spoked alloy, brake disc + caliper,
//  - a soft contact shadow under each car.
// Everything is rendered as InstancedMeshes (one per part) and compacted every frame so only cars that
// are near or on screen cost vertex work.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../core/G.js';
import { pm, VERT } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { canvasTex } from '../gfx/noise.js';

// ---------------------------------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------------------------------
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const EXTRA = ['position', 'normal', 'uv'];
const clean = (g, colour = false, keep = []) => {
  g = nonIdx(g);
  const n = g.attributes.position.count;
  for (const k of Object.keys(g.attributes)) if (!EXTRA.includes(k) && !keep.includes(k) && !(colour && k === 'color')) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (colour && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
};
const merge = (arr, colour = false, keep = []) => (arr.length ? mergeGeometries(arr.map((g) => clean(g, colour, keep)), false) : null);
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m); return g;
};
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const rbox = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => T(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), x, y, z, rx, ry, rz);
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) => T(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), x, y, z, 0, 0, 0, sx, sy, sz);
const cylX = (r0, r1, len, x, y, z) => T(new THREE.CylinderGeometry(r0, r1, len, 12), x, y, z, 0, 0, Math.PI / 2);

// piecewise cubic-Hermite through a [[x, v], ...] table (smooth hood / roof / width curves instead of polylines)
function smoothFn(tbl) {
  const n = tbl.length;
  const m = tbl.map((p, i) => { const a = tbl[Math.max(0, i - 1)], b = tbl[Math.min(n - 1, i + 1)]; return (b[1] - a[1]) / Math.max(1e-6, b[0] - a[0]); });
  return (x) => {
    if (x <= tbl[0][0]) return tbl[0][1];
    if (x >= tbl[n - 1][0]) return tbl[n - 1][1];
    let i = 0; while (x > tbl[i + 1][0]) i++;
    const x0 = tbl[i][0], h = tbl[i + 1][0] - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * tbl[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * tbl[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

// 2D control polyline -> n spaced points (centripetal Catmull-Rom)
function smoothLine(ctrl, n) {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([a, b]) => new THREE.Vector3(a, b, 0)), false, 'centripetal');
  return c.getSpacedPoints(n - 1).map((v) => [v.x, v.y]);
}

// rings of [x,y,z] (same count each) -> tube; optional per-point colour; separate caps for crisp normals
function loft(rings, o = {}) {
  const n = rings[0].length, R = rings.length;
  const pos = [], uv = [], col = [], idx = [];
  rings.forEach((r, j) => r.forEach((p, i) => { pos.push(p[0], p[1], p[2]); uv.push(i / (n - 1), j / (R - 1)); col.push(p[3] ?? 1, p[3] ?? 1, p[3] ?? 1); }));
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (o.cap) for (const [ri, flip] of [[0, true], [R - 1, false]]) {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0, ca = 0;
    for (const p of rings[ri]) { cx += p[0]; cy += p[1]; cz += p[2]; ca += p[3] ?? 1; }
    rings[ri].forEach((p) => { pos.push(p[0], p[1], p[2]); uv.push(0, 0); col.push((p[3] ?? 1) * 0.9, (p[3] ?? 1) * 0.9, (p[3] ?? 1) * 0.9); });
    pos.push(cx / n, cy / n, cz / n); uv.push(0, 0); const cc = (ca / n) * 0.9; col.push(cc, cc, cc);
    const ci = base + n;
    for (let i = 0; i < n - 1; i++) flip ? idx.push(ci, base + i, base + i + 1) : idx.push(ci, base + i + 1, base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// make sure the loft's normals point outwards: sample the vertex at `probe` (index) and flip the winding if it faces inwards of `centre`
function orient(g, probe, outward) {
  const n = g.attributes.normal;
  const d = n.getX(probe) * outward[0] + n.getY(probe) * outward[1] + n.getZ(probe) * outward[2];
  if (d < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

// ---------------------------------------------------------------------------------------------------
// type specs
// ---------------------------------------------------------------------------------------------------
// win: xA front-window limit, xB B-pillar x, xC rear-window limit, pb B-pillar half width, xWs windshield start, xBk back-glass end
const SPECS = {
  sedan: {
    len: 4.8, wid: 1.82, y0: 0.2, hw: 0.9, belt: 0.985, wheelR: 0.335, axleF: 1.45, axleR: -1.38, track: 0.79,
    body: [[-2.4, 0.78, 0.6], [-2.3, 0.88, 0.84], [-2.1, 0.96, 0.97], [-1.6, 0.975, 1.0], [-1.0, 0.985, 1.0], [0.4, 0.985, 1.0], [0.95, 0.96, 1.0], [1.5, 0.875, 1.0], [2.05, 0.80, 0.99], [2.32, 0.74, 0.93], [2.4, 0.62, 0.8]],
    glass: [[-1.6, 0.7, 0.8, 0.74], [-1.52, 0.86, 0.8, 0.74], [-1.42, 0.99, 0.82, 0.78], [-1.15, 1.28, 0.83, 0.62], [-0.55, 1.42, 0.85, 0.66], [0.35, 1.42, 0.85, 0.66], [0.8, 1.35, 0.85, 0.64], [1.15, 1.0, 0.86, 0.78], [1.27, 0.86, 0.87, 0.8], [1.34, 0.7, 0.87, 0.8]],
    xRear: -1.42, xFront: 1.15, xFront2: 0.8,
    win: { xA: 1.04, xB: -0.1, xC: -1.22, pb: 0.05, xWs: 0.62, xBk: -0.82 },
    seatX: [-0.75, 0.35], driverX: 0.32, roofH: 1.42, rails: false,
  },
  hatch: {
    len: 4.15, wid: 1.76, y0: 0.2, hw: 0.87, belt: 0.99, wheelR: 0.32, axleF: 1.25, axleR: -1.15, track: 0.77,
    body: [[-2.07, 0.82, 0.62], [-2.0, 0.92, 0.9], [-1.5, 0.99, 1.0], [-0.9, 0.99, 1.0], [0.3, 0.99, 1.0], [0.8, 0.96, 1.0], [1.35, 0.865, 1.0], [1.85, 0.8, 0.99], [2.03, 0.73, 0.92], [2.08, 0.62, 0.78]],
    glass: [[-2.0, 0.72, 0.78, 0.72], [-1.92, 0.88, 0.78, 0.72], [-1.75, 1.08, 0.82, 0.76], [-1.5, 1.44, 0.83, 0.66], [-0.6, 1.5, 0.84, 0.67], [0.3, 1.5, 0.84, 0.67], [0.7, 1.42, 0.84, 0.65], [1.0, 1.02, 0.85, 0.78], [1.1, 0.88, 0.86, 0.8], [1.17, 0.7, 0.86, 0.8]],
    xRear: -1.75, xFront: 1.0, xFront2: 0.7,
    win: { xA: 0.9, xB: -0.2, xC: -1.5, pb: 0.05, xWs: 0.52, xBk: -1.2 },
    seatX: [-0.7, 0.25], driverX: 0.22, roofH: 1.5, rails: false,
  },
  suv: {
    len: 4.75, wid: 1.95, y0: 0.3, hw: 0.97, belt: 1.15, wheelR: 0.39, axleF: 1.45, axleR: -1.4, track: 0.86,
    body: [[-2.37, 1.0, 0.62], [-2.3, 1.1, 0.9], [-2.1, 1.15, 0.98], [-1.0, 1.16, 1.0], [0.6, 1.15, 1.0], [1.15, 1.12, 1.0], [1.65, 1.02, 1.0], [2.15, 0.94, 0.98], [2.32, 0.84, 0.92], [2.38, 0.72, 0.8]],
    glass: [[-2.36, 0.88, 0.88, 0.8], [-2.28, 1.0, 0.88, 0.8], [-2.15, 1.18, 0.9, 0.8], [-1.95, 1.65, 0.93, 0.76], [-0.5, 1.74, 0.94, 0.76], [0.45, 1.74, 0.94, 0.76], [0.95, 1.66, 0.93, 0.74], [1.3, 1.16, 0.93, 0.8], [1.4, 1.0, 0.94, 0.8], [1.48, 0.85, 0.94, 0.8]],
    xRear: -2.15, xFront: 1.3, xFront2: 0.95,
    win: { xA: 1.18, xB: -0.35, xC: -1.85, pb: 0.055, xWs: 0.7, xBk: -1.95 },
    seatX: [-1.0, 0.1], driverX: 0.05, roofH: 1.74, rails: true,
  },
  van: {
    len: 5.3, wid: 1.95, y0: 0.3, hw: 0.97, belt: 1.2, wheelR: 0.36, axleF: 1.75, axleR: -1.65, track: 0.84,
    body: [[-2.65, 1.5, 0.94], [-2.5, 1.8, 1.0], [-0.9, 1.95, 1.0], [0.8, 1.95, 1.0], [1.4, 1.5, 1.0], [2.05, 1.05, 0.98], [2.55, 0.9, 0.9], [2.65, 0.7, 0.75]],
    glass: [[0.78, 1.45, 0.94, 0.9], [0.9, 1.5, 0.94, 0.9], [1.25, 1.85, 0.94, 0.88], [1.5, 1.9, 0.94, 0.86], [1.9, 1.5, 0.95, 0.9], [2.1, 1.15, 0.95, 0.92], [2.2, 1.0, 0.95, 0.92], [2.28, 0.8, 0.95, 0.92]],
    xRear: 0.9, xFront: 2.1, xFront2: 1.9,
    win: { xA: 2.06, xB: 0.88, xC: 0.88, pb: 0.04, xWs: 1.42, xBk: -9 },
    seatX: [1.3, 1.5], driverX: 1.5, roofH: 1.95, rails: false,
  },
};

// shoulder/side profile of the lower body: (half-width fraction, height fraction), bottom centre -> top centre
const PROF = [[0, 0], [0.7, 0], [0.84, 0.035], [0.93, 0.11], [0.985, 0.22], [1.0, 0.34], [1.0, 0.5], [0.995, 0.6], [0.985, 0.68], [0.955, 0.79], [0.9, 0.89], [0.8, 0.955], [0.62, 0.99], [0.3, 1.008], [0, 1.012]];
const NP = 34;

function makeBody(S) {
  const top = smoothFn(S.body.map(([x, t]) => [x, t]));
  const ws = smoothFn(S.body.map(([x, , w]) => [x, w]));
  const L2 = S.len / 2;
  const prof = smoothLine(PROF, NP);
  const bot = (x) => S.y0 + 0.1 * sm(L2 - 0.6, L2, Math.abs(x));
  const gauss = (u) => Math.exp(-u * u);
  const flare = (x) => 1 + 0.02 * (gauss((x - S.axleF) / 0.5) + gauss((x - S.axleR) / 0.5));
  const arches = [S.axleF, S.axleR].map((ax) => ({ ax, yc: S.wheelR, R: S.wheelR + 0.07 }));
  const tipK = (x) => { const e = L2 - Math.abs(x); return e >= 0.05 ? 1 : 0.86 + 0.14 * Math.sqrt(Math.max(0, 1 - ((0.05 - e) / 0.05) ** 2)); };
  // right-hand side point at ring x, profile index j  -> [x, y, z, ao]
  const pt = (x, j) => {
    const [w0, yf] = prof[j];
    const y0 = bot(x), H = top(x) - y0;
    const creaseFade = sm(L2 - 0.15, L2 - 0.5, Math.abs(x));
    const w = w0 + creaseFade * (0.012 * gauss((yf - 0.64) / 0.028) - 0.007 * gauss((yf - 0.545) / 0.04)) * (w0 > 0.5 ? 1 : 0);
    let y = y0 + yf * H;
    const hw = S.hw * ws(x) * flare(x);
    let z = w * hw, ao = 1 - 0.5 * sm(0.16, 0.0, yf);
    const k = tipK(x);
    if (k < 1) { const ym = (bot(x) + top(x)) / 2; y = ym + (y - ym) * k; z *= k; }
    return [x, y, z, ao];
  };
  // ring x positions: uniform + a few extra rings at each tip for a rounded bumper edge
  const N = Math.round(S.len / 0.06);
  const tips = [0, 0.006, 0.016, 0.03, 0.05];
  const all = [...new Set([...Array.from({ length: N + 1 }, (_, i) => -L2 + (S.len * i) / N), ...tips.map((e) => -L2 + e), ...tips.map((e) => L2 - e)])].sort((p, q) => p - q);
  const rings = all.map((x) => {
    const r = []; for (let j = 0; j < NP; j++) r.push(pt(x, j));
    for (let j = NP - 2; j >= 0; j--) { const p = r[j]; r.push([p[0], p[1], -p[2], p[3]]); }
    return r;
  });
  const geo = orient(loft(rings, { cap: true }), (Math.floor(rings.length / 2) * (2 * NP - 1)) + NP - 1, [0, 1, 0]);
  return { geo, top, ws, bot, flare, L2, arches };
}

// the greenhouse: smooth rings from the glass table; aWin = (distance from the belt along the section, side-glass arc length, distance to the nearer end)
function makeCabin(S, bodyWs) {
  const gt = S.glass;
  const roof = smoothFn(gt.map(([x, r]) => [x, r]));
  const wb = smoothFn(gt.map(([x, , w]) => [x, w]));
  const wr = smoothFn(gt.map(([x, , , w]) => [x, w]));
  const g0 = gt[0][0], g1 = gt[gt.length - 1][0];
  const NR = 56, per = 3;
  const rings = [], win = [];
  for (let i = 0; i <= NR; i++) {
    const x = g0 + ((g1 - g0) * i) / NR;
    const r = roof(x), b = Math.min(S.belt - 0.03, r - 0.01);
    const wB = Math.min(wb(x), S.hw * bodyWs(x) * 0.8), wR = Math.min(wr(x), wB - 0.07);      // the greenhouse springs from the body's shoulder instead of overhanging it
    const half = smoothLine([[wB, b], [wB - 0.42 * (wB - wR), b + 0.46 * (r - b)], [wR + 0.02, r - 0.02], [wR * 0.6, r], [0, r + 0.005]], per * 4 + 1);
    // arc length bookkeeping (metres)
    const arc = [0]; for (let k = 1; k < half.length; k++) arc.push(arc[k - 1] + Math.hypot(half[k][0] - half[k - 1][0], half[k][1] - half[k - 1][1]));
    let si = 0, bd = 1e9; half.forEach((pp, k) => { const dd = Math.hypot(pp[0] - (wR + 0.02), pp[1] - (r - 0.02)); if (dd < bd) { bd = dd; si = k; } });
    const sideLen = arc[si];                                       // belt -> roof edge
    const ring = [], ringWin = [];
    const endD = Math.min(x - S.xRear, S.xFront - x);                 // glass stops at the visible base of the windshield / backlight, not on the buried extension
    for (let k = 0; k < half.length; k++) { ring.push([x, half[k][1], -half[k][0]]); ringWin.push([arc[k], sideLen, endD]); }
    for (let k = half.length - 2; k >= 0; k--) { ring.push([x, half[k][1], half[k][0]]); ringWin.push([arc[k], sideLen, endD]); }
    rings.push(ring); win.push(ringWin);
  }
  const geo = loft(rings, {});
  geo.deleteAttribute('color');
  const aw = new Float32Array(geo.attributes.position.count * 3);
  let q = 0; for (const rw of win) for (const v of rw) { aw[q++] = v[0]; aw[q++] = v[1]; aw[q++] = v[2]; }
  geo.setAttribute('aWin', new THREE.BufferAttribute(aw, 3));
  const mid = Math.floor(rings.length / 2);
  return orient(geo, mid * rings[0].length + (rings[0].length - 1) / 2, [0, 1, 0]);
}

// ---------------------------------------------------------------------------------------------------
// lamp shapes
// ---------------------------------------------------------------------------------------------------
function lampShape(w, h, r, cut) {      // rounded slab with a raked outer-top corner (mirror for the other side)
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - cut); s.lineTo(x1 - cut * 1.6, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
// extrude a lamp shape facing +x (front, face > 0) or -x (rear); sgn = -1 / +1 picks the left / right side of the car
function lamp(w, h, depth, x, y, z, face, sgn, r = 0.03, cut = 0.04, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(lampShape(w, h, r, cut), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const mir = face > 0 ? -sgn : sgn;               // after the quarter turn the shape's +x maps to -z (front) or +z (rear): the raked corner must face outwards
  if (mir < 0) {
    g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  g.computeVertexNormals();
  return T(g, x, y, z, 0, face > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
}

function buildParts(name, S) {
  const parts = {
    body: [], trim: [], chrome: [], arch: [], head: [], headLens: [], tail: [], brake: [], plate: [], interior: [], interiorLight: [], driver: [], sign: [],
  };
  const body = makeBody(S);
  parts.body.push(body.geo);
  const L2 = S.len / 2, y0 = S.y0, hw = S.hw;
  const axles = [S.axleF, S.axleR];
  const cabin = makeCabin(S, body.ws);

  // ---- paint-matched bits: door mirrors ----
  for (const sgn of [-1, 1]) {
    const mx = S.seatX[1] + 0.44, my = S.belt + 0.04, mz = sgn * (hw * 1.0 + 0.085);
    parts.body.push(ball(0.06, mx, my, mz, 1.5, 0.78, 0.68, 14));
    parts.trim.push(box(0.05, 0.03, 0.14, mx + 0.02, my - 0.045, sgn * (hw + 0.0)));
    parts.chrome.push(T(new THREE.PlaneGeometry(0.14, 0.08), mx - 0.078, my, mz, 0, -Math.PI / 2, 0));
  }
  // ---- wheel houses: dark tunnel + back wall behind each shader-cut opening ----
  for (const sgn of [-1, 1]) for (const ax of axles) {
    const Ra = S.wheelR + 0.07, yc = S.wheelR, hwA = hw * body.ws(ax) * body.flare(ax);
    const a0 = Math.asin(Math.max(-1, Math.min(1, (y0 - 0.02 - yc) / Ra)));
    const pts = []; const nA = 26;
    for (let i = 0; i <= nA; i++) { const a = a0 + ((Math.PI - 2 * a0) * i) / nA; pts.push([ax + Math.cos(a) * Ra, yc + Math.sin(a) * Ra]); }
    const zO = sgn * (hwA - 0.005), zI = sgn * (hwA - 0.34);
    const pos = [], idx = [];
    pts.forEach(([x, y]) => { pos.push(x, y, zO, x, y, zI); });
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
    parts.arch.push(tg);
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts) sh.lineTo(x, y); sh.lineTo(pts[0][0], pts[0][1]);
    const wall = new THREE.ShapeGeometry(sh); wall.translate(0, 0, zI); parts.arch.push(wall);
  }
  // ---- sills, wheel-arch lips, door seams/handles ----
  const sillX0 = S.axleR + S.wheelR + 0.16, sillX1 = S.axleF - S.wheelR - 0.16;
  for (const sgn of [-1, 1]) {
    parts.trim.push(rbox(sillX1 - sillX0, 0.085, 0.05, 0.02, (sillX0 + sillX1) / 2, y0 + 0.085, sgn * (hw - 0.012)));
    for (const ax of axles) {
      const R = S.wheelR + 0.07;
      const lip = new THREE.TorusGeometry(R + 0.008, 0.013, 6, 28, Math.PI * 1.0);
      parts.trim.push(T(lip, ax, S.wheelR, sgn * (hw * body.flare(ax) * body.ws(ax) + 0.0), 0, 0, 0.0));
    }
    for (const dx of [S.seatX[1] - 0.15, S.seatX[0] * 0.9 + 0.32]) parts.chrome.push(rbox(0.16, 0.022, 0.02, 0.008, dx, S.belt - 0.12, sgn * (hw + 0.004)));
  }
  // ---- nose: grille, lamps, lip, fog lamps, plate; tail: lamps, lip, exhaust ----
  const nx = L2 - 0.004;
  parts.trim.push(rbox(0.06, 0.16, S.wid * 0.36, 0.02, nx - 0.012, y0 + 0.31, 0));                                   // grille
  for (let i = 0; i < 4; i++) parts.chrome.push(box(0.012, 0.01, S.wid * 0.33, nx + 0.028, y0 + 0.25 + i * 0.038, 0));
  parts.chrome.push(T(new THREE.TorusGeometry(0.045, 0.006, 6, 18), nx + 0.03, y0 + 0.33, 0, 0, Math.PI / 2, 0));   // badge ring
  parts.chrome.push(T(new THREE.CircleGeometry(0.038, 14), nx + 0.029, y0 + 0.33, 0, 0, Math.PI / 2, 0));
  parts.trim.push(rbox(0.1, 0.12, S.wid * 0.9, 0.03, L2 - 0.045, y0 + 0.055, 0));                                     // front lip
  parts.trim.push(rbox(0.1, 0.12, S.wid * 0.9, 0.03, -L2 + 0.045, y0 + 0.06, 0));                                     // rear lip
  parts.trim.push(rbox(0.04, 0.05, S.wid * 0.62, 0.012, L2 - 0.02, y0 + 0.17, 0));                                   // lower intake
  for (const sgn of [-1, 1]) {
    // headlamp: black housing, silver reflector, emissive lens + DRL line
    parts.trim.push(lamp(0.31, 0.13, 0.05, L2 - 0.02, y0 + 0.34, sgn * hw * 0.56, 1, sgn, 0.035, 0.045, 0.004));
    parts.headLens.push(lamp(0.27, 0.095, 0.03, L2 - 0.006, y0 + 0.34, sgn * hw * 0.56, 1, sgn, 0.03, 0.04, 0.003));
    parts.head.push(lamp(0.21, 0.055, 0.02, L2 + 0.006, y0 + 0.345, sgn * hw * 0.56 - sgn * 0.02, 1, sgn, 0.02, 0.028, 0.002));
    parts.head.push(box(0.012, 0.012, 0.26, L2 + 0.012, y0 + 0.405, sgn * hw * 0.56, 0, 0, 0));
    parts.trim.push(T(new THREE.CircleGeometry(0.038, 12), L2 - 0.004, y0 + 0.11, sgn * hw * 0.62, 0, Math.PI / 2, 0));   // fog lamp recess
    parts.chrome.push(T(new THREE.TorusGeometry(0.04, 0.005, 6, 14), L2 - 0.003, y0 + 0.11, sgn * hw * 0.62, 0, Math.PI / 2, 0));
    // tail lamp: black housing, red lens (tail), bright stop/brake element
    parts.trim.push(lamp(0.34, 0.13, 0.05, -L2 + 0.02, y0 + 0.5, sgn * hw * 0.52, -1, sgn, 0.03, 0.045, 0.004));
    parts.tail.push(lamp(0.3, 0.1, 0.03, -L2 + 0.006, y0 + 0.5, sgn * hw * 0.52, -1, sgn, 0.03, 0.04, 0.003));
    parts.brake.push(lamp(0.18, 0.05, 0.02, -L2 - 0.004, y0 + 0.51, sgn * hw * 0.52 + sgn * 0.045, -1, sgn, 0.02, 0.025, 0.002));
    parts.chrome.push(T(new THREE.CylinderGeometry(0.036, 0.036, 0.11, 14), -L2 - 0.012, y0 + 0.055, sgn * hw * 0.5, 0, 0, Math.PI / 2));   // exhaust tip
    parts.trim.push(T(new THREE.CylinderGeometry(0.03, 0.03, 0.115, 12), -L2 - 0.012, y0 + 0.055, sgn * hw * 0.5, 0, 0, Math.PI / 2));
  }
  parts.plate.push(T(new THREE.PlaneGeometry(0.52, 0.14), L2 + 0.04, y0 + 0.2, 0, 0, Math.PI / 2, 0));
  parts.plate.push(T(new THREE.PlaneGeometry(0.52, 0.14), -L2 - 0.038, y0 + 0.42, 0, 0, -Math.PI / 2, 0));
  parts.trim.push(rbox(0.012, 0.17, 0.56, 0.004, L2 + 0.032, y0 + 0.2, 0));
  parts.trim.push(rbox(0.012, 0.17, 0.56, 0.004, -L2 - 0.03, y0 + 0.42, 0));
  parts.chrome.push(box(0.006, 0.02, 0.5, -L2 - 0.03, y0 + 0.54, 0));                                                 // tailgate trim strip
  // ---- roof furniture ----
  parts.trim.push(rbox(0.16, 0.035, 0.06, 0.012, S.xRear + 0.45, S.roofH + 0.03, 0));                          // shark-fin antenna
  if (S.rails) for (const sgn of [-1, 1]) { parts.chrome.push(rbox(S.len * 0.52, 0.03, 0.035, 0.012, -0.3, S.roofH + 0.04, sgn * 0.72)); for (const rx of [-1.3, -0.3, 0.7]) parts.trim.push(rbox(0.04, 0.05, 0.05, 0.01, rx, S.roofH + 0.018, sgn * 0.72)); }
  if (name === 'sedan') parts.sign.push(rbox(0.4, 0.14, 0.9, 0.05, 0.0, S.roofH + 0.085, 0));
  // wipers on the cowl
  for (const sgn of [-1, 1]) parts.trim.push(box(0.014, 0.012, 0.44, S.win.xWs + 0.42, S.roofH - (S.roofH - S.belt) * 0.85 + 0.03, sgn * 0.3 - 0.0, 0, 0, -0.35));
  // ---- interior (seen through the glass) ----
  const seatY = y0 + 0.36, belt = S.belt;
  const dashX = S.xFront - 0.28;
  parts.interior.push(box(S.len * 0.42, 0.06, S.wid * 0.78, (S.seatX[0] + dashX) / 2, y0 + 0.26, 0));                   // floor
  for (const sx of S.seatX) for (const sgn of [-1, 1]) {
    parts.interior.push(rbox(0.48, 0.12, 0.48, 0.05, sx, seatY, sgn * 0.4));                                           // cushion
    parts.interior.push(rbox(0.11, 0.56, 0.46, 0.04, sx - 0.25, seatY + 0.12, sgn * 0.4, 0, 0, -0.14));                // back
    parts.interiorLight.push(rbox(0.07, 0.17, 0.2, 0.03, sx - 0.29, seatY + 0.72, sgn * 0.4, 0, 0, -0.1));             // head restraint
  }
  parts.interior.push(rbox(0.46, 0.22, S.wid * 0.84, 0.05, dashX, belt - 0.06, 0));                                     // dashboard
  parts.interior.push(rbox(0.2, 0.1, 0.5, 0.03, dashX - 0.14, belt + 0.06, -0.36));                                    // instrument hood
  parts.interior.push(rbox(0.6, 0.18, 0.2, 0.05, (S.seatX[0] + S.seatX[1]) / 2 + 0.2, seatY + 0.05, 0));              // centre console
  parts.interior.push(T(new THREE.TorusGeometry(0.17, 0.014, 6, 18), S.driverX + 0.46, belt + 0.06, -0.4, 0, Math.PI / 2, 0));   // steering wheel
  parts.interior.push(box(0.1, 0.05, 0.3, S.len * 0.0 - 0.0 + (S.seatX[0] - 0.5), belt + 0.02, 0));
  { const c0 = S.seatX[0] - 0.5, c1 = dashX + 0.05; for (const sgn of [-1, 1]) parts.interior.push(box(c1 - c0, belt - y0 - 0.22, 0.05, (c0 + c1) / 2, y0 + 0.2 + (belt - y0 - 0.22) / 2, sgn * hw * 0.62)); }   // door cards
  parts.interiorLight.push(box(S.xFront2 - S.xRear - 0.3, 0.03, 1.15, (S.xFront2 + S.xRear) / 2, S.roofH - 0.055, 0));   // headliner
  parts.driver.push(ball(0.11, S.driverX, belt + 0.42, -0.4, 1, 1.08, 1, 12));
  parts.driver.push(rbox(0.22, 0.44, 0.34, 0.06, S.driverX - 0.05, seatY + 0.28, -0.4));
  parts.driver.push(T(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8), S.driverX - 0.02, belt + 0.27, -0.4));
  // ---- wheels ----
  const wheels = { tire: [], rim: [], disc: [] };
  const R = S.wheelR, W = 0.22, hole = R * 0.62;
  const prof = [[hole, -W * 0.46], [R - 0.09, -W / 2], [R - 0.035, -W * 0.42], [R, -W * 0.28], [R + 0.004, 0], [R, W * 0.28], [R - 0.035, W * 0.42], [R - 0.09, W / 2], [hole, W * 0.46], [hole, -W * 0.46]];
  const tireGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40); tireGeo.rotateX(Math.PI / 2);
  wheels.tire.push(tireGeo);
  const zf = W * 0.44;
  wheels.rim.push(T(new THREE.RingGeometry(hole * 0.84, hole + 0.012, 36), 0, 0, W * 0.46 + 0.002));
  wheels.rim.push(T(new THREE.CylinderGeometry(hole + 0.012, hole + 0.012, 0.05, 36, 1, true), 0, 0, W * 0.46 - 0.025, Math.PI / 2, 0, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, len = hole * 0.86;
    wheels.rim.push(box(len, 0.055, 0.03, Math.cos(a) * len * 0.52, Math.sin(a) * len * 0.52, zf, 0, 0, a));
    wheels.rim.push(box(len * 0.5, 0.036, 0.034, Math.cos(a + 0.32) * len * 0.72, Math.sin(a + 0.32) * len * 0.72, zf - 0.004, 0, 0, a + 0.32 + 0.5));
    wheels.rim.push(T(new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 8), Math.cos(a + 0.63) * 0.062, Math.sin(a + 0.63) * 0.062, zf + 0.022, Math.PI / 2, 0, 0));
  }
  wheels.rim.push(T(new THREE.CylinderGeometry(0.058, 0.066, 0.03, 20), 0, 0, zf + 0.012, Math.PI / 2, 0, 0));
  wheels.rim.push(T(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), 0, 0, zf + 0.03, Math.PI / 2, 0, 0));
  wheels.disc.push(T(new THREE.CylinderGeometry(hole * 0.98, hole * 0.98, 0.016, 32), 0, 0, 0.02, Math.PI / 2, 0, 0));
  wheels.disc.push(T(new THREE.CylinderGeometry(hole * 0.98, hole * 0.98, 0.006, 32), 0, 0, W / 2 - 0.13, Math.PI / 2, 0, 0));
  wheels.disc.push(box(0.09, 0.15, 0.06, hole * 0.6, 0, 0.055, 0, 0, 0.5));
  return { parts, wheels, cabin, body };
}

// ---------------------------------------------------------------------------------------------------
// cabin shader: window masks in metres. The same mask drives the painted frame (opaque, discards the
// openings) and the glass (transparent, discards everything else).
// ---------------------------------------------------------------------------------------------------
const CABIN_COMMON = /* glsl */`
uniform vec4 uP;          // x: front side window front limit, y: B-pillar x, z: rear window rear limit, w: B-pillar half width
uniform vec3 uCol2;       // x: windshield start x, y: back-glass end x
varying vec3 vWin;        // x: metres from the belt, y: side-glass arc length, z: metres from the nearer end of the greenhouse
float rbx(float a, float b, float r){ float ra = r - a, rb = r - b; return (ra > 0.0 && rb > 0.0) ? r - length(vec2(ra, rb)) : min(a, b); }
float cabinD(vec3 p){
  float sM = vWin.x, sl = vWin.y, x = p.x;
  float d = -1.0;
  if (sM < sl) {
    float ds = min(sM - 0.022, sl - 0.04 - sM);
    float fr = rbx(ds, min(uP.x - x, x - (uP.y + uP.w)), 0.05);
    float rr = rbx(ds, min((uP.y - uP.w) - x, x - uP.z), 0.05);
    d = max(fr, rr);
  } else {
    float dr = sM - sl - 0.045;
    float ws = rbx(dr, min(x - uCol2.x, vWin.z - 0.03), 0.07);
    float bk = rbx(dr, min(uCol2.y - x, vWin.z - 0.03), 0.07);
    d = max(ws, bk);
  }
  return d;
}`;
PROC.cabin = CABIN_COMMON + /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float d = cabinD(p);
  float aw = max(0.0025, length(fwidth(p)) * 1.2);
  s.a = 1.0 - smoothstep(-0.004, 0.0015, d);                             // opening: the glass shows through
  float gasket = smoothstep(0.02, 0.008, -d) * step(d, 0.004);          // black rubber seal around every opening
  float bp = (1.0 - smoothstep(uP.w, uP.w + aw, abs(p.x - uP.y))) * step(vWin.x, vWin.y + 0.02);   // B pillar
  float flake = nz(p * 90.0).g;
  vec3 paint = s.alb * (0.94 + 0.12 * flake);
  s.alb = mix(paint, vec3(0.012, 0.012, 0.014), clamp(max(gasket, bp), 0.0, 1.0));
  s.rough = mix(s.rough, 0.7, clamp(max(gasket, bp), 0.0, 1.0));
  s.metal = mix(s.metal, 0.0, clamp(max(gasket, bp), 0.0, 1.0));
  s.h = (flake - 0.5) * 0.00006 * dfade(wp, 0.004);
}`;
PROC.cabinglass = CABIN_COMMON + /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float d = cabinD(p);
  s.a = smoothstep(-0.0015, 0.004, d);
  s.alb = vec3(0.014, 0.02, 0.026);
  s.rough = 0.035; s.metal = 0.0;
  s.h = 0.0;
}`;
VERT.cabin = VERT.cabinglass = { head: 'attribute vec3 aWin; varying vec3 vWin;', begin: 'vWin = aWin;' };

// ---------------------------------------------------------------------------------------------------
// instanced car type
// ---------------------------------------------------------------------------------------------------
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
let blobTex = null;
function getBlobTex() {
  if (blobTex) return blobTex;
  blobTex = canvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.7)'); g.addColorStop(0.85, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false, mip: true });
  return blobTex;
}

const CAR_MESHES = ['body', 'cabin', 'cabinGlass', 'arch', 'trim', 'chrome', 'head', 'headLens', 'tail', 'brake', 'plate', 'interior', 'interiorLight', 'driver', 'sign'];

export class CarType {
  constructor(scene, name, capacity) {
    const S = SPECS[name];
    this.name = name; this.S = S; this.cap = capacity; this.n = 0;
    const { parts, wheels, cabin } = buildParts(name, S);
    const w = S.win;
    const paint = pm('carpaint', { color: 0xffffff, rough: 0.2, metal: 0.78, physical: true, clearcoat: 1, ccRough: 0.025, wet: 1, side: THREE.DoubleSide, vertexColors: true, alphaTest: 0.5, p: [S.seatX[0] * 0.9 - 0.45, S.seatX[1] - 0.45, S.xFront - 0.02, S.xRear + 0.02], tag: name });
    paint.userData.uni.extra = { uArch: { value: new THREE.Vector4(S.axleF, S.axleR, S.wheelR, S.wheelR + 0.07) } };
    paint.userData.uni.uCol2.value.setRGB(S.y0 + 0.17, S.y0 + 0.64 * (S.belt - S.y0), S.belt + 0.3);
    const cabinPaint = pm('cabin', { color: 0xffffff, rough: 0.2, metal: 0.78, physical: true, clearcoat: 1, ccRough: 0.025, wet: 1, side: THREE.DoubleSide, alphaTest: 0.5, p: [w.xA, w.xB, w.xC, w.pb], tag: name });
    cabinPaint.userData.uni.uCol2.value.setRGB(w.xWs, w.xBk, 0);
    const cabinGlass = pm('cabinglass', { color: 0xffffff, rough: 0.035, glass: true, opacity: 0.68, env: 2.6, side: THREE.DoubleSide, alphaTest: 0.02, p: [w.xA, w.xB, w.xC, w.pb], tag: name });
    cabinGlass.userData.uni.uCol2.value.setRGB(w.xWs, w.xBk, 0);
    const archM = pm('plain', { color: 0x060606, rough: 0.95, side: THREE.DoubleSide });
    const trimM = pm('plastic', { color: 0x101112, rough: 0.5, wet: 1 });
    const chromeM = pm('plain', { color: 0xd8dade, metal: 1, rough: 0.12 });
    const inM = pm('fabric', { color: 0x1c1d20 });
    const inLightM = pm('fabric', { color: 0x6a6660 });
    const tireM = pm('rubber', { color: 0x141414, wet: 0.6 });
    const rimM = pm('metal', { color: 0x8d9298, p: [2, 80, 0, 0], rough: 0.28 });
    const discM = pm('plain', { color: 0x5b5d61, metal: 1, rough: 0.5 });
    const lensM = pm('plain', { color: 0xe6e9ee, metal: 1, rough: 0.14 });
    const lightBasic = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const headM = lightBasic(new THREE.Color(4, 3.8, 3.2)), tailM = lightBasic(new THREE.Color(2.4, 0.08, 0.05)), brakeM = lightBasic(new THREE.Color(5, 0.1, 0.06));
    const signM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.0), toneMapped: false });
    const driverM = pm('fabric', { color: 0x3b3835 });
    const plateM = new THREE.MeshBasicMaterial({ map: getPlateAtlas(), color: new THREE.Color(0.85, 0.85, 0.85), toneMapped: false });

    const N = capacity;
    const mk = (geo, mat, count, o = {}) => {
      if (!geo) return null;
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = o.shadow ?? true; im.receiveShadow = true; im.frustumCulled = false;
      im.layers.enable(1);
      if (o.color) { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < count; i++) im.setColorAt(i, c); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      if (o.renderOrder) im.renderOrder = o.renderOrder;
      im.count = 0;
      scene.add(im);
      return im;
    };
    this.mesh = {
      body: mk(merge(parts.body, true), paint, N, { color: true }),
      cabin: mk(merge([cabin], false, ['aWin']), cabinPaint, N, { color: true }),
      cabinGlass: mk(merge([cabin.clone()], false, ['aWin']), cabinGlass, N, { shadow: false, renderOrder: 4 }),
      arch: mk(merge(parts.arch), archM, N, { shadow: false }),
      trim: mk(merge(parts.trim), trimM, N), chrome: mk(merge(parts.chrome), chromeM, N, { shadow: false }),
      interior: mk(merge(parts.interior), inM, N, { shadow: false }), interiorLight: mk(merge(parts.interiorLight), inLightM, N, { shadow: false }),
      driver: mk(merge(parts.driver), driverM, N, { shadow: false }),
      head: mk(merge(parts.head), headM, N, { color: true, shadow: false }), headLens: mk(merge(parts.headLens), lensM, N, { shadow: false }),
      tail: mk(merge(parts.tail), tailM, N, { color: true, shadow: false }), brake: mk(merge(parts.brake), brakeM, N, { color: true, shadow: false }),
      sign: name === 'sedan' ? mk(merge(parts.sign), signM, N, { color: true, shadow: false }) : null,
      tire: mk(merge(wheels.tire), tireM, N * 4), rim: mk(merge(wheels.rim), rimM, N * 4, { shadow: false }), disc: mk(merge(wheels.disc), discM, N * 4, { shadow: false }),
    };
    // number plates: per-instance atlas cell through an instanced UV offset
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
    // soft contact shadow
    const blobM = new THREE.MeshBasicMaterial({ map: getBlobTex(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const blobG = new THREE.PlaneGeometry(S.len * 1.22, S.wid * 1.32); blobG.rotateX(-Math.PI / 2);
    this.mesh.blob = mk(blobG, blobM, N, { shadow: false, renderOrder: 2 });
    this.mesh.blob.receiveShadow = false;

    // wheel placement (outer tyre face sits just inside the arch lip)
    this.wheelLocal = [];
    for (const [ax, sg] of [[S.axleF, 1], [S.axleF, -1], [S.axleR, 1], [S.axleR, -1]]) this.wheelLocal.push({ x: ax, z: sg * (S.hw - 0.13), sg, front: ax === S.axleF });
    // per-car CPU state (compacted into the instance buffers every flush)
    this.mats = new Float32Array(N * 16); this.spin = new Float32Array(N); this.steer = new Float32Array(N); this.hasDriver = new Uint8Array(N);
    this.col = new Float32Array(N * 3).fill(1); this.lamps = new Float32Array(N * 3); this.signOn = new Float32Array(N);
    this._m = new THREE.Matrix4(); this._w = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color(); this._fr = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sp = new THREE.Sphere();
    this._wm = new THREE.Matrix4(); this._spin = new THREE.Matrix4(); this._side = new THREE.Matrix4().makeRotationY(Math.PI); this._z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.plateSrc = new Float32Array(N * 2); this._slotIdx = new Int32Array(N); this._t = new THREE.Matrix4(); this._rm = new THREE.Matrix4();
    this.visible = 0;
  }

  alloc() { return this.n++; }
  finish() { /* counts are decided every flush() after culling */ }

  // place car i. m = world matrix (position+heading). spin = wheel rotation, steer = front wheel yaw
  set(i, m, spin, steer, opts) { m.toArray(this.mats, i * 16); this.spin[i] = spin; this.steer[i] = steer; this.hasDriver[i] = opts && opts.driver ? 1 : 0; }
  setColor(i, hex) { const c = this._c.set(hex); this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; }
  setLights(i, head, tail, brake) { this.lamps[i * 3] = head; this.lamps[i * 3 + 1] = tail; this.lamps[i * 3 + 2] = brake; }
  setSign(i, on) { this.signOn[i] = on ? 1 : 0.2; }
  setPlate(i, cell) { this.plateSrc[i * 2] = cell % 4; this.plateSrc[i * 2 + 1] = Math.floor(cell / 4) % 4; }

  // cull (distance + frustum, generous near the player so shadows stay right), then write the visible cars densely into the instance buffers
  flush() {
    const M = this.mesh, cam = G.camera, S = this.S;
    let useFr = false;
    if (cam) { cam.updateMatrixWorld(); this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._pm); useFr = true; }
    const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
    const radius = S.len * 0.62;
    const m = this._m, w = this._w, wm = this._wm, sp = this._spin;
    let k = 0, kw = 0;
    const bodyCol = M.body.instanceColor, cabCol = M.cabin.instanceColor;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16, x = this.mats[o + 12], y = this.mats[o + 13], z = this.mats[o + 14];
      if (useFr) {
        const dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy * 0.25 + dz * dz;
        if (d2 > 300 * 300) continue;
        if (d2 > 70 * 70) { this._sp.set(this._v.set(x, y + 0.8, z), radius + 1.5); if (!this._fr.intersectsSphere(this._sp)) continue; }
      }
      m.fromArray(this.mats, o);
      for (const key of CAR_MESHES) { const im = M[key]; if (im) im.setMatrixAt(k, m); }
      M.plate.setMatrixAt(k, m);
      if (this.hasDriver[i]) M.driver.setMatrixAt(k, m); else M.driver.setMatrixAt(k, this._z);
      // contact shadow
      M.blob.setMatrixAt(k, w.copy(m).multiply(this._t.makeTranslation(0, 0.012, 0)));
      bodyCol.setXYZ(k, this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]); cabCol.setXYZ(k, this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]);
      M.head.instanceColor.setXYZ(k, this.lamps[i * 3], this.lamps[i * 3], this.lamps[i * 3]);
      M.tail.instanceColor.setXYZ(k, this.lamps[i * 3 + 1], this.lamps[i * 3 + 1], this.lamps[i * 3 + 1]);
      M.brake.instanceColor.setXYZ(k, this.lamps[i * 3 + 2], this.lamps[i * 3 + 2], this.lamps[i * 3 + 2]);
      if (M.sign) M.sign.instanceColor.setXYZ(k, this.signOn[i], this.signOn[i], this.signOn[i]);
      for (let q = 0; q < 4; q++) {
        const wl = this.wheelLocal[q];
        this._e.set(0, wl.front ? this.steer[i] : 0, 0); this._q.setFromEuler(this._e);
        w.compose(this._v.set(wl.x, S.wheelR, wl.z), this._q, this._s);
        wm.multiplyMatrices(m, w);
        if (wl.sg < 0) wm.multiply(this._side);
        M.tire.setMatrixAt(kw, wm); M.disc.setMatrixAt(kw, wm);
        sp.makeRotationZ(-this.spin[i]); M.rim.setMatrixAt(kw, this._rm.copy(wm).multiply(sp));
        kw++;
      }
      this._slotIdx[k] = i;
      k++;
    }
    this.visible = k;
    for (const key in M) {
      const im = M[key]; if (!im) continue;
      im.count = (key === 'tire' || key === 'rim' || key === 'disc') ? kw : k;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    // plate atlas cells follow the compacted order
    const pc = this.plateCell, src = this.plateSrc;
    for (let q = 0; q < k; q++) { const i = this._slotIdx[q]; pc[q * 2] = src[i * 2]; pc[q * 2 + 1] = src[i * 2 + 1]; }
    M.plate.geometry.attributes.aCell.needsUpdate = true;
  }
}

export const CAR_COLORS = [0x1c1f24, 0xe8e9ea, 0x8b1c1c, 0x1e3a5f, 0x5a6068, 0xc0c4c9, 0x2c5b3a, 0xd9a21b, 0x3b2a20, 0x7b8fa0, 0x9c2f2f, 0x121316, 0xf0f0ee, 0xb0651f];
