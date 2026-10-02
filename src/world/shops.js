// The two enterable shops: "Big Stack Burgers" (retro diner, north-east block) and "FreshMart"
// (grocery, south-east block), with interiors, menu boards, stocked shelves, checkout lanes,
// NPCs and interaction points. Exteriors carry big neon roof signs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { Kit, addCollider, mat4 } from './kit.js';
import { pm, glowMat } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { canvasTex } from '../gfx/noise.js';
import { LightPool } from '../gfx/lights.js';
import { Interact } from '../systems/interact.js';
import { makeScreen } from './screens.js';
import * as F from './furniture.js';
import { palette } from './palette.js';
import { cushion, rrShape, rrPath, pullBar } from './shapes.js';
import { WALK_Y } from './street.js';

PROC.checker = /* glsl */`
uniform vec3 uCol2; uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 q = abs(n.y) > 0.5 ? p.xz : (abs(n.x) > abs(n.z) ? p.zy : p.xy);      // floor tiles or a wall strip
  float c = mod(floor(q.x / uP.x) + floor(q.y / uP.x), 2.0);
  vec2 f = abs(fract(q / uP.x) - 0.5) * uP.x;
  float fpx = length(fwidth(q));
  float gw = max(0.004, fpx * 1.3);
  float g = smoothstep(0.0, gw, uP.x*0.5 - max(f.x, f.y));
  float gd = (1.0 - g) * min(1.0, 0.008 / gw);
  s.alb = mix(uCol2, s.alb, c) * (1.0 - 0.15*gd) * (0.94 + 0.08*nz(p*4.0).r);
  s.rough = 0.16 + 0.08*nz(p*9.0).b; s.h = 0.0;
}`;
PROC.product = /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float y = clamp(p.y, 0.0, 1.0);                                   // 0..1 over the pack height
  vec3 base = s.alb;
  float k = fract(dot(base, vec3(12.9898, 78.233, 37.719)) * 43.5453);
  bool side = abs(n.y) < 0.5;
  float u = abs(n.x) > abs(n.z) ? p.z : p.x;                         // across the face
  float detail = 1.0 - smoothstep(0.004, 0.016, length(fwidth(wp)));
  float label = side ? smoothstep(0.20, 0.22, y) * (1.0 - smoothstep(0.70, 0.72, y)) : 0.0;
  vec3 paper = vec3(0.92, 0.9, 0.85);
  vec3 c = mix(base, base * 0.5, 1.0 - smoothstep(0.12, 0.14, y));  // darker foot
  c = mix(c, base * 1.15, smoothstep(0.86, 0.88, y) * 0.5);           // header
  float title = smoothstep(0.52, 0.53, y) * (1.0 - smoothstep(0.66, 0.67, y)) * step(abs(u), 0.4);
  float lines = step(0.5, fract(y * 26.0)) * smoothstep(0.24, 0.26, y) * (1.0 - smoothstep(0.48, 0.5, y));
  float len = 0.18 + 0.2 * fract(k * 7.0 + floor(y * 26.0) * 0.37);
  lines *= step(abs(u + 0.02), len) * detail;
  vec3 lab = mix(paper, base, title);
  lab *= 1.0 - 0.55 * lines;
  s.alb = mix(c, lab, label) * (0.94 + 0.1 * nz(p * 12.0).r * detail);
  s.rough = 0.42 - 0.12 * label; s.h = 0.0;
}`;
PROC.asphaltLot = /* glsl */`
uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 w = wp.xz;
  float n1 = nz(vec3(w*0.13, 0.4)).r, sp = nz(vec3(w*45.0, 0.9)).g;
  vec3 col = vec3(0.05, 0.051, 0.055) * (0.7 + 0.6*n1);
  col += vec3(0.07) * smoothstep(0.84, 0.95, sp) * (1.0 - smoothstep(0.02, 0.2, length(fwidth(w))));
  vec2 q = w - uP.xy;
  float row = step(0.0, q.y) * step(q.y, 5.4) + step(12.6, q.y) * step(q.y, 18.0);
  float line = smoothstep(0.06, 0.04, abs(fract(q.x/2.75) - 0.02) * 2.75) * row;
  line = max(line, smoothstep(0.07, 0.05, abs(q.y - 5.4)) * step(0.0, q.x) * step(q.x, uP.z));
  line = max(line, smoothstep(0.07, 0.05, abs(q.y - 12.6)) * step(0.0, q.x) * step(q.x, uP.z));
  col = mix(col, vec3(0.55), line * 0.85 * (1.0 - 0.4*uWet));
  float oil = smoothstep(0.7, 0.8, nz(vec3(w*0.4, 0.3)).b);
  col *= 1.0 - 0.3*oil;
  float wetK = uWet;
  s.alb = col * (1.0 - 0.45*wetK); s.rough = mix(0.9, 0.12, wetK * (0.4 + 0.6*smoothstep(0.4, 0.7, n1)));
  s.h = (sp - 0.5) * 0.002 * (1.0 - smoothstep(0.02, 0.15, length(fwidth(w))));
}`;

const GY = WALK_Y + 0.02;

// ----------------------------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------------------------
function shell(K, o) {
  // o: x0,x1,z0,z1, h, front ('s'|'n'), door:[x0,x1], win:[x0,x1] (front glazing span), mats
  const { x0, x1, z0, z1, h, mats } = o;
  const T = 0.32;
  const b = (mat, ax0, ax1, y0, y1, az0, az1, col = true) => { K.box(mat, ax1 - ax0, y1 - y0, az1 - az0, (ax0 + ax1) / 2, y0, (az0 + az1) / 2); if (col) addCollider(ax0, ax1, az0, az1, y0, y1, 0); };
  const front = o.front;                      // 'n' => front wall at z1 side? (we use: front at min z for grocery, max z for burger)
  const fz0 = front === 'zmin' ? z0 : z1 - T, fz1 = front === 'zmin' ? z0 + T : z1;
  const bz0 = front === 'zmin' ? z1 - T : z0, bz1 = front === 'zmin' ? z1 : z0 + T;
  // floor and roof
  K.box(mats.floor, x1 - x0, 0.15, z1 - z0, (x0 + x1) / 2, -0.15, (z0 + z1) / 2);
  K.box(mats.roof, x1 - x0 + 0.6, 0.4, z1 - z0 + 0.6, (x0 + x1) / 2, h, (z0 + z1) / 2);
  K.box(mats.ceiling, x1 - x0 - 0.5, 0.06, z1 - z0 - 0.5, (x0 + x1) / 2, h - 0.06, (z0 + z1) / 2);
  // back + side walls
  b(mats.wall, x0, x1, 0, h, bz0, bz1);
  b(mats.wall, x0, x0 + T, 0, h, z0, z1);
  b(mats.wall, x1 - T, x1, 0, h, z0, z1);
  // front wall with door + glazing
  const [g0, g1] = o.win, [d0, d1] = o.door;
  const kh = 0.85, wh = 3.55;
  b(mats.wall, x0, g0, 0, h, fz0, fz1);
  b(mats.wall, g1, x1, 0, h, fz0, fz1);
  b(mats.wall, g0, g1, wh, h, fz0, fz1, false);
  b(mats.knee, g0, d0, 0, kh, fz0, fz1);
  b(mats.knee, d1, g1, 0, kh, fz0, fz1);
  addCollider(g0, d0, fz0, fz1, 0, h, 0); addCollider(d1, g1, fz0, fz1, 0, h, 0);
  K.box(mats.frame, d1 - d0, h - 2.5, T, (d0 + d1) / 2, 2.5, (fz0 + fz1) / 2);
  return { fz0, fz1, bz0, bz1, T, wh, kh };
}

function glassBox(par, x, y, z, w, h, front) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pm('plain', { color: 0x0a1518, rough: 0.02, glass: true, opacity: 0.1, side: THREE.DoubleSide, env: 2.2 }));
  m.position.set(x, y, z); if (front === 'x') m.rotation.y = Math.PI / 2; par.add(m); return m;
}

function menuBoard(title, items, w = 512, h = 192, style = 'burger') {
  return makeScreen(w, h, (c, cw, ch) => {
    c.fillStyle = style === 'burger' ? '#1a0d0a' : '#0a1a10'; c.fillRect(0, 0, cw, ch);
    const g = c.createLinearGradient(0, 0, cw, 0); g.addColorStop(0, style === 'burger' ? '#d43a2a' : '#2aa84a'); g.addColorStop(1, style === 'burger' ? '#f2a020' : '#a0d840'); c.fillStyle = g; c.fillRect(0, 0, cw, 40);
    c.fillStyle = '#fff'; c.font = '800 26px "Arial Black", Arial'; c.textBaseline = 'middle'; c.fillText(title, 14, 21);
    c.font = '600 20px Arial'; c.fillStyle = '#ffe9b8';
    items.forEach(([n, p], i) => { const y = 66 + i * 30; c.textAlign = 'left'; c.fillText(n, 16, y); c.textAlign = 'right'; c.fillText(p, cw - 16, y); c.strokeStyle = 'rgba(255,230,180,0.2)'; c.beginPath(); c.moveTo(16, y + 14); c.lineTo(cw - 16, y + 14); c.stroke(); });
    c.textAlign = 'left';
  }, { fps: 1 });
}


// ---------------------------------------------------------------- diner furniture (chrome + red vinyl)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function pushKit(K, kk, x, y, z, ry) { for (const [mat, arr] of kk.g) for (const geo of arr) K.push(mat, geo.clone(), mat4(x, y, z, 0, ry, 0)); }

// round domed seat cushion with piping (lathe)
function roundCushion(K, vinyl, r, h, x, y, z) {
  K.lathe(vinyl, [[0, 0], [r * 0.96, 0], [r, h * 0.16], [r * 1.02, h * 0.5], [r * 0.98, h * 0.85], [r * 0.8, h * 1.0], [r * 0.4, h * 1.08], [0, h * 1.1]], x, y, z, { seg: 28 });
  K.torus(vinyl, r * 1.0, 0.007, x, y + h * 0.86, z, { rx: Math.PI / 2, seg: 32, seg2: 5 });
}

function dinerStool(K, M, vinyl, x, z, h = 0.68) {
  K.lathe(M.chrome, [[0, 0], [0.22, 0], [0.235, 0.012], [0.225, 0.028], [0.09, 0.05], [0.05, 0.09], [0.038, 0.14], [0.034, h - 0.16], [0.05, h - 0.12], [0.07, h - 0.09], [0.0, h - 0.09]], x, 0, z, { seg: 24 });
  K.torus(M.chrome, 0.18, 0.011, x, 0.3, z, { rx: Math.PI / 2, seg: 30, seg2: 6 });
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4; K.strut(M.chrome, [x, 0.3, z], [x + Math.cos(a) * 0.18, 0.3, z + Math.sin(a) * 0.18], 0.006, 0.006, { seg: 5 }); }
  K.cyl(M.chrome, 0.21, 0.21, 0.02, x, h - 0.1, z, { seg: 28 });
  roundCushion(K, vinyl, 0.2, 0.09, x, h - 0.08, z);
}

function dinerChair(K, M, vinyl, x, z, ry) {
  const kk = new Kit();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.strut(M.chrome, [sx * 0.19, 0.44, sz * 0.19], [sx * 0.225, 0, sz * 0.225], 0.012, 0.009, { seg: 8 });
  for (const sx of [-1, 1]) { kk.strut(M.chrome, [sx * 0.2, 0.22, -0.2], [sx * 0.2, 0.22, 0.2], 0.007, 0.007, { seg: 6 }); kk.strut(M.chrome, [sx * 0.19, 0.44, -0.19], [sx * 0.19, 0.95, -0.235], 0.011, 0.011, { seg: 8 }); }
  kk.box(M.chrome, 0.44, 0.028, 0.44, 0, 0.42, 0, { r: 0.012 });
  cushion(kk, vinyl, 0.44, 0.07, 0.44, 0, 0.44, 0, { r: 0.03, crown: 0.02, pipe: vinyl, seg: 4 });
  cushion(kk, vinyl, 0.4, 0.26, 0.06, 0, 0.66, -0.225, { rx: -0.1, r: 0.03, crown: 0.02, pipe: vinyl, seg: 4 });
  pushKit(K, kk, x, 0, z, ry);
}

// booth: two benches along local z at x = +-1.0 around a formica table (axis 0), or rotated for the side walls
function dinerBooth(K, M, vinyl, tableTop, cx, cz, ry) {
  const kk = new Kit();
  for (const s of [-1, 1]) {
    kk.box(M.blackMetal, 0.6, 0.2, 1.42, s * 1.0, 0.0, 0, { r: 0.01 });
    kk.box(M.chrome, 0.62, 0.03, 1.44, s * 1.0, 0.03, 0);
    cushion(kk, vinyl, 0.68, 0.22, 1.46, s * 1.0, 0.22, 0, { r: 0.06, crown: 0.03, pipe: vinyl, seg: 5 });
    for (let j = 0; j < 3; j++) cushion(kk, vinyl, 0.62, 0.14, 0.47, s * 1.3, 0.42, (j - 1) * 0.49, { rz: s * (Math.PI / 2 - 0.12), r: 0.05, crown: 0.028, pipe: vinyl, seg: 5, buttons: [2, 1] });
    kk.box(M.chrome, 0.05, 0.05, 1.5, s * 1.36, 1.03, 0, { r: 0.02 });
    for (const zz of [-0.74, 0.74]) kk.box(M.chrome, 0.05, 0.9, 0.04, s * 1.36, 0.16, zz, { r: 0.015 });
  }
  // formica table with chrome banding and a pedestal
  kk.box(tableTop, 0.85, 0.045, 1.3, 0, 0.7, 0, { r: 0.012, seg: 3 });
  kk.box(M.chrome, 0.87, 0.03, 0.02, 0, 0.7, 0.65); kk.box(M.chrome, 0.87, 0.03, 0.02, 0, 0.7, -0.65);
  kk.box(M.chrome, 0.02, 0.03, 1.32, 0.435, 0.7, 0); kk.box(M.chrome, 0.02, 0.03, 1.32, -0.435, 0.7, 0);
  kk.lathe(M.chrome, [[0, 0], [0.24, 0], [0.26, 0.014], [0.22, 0.03], [0.07, 0.07], [0.05, 0.12], [0.045, 0.6], [0.09, 0.66], [0.0, 0.7]], 0, 0, 0, { seg: 24 });
  // sugar, napkins, salt & pepper, ketchup, a menu
  kk.box(M.chrome, 0.08, 0.13, 0.08, 0, 0.745, -0.2, { r: 0.008 });
  kk.lathe(M.chrome, [[0, 0], [0.025, 0], [0.025, 0.09], [0.012, 0.11], [0, 0.11]], -0.1, 0.745, 0.2, { seg: 10 });
  kk.lathe(M.chrome, [[0, 0], [0.025, 0], [0.025, 0.09], [0.012, 0.11], [0, 0.11]], 0.0, 0.745, 0.2, { seg: 10 });
  kk.lathe(pm('plain', { color: 0xd43a2a, rough: 0.3, interior: true }), [[0, 0], [0.032, 0], [0.034, 0.14], [0.014, 0.17], [0.014, 0.19], [0, 0.19]], 0.1, 0.745, 0.2, { seg: 12 });
  kk.box(pm('paper', {}), 0.16, 0.004, 0.22, 0.2, 0.745, -0.25, { ry: 0.3 });
  pushKit(K, kk, cx, 0, cz, ry);
}

function dinerJukebox(K, M, x, z) {
  const kk = new Kit();
  const body = pm('paint', { color: 0x8a1c1c, rough: 0.3, physical: true, clearcoat: 0.6, ccRough: 0.1, interior: true });
  const W = 0.9, D = 0.55;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, 1.15);
  shape.absarc(0, 1.15, W / 2, 0, Math.PI, false);
  shape.lineTo(-W / 2, 0);
  kk.extrude(body, shape, D, 0, 0, -D / 2, { bevel: 0.02, seg: 18 });
  const glow = pm('plain', { color: 0x000000, emissive: 0xffcc60, emissiveI: 3.2, interior: true });
  const glow2 = pm('plain', { color: 0x000000, emissive: 0x40e0ff, emissiveI: 3.6, interior: true });
  // curved dome window, chrome arch trim, coloured light tubes, grille, coin door, feet
  const arc = new THREE.Shape(); arc.moveTo(-0.33, 0.95); arc.lineTo(0.33, 0.95); arc.absarc(0, 1.15, 0.33, 0, Math.PI, false); arc.lineTo(-0.33, 0.95);
  kk.extrude(glow, arc, 0.02, 0, 0, D / 2 + 0.028);
  const trim = new THREE.Shape(); trim.absarc(0, 1.15, 0.4, 0, Math.PI, false); trim.absarc(0, 1.15, 0.36, Math.PI, 0, true);
  kk.extrude(M.chrome, trim, 0.035, 0, 0, D / 2 + 0.02);
  for (const sx of [-1, 1]) { kk.box(glow2, 0.03, 1.0, 0.03, sx * 0.4, 0.15, D / 2 + 0.03, { r: 0.012 }); kk.box(M.chrome, 0.05, 1.05, 0.02, sx * 0.44, 0.13, D / 2 + 0.015); }
  kk.box(glow, 0.56, 0.2, 0.02, 0, 0.62, D / 2 + 0.028, { r: 0.004 });
  for (let i = 0; i < 5; i++) kk.box(M.chrome, 0.5, 0.008, 0.008, 0, 0.66 - i * 0.032, D / 2 + 0.042);
  kk.box(pm('fabric', { color: 0x1a1517, interior: true }), 0.56, 0.3, 0.02, 0, 0.2, D / 2 + 0.024);
  for (const sx of [-1, 1]) kk.cyl(M.chrome, 0.035, 0.045, 0.06, sx * 0.34, 0, 0.2, { seg: 12 });
  pushKit(K, kk, x, 0, z, 0);
}

// ----------------------------------------------------------------------------------------------
// BIG STACK BURGERS
// ----------------------------------------------------------------------------------------------
export function buildBurger(scene, glow, ctx) {
  const M = palette(), R = ctx.rand;
  const par = new THREE.Group(); par.name = 'burger'; scene.add(par);
  const K = new Kit();
  const x0 = 18, x1 = 52, z0 = -36, z1 = -12, H = 4.6;
  const red = pm('paint', { color: 0xb3241c, rough: 0.35, wet: 1 });
  const teal = pm('plaster', { color: 0x3f9a92, interior: true });
  const cream = pm('plaster', { color: 0xf0e6cc, interior: true });
  const chromeS = M.steel;
  const mats = {
    floor: pm('checker', { color: 0xf1efe8, col2: 0x151517, p: [0.6, 0, 0, 0], physical: true, clearcoat: 0.6, ccRough: 0.1, interior: true }),
    roof: pm('concrete', { color: 0x777a7c, p: [0, 0, 0, 0], wet: 1 }),
    ceiling: pm('plaster', { color: 0xf0ebe0, interior: true }),
    wall: pm('paint', { color: 0xc93b2c, rough: 0.5, wet: 1 }),
    knee: pm('tile', { color: 0xf3f2ee, col2: 0x8b8a86, p: [0.15, 0.15, 0.004, 0], wet: 1 }),
    frame: red,
  };
  const S = shell(K, { x0, x1, z0, z1, h: H, front: 'zmax', door: [29.1, 30.9], win: [20, 50], mats });
  // interior wall skins (teal wainscot + cream)
  K.box(teal, x1 - x0 - 0.7, 1.3, 0.03, (x0 + x1) / 2, 0, z0 + 0.34);
  K.box(cream, x1 - x0 - 0.7, H - 1.3, 0.03, (x0 + x1) / 2, 1.3, z0 + 0.34);
  K.box(chromeS, x1 - x0 - 0.7, 0.06, 0.05, (x0 + x1) / 2, 1.3, z0 + 0.36);
  for (const sx of [x0 + 0.34, x1 - 0.34]) { K.box(teal, 0.03, 1.3, z1 - z0 - 0.7, sx, 0, (z0 + z1) / 2); K.box(cream, 0.03, H - 1.3, z1 - z0 - 0.7, sx, 1.3, (z0 + z1) / 2); K.box(chromeS, 0.05, 0.06, z1 - z0 - 0.7, sx, 1.3, (z0 + z1) / 2); }
  // window frames (chrome mullions)
  for (let x = 20; x <= 50; x += 3) if (x < 29.0 || x > 31.0) K.box(chromeS, 0.07, 2.7, 0.14, x, 0.85, z1 - 0.16);
  K.box(chromeS, 30, 0.08, 0.14, 35, 3.5, z1 - 0.16); K.box(chromeS, 30, 0.08, 0.14, 35, 0.85, z1 - 0.16);
  // exterior sign band + awning
  K.box(red, 34.6, 0.9, 0.5, 35, 3.9, z1 + 0.05);
  K.box(pm('paint', { color: 0xf3f0e6, rough: 0.4 }), 34.6, 0.1, 0.55, 35, 3.85, z1 + 0.05);
  // ---- counter, kitchen, stools ----
  const counterTop = pm('plain', { color: 0xede8dc, rough: 0.15, physical: true, clearcoat: 0.5, interior: true });
  const cz = -28.4;
  K.box(red, 22, 1.0, 1.0, 35, 0, cz, { r: 0.02 });
  K.box(counterTop, 22.3, 0.07, 1.2, 35, 1.0, cz, { r: 0.01 });
  K.box(chromeS, 22.2, 0.08, 0.08, 35, 0.2, cz + 0.5);
  const vinylS = pm('leather', { color: 0xa8231b, physical: true, clearcoat: 0.35, ccRough: 0.25, interior: true });
  for (let i = 0; i < 10; i++) dinerStool(K, M, vinylS, 25 + i * 2.2, -27.3);
  K.box(chromeS, 22.0, 0.04, 0.05, 35, 0.22, cz + 0.52, { r: 0.015 });                                    // chrome kick rail
  addCollider(23.8, 46.2, -29.1, -27.6, 0, 1.2, 0);
  // kitchen equipment (back of the kitchen zone z -35.7..-30)
  const st = M.steel;
  K.box(st, 22, 0.9, 0.9, 35, 0, -35.15, { r: 0.01 });                                            // back counter
  K.box(M.blackMetal, 2.0, 0.05, 0.85, 26, 0.9, -35.15);                                          // griddle
  K.box(pm('plain', { color: 0x120500, emissive: 0xff5a10, emissiveI: 0.8, interior: true }), 1.9, 0.01, 0.8, 26, 0.955, -35.15);
  K.box(st, 2.2, 0.9, 0.9, 30, 0, -34.2, { r: 0.01 }); K.box(M.blackMetal, 0.9, 0.16, 0.7, 29.6, 0.9, -34.2); K.box(M.blackMetal, 0.9, 0.16, 0.7, 30.6, 0.9, -34.2);   // fryers
  K.box(st, 4, 0.6, 1.2, 26, 3.0, -35.0, { r: 0.02 });                                            // hood
  K.box(st, 0.9, 1.0, 0.9, 26, 3.6, -35.2, { r: 0.02 });
  K.box(pm('plain', { color: 0x050505, emissive: 0xff7a30, emissiveI: 3.5, interior: true }), 3.6, 0.04, 0.3, 26, 2.96, -34.6);      // heat lamps
  K.box(st, 1.6, 1.2, 0.8, 41, 0, -35.2, { r: 0.01 }); K.cyl(M.chrome, 0.15, 0.15, 0.7, 41, 1.2, -35.2, { seg: 16 });     // milkshake machine
  for (let i = 0; i < 4; i++) K.cyl(pm('plain', { color: [0xe83a3a, 0x3a8ae8, 0xf0c040, 0x4ac06a][i], rough: 0.4, interior: true }), 0.09, 0.09, 0.28, 44 + i * 0.4, 0.9, -35.2, { seg: 12 });
  K.box(st, 10, 0.06, 0.4, 34, 1.5, -35.55);                                                       // shelf
  for (let i = 0; i < 12; i++) K.cyl(pm('plain', { color: [0xd8c8a8, 0xe83a3a, 0xf0e8d0][i % 3], rough: 0.5, interior: true }), 0.1, 0.1, 0.16, 29.5 + i * 0.8, 1.56, -35.55, { seg: 10 });
  // register
  K.box(M.blackMetal, 0.5, 0.35, 0.45, 35, 1.07, cz, { r: 0.02 }); K.box(M.plasticB, 0.42, 0.28, 0.03, 35, 1.42, cz - 0.05, { rx: -0.2 });
  K.cyl(M.brass, 0.05, 0.05, 0.03, 36.4, 1.07, cz, { seg: 14 });                                     // bell
  // napkins/condiments on the counter
  for (let i = 0; i < 4; i++) { K.box(M.chrome, 0.08, 0.12, 0.08, 26 + i * 4.5, 1.07, cz + 0.3); K.cyl(pm('plain', { color: 0xd43a2a, rough: 0.3, interior: true }), 0.03, 0.03, 0.12, 26.2 + i * 4.5, 1.07, cz + 0.28, { seg: 8 }); }
  // ---- booths (red vinyl) ----
  const vinyl = pm('leather', { color: 0xa8231b, physical: true, clearcoat: 0.35, ccRough: 0.25, interior: true });
  const tableTop = pm('plain', { color: 0xf3efe4, rough: 0.2, physical: true, clearcoat: 0.4, interior: true });
  for (let i = 0; i < 6; i++) {
    const bx = 22.4 + i * 4.9, bz = -15.6;
    if (bx > 27 && bx < 33.6) continue;
    dinerBooth(K, M, vinyl, tableTop, bx, bz, 0);
    addCollider(bx - 1.5, bx + 1.5, bz - 0.85, bz + 0.85, 0, 1.2, 0);
  }
  // free tables with chairs in the middle
  for (let i = 0; i < 5; i++) for (const zz of [-20.5, -24]) {
    const tx = 24 + i * 6;
    K.lathe(tableTop, [[0, 0.7], [0.43, 0.7], [0.455, 0.706], [0.46, 0.72], [0.455, 0.735], [0.43, 0.742], [0, 0.742]], tx, 0, zz, { seg: 40 });
    K.torus(M.chrome, 0.455, 0.011, tx, 0.72, zz, { rx: Math.PI / 2, seg: 40, seg2: 6 });
    K.lathe(M.chrome, [[0, 0], [0.26, 0], [0.28, 0.014], [0.24, 0.03], [0.07, 0.07], [0.045, 0.12], [0.04, 0.6], [0.09, 0.68], [0, 0.7]], tx, 0, zz, { seg: 24 });
    K.box(M.chrome, 0.07, 0.12, 0.07, tx - 0.08, 0.745, zz, { r: 0.008 }); K.lathe(pm('plain', { color: 0xd43a2a, rough: 0.3, interior: true }), [[0, 0], [0.03, 0], [0.032, 0.12], [0.012, 0.16], [0, 0.16]], tx + 0.1, 0.745, zz - 0.05, { seg: 10 });
    for (const a of [0, Math.PI]) dinerChair(K, M, vinyl, tx + Math.cos(a) * 0.85, zz, a === 0 ? -Math.PI / 2 : Math.PI / 2);
    addCollider(tx - 1.2, tx + 1.2, zz - 0.6, zz + 0.6, 0, 1.0, 0);
  }
  // jukebox
  dinerJukebox(K, M, 49.6, -14.4);
  addCollider(49.1, 50.1, -14.8, -13.8, 0, 1.6, 0);
  // pendant lights over the booths + ceiling fans
  const pend = new Kit();
  const shadeM = pm('plain', { color: 0xf0e6cf, emissive: 0xffc27a, emissiveI: 2.2, interior: true });
  for (let i = 0; i < 6; i++) for (const zz of [-16.2, -21, -25]) { pend.cyl(M.blackMetal, 0.005, 0.005, 0.9, 23 + i * 5.4, H - 1.0, zz, { seg: 4 }); pend.lathe(shadeM, [[0.05, 0], [0.19, 0], [0.15, 0.22], [0.06, 0.24]], 23 + i * 5.4, H - 1.2, zz, { seg: 20 }); }
  pend.mesh(par, { cast: false });
  // wall art: retro posters & neon
  const neonTex = (txt, col) => canvasTex(512, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = '800 80px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = col; c.shadowBlur = 22; c.fillStyle = col; c.fillText(txt, w / 2, h / 2 + 4); c.shadowBlur = 8; c.fillStyle = '#fff'; c.globalAlpha = 0.85; c.fillText(txt, w / 2, h / 2 + 4); }, { srgb: true });
  const neons = [];
  const neon = (txt, col, x, y, z, ry, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: neonTex(txt, col), transparent: true, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4), depthWrite: false })); m.position.set(x, y, z); m.rotation.y = ry; par.add(m); neons.push(m); return m; };
  neon('BURGERS', '#ff3c7a', 35, 3.5, z0 + 0.4, 0, 5, 1.25);
  neon('EAT', '#3cf0ff', x0 + 0.4, 3.0, -24, Math.PI / 2, 2, 0.7);
  neon('OPEN', '#7dff5c', 29.2, 2.7, z1 - 0.2, Math.PI, 1.0, 0.32).material.color.setScalar(3);
  // menu boards (emissive screens)
  const boards = [
    menuBoard('BIG STACKS', [['Classic Burger', '$8.50'], ['Double Stack', '$11.00'], ['Chicken Melt', '$9.00'], ['Veggie Deluxe', '$9.50']]),
    menuBoard('SIDES & SHAKES', [['Crispy Fries', '$4.00'], ['Onion Rings', '$5.00'], ['Vanilla Shake', '$5.50'], ['Cola', '$3.00']]),
    menuBoard('COMBOS', [['Classic Combo', '$13.50'], ['Double Combo', '$16.00'], ['Kids Meal', '$7.50'], ['Garden Salad', '$9.00']]),
  ];
  boards.forEach((b, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), b.mat); m.position.set(28 + i * 7, 2.85, z0 + 0.4); par.add(m); b.visible = true; K.box(M.blackMetal, 3.7, 1.45, 0.05, 28 + i * 7, 2.13, z0 + 0.36); });
  // ---- side-wall booths (axis along z) ----
  const sideBooth = (xc, zc) => {
    dinerBooth(K, M, vinyl, tableTop, xc, zc, Math.PI / 2);
    addCollider(xc - 0.85, xc + 0.85, zc - 1.42, zc + 1.42, 0, 1.2, 0);
  };
  for (const zc of [-26.6, -22.3, -18.0]) sideBooth(19.25, zc);
  for (const zc of [-26.6, -22.3]) sideBooth(50.75, zc);
  // checkerboard band above the teal wainscot + warm LED cove under the ceiling
  const band = pm('checker', { color: 0xf1efe8, col2: 0x151517, p: [0.12, 0, 0, 0], rough: 0.4, interior: true });
  K.box(band, x1 - x0 - 0.7, 0.24, 0.02, (x0 + x1) / 2, 1.36, z0 + 0.365);
  for (const sx of [x0 + 0.365, x1 - 0.365]) K.box(band, 0.02, 0.24, z1 - z0 - 0.7, sx, 1.36, (z0 + z1) / 2);
  const cove = pm('plain', { color: 0x050505, emissive: 0xffb070, emissiveI: 2.4, interior: true });
  K.box(cove, x1 - x0 - 1.0, 0.03, 0.07, (x0 + x1) / 2, H - 0.3, z0 + 0.42);
  for (const sx of [x0 + 0.42, x1 - 0.42]) K.box(cove, 0.07, 0.03, z1 - z0 - 1.0, sx, H - 0.3, (z0 + z1) / 2);
  // retro sunburst posters on the side walls
  const posterTex = (l1, l2, c1, c2) => canvasTex(256, 330, (c, w, h) => {
    c.fillStyle = c1; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h * 0.5);
    for (let i = 0; i < 18; i++) { c.rotate(Math.PI / 9); c.fillStyle = i % 2 ? c2 : c1; c.beginPath(); c.moveTo(0, 0); c.lineTo(-46, -260); c.lineTo(46, -260); c.closePath(); c.fill(); }
    c.restore();
    c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(w / 2, h * 0.5, 72, 0, Math.PI * 2); c.fill();
    c.fillStyle = c1; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 38px "Arial Black", Impact, sans-serif'; c.fillText(l1, w / 2, h * 0.5 - 8);
    c.font = '700 21px Arial'; c.fillText(l2, w / 2, h * 0.5 + 26);
    c.fillStyle = '#fff6e0'; c.fillRect(0, h - 46, w, 46); c.fillStyle = c1; c.font = '800 21px Arial'; c.fillText('BIG STACK BURGERS', w / 2, h - 23);
  }, { srgb: true });
  const posters = [['SHAKES', 'thick & cold', '#c8322b', '#e8853a'], ['FRIES', 'golden crisp', '#d8952a', '#c8322b'], ['COLA', 'ice cold', '#1f6f8a', '#3aa6a0'], ['BURGERS', 'stacked high', '#3a7d44', '#d8952a'], ['PIE', 'fresh daily', '#8a3a7a', '#d8952a'], ['COFFEE', 'bottomless', '#4a3020', '#c8322b']];
  const hang = (i, x, z, ry) => {
    const [a, b, c1, c2] = posters[i % posters.length];
    const pm2 = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.22), new THREE.MeshStandardMaterial({ map: posterTex(a, b, c1, c2), roughness: 0.7 }));
    pm2.position.set(x + Math.sin(ry) * 0.016, 2.55, z); pm2.rotation.y = ry; par.add(pm2);      // print sits proud of a slim chrome frame slab
    K.box(M.chrome, 0.02, 1.3, 1.03, x, 1.9, z);
  };
  [-27.6, -21.2, -17.6].forEach((z, i) => hang(i, x0 + 0.385, z, Math.PI / 2));
  [-27.6, -24.5, -21.4, -18.3].forEach((z, i) => hang(i + 3, x1 - 0.385, z, -Math.PI / 2));
  // wall clock over the pass
  const clockTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#f6f2e6'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a1a1a'; c.font = '700 26px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; c.fillText(String(i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); }
    c.strokeStyle = '#1a1a1a'; c.lineCap = 'round'; c.lineWidth = 8; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 20, 128 - 48); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 62, 128 - 26); c.stroke();
    c.strokeStyle = '#c8322b'; c.lineWidth = 2; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 10, 128 + 78); c.stroke();
  }, { srgb: true });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 }));
  clock.position.set(47.5, 3.55, z0 + 0.4); par.add(clock);
  K.torus(chromeS, 0.34, 0.03, 47.5, 3.55, z0 + 0.4, { seg: 40, seg2: 8 });
  K.mesh(par, { reflect: true });
  glassBox(par, 35, 0.85 + 1.35, z1 - 0.16, 30, 2.7, 'z');
  // roof: big illuminated sign on the front parapet (readable from the street), with a stacked-burger icon on top
  const rk = new Kit();
  const ZS = -13.3, SY = H + 0.9;
  const creamP = pm('paint', { color: 0xf3f0e6, rough: 0.4 });
  rk.box(red, 20, 3.2, 0.5, 35, SY, ZS, { r: 0.12, seg: 3 });
  rk.box(creamP, 20.5, 0.16, 0.62, 35, SY + 3.2, ZS, { r: 0.03 }); rk.box(creamP, 20.5, 0.16, 0.62, 35, SY - 0.16, ZS, { r: 0.03 });
  for (const sx of [-1, 1]) rk.box(creamP, 0.16, 3.52, 0.62, 35 + sx * 10.17, SY - 0.16, ZS, { r: 0.03 });
  const ledRim = pm('plain', { color: 0x050505, emissive: 0xfff0d0, emissiveI: 3 });
  rk.box(ledRim, 19.8, 0.05, 0.05, 35, SY + 0.08, ZS + 0.27); rk.box(ledRim, 19.8, 0.05, 0.05, 35, SY + 3.07, ZS + 0.27);
  for (const px of [27, 35, 43]) { rk.box(M.blackMetal, 0.32, 0.55, 0.32, px, H + 0.4, ZS, { r: 0.02 }); rk.box(M.blackMetal, 0.7, 0.05, 0.7, px, H + 0.4, ZS); }
  for (const px of [26, 44]) { rk.strut(M.blackMetal, [px - 1.2, H + 0.4, ZS - 1.4], [px - 0.1, SY + 0.6, ZS - 0.15], 0.05, 0.05, { seg: 6 }); rk.strut(M.blackMetal, [px + 1.2, H + 0.4, ZS - 1.4], [px + 0.1, SY + 0.6, ZS - 0.15], 0.05, 0.05, { seg: 6 }); }
  rk.mesh(par, { reflect: true });
  const signT = canvasTex(1024, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c92c22'); g.addColorStop(1, '#9c1a14'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,240,210,0.85)'; c.lineWidth = 5; c.strokeRect(14, 14, w - 28, h - 28);
    let fs = 110; c.font = `900 ${fs}px "Arial Black", Impact`; while (c.measureText('BIG STACK BURGERS').width > w * 0.86 && fs > 40) { fs -= 4; c.font = `900 ${fs}px "Arial Black", Impact`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#5a0a06'; c.shadowBlur = 0; c.shadowOffsetX = 5; c.shadowOffsetY = 6; c.fillStyle = '#5a0a06'; c.fillText('BIG STACK BURGERS', w / 2, h / 2 + 6);
    c.shadowColor = '#ffb000'; c.shadowBlur = 16; c.shadowOffsetX = 0; c.shadowOffsetY = 0; c.fillStyle = '#fff6e0'; c.fillText('BIG STACK BURGERS', w / 2, h / 2 + 2);
  });
  const signMat = new THREE.MeshBasicMaterial({ map: signT, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 3.0), signMat);
  sign.position.set(35, SY + 1.6, ZS + 0.262); par.add(sign); const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = ZS - 0.262; par.add(sign2);
  // burger icon on top: sesame bun, lettuce ruffle, tomato, cheese, patty, heel
  const burger = new Kit();
  const bunM = pm('paint', { color: 0xd8963a, rough: 0.45, physical: true, clearcoat: 0.3, ccRough: 0.3 });
  const by = SY + 3.36, bx = 35, bz = ZS;
  burger.lathe(bunM, [[0, 0], [1.55, 0], [1.6, 0.1], [1.56, 0.3], [1.34, 0.44], [0, 0.46]], bx, by, bz, { seg: 32 });
  burger.lathe(pm('paint', { color: 0x4a2412, rough: 0.7 }), [[0, 0], [1.68, 0], [1.72, 0.1], [1.72, 0.32], [1.64, 0.42], [0, 0.42]], bx, by + 0.46, bz, { seg: 32 });
  burger.box(pm('paint', { color: 0xf2b820, rough: 0.35 }), 3.5, 0.07, 3.5, bx, by + 0.88, bz, { ry: Math.PI / 4 });
  burger.torus(pm('paint', { color: 0x58a030, rough: 0.55 }), 1.72, 0.14, bx, by + 1.0, bz, { seg: 40, seg2: 8, rx: Math.PI / 2 });
  burger.torus(pm('paint', { color: 0x6cb83a, rough: 0.55 }), 1.62, 0.1, bx, by + 1.06, bz, { seg: 36, seg2: 8, rx: Math.PI / 2 });
  burger.cyl(pm('paint', { color: 0xe83a2a, rough: 0.35 }), 1.55, 1.55, 0.16, bx, by + 1.1, bz, { seg: 32 });
  burger.lathe(bunM, [[0, 0], [1.6, 0], [1.72, 0.2], [1.66, 0.6], [1.32, 1.08], [0.66, 1.34], [0, 1.4]], bx, by + 1.28, bz, { seg: 32 });
  const seed = pm('paint', { color: 0xf6e8c0, rough: 0.5 });
  for (let i = 0; i < 46; i++) { const a = i * 2.399, r = 0.15 + Math.sqrt((i + 0.5) / 46) * 1.15, y = by + 1.28 + 1.4 * (1 - (r / 1.72) ** 2.2) * 0.98 + 0.02; burger.sph(seed, 0.07, bx + Math.cos(a) * r, y, bz + Math.sin(a) * r, { sy: 0.5, seg: 6, seg2: 4, ry: a }); }
  burger.mesh(par, {});
  // lights
  const em = (x, y, z, c, i, d) => LightPool.add({ pos: new THREE.Vector3(x, y, z), color: c, intensity: i, distance: d, levelY: 0, levelRange: 12, zone: 'burger' });
  em(26, 3.2, -20, 0xffd6a0, 60, 14); em(44, 3.2, -20, 0xffd6a0, 60, 14); em(35, 3.4, -32, 0xffe6c4, 90, 12); em(35, 3.0, -15, 0xffd6a0, 50, 10); em(35, 3.2, -33.4, 0xff5a8a, 42, 8); em(49, 1.4, -14.4, 0xffcc60, 40, 6);
  for (let i = 0; i < 6; i++) for (const zz of [-16.2, -21, -25]) em(23 + i * 5.4, H - 1.35, zz, 0xffd0a0, 46, 8);       // one real light per pendant shade
  for (const [x, z] of [[24, -34], [35, -34.4], [46, -34], [19.6, -26], [19.6, -18], [50.4, -26], [50.4, -18], [26, -13], [44, -13]]) em(x, 3.6, z, 0xffc890, 34, 9);   // the warm LED cove washing the walls
  // NPCs
  const npcs = [];
  if (G.people) {
    npcs.push(G.people.add({ x: 35.2, z: -30.4, y0: 0, yaw: 0, shirt: 0xd43a2a, pants: 0x1c1c1c, hair: 0x2a1a10, skin: 0xe0ac86, mode: 'idle' }));   // cashier
    npcs.push(G.people.add({ x: 26.5, z: -33.6, y0: 0, yaw: Math.PI, shirt: 0xf3f0e6, pants: 0x1c1c1c, hair: 0x141010, skin: 0xc68863, mode: 'idle' }));   // cook
    npcs.push(G.people.add({ x: 22.4 + 1.0, z: -15.6, seat: 0.46, yaw: -Math.PI / 2, shirt: 0x2a3a52, pants: 0x3a4256, hair: 0x8a6a3a, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 22.4 + 4.9 - 1.0, z: -15.6, seat: 0.46, yaw: Math.PI / 2, shirt: 0x8a2c34, pants: 0x1c1c1c, hair: 0x141010, skin: 0x9b6a48, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 41.4, z: -15.6, seat: 0.46, yaw: -Math.PI / 2, shirt: 0x2e5a48, pants: 0x3a4256, hair: 0xc9b070, skin: 0xf1c9a5, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 19.25, z: -26.6 - 1.0, seat: 0.46, yaw: 0, shirt: 0xc9a23a, pants: 0x2a2a34, hair: 0x2a1a10, skin: 0xd9a37e, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 19.25, z: -26.6 + 1.0, seat: 0.46, yaw: Math.PI, shirt: 0x5a3a7a, pants: 0x1c1c1c, hair: 0x8a5a2a, skin: 0xf1c9a5, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 50.75, z: -22.3 - 1.0, seat: 0.46, yaw: 0, shirt: 0x3a7a5a, pants: 0x3a4256, hair: 0x141010, skin: 0x8a5a3a, mode: 'idle', sit: true }));
    npcs.push(G.people.add({ x: 28.6, z: -26.6, y0: 0, yaw: 0, shirt: 0x2a3a52, pants: 0x3a3a3a, hair: 0x6a4a2a, skin: 0xe0ac86, mode: 'idle' }));   // waiting at the counter
  }
  // interaction: order at the register
  Interact.add({ pos: new THREE.Vector3(35, 1.4, -27.6), r: 1.6, maxDist: 3.2, label: () => 'Order food at the counter', act: () => G.game?.openBurger?.() });
  Interact.add({ pos: new THREE.Vector3(49.6, 1.0, -14.2), r: 0.7, label: () => 'Play the jukebox', act: () => G.game?.jukebox?.() });
  const inside = (x, z) => x > x0 + 0.3 && x < x1 - 0.3 && z > z0 + 0.3 && z < z1 - 0.3;
  return { par, inside, neons, boards, menu: boards, bounds: { x0, x1, z0, z1 }, door: { x: 30, z: z1 }, entry: { x: 30, z: z1 + 2 } };
}

// ----------------------------------------------------------------------------------------------
// FRESHMART
// ----------------------------------------------------------------------------------------------
export function buildGrocery(scene, glow, ctx) {
  const M = palette(), R = ctx.rand;
  const par = new THREE.Group(); par.name = 'grocery'; scene.add(par);
  const K = new Kit();
  const x0 = 18, x1 = 64, z0 = 12, z1 = 42, H = 6.0;
  const green = pm('paint', { color: 0x2a8f4a, rough: 0.45, wet: 1 });
  const storeWall = pm('plaster', { color: 0xf1f2ee, interior: true });
  const mats = {
    floor: pm('tile', { color: 0xbdbdb8, col2: 0x6a6a68, p: [0.6, 0.6, 0.005, 0], physical: true, clearcoat: 0.4, ccRough: 0.15, interior: true }),
    roof: pm('concrete', { color: 0x777a7c, p: [0, 0, 0, 0], wet: 1 }),
    ceiling: pm('plaster', { color: 0xf4f4f0, interior: true }),
    wall: pm('paint', { color: 0xe8ebe4, rough: 0.6, wet: 1 }),
    knee: pm('concrete', { color: 0x5a5d5e, p: [0, 0, 0, 0], wet: 1 }),
    frame: green,
  };
  const S = shell(K, { x0, x1, z0, z1, h: H, front: 'zmin', door: [39, 43], win: [20, 62], mats });
  // interior skins
  K.box(storeWall, x1 - x0 - 0.7, H - 0.6, 0.03, (x0 + x1) / 2, 0, z1 - 0.34);
  for (const sx of [x0 + 0.34, x1 - 0.34]) K.box(storeWall, 0.03, H - 0.6, z1 - z0 - 0.7, sx, 0, (z0 + z1) / 2);
  // exterior fascia + sign band + canopy
  K.box(green, x1 - x0 + 0.4, 1.4, 0.6, (x0 + x1) / 2, 4.4, z0 - 0.05);
  K.box(pm('paint', { color: 0xf6f6f2, rough: 0.5 }), x1 - x0 + 0.6, 0.12, 0.7, (x0 + x1) / 2, 4.32, z0 - 0.05);
  // entrance canopy: steel slab with a green fascia and coping, recessed downlights, round posts on base plates, diagonal braces
  { const cz = z0 - 1.55, cw = 8.4, cd = 3.3, cy = 3.45;
    const steelC = pm('metal', { color: 0x1d1f21, p: [0, 60, 0, 0], rough: 0.42 });
    const cap = pm('concrete', { color: 0xcdc8ba, wet: 1 });
    K.box(steelC, cw, 0.1, cd, 41, cy, cz, { r: 0.015 });
    K.box(green, cw + 0.1, 0.38, 0.1, 41, cy - 0.1, cz - cd / 2 - 0.02, { r: 0.01 });
    for (const sx of [-1, 1]) K.box(green, 0.1, 0.38, cd + 0.1, 41 + sx * (cw / 2 + 0.02), cy - 0.1, cz, { r: 0.01 });
    K.box(cap, cw + 0.22, 0.04, 0.2, 41, cy + 0.28, cz - cd / 2 - 0.02); for (const sx of [-1, 1]) K.box(cap, 0.2, 0.04, cd + 0.12, 41 + sx * (cw / 2 + 0.02), cy + 0.28, cz);
    K.box(pm('plain', { color: 0x050505, emissive: 0xf4fff4, emissiveI: 3 }), cw - 0.2, 0.02, 0.04, 41, cy - 0.015, cz - cd / 2 + 0.06);        // LED strip under the fascia
    const dl = pm('plain', { color: 0x050505, emissive: 0xfff2d8, emissiveI: 4.5 });
    for (const dx of [-3, -1, 1, 3]) for (const dz of [-0.9, 0.5]) { K.cyl(dl, 0.11, 0.11, 0.02, 41 + dx, cy - 0.015, cz + dz, { seg: 14 }); K.cyl(steelC, 0.14, 0.14, 0.012, 41 + dx, cy - 0.022, cz + dz, { seg: 14 }); }
    for (const sx of [37.4, 44.6]) {
      K.cyl(steelC, 0.09, 0.09, cy, sx, 0.04, z0 - 3.0, { seg: 14 });
      K.cyl(steelC, 0.19, 0.19, 0.04, sx, 0, z0 - 3.0, { seg: 14 }); K.torus(steelC, 0.095, 0.014, sx, 0.22, z0 - 3.0, { rx: Math.PI / 2, seg: 14, seg2: 5 });
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; K.cyl(steelC, 0.014, 0.014, 0.03, sx + Math.cos(a) * 0.14, 0.04, z0 - 3.0 + Math.sin(a) * 0.14, { seg: 6 }); }
      K.strut(steelC, [sx, cy - 0.2, z0 - 3.0], [sx + (sx < 41 ? 0.9 : -0.9), cy - 0.02, z0 - 3.0], 0.03, 0.03, { seg: 6 });
      K.box(steelC, 0.26, 0.12, 0.26, sx, cy - 0.14, z0 - 3.0, { r: 0.02 });
    }
  }
  // sidewalk produce stands: tiered wooden display with crates of fruit and a chalk price board
  { const wood = pm('woodfurn', { color: 0xb8925a, col2: 0x6a4a28, wet: 1 });
    const cols = [0xd8342a, 0xf2b420, 0x3ea85a, 0xe86a20, 0xb0d840, 0x8a3ac8, 0xffe08a];
    const fr = [];
    for (const [sx, k] of [[31.5, 0], [50.5, 3]]) {
      const sz = z0 - 1.25;
      for (const dx of [-1.1, 1.1]) for (const dz of [-0.4, 0.4]) K.box(wood, 0.07, 1.0, 0.07, sx + dx, 0, sz + dz);
      for (let t = 0; t < 3; t++) {
        const y = 0.42 + t * 0.26, back = -0.18 * t;
        K.box(wood, 2.4, 0.04, 0.5, sx, y, sz + back, { rx: -0.12 });
        K.box(wood, 2.4, 0.09, 0.03, sx, y + 0.02, sz + back + 0.24, { r: 0.004 });
        for (let f = 0; f < 18; f++) fr.push({ x: sx - 1.05 + f * 0.125 + (f % 2) * 0.02, y: y + 0.095, z: sz + back + ((f * 37) % 5 - 2) * 0.05, c: cols[(t * 2 + k + Math.floor(f / 5)) % cols.length], s: 0.05 + ((f * 13) % 4) * 0.008 });
      }
      K.box(pm('plain', { color: 0x1c2a22, rough: 0.9 }), 0.7, 0.5, 0.03, sx + 0.9, 1.05, sz - 0.62, { rx: -0.2 }); K.box(wood, 0.76, 0.56, 0.02, sx + 0.9, 1.04, sz - 0.6, { rx: -0.2 });
      K.box(pm('plain', { color: 0x1c2a22, rough: 0.9 }), 0.64, 0.42, 0.012, sx + 0.9, 1.085, sz - 0.64, { rx: -0.2 });
      addCollider(sx - 1.25, sx + 1.25, sz - 0.8, sz + 0.4, 0, 1.2, 0);
    }
    const g = new THREE.SphereGeometry(1, 8, 6); const im = new THREE.InstancedMesh(g, pm('plain', { color: 0xffffff, rough: 0.35 }), fr.length);
    const m = new THREE.Matrix4(), c = new THREE.Color(); fr.forEach((f, i) => { m.compose(new THREE.Vector3(f.x, f.y + f.s, f.z), new THREE.Quaternion(), new THREE.Vector3(f.s, f.s * 0.92, f.s)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(f.c)); }); im.castShadow = true; im.receiveShadow = true; par.add(im);
  }
  // glazing frames
  for (let x = 20; x <= 62; x += 3.5) if (x < 38.5 || x > 43.5) K.box(M.blackMetal, 0.08, 2.7, 0.14, x, 0.85, z0 + 0.16);
  K.box(M.blackMetal, 42, 0.08, 0.14, 41, 3.5, z0 + 0.16); K.box(M.blackMetal, 42, 0.08, 0.14, 41, 0.85, z0 + 0.16);
  // ---- ceiling: LED tubes, ducts ----
  const tube = pm('plain', { color: 0x050505, emissive: 0xf4f8ff, emissiveI: 5.5, interior: true });
  for (let i = 0; i < 9; i++) for (const zz of [17, 23, 29, 35]) K.box(tube, 3.4, 0.05, 0.14, 22.5 + i * 5, H - 0.14, zz);
  for (const zz of [15, 26, 38]) K.cyl(M.steel, 0.28, 0.28, 44, 41, H - 0.6, zz, { rz: Math.PI / 2, cy: true, seg: 14 });
  for (let x = 22; x < 62; x += 6) K.box(M.blackMetal, 0.06, 0.6, 26, x, H - 0.75, 27);
  // ---- shelving: 7 gondolas oriented along z ----
  const shelfM = pm('metal', { color: 0xcfd3d6, p: [1, 40, 0, 0], interior: true });
  const shelfBack = pm('paint', { color: 0xe8eae4, interior: true });
  const gondolas = [];
  const prods = { boxes: [], cans: [], bottles: [], jars: [] };
  const cols = [0xd8342a, 0xf2b420, 0x2e8fd8, 0x3ea85a, 0xf0e6d0, 0x8a3ac8, 0xe86a20, 0x1c1c22, 0xf58ab0, 0x5ad0d0, 0xb0d840, 0xffffff];
  const shelfX = [25.5, 29.5, 33.5, 47.5, 51.5, 55.5, 59.5];
  const zA = 16.5, zB = 37.5;
  for (const gx of shelfX) {
    K.box(shelfM, 1.5, 0.12, zB - zA, gx, 0, (zA + zB) / 2);
    K.box(shelfBack, 0.06, 1.9, zB - zA, gx, 0.1, (zA + zB) / 2);
    for (const side of [-1, 1]) {
      for (let r = 0; r < 5; r++) K.box(shelfM, 0.5, 0.03, zB - zA, gx + side * 0.29, 0.3 + r * 0.34, (zA + zB) / 2);
      K.box(shelfM, 0.03, 0.14, zB - zA, gx + side * 0.54, 0.3, (zA + zB) / 2);
      for (let r = 0; r < 5; r++) {
        let z = zA + 0.2;
        while (z < zB - 0.2) {
          const kr = R(), kind = kr < 0.28 ? 'cans' : kr < 0.45 ? 'bottles' : kr < 0.56 ? 'jars' : 'boxes';
          const w = kind === 'cans' ? 0.085 : kind === 'bottles' ? 0.07 + R() * 0.02 : kind === 'jars' ? 0.08 : 0.1 + R() * 0.08;
          const h = kind === 'cans' ? 0.13 : kind === 'bottles' ? 0.22 + R() * 0.08 : kind === 'jars' ? 0.12 : 0.16 + R() * 0.12;
          const d = kind === 'boxes' ? 0.16 : w;
          const gap = R() < 0.05 ? 0.4 : 0;
          const row = { x: gx + side * (0.3 + (R() - 0.5) * 0.04), y: 0.33 + r * 0.34, z: z + w / 2 + gap, w, h, d, c: cols[Math.floor(R() * cols.length)] };
          prods[kind].push(row);
          z += w + 0.012 + gap;
        }
      }
    }
    // end-cap promo display
    K.box(shelfM, 1.5, 0.9, 0.8, gx, 0.12, zA - 0.5); K.box(green, 1.5, 0.5, 0.05, gx, 1.5, zA - 0.5);
    addCollider(gx - 0.8, gx + 0.8, zA - 0.95, zB + 0.1, 0, 2.0, 0);
    // aisle number sign hanging from the ceiling
    gondolas.push(gx);
  }
  const instBoxes = (list, geo, mat) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((p, i) => { m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(p.d, p.h, p.w)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(p.c)); });
    im.castShadow = false; im.receiveShadow = true; im.matrixAutoUpdate = false; im.updateMatrix(); im.computeBoundingSphere();
    par.add(im);
  };
  const boxG = new RoundedBoxGeometry(1, 1, 1, 2, 0.045); boxG.translate(0, 0.5, 0);
  const canG = new THREE.LatheGeometry([[0, 0], [0.44, 0], [0.5, 0.025], [0.5, 0.955], [0.46, 0.975], [0.46, 0.99], [0.4, 0.99], [0.4, 0.975], [0, 0.975]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  instBoxes(prods.boxes, boxG, pm('product', { color: 0xffffff, rough: 0.4, interior: true }));
  instBoxes(prods.cans, canG, pm('product', { color: 0xffffff, rough: 0.3, metal: 0.3, interior: true }));
  const botG = new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.5, 0.55], [0.4, 0.68], [0.2, 0.76], [0.17, 0.8], [0.17, 0.92], [0.21, 0.93], [0.21, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const jarG = new THREE.LatheGeometry([[0, 0], [0.46, 0], [0.5, 0.03], [0.5, 0.78], [0.45, 0.8], [0.44, 0.83], [0.48, 0.84], [0.48, 0.985], [0.42, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  instBoxes(prods.bottles, botG, pm('product', { color: 0xffffff, rough: 0.2, metal: 0.05, interior: true }));
  instBoxes(prods.jars, jarG, pm('product', { color: 0xffffff, rough: 0.25, interior: true }));
  // ---- produce (west), fridges (back wall), bakery/deli (east) ----
  const crate = pm('woodfurn', { color: 0xb8925a, col2: 0x6a4a28, interior: true });
  const produceCols = [0xd8342a, 0xf2b420, 0x3ea85a, 0xe86a20, 0xb0d840, 0x8a3ac8, 0xffe08a, 0xd85a3a];
  const fruit = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const px = 21.5 + j * 1.5, pz = 15.6 + i * 4.6;
    K.box(crate, 1.3, 0.55, 3.6, px, 0, pz + 1.8, { r: 0.01 });
    K.box(pm('paint', { color: 0x1a5a34, interior: true }), 1.3, 0.04, 3.6, px, 0.55, pz + 1.8);
    // a heaped crate of one kind of produce: apples / oranges / lemons / limes / aubergines ... at real sizes (3-5 cm radius), mounded in the middle
    const ti = (i * 3 + j) % produceCols.length, rad = [0.04, 0.043, 0.032, 0.036, 0.034, 0.028, 0.03, 0.038][ti], sh = [[1, 0.92, 1], [1, 1, 1], [0.88, 0.88, 1.3], [1, 0.95, 1], [1, 1, 1], [0.8, 0.8, 1.9], [0.9, 0.9, 1.4], [1, 0.82, 1]][ti];
    for (let a = 0; a < 11; a++) for (let b = 0; b < 33; b++) {
      const u = (a + 0.5) / 11 - 0.5, v = (b + 0.5) / 33 - 0.5, mound = Math.max(0, 1 - (u * 2) ** 2 * 0.7 - (v * 2) ** 2 * 0.5);
      fruit.push({ x: px + u * 1.2 + (R() - 0.5) * rad * 2.0, y: 0.585 + rad * 0.9 + 0.07 * mound + R() * rad * 0.9, z: pz + 1.8 + v * 3.4 + (R() - 0.5) * rad * 2.0, c: produceCols[ti], s: rad * (0.9 + R() * 0.2), sh, rot: R() * 6.28 });
    }
    addCollider(px - 0.65, px + 0.65, pz, pz + 3.6, 0, 0.7, 0);
  }
  { const g = new THREE.SphereGeometry(1, 9, 6); const im = new THREE.InstancedMesh(g, pm('plain', { color: 0xffffff, rough: 0.35, interior: true }), fruit.length); const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(); fruit.forEach((f, i) => { q.setFromEuler(e.set(0, f.rot, 0)); m.compose(v3.set(f.x, f.y, f.z), q, sc.set(f.s * f.sh[0], f.s * f.sh[1], f.s * f.sh[2])); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(f.c).multiplyScalar(0.85 + R() * 0.3)); }); im.receiveShadow = true; im.castShadow = true; par.add(im); }
  // refrigerated wall (glass doors with glowing interiors)
  const fridgeTex = canvasTex(256, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e8f6ff'); g.addColorStop(1, '#a8d0ea'); c.fillStyle = g; c.fillRect(0, 0, w, h); const cc = ['#e83a3a', '#3a8ae8', '#f0c040', '#4ac06a', '#f2f2f2', '#8a3ac8']; const RR = rng(5); for (let r = 0; r < 6; r++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 60 + r * 74, w, 4); for (let k = 0; k < 9; k++) { c.fillStyle = cc[Math.floor(RR() * cc.length)]; c.fillRect(8 + k * 27, 20 + r * 74 + RR() * 10, 22, 42 - RR() * 10); } } }, { aniso: 4 });
  const fridgeM = new THREE.MeshBasicMaterial({ map: fridgeTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.35) });
  for (let i = 0; i < 12; i++) {
    const fx = 21 + i * 3.4;
    K.box(M.steel, 3.2, 2.5, 0.9, fx, 0, z1 - 0.9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), fridgeM); m.position.set(fx - 0.78, 1.25, z1 - 1.36); m.rotation.y = Math.PI; par.add(m);
    const m2 = m.clone(); m2.position.x = fx + 0.78; par.add(m2);
    K.box(M.chrome, 0.03, 1.4, 0.05, fx - 0.06, 0.55, z1 - 1.4); K.box(M.chrome, 0.03, 1.4, 0.05, fx + 0.06, 0.55, z1 - 1.4);
  }
  addCollider(x0 + 0.4, x1 - 0.4, z1 - 1.5, z1, 0, 2.6, 0);
  // checkout lanes near the entrance (right side)
  const lanes = [];
  for (let i = 0; i < 3; i++) {
    const lx = 44.6 + i * 4.6, lz = 15.5;
    K.box(M.blackMetal, 1.0, 0.9, 3.2, lx, 0, lz + 1.6, { r: 0.02 });                        // belt body
    K.box(M.rubber, 0.8, 0.02, 3.0, lx, 0.9, lz + 1.6);
    K.box(M.blackMetal, 1.0, 0.95, 1.0, lx + 0.9, 0, lz + 3.7, { r: 0.02 }); K.box(M.plasticB, 0.4, 0.3, 0.35, lx + 0.9, 0.95, lz + 3.6); K.box(pm('plain', { color: 0x000000, emissive: 0x88ffb0, emissiveI: 2.2, interior: true }), 0.3, 0.16, 0.01, lx + 0.9, 1.05, lz + 3.42);
    K.box(pm('paint', { color: 0x2a8f4a, interior: true }), 0.06, 2.4, 0.06, lx, 0, lz + 0.2); K.box(pm('plain', { color: 0x000000, emissive: i === 1 ? 0x40ff70 : 0xff4040, emissiveI: 3, interior: true }), 0.5, 0.35, 0.05, lx, 2.2, lz + 0.2);
    addCollider(lx - 0.6, lx + 1.5, lz, lz + 4.4, 0, 1.2, 0);
    lanes.push({ x: lx, z: lz });
  }
  // baskets stack + carts at the entrance (left)
  for (let i = 0; i < 6; i++) K.box(pm('paint', { color: 0xd8342a, rough: 0.5, interior: true }), 0.45, 0.24, 0.32, 21.0, 0.08 + i * 0.2, 14.6, { r: 0.02 });
  // hanging aisle signs
  const aisleNames = ['1 · PASTA & SAUCE', '2 · BREAKFAST', '3 · SNACKS', '4 · DAIRY & EGGS', '5 · DRINKS', '6 · FROZEN', '7 · HOME'];
  const aisleTex = (t) => canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#1e7a3e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '700 44px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, w / 2, h / 2 + 2); });
  shelfX.forEach((gx, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: aisleTex(aisleNames[i]), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) })); m.position.set(gx, 3.5, zA + 3.0); par.add(m); const m2 = m.clone(); m2.rotation.y = Math.PI; m2.position.z += 0.02; par.add(m2); K.box(M.blackMetal, 0.03, H - 3.9, 0.03, gx - 1.1, 3.9, zA + 3.0); K.box(M.blackMetal, 0.03, H - 3.9, 0.03, gx + 1.1, 3.9, zA + 3.0); });
  // banner
  const banner = canvasTex(1024, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#1e7a3e'); g.addColorStop(1, '#7ac040'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '900 92px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FRESH · LOCAL · DAILY', w / 2, h / 2); });
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: banner, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) })); bm.position.set(41, 3.4, z1 - 0.4); bm.rotation.y = Math.PI; par.add(bm);
  K.mesh(par, { reflect: true });
  glassBox(par, 41, 0.85 + 1.35, z0 + 0.16, 42, 2.7, 'z');
  // ---- sliding doors ----
  const doorM = new THREE.MeshPhysicalMaterial({ color: 0x9ab8c4, roughness: 0.04, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 });
  const leaves = [];
  for (const s of [-1, 1]) { const g = new THREE.Group(); const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.6), doorM); lm.position.set(s * 1.0, 1.4, 0); g.add(lm); const fk = new Kit(); fk.box(M.steel, 0.05, 2.62, 0.05, s * 1.96, 0.1, 0); fk.box(M.steel, 1.96, 0.05, 0.05, s * 1.0, 2.68, 0); fk.box(M.steel, 1.96, 0.05, 0.05, s * 1.0, 0.1, 0); fk.mesh(g, {}); g.position.set(41, 0, z0 + 0.2); par.add(g); leaves.push({ g, s }); }
  const doorBlock = addCollider(39, 43, z0 - 0.05, z0 + 0.4, 0, 3, 0);
  const state = { open: 0 };
  // neon-ish exterior sign
  const fasc = canvasTex(2048, 160, (c, w, h) => {
    c.fillStyle = '#2a8f4a'; c.fillRect(0, 0, w, h);
    c.font = '900 118px "Arial Black", Arial'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const tw = c.measureText('FRESHMART').width, x0 = (w - tw) / 2 + 60;
    c.fillStyle = 'rgba(8,50,20,0.55)'; c.fillText('FRESHMART', x0 + 5, h / 2 + 8);
    c.fillStyle = '#ffffff'; c.fillText('FRESHMART', x0, h / 2 + 4);
    // apple + leaf logo
    const lx = x0 - 78, ly = h / 2 + 6;
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(lx - 14, ly, 30, 0, 7); c.arc(lx + 14, ly, 30, 0, 7); c.fill();
    c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(lx + 2, ly - 28); c.quadraticCurveTo(lx + 22, ly - 62, lx + 52, ly - 48); c.quadraticCurveTo(lx + 34, ly - 22, lx + 2, ly - 28); c.fill();
  });
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 1.0), new THREE.MeshBasicMaterial({ map: fasc, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) })); fm.position.set(41, 5.1, z0 - 0.37); fm.rotation.y = Math.PI; par.add(fm);
  // parking lot behind (z 42..104), painted stalls
  const lotMat = pm('asphaltLot', { color: 0xffffff, p: [18, 52, 46, 0], wet: 1 });
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(46, 60), lotMat); lot.rotation.x = -Math.PI / 2; lot.position.set(41, GY + 0.008, 72); lot.receiveShadow = true; lot.layers.enable(1); par.add(lot);
  // ---- lights ----
  const em = (x, y, z, c, i, d) => LightPool.add({ pos: new THREE.Vector3(x, y, z), color: c, intensity: i, distance: d, levelY: 0, levelRange: 12, zone: 'grocery' });
  for (const [x, z] of [[24, 17], [36, 17], [48, 17], [60, 17], [24, 24], [36, 24], [48, 24], [60, 24], [24, 33], [36, 33], [48, 33], [60, 33], [38, 16]]) em(x, H - 0.6, z, 0xf2f6ff, 95, 13);
  em(41, 3.0, z0 - 1.6, 0xfff0d0, 100, 10);
  // NPCs: cashiers, a shopper
  if (G.people) {
    G.people.add({ x: 45.5 + 0.9, z: 19.4, y0: 0, yaw: -Math.PI / 2 - 0.0, shirt: 0x2a8f4a, pants: 0x1c1c1c, hair: 0x5a3a20, skin: 0xe0ac86, mode: 'idle' });
    G.people.add({ x: 55 + 0.9, z: 19.4, y0: 0, yaw: -Math.PI / 2, shirt: 0x2a8f4a, pants: 0x1c1c1c, hair: 0x141010, skin: 0x9b6a48, mode: 'idle' });
    G.people.add({ x: 40, z: 33, y0: 0, yaw: 2.2, shirt: 0xb45a3a, pants: 0x3a4256, hair: 0x8a8a8a, skin: 0xf1c9a5, mode: 'idle' });
    G.people.add({ x: 30.5, z: 26, y0: 0, yaw: 1.0, shirt: 0x4a5a78, pants: 0x1c1c1c, hair: 0x2a1a10, skin: 0xc68863, mode: 'idle' });
  }
  // ---- interactions: shelf categories, checkout ----
  const cats = [
    ['Pantry aisle', 'pantry', 27.5, 26], ['Breakfast aisle', 'breakfast', 31.5, 26], ['Snacks & drinks', 'snacks', 35.5, 26],
    ['Dairy & eggs', 'dairy', 49.5, 26], ['Frozen foods', 'frozen', 53.5, 26], ['Meat & deli', 'meat', 57.5, 26], ['Fresh produce', 'produce', 22.0, 24], ['Bakery', 'bakery', 61, 26],
  ];
  for (const [label, cat, x, z] of cats) Interact.add({ pos: new THREE.Vector3(x, 1.1, z), r: cat === 'produce' ? 3.2 : 2.6, maxDist: 3.4, label: () => `Shop: ${label}`, act: () => G.game?.openGrocery?.(cat) });
  Interact.add({ pos: new THREE.Vector3(46.4, 1.2, 19.6), r: 1.4, maxDist: 3.2, label: () => 'Checkout', act: () => G.game?.checkout?.() });
  const inside = (x, z) => x > x0 + 0.3 && x < x1 - 0.3 && z > z0 + 0.3 && z < z1 - 0.3;
  const out = {
    par, inside, bounds: { x0, x1, z0, z1 }, lanes, entry: { x: 41, z: z0 - 2 },
    update(dt) {
      const P = G.player;
      const near = P && P.level === 0 && Math.abs(P.pos.x - 41) < 3.6 && P.pos.z > z0 - 3.8 && P.pos.z < z0 + 3;
      const allow = !(G.game && G.game.leaveBlocked && G.game.leaveBlocked() && P && P.pos.z > z0 + 0.6);
      state.open += (((near && allow) || (near && P.pos.z < z0 + 0.5) ? 1 : 0) - state.open) * (1 - Math.exp(-dt * 4));
      for (const l of leaves) l.g.position.x = 41 + l.s * state.open * 1.9;
      doorBlock.on = state.open < 0.55;
    },
  };
  return out;
}
