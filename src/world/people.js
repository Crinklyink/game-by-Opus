// Pedestrians and shop NPCs: one instanced, vertex-animated humanoid (walk cycle in the vertex
// shader), umbrellas in the rain, and a small sidewalk/crosswalk waypoint AI that obeys the
// pedestrian signals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { patchMaterial } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { Signals, isRoad, ROAD_Y, WALK_Y } from './street.js';

// Colour categories (aPart) - what a part is made of. Motion is separate (aSw) so shoes/forearms can follow their limbs.
const PART = { LEG: 0, TORSO: 2, UPPER: 3, FORE: 4, HEAD: 5, HAIR: 6, SHOE: 7, BAG: 8, FACE: 9, BELT: 10, LONGHAIR: 11, JACKET: 12, HAT: 13, HAND: 14, EYEW: 15, LIPS: 16 };
// Motion groups (aSw): 1/2 thigh L/R (hip), 3/4 upper arm L/R (shoulder), 5/6 calf+shoe L/R (knee under hip), 7/8 forearm+hand L/R (elbow under shoulder)

function part(geo, id, pivot, sw = 0, pivot2 = pivot) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  const ag = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { ag[i * 4] = id; ag[i * 4 + 1] = sw; ag[i * 4 + 2] = sw; ag[i * 4 + 3] = 0; }
  geo.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 4));
  return geo;
}
// translate / rotate(YXZ) / scale a geometry (normals follow via applyMatrix4)
const T = (g, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')), new THREE.Vector3(...s))); return g; };
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const ball = (rad, seg = 12) => new THREE.SphereGeometry(rad, seg, Math.max(6, seg - 4));


// ---------------------------------------------------------------------------------------------------
// One continuous skin: smooth-union of anatomical primitives, meshed with surface nets. Every vertex carries its two
// nearest skeleton segments + a blend weight, so knees, elbows, hips and shoulders bend smoothly (no gaps, no spheres).
// ---------------------------------------------------------------------------------------------------
function bodyGeometry(H = 0.0125) {
  const v3 = (x, y, z) => [x, y, z];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const roundCone = (p, a, b, r1, r2) => {
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2], rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    const y = pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2], z = y - l2;
    const q = [pa[0] * l2 - ba[0] * y, pa[1] * l2 - ba[1] * y, pa[2] * l2 - ba[2] * y];
    const x2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2], y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
  const ell = (p, c, r) => { const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]]; const k0 = len(q); const k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]); return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1; };
  // group: 0 torso/head, 1/2 thigh L/R, 3/4 upper arm, 5/6 calf, 7/8 forearm.  part: colour category
  const P = [];
  // cl = garment thickness (m) pushed out over the skin for this primitive (0 = bare skin)
  const E = (g, part, c, r, cl = 0) => P.push({ g, part, cl, f: (p) => ell(p, c, r) });
  const C = (g, part, a, b, r1, r2, cl = 0) => P.push({ g, part, cl, f: (p) => roundCone(p, a, b, r1, r2) });
  E(0, 0, v3(0, 0.955, -0.008), v3(0.163, 0.105, 0.108), 0.012);          // pelvis (trouser colour)
  for (const sg of [-1, 1]) {
    const L = sg < 0;
    E(0, 0, v3(sg * 0.068, 0.915, -0.062), v3(0.088, 0.095, 0.082), 0.013);   // glutes
    E(0, 2, v3(sg * 0.07, 1.075, 0.0), v3(0.082, 0.12, 0.097), 0.010);        // abdomen (two lobes so a belt line / shirt tuck can sit between)
    E(0, 2, v3(sg * 0.078, 1.37, 0.056), v3(0.082, 0.056, 0.05), 0.011);      // pectoral
    E(0, 2, v3(sg * 0.2, 1.425, 0), v3(0.056, 0.054, 0.058), 0.009);          // shoulder cap (deltoid)
    C(0, 2, v3(0, 1.49, -0.005), v3(sg * 0.198, 1.435, 0), 0.046, 0.046, 0.006);     // trapezius slope
    E(0, 2, v3(sg * 0.065, 1.31, -0.06), v3(0.098, 0.125, 0.066), 0.011);     // back (lats)
    C(L ? 1 : 2, 0, v3(sg * 0.1, 0.945, 0), v3(sg * 0.094, 0.5, 0.004), 0.097, 0.058, 0.012);   // thigh
    E(L ? 1 : 2, 0, v3(sg * 0.095, 0.5, 0.032), v3(0.044, 0.048, 0.028), 0.01);     // kneecap
    E(L ? 1 : 2, 0, v3(sg * 0.1, 0.78, 0.016), v3(0.082, 0.14, 0.082), 0.012);      // quad bulk
    C(L ? 5 : 6, 0, v3(sg * 0.095, 0.5, 0), v3(sg * 0.095, 0.085, -0.004), 0.056, 0.038, 0.009);   // shin
    E(L ? 5 : 6, 0, v3(sg * 0.095, 0.37, -0.03), v3(0.052, 0.1, 0.056), 0.01);     // calf muscle
    C(L ? 3 : 4, 3, v3(sg * 0.236, 1.415, 0), v3(sg * 0.245, 1.13, 0), 0.045, 0.035, 0.009);   // upper arm
    E(L ? 3 : 4, 3, v3(sg * 0.248, 1.22, 0.012), v3(0.04, 0.07, 0.04), 0.009);      // bicep
    C(L ? 7 : 8, 4, v3(sg * 0.245, 1.13, 0), v3(sg * 0.25, 0.835, 0.004), 0.035, 0.026);   // forearm
    E(L ? 7 : 8, 4, v3(sg * 0.25, 1.03, -0.004), v3(0.037, 0.075, 0.037));       // forearm muscle
  }
  E(0, 2, v3(0, 1.315, -0.004), v3(0.168, 0.165, 0.104), 0.011);          // ribcage
  E(0, 2, v3(0, 1.185, 0), v3(0.14, 0.095, 0.095), 0.010);                // waist
  C(0, 5, v3(0, 1.49, -0.002), v3(0, 1.58, 0.014), 0.048, 0.042);         // neck
  const Eh = (c, r) => P.push({ g: 0, part: 5, cl: 0, head: true, f: (p) => ell(p, c, r) });          // head primitives: tight smooth-union (see sdf)
  const Ch = (a, b, r1, r2) => P.push({ g: 0, part: 5, cl: 0, head: true, f: (p) => roundCone(p, a, b, r1, r2) });
  Eh(v3(0, 1.662, 0.004), v3(0.072, 0.108, 0.092));                       // cranium
  Eh(v3(0, 1.598, 0.03), v3(0.055, 0.05, 0.062));                    // jaw
  Eh(v3(0, 1.564, 0.074), v3(0.026, 0.022, 0.024));                  // chin
  Eh(v3(0, 1.683, 0.08), v3(0.062, 0.014, 0.026));                   // brow ridge
  Eh(v3(0, 1.605, 0.092), v3(0.034, 0.024, 0.024));                  // mouth / muzzle
  Ch(v3(0, 1.672, 0.088), v3(0, 1.622, 0.119), 0.0105, 0.0145);      // nose: bridge to tip
  Eh(v3(0, 1.5985, 0.099), v3(0.02, 0.0065, 0.011));                  // upper lip
  Eh(v3(0, 1.5865, 0.097), v3(0.0185, 0.0085, 0.012));                // lower lip
  for (const sg of [-1, 1]) {
    Eh(v3(sg * 0.042, 1.626, 0.07), v3(0.022, 0.026, 0.024));          // cheekbones
    Eh(v3(sg * 0.0175, 1.617, 0.106), v3(0.0125, 0.011, 0.013));       // nostril wings
    Eh(v3(sg * 0.07, 1.63, 0.0), v3(0.012, 0.03, 0.02));              // ear seat
  }
  // eye sockets: carved out of the union so the eyeballs sit in orbits under the brow
  const sockets = [-1, 1].map((sg) => (p) => ell(p, v3(sg * 0.033, 1.653, 0.104), v3(0.02, 0.0125, 0.02)));   // shallow orbit; the eye itself is painted in the shader
  const KS = 0.05;
  const smin = (a, b) => { const h = Math.max(KS - Math.abs(a - b), 0) / KS; return Math.min(a, b) - h * h * KS * 0.25; };
  const smax = (a, b) => { const h = Math.max(0.01 - Math.abs(a - b), 0) / 0.01; return Math.max(a, b) + h * h * 0.01 * 0.25; };
  const smk = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const sdf = (p) => { let db = 1e9, dh = 1e9; for (const q of P) { if (q.head) dh = smk(dh, q.f(p), 0.011); else db = smin(db, q.f(p)); } let d = smk(db, dh, 0.03); if (p[1] > 1.6 && p[2] > 0.06) for (const sk of sockets) d = smax(d, -sk(p)); return d; };
  // surface nets
  const x0 = -0.34, y0 = 0.04, z0 = -0.17, nx = Math.ceil(0.68 / H), ny = Math.ceil(1.76 / H), nzz = Math.ceil(0.34 / H);
  const idxN = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
  const val = new Float32Array((nx + 1) * (ny + 1) * (nzz + 1));
  for (let k = 0; k <= nzz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[idxN(i, j, k)] = sdf([x0 + i * H, y0 + j * H, z0 + k * H]);
  const vid = new Int32Array(nx * ny * nzz).fill(-1);
  const pos = [], nor = [];
  const grad = (p) => { const e = 0.004; return [sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e])]; };
  const cid = (i, j, k) => (k * ny + j) * nx + i;
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nzz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const d = corners.map(([a, b, c]) => val[idxN(i + a, j + b, k + c)]);
    let neg = 0; for (const x of d) if (x < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((d[a] < 0) === (d[b] < 0)) continue;
      const t = d[a] / (d[a] - d[b]), ca = corners[a], cb = corners[b];
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
    }
    const pp = [x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H];
    vid[cid(i, j, k)] = pos.length / 3; pos.push(...pp);
    const g = grad(pp), gl = Math.hypot(...g) || 1; nor.push(g[0] / gl, g[1] / gl, g[2] / gl);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; flip ? idx.push(a, b, c, a, c, d) : idx.push(a, c, b, a, d, c); };
  for (let k = 1; k < nzz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const s0 = val[idxN(i, j, k)] < 0;
    const sX = val[idxN(i + 1, j, k)] < 0, sY = val[idxN(i, j + 1, k)] < 0, sZ = val[idxN(i, j, k + 1)] < 0;
    if (s0 !== sX) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], s0);
    if (s0 !== sY) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], s0);
    if (s0 !== sZ) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], s0);
  }
  // per-vertex segment weights
  const nv = pos.length / 3;
  const sm01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const aDisp = new Float32Array(nv);
  const aPart = new Float32Array(nv), aSw = new Float32Array(nv), aSw2 = new Float32Array(nv), aBl = new Float32Array(nv);
  const nb = (g) => (g === 0 ? [] : g <= 2 ? [0, g + 4] : g <= 4 ? [0, g + 4] : g <= 6 ? [g - 4] : [g - 4]);
  for (let v = 0; v < nv; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    let best = 1e9, bi = 0; const ds = P.map((q, qi) => { const d = q.f(p); if (d < best) { best = d; bi = qi; } return d; });
    const g1 = P[bi].g; let part = P[bi].part;
    if (part === 2 && p[1] < 1.0) part = 0;
    let d2 = 1e9, g2 = g1; const ok = nb(g1);
    P.forEach((q, qi) => { if (q.g !== g1 && ok.includes(q.g) && ds[qi] < d2) { d2 = ds[qi]; g2 = q.g; } });
    const wdt = 0.055, t = g2 === g1 ? 0 : Math.max(0, Math.min(0.5, 0.5 * (1 - (d2 - best) / wdt)));
    aPart[v] = part; aSw[v] = g1; aSw2[v] = g2; aBl[v] = t;
    // clothing: push the surface out by the garment thickness, add hem flare and creases at the joints / waist / armpits
    let cl = P[bi].cl;
    if (cl > 0) {
      const x = p[0], y = p[1], z = p[2], ex = (a, c, w) => Math.exp(-(((a - c) / w) ** 2));
      if (part === 2) cl *= 1 - sm01(1.43, 1.5, y) * 0.9;                                      // collar line
      if (part === 0 && y < 0.15) cl += 0.011 * (1 - sm01(0.07, 0.16, y));                      // trouser hem breaks over the shoe
      let w = 0;
      if (part === 0) w = 0.0028 * ex(y, 0.5, 0.075) * Math.sin(y * 105 + (z > 0 ? 0 : 1.2) + x * 40) + 0.0032 * ex(y, 0.92, 0.09) * Math.sin(y * 62 + Math.abs(x) * 55) + 0.0016 * ex(y, 0.14, 0.05) * Math.sin(y * 140 + z * 60);
      else if (part === 2) w = 0.0035 * ex(y, 1.04, 0.06) * Math.sin(x * 90 + z * 20) + 0.003 * ex(Math.abs(x), 0.17, 0.04) * ex(y, 1.34, 0.07) * Math.sin(y * 80 + x * 30);
      else if (part === 3) w = 0.004 * ex(y, 1.13, 0.07) * Math.sin(y * 135 + z * 30) + 0.003 * ex(y, 1.38, 0.05) * Math.sin(y * 90);
      aDisp[v] = cl + w;
    }
  }
  for (let v = 0; v < nv; v++) if (aDisp[v]) { const d = aDisp[v]; pos[v * 3] += nor[v * 3] * d; pos[v * 3 + 1] += nor[v * 3 + 1] * d; pos[v * 3 + 2] += nor[v * 3 + 2] * d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nv * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();                                   // smooth normals of the dressed surface
  const ng = g.toNonIndexed();
  // expand per-vertex attributes to the non-indexed layout
  const ix = idx, outN = ix.length;
    const ag = new Float32Array(outN * 4);
  for (let q = 0; q < outN; q++) { const v = ix[q]; ag[q * 4] = aPart[v]; ag[q * 4 + 1] = aSw[v]; ag[q * 4 + 2] = aSw2[v]; ag[q * 4 + 3] = aBl[v]; }
  ng.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 4));
  return ng;
}


// ---------------------------------------------------------------------------------------------------
// Hair as a real volume: a shell over the cranium with the face window, ear windows and nape cut out of it (SDF -> surface nets),
// optionally with a back curtain and side locks. Everything carries aG = (part, 0, 0, 0): it moves with the torso/head.
// ---------------------------------------------------------------------------------------------------
function sdfMesh(sdf, bounds, H, partId) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / H), ny = Math.ceil((y1 - y0) / H), nz = Math.ceil((z1 - z0) / H);
  const idxN = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i, cid = (i, j, k) => (k * ny + j) * nx + i;
  const val = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[idxN(i, j, k)] = sdf([x0 + i * H, y0 + j * H, z0 + k * H]);
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const d = corners.map(([a, b, c]) => val[idxN(i + a, j + b, k + c)]);
    let neg = 0; for (const x of d) if (x < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((d[a] < 0) === (d[b] < 0)) continue;
      const t = d[a] / (d[a] - d[b]), ca = corners[a], cb = corners[b];
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
    }
    vid[cid(i, j, k)] = pos.length / 3; pos.push(x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; flip ? idx.push(a, b, c, a, c, d) : idx.push(a, c, b, a, d, c); };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const s0 = val[idxN(i, j, k)] < 0;
    if (s0 !== (val[idxN(i + 1, j, k)] < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], s0);
    if (s0 !== (val[idxN(i, j + 1, k)] < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], s0);
    if (s0 !== (val[idxN(i, j, k + 1)] < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], s0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  const n = ng.attributes.position.count, ag = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) ag[i * 4] = partId;
  ng.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 4));
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return ng;
}

function hairGeometry(long, H = 0.0085) {
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const ell = (p, c, r) => { const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]]; const k0 = len(q); const k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]); return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1; };
  const cone = (p, a, b, r1, r2, sz = 1) => {                       // round cone between a and b, flattened along z by sz
    const pz = [p[0], p[1], a[2] + (p[2] - a[2]) / sz];
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], pa = [pz[0] - a[0], pz[1] - a[1], pz[2] - a[2]];
    const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2])));
    const q = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h];
    return (len(q) - (r1 + (r2 - r1) * h)) * Math.min(1, sz + 0.25);
  };
  const smin = (a, b, k = 0.02) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k = 0.008) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
  const sdf = (p) => {
    let d = ell(p, [0, 1.662, 0.004], [0.0855, 0.12, 0.103]);                     // shell over the cranium
    d = smin(d, ell(p, [0, 1.72, 0.006], [0.08, 0.046, 0.094]), 0.03);           // crown volume
    d = smin(d, ell(p, [0.012, 1.712, 0.062], [0.066, 0.024, 0.05]), 0.02);        // swept fringe
    if (long) {
      d = smin(d, cone(p, [0, 1.6, -0.07], [0, 1.31, -0.1], 0.088, 0.07, 0.62), 0.03);                 // curtain down the back
      for (const sg of [-1, 1]) d = smin(d, cone(p, [sg * 0.088, 1.625, 0.016], [sg * 0.084, 1.38, -0.04], 0.021, 0.03, 1), 0.02);   // locks framing the face
    }
    // face window (forehead down to the chin), ear windows and a nape trim are cut out of the shell
    const e2 = (Math.hypot(p[0] / 0.073, (p[1] - 1.615) / 0.087) - 1) * 0.07;
    d = smax(d, -Math.max(e2, 0.034 - p[2]));
    for (const sg of [-1, 1]) d = smax(d, -ell(p, [sg * 0.082, 1.63, 0.002], [0.04, 0.036, 0.034]), 0.006);
    if (!long) d = smax(d, 1.553 - p[1], 0.01);                                     // short cut: nothing below the nape line
    return d;
  };
  return sdfMesh(sdf, [-0.16, long ? 1.27 : 1.5, -0.22, 0.16, 1.86, 0.17], H, long ? PART.LONGHAIR : PART.HAIR);
}

function personGeometry(lod = 0) {
  const G_ = [];
  const add = (g, id, pivot, sw, pivot2) => G_.push(part(g, id, pivot, sw, pivot2));
  for (const sg of [-1, 1]) {
    const hip = [sg * 0.095, 0.93, 0], knee = [sg * 0.095, 0.5, 0], sh = [sg * 0.25, 1.43, 0], elb = [sg * 0.25, 1.13, 0];
    const L = sg < 0;
    // ---- legs: thigh (hip) + kneecap; calf + shoe (knee under hip) ----
    add(T(ball(1, 12), [sg * 0.095, 0.058, 0.058], [0.05, 0.044, 0.125]), PART.SHOE, knee, L ? 5 : 6, hip);          // shoe upper
    add(T(ball(1, 10), [sg * 0.095, 0.058, -0.035], [0.046, 0.04, 0.05]), PART.SHOE, knee, L ? 5 : 6, hip);        // heel
    add(T(new THREE.BoxGeometry(0.088, 0.014, 0.265), [sg * 0.095, 0.008, 0.052]), PART.SHOE, knee, L ? 5 : 6, hip); // sole
    // ---- arms: upper arm + elbow ball (shoulder); forearm + hand (elbow under shoulder) ----
    add(T(ball(1, 10), [sg * 0.25, 0.795, 0.006], [0.029, 0.056, 0.04]), PART.HAND, elb, L ? 7 : 8, sh);
    add(T(ball(1, 8), [sg * 0.25 - sg * 0.02, 0.83, 0.03], [0.011, 0.028, 0.012], [0.3, 0, -sg * 0.3]), PART.HAND, elb, L ? 7 : 8, sh);   // thumb
    for (let f = 0; f < (lod ? 0 : 4); f++) {                                                          // fingers: relaxed, slightly curled
      const fx = sg * 0.25 + (f - 1.5) * 0.0105 * 1.0, len = [0.036, 0.042, 0.04, 0.03][f];
      add(T(ball(1, 6), [fx, 0.748 - (len - 0.036) * 0.4, 0.014 + f * 0.0015], [0.0058, len, 0.0072], [0.22 + f * 0.03, 0, 0]), PART.HAND, elb, L ? 7 : 8, sh);
    }
    add(T(new THREE.TorusGeometry(0.0425, 0.0075, 6, 14), [sg * 0.25, 0.865, 0], [1, 1, 1], [Math.PI / 2, 0, 0]), PART.JACKET, elb, L ? 7 : 8, sh);   // jacket sleeve cuff (hidden unless the person wears a jacket)
    add(T(new THREE.TorusGeometry(0.0525, 0.008, 6, 14), [sg * 0.095, 0.115, 0], [1, 1, 1], [Math.PI / 2, 0, 0]), PART.LEG, knee, L ? 5 : 6, hip);    // trouser hem
    add(T(new THREE.TorusGeometry(0.0485, 0.006, 6, 14), [sg * 0.095, 0.078, 0.004], [1, 1, 1], [Math.PI / 2 - 0.1, 0, 0]), PART.SHOE, knee, L ? 5 : 6, hip);   // shoe collar
    // laces: a few tiny bars across the vamp
    for (let k = 0; k < (lod ? 0 : 3); k++) add(T(new THREE.BoxGeometry(0.052, 0.004, 0.006), [sg * 0.095, 0.092 - k * 0.002, 0.03 + k * 0.022], [1, 1, 1], [-0.25 - k * 0.12, 0, 0]), PART.EYEW, knee, L ? 5 : 6, hip);
    // ---- ear ----
    add(T(ball(1, 10), [sg * 0.0765, 1.632, -0.002], [0.0085, 0.027, 0.018], [0, sg * 0.28, 0]), PART.HEAD, [0, 1.45, 0], 0, [0, 1.45, 0]);
    // ---- eyes / brows (dark details) ----
  }
  const P0 = [0, 1.0, 0], HP = [0, 1.45, 0];
  G_.push(bodyGeometry(lod ? 0.027 : 0.0125));
  // ---- torso (elliptical loft), collar, belt + buckle ----
  for (let k = 0; k < 4; k++) add(T(ball(1, 6), [0, 1.43 - k * 0.1, 0.104 - k * 0.004], [0.008, 0.008, 0.005]), PART.BELT, P0);   // shirt buttons
  add(T(new THREE.BoxGeometry(0.03, 0.02, 0.03), [0.0, 1.37, 0.108], [1, 1, 1]), PART.TORSO, P0);
  add(T(new THREE.CylinderGeometry(0.163, 0.163, 0.036, 20, 1, true), [0, 1.03, 0], [1, 1, 0.62]), PART.BELT, P0);
  add(T(new THREE.BoxGeometry(0.036, 0.03, 0.012), [0, 1.03, 0.1]), PART.BELT, P0);
  // ---- jacket shell (visible on some people): open coat to mid-thigh ----
  add(T(lathe([[0, 0.76], [0.172, 0.76], [0.176, 0.88], [0.172, 1.03], [0.163, 1.16], [0.176, 1.27], [0.198, 1.355], [0.214, 1.41], [0.207, 1.46], [0.135, 1.488], [0.08, 1.508], [0, 1.51]], 24), [0, 0, 0], [1.1, 1, 0.84]), PART.JACKET, P0);
  add(T(new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.62), [0, 1.535, -0.085], [1.1, 0.95, 0.9], [0.5, 0, 0]), PART.JACKET, P0);   // hood resting on the back
  add(T(new THREE.TorusGeometry(0.094, 0.03, 8, 18).rotateX(Math.PI / 2 - 0.15), [0, 1.52, 0.0], [1, 1, 0.92]), PART.JACKET, P0);   // high collar
  add(T(new THREE.TorusGeometry(0.17, 0.014, 6, 24).rotateX(Math.PI / 2), [0, 0.775, 0], [1.1, 1, 0.84]), PART.JACKET, P0);   // ribbed hem
  for (const sg of [-1, 1]) add(T(new RoundedBoxGeometry(0.1, 0.03, 0.022, 2, 0.008), [sg * 0.1, 0.935, 0.108], [1, 1, 1], [0.12, 0, sg * 0.14]), PART.JACKET, P0);   // pocket flaps
  add(T(new THREE.BoxGeometry(0.008, 0.72, 0.008), [0, 1.14, 0.122]), PART.JACKET, P0);                                    // zip track
  // ---- neck, head (egg + jaw + nose + mouth), hair, long hair, hat ----

  add(T(new THREE.SphereGeometry(0.121, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), [0, 1.672, -0.012], [0.97, 1.0, 1.07], [-0.2, 0, 0]), PART.HAT, HP);
  add(T(new THREE.TorusGeometry(0.119, 0.017, 6, 22), [0, 1.706, -0.004], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]), PART.HAT, HP);
  // ---- backpack with straps (shown on some people) ----
  add(T(new RoundedBoxGeometry(0.27, 0.34, 0.13, 3, 0.045), [0, 1.22, -0.16]), PART.BAG, P0);
  add(T(new RoundedBoxGeometry(0.2, 0.14, 0.05, 2, 0.02), [0, 1.14, -0.24]), PART.BAG, P0);
  for (const sg of [-1, 1]) {
    add(T(new THREE.BoxGeometry(0.036, 0.012, 0.22), [sg * 0.09, 1.478, -0.03]), PART.BAG, P0);
    add(T(new THREE.BoxGeometry(0.036, 0.3, 0.012), [sg * 0.09, 1.33, 0.098], [1, 1, 1], [0.05, 0, 0]), PART.BAG, P0);
  }
  G_.push(hairGeometry(false, lod ? 0.018 : 0.0085), hairGeometry(true, lod ? 0.018 : 0.0085));
  return mergeGeometries(G_, false);
}

const PERSON_PROC = /* glsl */`
varying vec3 vPC; varying float vPart; varying float vSeed; varying float vJk; varying vec3 vHC; varying vec3 vSC; varying vec3 vPN;
vec3 skinTone(vec3 col, vec3 p, vec3 n, vec3 wp, inout float h, inout float rough){
  float pores = nz(p*vec3(650.0)).g, blot = nz(p*vec3(24.0)).r;
  h += (pores - 0.5) * 0.00022;
  rough = 0.52 + 0.14 * pores;
  col *= 0.93 + 0.14 * blot;
  float fr = pow(1.0 - abs(dot(normalize(n), normalize(cameraPosition - wp))), 3.0);       // warm scattering at grazing angles
  return col + vec3(0.22, 0.05, 0.02) * fr * 0.3 * (0.4 + col.r);
}
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float pt = vPart, sd = vSeed;
  vec3 pcol = vPC;
  if (pt < 2.5) {                                              // trousers vs shirt: smooth hem line instead of the mesh's vertex boundary
    float hemY = 1.0 + 0.012 * sin(p.x * 34.0 + p.z * 21.0) + 0.006 * sin(p.x * 91.0 + 1.3) - 0.01 * smoothstep(0.1, 0.2, abs(p.x));
    float bl = smoothstep(-0.004, 0.004, p.y - hemY);
    pt = bl > 0.5 ? 2.0 : 0.0; pcol = mix(vPN, vSC, bl);
  }
  float f = nz(wp*9.0).r, g = nz(wp*31.0).g;
  float k1 = nz(p*vec3(300.0)).g, k2 = nz(p*vec3(760.0)).b;
  vec3 col = pcol; float rough = 0.85, h = 0.0, ao = 1.0;
  if (pt < 0.5) {                                              // trousers: denim twill or chino
    float denim = step(0.5, fract(sd*5.17));
    float tw = sin((p.x + p.y) * 640.0) * 0.5 + 0.5;
    float warp = nz(vec3(p.x*420.0, p.y*40.0, p.z*420.0)).g;
    h = denim * (0.0007*tw + 0.0004*warp) + (1.0 - denim) * 0.0005 * (k1 - 0.5);
    col *= mix(0.9 + 0.2*k1, (0.86 + 0.26*tw) * (0.9 + 0.2*warp), denim);
    float fade = smoothstep(0.6, 0.95, nz(vec3(p.x*6.0, p.y*2.6, p.z*6.0)).r) * denim;
    col = mix(col, col * vec3(1.45, 1.38, 1.25), fade * 0.45);
    float seam = smoothstep(0.0045, 0.0, abs(abs(p.x) - 0.183));                          // outer side seam, contrast stitching on jeans
    col = mix(col, col * 1.25 + vec3(0.05, 0.035, 0.0), seam * denim * 0.6); h -= seam * 0.0009;
    float pocket = smoothstep(0.004, 0.0, abs(p.y - 0.86 - 0.02 * sin(p.x * 30.0))) * step(0.03, p.z) * step(0.03, abs(p.x) - 0.04);
    h -= pocket * 0.0005; col *= 1.0 - 0.15 * pocket;
    rough = mix(0.88, 0.72, denim * 0.5 * tw);
    ao = 0.72 + 0.28 * smoothstep(0.0, 0.05, abs(p.x) - 0.004 + (1.0 - step(0.8, p.y)) * 1.0);   // dark inner thighs
  } else if (pt < 4.5) {                                       // shirt / sleeves / forearm (skin unless jacketed)
    bool skinArm = pt > 3.5 && vJk < 0.5;
    if (skinArm) col = skinTone(col, p, n, wp, h, rough);
    else {
      float rib = sin(p.x * 880.0) * 0.5 + 0.5;
      h = 0.0006 * (k1 - 0.5) + 0.0003 * (rib - 0.5) * (1.0 - vJk);
      col *= 0.9 + 0.2 * k1;
      float style = fract(sd * 11.3);
      float stripes = step(0.5, fract(p.y * 8.5)) * step(style, 0.2) * (1.0 - vJk);
      col = mix(col, col * 0.55 + vec3(0.3), stripes * 0.55);
      float patch_ = smoothstep(0.03, 0.022, length(vec2(p.x - 0.075, p.y - 1.33))) * step(0.08, p.z) * step(0.2, style) * step(style, 0.32) * (1.0 - vJk) * step(pt, 2.5);
      col = mix(col, vec3(0.85, 0.75, 0.3), patch_);
      rough = 0.9 - 0.12 * vJk;
    }
    ao = 0.78 + 0.22 * smoothstep(0.0, 0.05, abs(p.x) - 0.17);                              // dark armpits
    if (pt < 2.5) ao = 1.0;
  } else if (pt < 5.5) {                                       // head / neck: skin with the whole face painted on (eyes, brows, lips, nostrils, stubble / beard)
    col = skinTone(col, p, n, wp, h, rough);
    float ex = abs(p.x), fz = smoothstep(0.03, 0.065, p.z);
    float ch = smoothstep(0.045, 0.0, length(vec2(ex - 0.052, p.y - 1.612))) * step(0.03, p.z);
    float ear = smoothstep(0.03, 0.0, length(vec2(ex - 0.088, p.y - 1.635)));
    float nose = smoothstep(0.022, 0.0, length(vec2(p.x, p.y - 1.62))) * step(0.08, p.z);
    col = mix(col, col * vec3(1.22, 0.78, 0.72), clamp(ch * 0.22 + ear * 0.4 + nose * 0.22, 0.0, 1.0));
    ao = 0.85 + 0.15 * smoothstep(1.5, 1.56, p.y);                                              // shadowed throat
    if (fz > 0.0 && p.y > 1.54) {
      float hair = fract(sd * 41.3);
      // beard / stubble over the lower face and upper lip (never over the lips themselves)
      float lipBand = smoothstep(0.0075, 0.0035, abs(p.y - 1.592)) * smoothstep(0.026, 0.02, ex);
      float jaw = smoothstep(1.612, 1.582, p.y) * smoothstep(0.078, 0.052, ex) * smoothstep(1.545, 1.57, p.y);
      float stache = smoothstep(1.6, 1.607, p.y) * smoothstep(1.62, 1.607, p.y) * smoothstep(0.034, 0.016, ex);
      float bmask = clamp(jaw + stache, 0.0, 1.0) * (1.0 - lipBand) * (1.0 - nose);
      float nzf = nz(p * vec3(520.0)).r;
      if (hair > 0.62 && hair < 0.82) { col = mix(col, vHC * 0.55, bmask * (0.22 + 0.3 * nzf)); }
      else if (hair >= 0.82) { col = mix(col, vHC * (0.7 + 0.4 * nzf), bmask * 0.92); h += bmask * 0.0007 * nzf; rough = mix(rough, 0.6, bmask); }
      // eyes: an almond opening with sclera, iris, pupil, catch-light, lid shadow, crease and lash line
      float er = ex - 0.0325;
      float ey = p.y - 1.653 - 0.11 * er;
      float aa = er / 0.0148, bb = ey / (0.0074 * max(0.12, 1.0 - 0.55 * aa * aa));
      float er2 = aa * aa + bb * bb;
      float lid = smoothstep(0.0082, 0.0155, ey) * smoothstep(0.03, 0.012, abs(er)) * step(0.0, ey);
      col *= 1.0 - 0.28 * lid;
      float crease = smoothstep(0.0018, 0.0, abs(ey - 0.0155 + 0.003 * aa * aa)) * smoothstep(0.022, 0.012, abs(er));
      col = mix(col, col * vec3(0.7, 0.5, 0.45), crease * 0.7);
      float inEye = 1.0 - smoothstep(0.78, 1.0, er2);
      if (inEye > 0.0) {
        vec2 ic = vec2(er - (p.x > 0.0 ? -0.0006 : 0.0006), ey - 0.0004);
        float ir = length(ic);
        float ih = fract(sd * 17.31);
        vec3 iris = ih < 0.5 ? vec3(0.2, 0.11, 0.05) : ih < 0.75 ? vec3(0.32, 0.2, 0.09) : ih < 0.9 ? vec3(0.15, 0.27, 0.42) : vec3(0.2, 0.34, 0.22);
        iris *= 0.75 + 0.5 * smoothstep(0.0045, 0.0015, ir) + 0.25 * nz(vec3(atan(ic.y, ic.x) * 6.0, 0.3, 0.1)).r;
        vec3 eye = vec3(0.9, 0.87, 0.84) * (0.55 + 0.45 * smoothstep(1.0, 0.2, er2)) * (1.0 - 0.45 * lid);
        eye = mix(eye, vec3(0.8, 0.45, 0.4), smoothstep(0.7, 1.0, abs(aa)) * 0.35);
        eye = mix(eye, iris, smoothstep(0.0062, 0.0052, ir));
        eye = mix(eye, vec3(0.02), smoothstep(0.0029, 0.0023, ir));
        eye = mix(eye, vec3(1.6), smoothstep(0.0011, 0.0006, length(ic - vec2(0.0019, 0.0021))));
        col = mix(col, eye, inEye); rough = mix(rough, 0.12, inEye); h *= 1.0 - inEye;
      }
      float lash = smoothstep(0.17, 0.0, abs(er2 - 1.0)) * smoothstep(-0.2, 0.5, bb) * smoothstep(0.012, 0.007, abs(er));
      col = mix(col, vec3(0.03, 0.02, 0.02), lash * 0.8);
      // eyebrows: arched hair strokes in the hair colour
      float bx = (ex - 0.034) / 0.021;
      float by = p.y - (1.6775 + 0.0095 * (1.0 - bx * bx) + 0.004 * (ex - 0.034));
      float bw = 0.0036 * (1.0 - 0.55 * smoothstep(0.2, 1.0, bx));
      float brow = smoothstep(bw, bw * 0.4, abs(by)) * smoothstep(1.05, 0.8, abs(bx)) * smoothstep(0.0, 0.012, ex - 0.008);
      col = mix(col, vHC * (0.55 + 0.5 * nzf), brow * 0.9);
      // mouth: upper + lower lip colour, a dark parting line and a little shading around
      float mx = p.x;
      float upper = smoothstep(1.0, 0.8, length(vec2(mx / 0.0215, (p.y - 1.5985) / 0.0046)));
      float lower = smoothstep(1.0, 0.8, length(vec2(mx / 0.0195, (p.y - 1.5865) / 0.0062)));
      vec3 lipc = mix(vPC * vec3(1.0, 0.72, 0.7), vec3(0.58, 0.22, 0.25), 0.5);
      col = mix(col, lipc * (0.9 + 0.2 * nz(p * vec3(900.0)).g), clamp(upper + lower, 0.0, 1.0));
      float part = smoothstep(0.0016, 0.0, abs(p.y - 1.5926 + 0.0016 * (1.0 - smoothstep(0.0, 0.02, abs(mx))))) * smoothstep(0.021, 0.015, abs(mx));
      col = mix(col, vec3(0.16, 0.05, 0.06), part * 0.85);
      rough = mix(rough, 0.3, clamp(upper + lower, 0.0, 1.0));
      float philtrum = smoothstep(0.003, 0.0, abs(abs(mx) - 0.006)) * smoothstep(1.597, 1.6, p.y) * smoothstep(1.614, 1.606, p.y);
      col *= 1.0 - 0.07 * philtrum;
      // nostrils
      vec2 nq = vec2(ex - 0.0105, p.y - 1.6095);
      float nost = smoothstep(1.0, 0.7, length(vec2(nq.x / 0.0052, nq.y / 0.0032))) * step(0.088, p.z);
      col = mix(col, vec3(0.06, 0.03, 0.025), nost * 0.9);
    }
  } else if (pt < 6.5 || (pt > 10.5 && pt < 11.5)) {           // hair: strands along the fall direction
    float st = nz(vec3(p.x*230.0, p.y*26.0, p.z*230.0)).r, st2 = nz(vec3(p.x*600.0, p.y*70.0, p.z*600.0)).g;
    h = (st - 0.5) * 0.0016 + (st2 - 0.5) * 0.0008;
    col *= 0.6 + 0.78 * st + 0.15 * (st2 - 0.5);
    rough = 0.4 + 0.3 * st2;
    ao = 0.7 + 0.3 * smoothstep(1.5, 1.72, p.y);
  } else if (pt < 7.5) {                                       // shoes
    float sole = 1.0 - smoothstep(0.013, 0.022, p.y);
    float sneaker = step(0.5, fract(sd * 2.71));
    col = mix(col, vec3(0.62) * (0.8 + 0.3 * k1), sneaker * (1.0 - sole));
    col = mix(col, vec3(0.64, 0.62, 0.56), sole * 0.75);
    float crease = smoothstep(0.5, 0.9, nz(vec3(p.x*40.0, p.y*70.0, p.z*40.0)).r);
    h = -crease * 0.0006 + (k2 - 0.5) * 0.0003;
    rough = mix(0.34 + 0.2 * crease, 0.92, sole);
  } else if (pt < 8.5) {                                       // backpack: ripstop nylon + zip
    float gx = smoothstep(0.42, 0.5, abs(fract(p.x * 150.0) - 0.5)) + smoothstep(0.42, 0.5, abs(fract(p.y * 150.0) - 0.5));
    h = gx * 0.0004; col *= 0.9 + 0.2 * k1 - 0.06 * gx; rough = 0.6;
    float zip = smoothstep(0.004, 0.0, abs(p.y - 1.29)) * step(abs(p.x), 0.11);
    col = mix(col, vec3(0.05), zip * 0.7);
  } else if (pt < 9.5) { rough = 0.22; h = 0.0; }              // eyes / brows
  else if (pt < 10.5) { col *= 0.75 + 0.5 * k1; rough = 0.42; h = (k1 - 0.5) * 0.0004; }   // leather belt
  else if (pt < 12.5) {                                        // jacket: shell or puffer, zip front, side seams
    float puff = step(0.5, fract(sd * 8.91));
    float baf = abs(fract(p.y / 0.115) - 0.5);
    float seamL = smoothstep(0.42, 0.5, baf);
    float bulge = 1.0 - (baf * 2.0) * (baf * 2.0);
    h = puff * (bulge * 0.0075 - seamL * 0.001) + (1.0 - puff) * (0.0003 * (k1 - 0.5));
    col *= 1.0 - 0.3 * seamL * puff; col *= 0.93 + 0.12 * k1;
    float zip = smoothstep(0.0075, 0.0, abs(p.x)) * step(0.05, p.z) * step(0.78, p.y) * step(p.y, 1.52);
    col = mix(col, vec3(0.58, 0.58, 0.6), zip * 0.85); h -= zip * 0.0006;
    float sideS = smoothstep(0.005, 0.0, abs(abs(p.x) - 0.172)) * step(p.y, 1.3);
    col *= 1.0 - 0.25 * sideS; h -= sideS * 0.0007;
    rough = 0.4 + 0.15 * puff;
    ao = 0.85 + 0.15 * smoothstep(0.0, 0.2, abs(p.x));
  } else if (pt < 13.5) {                                      // knit beanie
    float rib = sin(atan(p.z, p.x) * 70.0) * 0.5 + 0.5;
    h = 0.0012 * rib + 0.0004 * (k1 - 0.5); col *= 0.86 + 0.22 * rib; rough = 0.96;
  } else if (pt < 14.5) { col = skinTone(col, p, n, wp, h, rough); }   // hands
  else if (pt < 15.5) { col = vec3(0.8) * (0.9 + 0.1 * k1); rough = 0.25; }   // eye whites / laces
  else { col = col * (0.85 + 0.25 * k1); rough = 0.34; h = 0.0; }          // lips
  float fd = dfade(wp, 0.003);
  s.alb *= col * (0.94 + 0.12 * f) * (0.97 + 0.06 * g);
  s.rough = rough; s.h = h * fd; s.ao = ao;
}`;
const VERT = {
  head: `attribute vec4 aG; 
#define aPart aG.x
#define aSw aG.y
#define aSw2 aG.z
#define aBlend aG.w
 attribute vec3 aAnim; attribute vec3 aCShirt; attribute vec3 aCPants; attribute vec3 aCSkin; attribute vec3 aCHair; varying vec3 vPC; varying float vPart; varying float vSeed; varying float vJk; varying vec3 vHC; varying vec3 vSC; varying vec3 vPN; uniform float uWet; uniform float uTime;
vec3 rotX(vec3 d, float a){ float c = cos(a), s = sin(a); return vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c); }
void angles(float g, out float a1, out float a2){
  float sp = max(aAnim.y, 0.0);
  bool seated = aAnim.y < -0.5;
  a1 = 0.0; a2 = 0.0;
  if (g < 0.5) return;
  bool left = mod(g, 2.0) > 0.5;
  float ph = aAnim.x + (left ? 0.0 : 3.14159);
  float sw = sin(ph) * 0.72 * sp;
  float idle = sin(uTime * 0.8 + aAnim.z * 6.0 + (left ? 0.0 : 1.7)) * 0.025 * (1.0 - min(sp, 1.0));
  if (g < 2.5) { a1 = sw; if (seated) a1 = -1.45; }
  else if (g < 4.5) { a1 = -sw * 0.85 + idle; if (seated) a1 = -0.5; }
  else if (g < 6.5) { float knee = sp * (0.1 + 1.0 * max(0.0, -cos(ph - 0.35))); a1 = seated ? -1.45 : sw; a2 = seated ? 1.5 : knee; }
  else { float a = -sw * 0.85; a1 = seated ? -0.5 : a - 0.06 + idle; a2 = seated ? -1.15 : -(0.28 + sp * (0.12 + 0.55 * max(0.0, -a / 0.6))); }
}
vec3 poseG(float g, vec3 p, bool nrm){
  if (g < 0.5) return p;
  float a1, a2; angles(g, a1, a2);
  float sg = mod(g, 2.0) > 0.5 ? -1.0 : 1.0;
  if (g > 4.5) { vec3 pv = g < 6.5 ? vec3(sg * 0.095, 0.5, 0.0) : vec3(sg * 0.25, 1.13, 0.0); p = nrm ? rotX(p, a2) : pv + rotX(p - pv, a2); }
  vec3 hp = (g < 2.5 || (g > 4.5 && g < 6.5)) ? vec3(sg * 0.095, 0.93, 0.0) : vec3(sg * 0.25, 1.43, 0.0);
  p = nrm ? rotX(p, a1) : hp + rotX(p - hp, a1);
  return p;
}
vec3 poseMix(vec3 p, bool nrm){ vec3 a = poseG(aSw, p, nrm); return aBlend > 0.001 ? mix(a, poseG(aSw2, p, nrm), aBlend) : a; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`,
  normal: /* glsl */`
{
  objectNormal = normalize(poseMix(objectNormal, true));
  { float wU = smoothstep(0.85, 1.25, position.y); if ((aSw > 2.5 && aSw < 4.5) || aSw > 6.5) wU = 1.0; float tw2 = sin(aAnim.x) * 0.1 * max(aAnim.y, 0.0) * wU; objectNormal.xz = rot2(tw2) * objectNormal.xz; }
}`,
  begin: /* glsl */`
{
  float sp = max(aAnim.y, 0.0), seed = aAnim.z;
  vec3 pp = transformed;
  pp = poseMix(pp, false);
  transformed = pp;
  float ph0 = aAnim.x, seated0 = aAnim.y < -0.5 ? 1.0 : 0.0;
  float bob = abs(sin(ph0)) * 0.03 * sp + sin(ph0 * 0.31 + seed * 20.0) * 0.004;
  transformed.y += bob * (1.0 - seated0);
  // upper body: counter-twist to the hips, lateral sway, idle weight shift + breathing; the head stays steadier
  float wUp = smoothstep(0.85, 1.25, position.y);
  if ((aSw > 2.5 && aSw < 4.5) || aSw > 6.5) wUp = 1.0;
  float head = smoothstep(1.5, 1.62, position.y);
  float tw = sin(ph0) * 0.1 * sp * (1.0 - seated0) * wUp * (1.0 - 0.7 * head);
  transformed.xz = rot2(tw) * transformed.xz;
  transformed.x += sin(ph0) * 0.02 * sp * wUp * (1.0 - seated0) + sin(uTime * 0.5 + seed * 7.0) * 0.01 * wUp * (1.0 - min(sp, 1.0)) * (1.0 - seated0);
  transformed.xz *= 1.0 + 0.012 * sin(uTime * 1.7 + seed * 9.0) * smoothstep(1.05, 1.3, position.y) * (1.0 - smoothstep(1.45, 1.55, position.y));
  transformed.z += sin(ph0 * 2.0) * 0.012 * sp * wUp;
  transformed.x += sin(uTime * 0.35 + seed * 5.0) * 0.0 + head * sin(uTime * 0.6 + seed * 11.0) * 0.004;
  // per-person outfit variety derived from the seed
  float hairStyle = floor(fract(seed * 7.13) * 3.0);                       // 0 short, 1 long, 2 hat
  bool bag = fract(seed * 13.7) < 0.42;
  bool jk = fract(seed * 3.31) < 0.3 + 0.5 * uWet;
  vec3 jcol = aCPants * 1.3 + vec3(0.035);
  vec3 pc = aCShirt;
  bool hide = false;
  if (aPart < 0.5) pc = aCPants;
  else if (aPart < 2.5) pc = jk ? jcol * 0.5 + aCShirt * 0.5 : aCShirt;
  else if (aPart < 3.5) pc = jk ? jcol : aCShirt;
  else if (aPart < 4.5) pc = jk ? jcol : aCSkin;
  else if (aPart < 5.5) pc = aCSkin;
  else if (aPart < 6.5) { pc = aCHair; hide = hairStyle > 0.5; }
  else if (aPart < 7.5) pc = vec3(0.045);
  else if (aPart < 8.5) { pc = mix(aCShirt, aCHair, 0.6) * 0.8; hide = !bag; }
  else if (aPart < 9.5) pc = vec3(0.035, 0.028, 0.025);
  else if (aPart < 10.5) pc = vec3(0.06, 0.04, 0.03);
  else if (aPart < 11.5) { pc = aCHair; hide = !(hairStyle > 0.5 && hairStyle < 1.5); }
  else if (aPart < 12.5) { pc = jcol; hide = !jk; }
  else if (aPart < 13.5) { pc = aCShirt * 0.55 + vec3(0.02); hide = hairStyle < 1.5; }
  else if (aPart < 14.5) pc = aCSkin;
  else if (aPart < 15.5) pc = vec3(0.8);
  else pc = mix(aCSkin, vec3(0.5, 0.15, 0.16), 0.6);
  if (hide) transformed = vec3(0.0, 1.3, 0.0);
  vSC = jk ? jcol * 0.5 + aCShirt * 0.5 : aCShirt; vPN = aCPants;
  vPC = pc; vHC = aCHair; vPart = aPart; vSeed = seed; vJk = jk ? 1.0 : 0.0;
}`,
};

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9b6a48, 0x6f4a33, 0x4a3122];
const HAIR = [0x141010, 0x2a1a10, 0x5a3a20, 0x8a6a3a, 0xc9b070, 0x8a8a8a, 0x8a2c1c];
const SHIRT = [0x2a3a52, 0x8a2c34, 0x2e5a48, 0xd4d0c4, 0x1c1c20, 0x4a5a78, 0xc79a34, 0x6a4a72, 0x3a6a8a, 0xb45a3a, 0xe8e6e0, 0x555a5e];
const PANTS = [0x1c2233, 0x2b2b2e, 0x3a4256, 0x5a4a3a, 0x1a1a1a, 0x4a5568, 0x6a6a68, 0x2c3a2c];

export class People {
  constructor(scene, q, ctx) {
    this.R = rng(1717);
    this.scene = scene; this.q = q;
    this.cap = 96;
    const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    // master per-person data (CPU side); each frame it is copied into whichever LOD mesh the person falls in
    this.aAnim = attr(); this.aShirt = attr(); this.aPants = attr(); this.aSkin = attr(); this.aHair = attr();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const uni = { uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color() }, uWetAmt: { value: 0.6 } };
    mat.customProgramCacheKey = () => 'person';
    mat.onBeforeCompile = (sh) => patchMaterial(sh, PERSON_PROC, uni, '', VERT);
    const mkLod = (lod) => {
      const geo = personGeometry(lod), a = {};
      for (const n of ['aAnim', 'aCShirt', 'aCPants', 'aCSkin', 'aCHair']) { a[n] = attr(); geo.setAttribute(n, a[n]); }
      const mesh = new THREE.InstancedMesh(geo, mat, this.cap);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(1);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
      scene.add(mesh);
      return { mesh, a };
    };
    this.lodN = mkLod(0); this.lodF = mkLod(1);
    this.mesh = this.lodN.mesh;
    this.nearDist = q.peopleNear ?? 24;
    // umbrellas
    const ug = mergeGeometries([
      (() => { const c = new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32); c.translate(0, -0.4, 0); return c.toNonIndexed(); })(),
      (() => { const c = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6); c.translate(0, -0.35, 0); return c.toNonIndexed(); })(),
    ].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
    this.umb = new THREE.InstancedMesh(ug, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), this.cap);
    this.umb.frustumCulled = false; this.umb.count = 0; this.umb.castShadow = true; this.umb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    { const c = new THREE.Color(); const cols = [0x1a1a1f, 0x8a1c2c, 0x2a4a7a, 0x2e6a4c, 0x111111, 0xd4a020, 0x6a3a7a]; for (let i = 0; i < this.cap; i++) this.umb.setColorAt(i, c.set(cols[i % cols.length])); }
    scene.add(this.umb);
    this.list = [];
    this.crossing = [];
    this.m = new THREE.Matrix4(); this.qq = new THREE.Quaternion(); this.e = new THREE.Euler(); this.pv = new THREE.Vector3(); this.sv = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    G.people = this;
  }

  _look(o) {
    const R = this.R, c = new THREE.Color();
    const i = this.list.length;
    const set = (a, hex, k = 1) => { c.set(hex); a.setXYZ(i, c.r * k, c.g * k, c.b * k); };
    set(this.aShirt, o.shirt ?? SHIRT[Math.floor(R() * SHIRT.length)]);
    set(this.aPants, o.pants ?? PANTS[Math.floor(R() * PANTS.length)]);
    set(this.aSkin, o.skin ?? SKIN[Math.floor(R() * SKIN.length)]);
    set(this.aHair, o.hair ?? HAIR[Math.floor(R() * HAIR.length)]);
    return i;
  }

  add(o) {
    const R = this.R;
    if (this.list.length >= this.cap) return null;
    const i = this._look(o);
    const p = {
      i, x: o.x, z: o.z, y: 0, yaw: o.yaw ?? R() * 6.28, speed: 0, v: o.v ?? 1.25 + R() * 0.4, phase: R() * 6.28, scale: 0.94 + R() * 0.13, girth: 0.93 + R() * 0.16,
      mode: o.mode ?? 'idle', umb: R() < 0.62, seed: R(), lat: (R() - 0.5) * 3, sit: !!o.sit, y0: o.sit ? ((o.seat ?? 0.45) - 0.93 * 1.0) : (o.y0 ?? null), state: 'out', wait: 0, level: o.level ?? 0, arm: 0,
      anim: o.anim ?? 0,
    };
    p.tx = p.x; p.tz = p.z;
    this.list.push(p);
    this.umb.count = this.list.length;
    return p;
  }

  // sidewalk walkers around the main intersection
  spawnWalkers(n) {
    const R = this.R;
    for (let k = 0; k < n; k++) {
      const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1, alongAve = R() < 0.55;
      const d = 14 + R() * 200;
      const lat = (R() - 0.5) * 2.4;
      const p = this.add({ x: alongAve ? sx * d : sx * (9.4 + lat), z: alongAve ? sz * (9.4 + lat) : sz * d, mode: 'walk' });
      if (!p) return;
      p.corner = [sx, sz]; p.alongAve = alongAve; p.lat = lat; p.state = R() < 0.5 ? 'in' : 'out';
      this._aim(p);
    }
  }

  _cornerPt(p) { const [sx, sz] = p.corner; return [sx * 9.3 + (p.alongAve ? 0 : p.lat), sz * 9.3 + (p.alongAve ? p.lat : 0)]; }
  _aim(p) {
    const [sx, sz] = p.corner;
    if (p.state === 'in') { const [cx, cz] = this._cornerPt(p); p.tx = p.alongAve ? cx : sx * (9.4 + p.lat); p.tz = p.alongAve ? sz * (9.4 + p.lat) : cz; }
    else if (p.state === 'out') { const far = 150 + this.R() * 90; if (p.alongAve) { p.tx = sx * far; p.tz = sz * (9.4 + p.lat); } else { p.tx = sx * (9.4 + p.lat); p.tz = sz * far; } }
  }

  update(dt, camPos) {
    const R = this.R;
    const rain = G.weather.rain;
    const P = G.player;
    this.crossing.length = 0;
    const pa = Signals.pedAvenue(), pc = Signals.pedCross();
    const remA = Signals.dur[3] - Signals.tin, remC = Signals.dur[0] - Signals.tin;
    for (const p of this.list) {
      if (p.mode === 'walk') {
        // ---- walking / waiting / crossing state machine ----
        if (p.state === 'wait') {
          p.speed = 0; p.wait += dt;
          const ok = p.cross.type === 'A' ? (pa === 'w' && remA > 9) : (pc === 'w' && remC > 9);
          if (ok) { p.state = 'cross'; }
        } else {
          const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
          const spd = p.state === 'cross' ? 1.6 : p.v;
          if (d < 0.35) {
            if (p.state === 'out') { p.state = 'in'; this._aim(p); }
            else if (p.state === 'in') {
              // arrived at the corner: decide to cross or turn
              const [sx, sz] = p.corner;
              const r = R();
              if (r < 0.5) {
                // cross the street we are walking along the side of
                const type = p.alongAve ? 'B' : 'A';
                p.cross = { type };
                if (type === 'A') { const [cx] = [sx * 9.1]; p.cx0 = cx; p.tx = cx; p.tz = -sz * 9.3; p.corner = [sx, -sz]; p.x = cx; p.z = sz * 9.3; p.alongAve = false; }
                else { const cz = sz * 9.1; p.tx = -sx * 9.3; p.tz = cz; p.corner = [-sx, sz]; p.x = sx * 9.3; p.z = cz; p.alongAve = true; }
                p.state = 'wait'; p.ccorner = p.corner; p.pending = true;
              } else {
                // turn onto the other street outward
                p.alongAve = !p.alongAve; p.state = 'out'; this._aim(p);
              }
            } else if (p.state === 'cross') {
              p.state = 'out'; if (R() < 0.35) p.alongAve = !p.alongAve; this._aim(p);
            }
          } else {
            const st = spd;
            p.speed += (st - p.speed) * (1 - Math.exp(-dt * 6));
            const nx = dx / d, nz = dz / d;
            p.x += nx * p.speed * dt; p.z += nz * p.speed * dt;
            const yawT = Math.atan2(nx, nz);
            let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            p.yaw += dy * (1 - Math.exp(-dt * 8));
          }
          if (p.state === 'cross') this.crossing.push(p);
        }
      } else {
        p.speed += (0 - p.speed) * (1 - Math.exp(-dt * 6));
      }
      // stopped-at-kerb pose: face the crossing
      if (p.state === 'wait') { const [tx, tz] = [p.tx - p.x, p.tz - p.z]; const yawT = Math.atan2(tx, tz); let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * (1 - Math.exp(-dt * 6)); }
      p.phase += p.speed * dt * 4.6;
      const gy = p.y0 != null ? p.y0 : (isRoad(p.x, p.z) ? ROAD_Y : WALK_Y + 0.02);
      p.y += (gy - p.y) * (1 - Math.exp(-dt * 14));
    }
    // ---- write instances (near people get the detailed mesh, the rest the coarse one) ----
    const aa = this.aAnim.array, nd2 = this.nearDist * this.nearDist;
    const cx = camPos ? camPos.x : 0, cy = camPos ? camPos.y : 0, cz = camPos ? camPos.z : 0;
    const N = this.lodN, F = this.lodF;
    let nN = 0, nF = 0;
    const cp = (src, dst, k, s) => { const sa = src.array, da = dst.array; da[s * 3] = sa[k * 3]; da[s * 3 + 1] = sa[k * 3 + 1]; da[s * 3 + 2] = sa[k * 3 + 2]; };
    this.list.forEach((p, k) => {
      const idle = p.mode !== 'walk' || p.state === 'wait';
      const sp = p.speed / 1.5;
      aa[k * 3] = p.phase; aa[k * 3 + 1] = p.sit ? -1 : (idle ? 0 : Math.min(1.4, sp)); aa[k * 3 + 2] = p.seed;
      this.e.set(0, p.yaw, 0); this.qq.setFromEuler(this.e);
      this.pv.set(p.x, p.y, p.z);
      this.sv.set(p.scale * p.girth, p.scale, p.scale * p.girth);
      this.m.compose(this.pv, this.qq, this.sv);
      const dx = p.x - cx, dy = (p.y + 1) - cy, dz = p.z - cz;
      const near = dx * dx + dz * dz + dy * dy * 0.25 < nd2;
      const L = near ? N : F, s = near ? nN++ : nF++;
      cp(this.aAnim, L.a.aAnim, k, s); cp(this.aShirt, L.a.aCShirt, k, s); cp(this.aPants, L.a.aCPants, k, s); cp(this.aSkin, L.a.aCSkin, k, s); cp(this.aHair, L.a.aCHair, k, s);
      L.mesh.setMatrixAt(s, this.m);
      // umbrella
      const showU = p.umb && rain > 0.25 && p.mode === 'walk' && p.level === 0;
      if (showU) {
        this.e.set(0.12 * Math.sin(p.phase * 0.5), p.yaw, 0.08); this.qq.setFromEuler(this.e);
        this.pv.set(p.x, p.y + 2.02 * p.scale, p.z);
        this.sv.setScalar(1);
        this.umb.setMatrixAt(k, this.m.compose(this.pv, this.qq, this.sv));
      } else this.umb.setMatrixAt(k, this.zero);
    });
    for (const [L, n] of [[N, nN], [F, nF]]) {
      L.mesh.count = n; L.mesh.instanceMatrix.needsUpdate = true;
      for (const key in L.a) L.a[key].needsUpdate = true;
    }
    this.umb.instanceMatrix.needsUpdate = true;
  }
}
