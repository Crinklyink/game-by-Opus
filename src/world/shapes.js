// Higher-level modelling helpers built on Kit: upholstery with piping and buttons, turned legs,
// panelled doors, hardware, tableware, book stacks. They only add shapes to a Kit (nothing
// touches the scene), so callers can place them anywhere with mat4().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat4 } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// closed rounded-rectangle outline in the x/z plane (counter-clockwise), n points per corner
export function rrPath(w, d, r, n = 4) {
  const pts = [];
  const hw = w / 2, hd = d / 2, rr = Math.max(1e-4, Math.min(r, hw, hd));
  const corners = [[hw - rr, hd - rr, 0], [-(hw - rr), hd - rr, Math.PI / 2], [-(hw - rr), -(hd - rr), Math.PI], [hw - rr, -(hd - rr), Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  return pts;
}

// rounded-rectangle THREE.Shape (x/y plane) for extrusions
export function rrShape(w, h, r) {
  const s = new THREE.Shape(), hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  s.moveTo(-hw + rr, -hh); s.lineTo(hw - rr, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  s.lineTo(hw, hh - rr); s.quadraticCurveTo(hw, hh, hw - rr, hh);
  s.lineTo(-hw + rr, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  s.lineTo(-hw, -hh + rr); s.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  return s;
}

// Upholstered cushion: a rounded box with a crowned top and stuffed sides, piping around the top and
// bottom edges and (optionally) a grid of pulled-in buttons.
//   o: r radius, crown, bulge, seg, pipe (Material), buttons: [nx, nz] with button material, rx/ry/rz
export function cushion(k, mat, w, h, d, x, y, z, o = {}) {
  const r = Math.max(0.004, Math.min(o.r ?? Math.min(0.06, h * 0.42), w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const geo = new RoundedBoxGeometry(w, h, d, o.seg ?? 5, r);
  const p = geo.attributes.position;
  const crown = o.crown ?? h * 0.14, bulge = o.bulge ?? Math.min(0.014, h * 0.1), hw = w / 2, hd = d / 2, hh = h / 2;
  for (let i = 0; i < p.count; i++) {
    let px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const u = Math.max(0, 1 - (px / hw) ** 2), v = Math.max(0, 1 - (pz / hd) ** 2);
    const t = Math.max(0, py / hh);
    py += crown * t * t * u * v;
    const belly = 1 - (py / (hh + crown)) ** 2;                   // widest at mid-height
    px += Math.sign(px) * bulge * Math.max(0, belly) * v; pz += Math.sign(pz) * bulge * Math.max(0, belly) * u;
    p.setXYZ(i, px, py, pz);
  }
  geo.computeVertexNormals();
  const m = mat4(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0);
  k.push(mat, geo, m);
  if (o.pipe) {
    const rad = Math.min(0.0075, r * 0.3), inset = r * 0.32;
    for (const sy of [1, -1]) {
      if (sy < 0 && o.pipeBottom === false) continue;
      const path = rrPath(w - inset * 2 + bulge, d - inset * 2 + bulge, Math.max(0.01, r - inset), 4).map(([px, pz]) => V(px, sy * (hh - r * 0.3), pz).applyMatrix4(m));
      k.tube(o.pipe, path.map((q) => [q.x, q.y, q.z]), rad, { closed: true, seg: path.length * 2, radial: 5, tension: 0.2 });
    }
  }
  if (o.buttons) {
    const [nx, nz] = o.buttons, bm = o.buttonMat ?? mat;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = (-0.5 + (i + 0.5) / nx) * (w - 0.1), lz = (-0.5 + (j + 0.5) / nz) * (d - 0.1);
      const top = hh + crown * Math.max(0, 1 - (lx / hw) ** 2) * Math.max(0, 1 - (lz / hd) ** 2);
      const q = V(lx, top - 0.004, lz).applyMatrix4(m);
      k.sph(bm, 0.011, q.x, q.y, q.z, { sy: 0.55, seg: 10, seg2: 6 });
    }
  }
}

// Throw pillow: pinched corners, centre dimple. (superellipsoid; e<1 boxier)
export function throwPillow(k, mat, w, h, d, x, y, z, o = {}) {
  const e = o.e ?? 0.5;
  const geo = new THREE.SphereGeometry(1, 32, 22);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const sg = (a, ee) => Math.sign(a) * Math.pow(Math.abs(a), ee);
    const nx = sg(px, e), ny = sg(py, 0.9), nz = sg(pz, e);
    const cx = Math.abs(nx), cz = Math.abs(nz);
    const pinch = 1 - 0.22 * Math.pow(cx * cz, 2);                  // corners taper toward the seam
    const fx = nx * w / 2, fz = nz * d / 2;
    let fy = ny * h / 2 * pinch;
    const rr = Math.sqrt(nx * nx + nz * nz);
    fy -= Math.sign(py) * (o.dimple ?? 0.16) * h * Math.max(0, 1 - rr * rr);
    p.setXYZ(i, fx, fy, fz);
  }
  geo.computeVertexNormals();
  return k.push(mat, geo, mat4(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0));
}

// Pillow resting on a surface and leaning back toward -z (a headboard / sofa back): (x, z0, yb) is where its lowest edge touches,
// theta = lean from flat. The centre is solved so the pillow sits on the surface instead of hovering above it.
export function leanPillow(k, mat, w, h, d, x, z0, yb, theta, o = {}) {
  const sn = Math.sin(theta), cs = Math.cos(theta);
  const cy = yb + (d / 2) * sn + (h / 2) * cs, cz = z0 - (d / 2) * cs + (h / 2) * sn;
  return throwPillow(k, mat, w, h, d, x, cy - h / 2, cz, { rx: theta, ...o });
}

// turned wooden leg: lathe profile with a ferrule ring, slim taper and a collar under the frame
export function turnedLeg(k, mat, x, y, z, h, r = 0.022, o = {}) {
  const rb = r * (o.foot ?? 0.62), col = o.collar ?? 0.05;
  const pts = [[0, 0], [rb * 0.9, 0], [rb, 0.004], [rb * 1.12, 0.012], [rb * 1.12, 0.022], [rb * 0.96, 0.03],
    [r * 0.82, h * 0.35], [r * 0.78, h * 0.6], [r * 0.92, h - col - 0.01], [r * 1.14, h - col + 0.012], [r * 1.0, h - col + 0.03], [r * 1.05, h - 0.008], [r * 0.6, h], [0, h]];
  return k.lathe(mat, pts, x, y, z, { seg: o.seg ?? 14, rx: o.rx || 0, rz: o.rz || 0 });
}

// cabinet door: painted frame + recessed centre panel (shaker), optional bar pull. Front faces +z; (x,y) = bottom-centre, z = mid-thickness.
//   o: t thickness, rail width, inner (panel Material), pull (Material), pullVert, pullX (offset from centre), pullY (centre height above bottom), pullLen
export function shakerDoor(k, mat, w, h, x, y, z, o = {}) {
  const t = o.t ?? 0.02, rail = Math.min(o.rail ?? 0.055, w / 2 - 0.01, h / 2 - 0.01), inner = o.inner ?? mat;
  k.box(mat, w, rail, t, x, y, z, { r: 0.0025 });
  k.box(mat, w, rail, t, x, y + h - rail, z, { r: 0.0025 });
  k.box(mat, rail, h - 2 * rail, t, x - w / 2 + rail / 2, y + rail, z, { r: 0.0025 });
  k.box(mat, rail, h - 2 * rail, t, x + w / 2 - rail / 2, y + rail, z, { r: 0.0025 });
  k.box(inner, w - 2 * rail + 0.008, h - 2 * rail + 0.008, t * 0.36, x, y + rail - 0.004, z - t * 0.32);
  if (o.pull) {
    const len = o.pullLen ?? 0.16;
    if (o.pullVert) pullBar(k, o.pull, x + (o.pullX ?? 0), y + (o.pullY ?? h / 2) - len / 2, z + t / 2, len, true);
    else pullBar(k, o.pull, x + (o.pullX ?? 0), y + (o.pullY ?? h - rail - 0.03), z + t / 2, len, false);
  }
}

// flat slab door with a routed groove + bar pull
export function slabDoor(k, mat, w, h, x, y, z, o = {}) {
  k.box(mat, w, h, o.t ?? 0.02, x, y, z, { r: 0.002 });
  if (o.pull) pullBar(k, o.pull, x + (o.px ?? 0), y + (o.py ?? h - 0.08), z + (o.t ?? 0.02) / 2, o.len ?? 0.14, !!o.vert);
}

// bar handle on two standoffs
export function pullBar(k, mat, x, y, z, len = 0.15, vert = false) {
  if (vert) {
    k.cyl(mat, 0.0065, 0.0065, len, x, y, z + 0.022, { seg: 8 });
    for (const dy of [0.015, len - 0.015]) k.cyl(mat, 0.005, 0.005, 0.022, x, y + dy, z + 0.011, { rx: Math.PI / 2, cy: true, seg: 6 });
  } else {
    k.cyl(mat, 0.0065, 0.0065, len, x, y, z + 0.022, { rz: Math.PI / 2, cy: true, seg: 8 });
    for (const dx of [-len / 2 + 0.015, len / 2 - 0.015]) k.cyl(mat, 0.005, 0.005, 0.022, x + dx, y, z + 0.011, { rx: Math.PI / 2, cy: true, seg: 6 });
  }
}

// round knob
export function knob(k, mat, x, y, z, r = 0.014) {
  k.cyl(mat, 0.004, 0.004, 0.02, x, y, z + 0.01, { rx: Math.PI / 2, cy: true, seg: 6 });
  k.sph(mat, r, x, y, z + 0.026, { sz: 0.7, seg: 12, seg2: 8 });
}

// a stack of hardcover books lying flat: [{ c: Material, w, d, h }] from the bottom up
export function bookStack(k, pages, list, x, y, z, ry = 0) {
  let cy = y;
  list.forEach((b, i) => {
    const w = b.w ?? 0.24, d = b.d ?? 0.17, h = b.h ?? 0.03, a = ry + (i % 2 ? 0.12 : -0.08) * (b.j ?? 1);
    const ox = (i % 3 - 1) * 0.008;
    k.box(pages, w - 0.006, h - 0.006, d - 0.004, x + ox, cy + 0.003, z, { ry: a });
    k.box(b.c, w, 0.004, d, x + ox, cy, z, { ry: a });
    k.box(b.c, w, 0.004, d, x + ox, cy + h - 0.004, z, { ry: a });
    const sx = Math.cos(a) * (-w / 2 + 0.002) , sz = -Math.sin(a) * (-w / 2 + 0.002);
    k.box(b.c, 0.006, h, d, x + ox + sx, cy, z + sz, { ry: a });
    cy += h;
  });
  return cy;
}

// mug with handle
export function mug(k, mat, x, y, z, o = {}) {
  const r = o.r ?? 0.04, h = o.h ?? 0.09;
  k.lathe(mat, [[0, 0], [r * 0.9, 0], [r, 0.004], [r * 1.02, h], [r * 0.92, h], [r * 0.88, h - 0.006], [0, 0.008]], x, y, z, { seg: 20 });
  k.torus(mat, h * 0.28, 0.006, x + Math.cos(o.ry ?? 0) * r * 1.02, y + h * 0.52, z - Math.sin(o.ry ?? 0) * r * 1.02, { rx: 0, ry: o.ry ?? 0, seg: 14, seg2: 5 });
  if (o.liquid) k.cyl(o.liquid, r * 0.86, r * 0.86, 0.004, x, y + h - 0.012, z, { seg: 18 });
}

// dinner plate / bowl (lathe)
export function plate(k, mat, x, y, z, r = 0.12, o = {}) {
  const deep = o.deep ?? 0.018;
  k.lathe(mat, [[0, 0.002], [r * 0.55, 0.002], [r * 0.72, deep * 0.5], [r, deep], [r * 1.02, deep + 0.004], [r * 0.97, deep + 0.004], [r * 0.7, deep * 0.28], [0, 0]], x, y, z, { seg: o.seg ?? 32 });
}

// wine / water glass (thin lathe, use a glassy material)
export function stemGlass(k, mat, x, y, z, s = 1) {
  k.lathe(mat, [[0, 0], [0.032 * s, 0], [0.03 * s, 0.004 * s], [0.004 * s, 0.01 * s], [0.004 * s, 0.075 * s], [0.014 * s, 0.09 * s], [0.03 * s, 0.13 * s], [0.032 * s, 0.17 * s], [0.03 * s, 0.17 * s], [0.026 * s, 0.13 * s], [0.008 * s, 0.098 * s], [0, 0.095 * s]], x, y, z, { seg: 18 });
}

// vase with a few stems and blossoms/leaves
export function branchVase(k, vaseMat, stemMat, leafMat, x, y, z, rnd, o = {}) {
  const h = o.h ?? 0.28;
  k.lathe(vaseMat, [[0, 0], [0.05, 0], [0.08, h * 0.35], [0.06, h * 0.75], [0.035, h * 0.95], [0.04, h], [0.031, h], [0.03, h * 0.94], [0.058, h * 0.72], [0.074, h * 0.35], [0.044, 0.01], [0, 0.01]], x, y, z, { seg: 22 });
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, tilt = 0.15 + rnd() * 0.5, L = (o.len ?? 0.6) * (0.7 + rnd() * 0.5);
    const tx = x + Math.cos(a) * Math.sin(tilt) * L, tz = z + Math.sin(a) * Math.sin(tilt) * L, ty = y + h + Math.cos(tilt) * L;
    k.tube(stemMat, [[x, y + h - 0.02, z], [x + Math.cos(a) * Math.sin(tilt) * L * 0.5, y + h + Math.cos(tilt) * L * 0.5, z + Math.sin(a) * Math.sin(tilt) * L * 0.5], [tx, ty, tz]], 0.0035, { seg: 10, radial: 4 });
    if (o.bloom) k.sph(o.bloom, 0.026 + rnd() * 0.012, tx, ty, tz, { seg: 10, seg2: 7, sy: 0.8 });
    else for (let j = 0; j < 5; j++) k.push(leafMat, o.leafGeo.clone(), mat4(x + (tx - x) * (0.4 + j * 0.13), y + h + (ty - y - h) * (0.4 + j * 0.13), z + (tz - z) * (0.4 + j * 0.13), 0.5, a + j * 1.7, 0));
  }
}

// draped knit throw (returns height function for Kit.cloth): folds across u, hangs over an edge at v>0.6
export function throwHeight(seed = 1) {
  return (u, v) => {
    const fold = Math.sin(u * 17 + seed) * 0.014 + Math.sin(u * 41 + v * 6) * 0.004;
    const hang = v > 0.6 ? -Math.pow((v - 0.6) / 0.4, 1.6) * 0.42 : 0;
    return 0.02 + fold * (0.4 + v) + hang;
  };
}

// louvred / slatted panel: n vertical slats
export function slats(k, mat, w, h, x, y, z, n = 12, t = 0.012, gap = 0.012, dz = 0.02) {
  const pitch = w / n;
  for (let i = 0; i < n; i++) k.box(mat, pitch - gap, h, dz, x - w / 2 + pitch * (i + 0.5), y, z, { r: 0.003 });
}

// fluted wall/door panel (half-round strips)
export function flutes(k, mat, w, h, x, y, z, n = 14, r = 0.014) {
  const pitch = w / n;
  for (let i = 0; i < n; i++) k.cyl(mat, r, r, h, x - w / 2 + pitch * (i + 0.5), y, z, { seg: 8 });
}
