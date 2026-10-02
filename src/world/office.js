// Trading desk (3 monitors), office chair, floor-to-ceiling bookshelf with rolling ladder.
import * as THREE from 'three';
import { Kit, mat4 } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { canvasTex } from '../gfx/noise.js';
import { finish, colBox, bookRun, snakePlant, trailingPlant, tableLamp } from './furniture.js';
import { makeScreen, drawChartScreen } from './screens.js';

export function officeChair(par, y0, x, z, ry) {
  const M = palette(), k = new Kit();
  // five-star base with casters, gas lift, seat, mesh back, arms
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box(M.blackMetal, 0.32, 0.03, 0.045, Math.cos(a) * 0.16, 0.06, Math.sin(a) * 0.16, { ry: -a, r: 0.01 });
    k.sph(M.rubber, 0.028, Math.cos(a) * 0.31, 0.03, Math.sin(a) * 0.31, { seg: 10, seg2: 8 });
  }
  k.cyl(M.chrome, 0.026, 0.026, 0.32, 0, 0.1, 0, { seg: 12 });
  k.cyl(M.blackMetal, 0.045, 0.045, 0.06, 0, 0.42, 0, { seg: 14 });
  k.pillow(M.charcoal, 0.5, 0.1, 0.5, 0, 0.44, 0.02, { e: 0.6 });
  k.box(M.blackMetal, 0.05, 0.4, 0.04, 0, 0.5, -0.22, { rx: -0.1 });
  // mesh back: curved dark panel with light frame
  k.box(pm('plain', { color: 0x1a1b1e, rough: 0.9, interior: true }), 0.46, 0.5, 0.03, 0, 0.72, -0.27, { r: 0.012, rx: -0.12 });
  k.box(M.blackMetal, 0.5, 0.05, 0.04, 0, 1.2, -0.28, { r: 0.015, rx: -0.12 });
  for (const s of [-1, 1]) {
    k.box(M.blackMetal, 0.04, 0.24, 0.04, s * 0.27, 0.5, -0.02);
    k.box(M.plasticB, 0.06, 0.03, 0.26, s * 0.27, 0.72, 0.05, { r: 0.012 });
  }
  const g = finish(par, k, x, y0, z, ry);
  return g;
}

export function buildDesk(par, y0, x, z, ry, ctx) {
  const M = palette(), k = new Kit(), out = { screens: [] };
  const W = 3.0, D = 0.86, top = 0.74;
  k.box(M.walnut, W, 0.045, D, 0, top - 0.045, 0, { r: 0.008 });
  // legs: two black steel U-frames
  for (const s of [-1, 1]) {
    k.box(M.blackMetal, 0.04, top - 0.05, 0.04, s * (W / 2 - 0.15), 0, D / 2 - 0.1, { r: 0.006 });
    k.box(M.blackMetal, 0.04, top - 0.05, 0.04, s * (W / 2 - 0.15), 0, -D / 2 + 0.1, { r: 0.006 });
    k.box(M.blackMetal, 0.04, 0.04, D - 0.12, s * (W / 2 - 0.15), 0.02, 0, { r: 0.006 });
    k.box(M.blackMetal, 0.04, 0.04, D - 0.12, s * (W / 2 - 0.15), top - 0.1, 0, { r: 0.006 });
  }
  k.box(M.blackMetal, W - 0.4, 0.14, 0.02, 0, top - 0.24, -D / 2 + 0.08);          // modesty rail
  k.box(M.blackMetal, W - 0.6, 0.06, 0.1, 0, top - 0.1, -D / 2 + 0.2, { r: 0.01 }); // cable tray
  // desk mat, keyboard, mouse
  k.box(pm('fabric', { color: 0x24262b, interior: true }), 1.0, 0.004, 0.42, 0.0, top, 0.22, { r: 0.002 });
  const kbTex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#17181b'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 5; r++) for (let i = 0; i < 16; i++) { c.fillStyle = (r + i) % 7 === 0 ? '#3a3f4a' : '#2a2d34'; c.fillRect(6 + i * 15, 6 + r * 16, 13, 13); }
  });
  const kbMat = pm('plain', { color: 0xffffff, rough: 0.45, interior: true }).clone();
  kbMat.map = kbTex; kbMat.needsUpdate = true;
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.022, 0.15), [M.plasticB, M.plasticB, kbMat, M.plasticB, M.plasticB, M.plasticB]);
  kb.position.set(-0.05, top + 0.011, 0.26); kb.castShadow = true;
  k.box(M.plasticB, 0.062, 0.03, 0.105, 0.42, top, 0.24, { r: 0.014, seg: 3, ry: 0.15 });
  // lamp (articulated brass)
  k.cyl(M.brass, 0.07, 0.08, 0.02, 1.3, top, -0.15, { seg: 20 });
  k.tube(M.brass, [[1.3, top + 0.02, -0.15], [1.3, top + 0.35, -0.15], [1.05, top + 0.6, -0.1]], 0.008, { seg: 20, radial: 6 });
  k.lathe(M.brass, [[0.0, 0], [0.09, 0.0], [0.05, 0.11], [0.0, 0.11]], 0.98, top + 0.5, -0.08, { rz: 0.3 });
  // headphones on stand
  k.cyl(M.brass, 0.05, 0.05, 0.015, -1.3, top, 0.05, { seg: 14 });
  k.cyl(M.brass, 0.008, 0.008, 0.28, -1.3, top + 0.015, 0.05, { seg: 8 });
  k.torus(M.plasticB, 0.09, 0.012, -1.3, top + 0.3, 0.05, { rx: 0, ry: 0, rz: 0 });
  for (const s of [-1, 1]) k.cyl(M.plasticB, 0.045, 0.045, 0.04, -1.3 + s * 0.09, top + 0.29, 0.05, { rz: Math.PI / 2, cy: true, seg: 16 });
  // mug, notebook, pen
  k.lathe(M.ceramic, [[0, 0], [0.04, 0], [0.042, 0.09], [0.036, 0.09], [0.036, 0.005]], -1.02, top, 0.3);
  k.box(M.paper, 0.2, 0.012, 0.28, 1.06, top, 0.28, { ry: -0.25, r: 0.003 });
  k.box(M.rust, 0.205, 0.006, 0.285, 1.06, top, 0.28, { ry: -0.25 });
  k.cyl(M.blackMetal, 0.005, 0.005, 0.14, 1.1, top + 0.013, 0.32, { rz: Math.PI / 2, ry: 0.4, cy: true, seg: 6 });
  snakePlant(k, M, -1.25, top, -0.2, 11, 0.55);
  // three monitors on an arc centred on the seated eye (R = 1.1 m, eye 1.05 m out from the desk centre), each on its own stand and
  // tilted to face the eye; bottom edge 12 cm above the desk, centre a touch below eye height
  const mw = 0.64, mh = 0.37, mt = 0.022, bez = 0.011, R = 1.1, eyeZ = 1.05;
  const g0 = new THREE.Group();
  [{ phi: -0.625, mode: 1, seed: 1 }, { phi: 0, mode: 0, seed: 0 }, { phi: 0.625, mode: 2, seed: 2 }].forEach((c) => {
    const px = R * Math.sin(c.phi), pz = eyeZ - R * Math.cos(c.phi), yaw = -c.phi;
    const local = new Kit();
    // local origin = centre of the panel (Kit boxes are bottom-anchored unless cy is set; the screen plane is centred, so everything here is too)
    const deskY = -(0.12 + mh / 2);
    local.box(M.plasticB, mw, mh, mt, 0, 0, 0, { r: 0.006, seg: 3, cy: true });                          // panel + bezel
    local.box(M.blackMetal, mw * 0.55, mh * 0.6, 0.024, 0, -mh * 0.04, -mt / 2 - 0.011, { r: 0.008, cy: true });   // rear housing
    local.box(M.blackMetal, 0.05, -deskY - 0.06, 0.022, 0, deskY, -0.05, { r: 0.004 });                  // neck: foot up into the housing
    local.box(M.blackMetal, 0.28, 0.012, 0.2, 0, deskY, -0.04, { r: 0.005 });                             // foot on the desk
    local.box(M.chrome, 0.012, 0.004, 0.006, mw / 2 - 0.04, -mh / 2 + 0.003, mt / 2, { cy: true });       // power LED on the bottom bezel
    const grp = new THREE.Group();
    local.mesh(grp, { occ: false });
    const scr = makeScreen(512, 300, drawChartScreen, { fps: 3 });
    scr.seed = c.seed; scr.mode = c.mode; scr.visible = true;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(mw - 2 * bez, mh - 2 * bez), scr.mat);
    pl.position.z = mt / 2 + 0.0008;
    grp.add(pl);
    grp.position.set(px, top + 0.12 + mh / 2, pz);
    grp.rotation.set(-0.05, yaw, 0, 'YXZ');
    g0.add(grp);
    out.screens.push(scr);
  });
  const g = finish(par, k, x, y0, z, ry);
  g.add(kb); g.add(g0);
  colBox(x, z, W, D, ry, y0, y0 + 0.8);
  out.group = g;
  out.deskPos = new THREE.Vector3(x, y0 + 1.15, z + 0.1);
  out.lampPos = new THREE.Vector3(x + 0.98, y0 + top + 0.5, z - 0.1);
  return out;
}

export function buildBookshelf(par, y0, cx, z, W = 3.5, H = 3.15, ctx) {
  const M = palette(), k = new Kit(), R = ctx.rand;
  const D = 0.36;
  // carcass facing north (-z): front at local +z? we place against south wall, front toward -z => rotate by PI
  k.box(M.walnut, 0.04, H, D, -W / 2 + 0.02, 0, 0, { r: 0.004 });
  k.box(M.walnut, 0.04, H, D, W / 2 - 0.02, 0, 0, { r: 0.004 });
  k.box(pm('woodfurn', { color: 0x3b2413, col2: 0x1b0d05, interior: true }), W, H, 0.02, 0, 0, -D / 2 + 0.01);
  const shelves = [0.0, 0.42, 0.84, 1.26, 1.68, 2.1, 2.52, 2.94];
  for (const sy of shelves) k.box(M.walnut, W - 0.06, 0.035, D, 0, sy, 0, { r: 0.004 });
  // vertical dividers
  for (const dx of [-W / 6, W / 6]) k.box(M.walnut, 0.025, 2.9, D - 0.02, dx, 0.035, 0.0);
  // integrated shelf lighting strips
  for (const sy of shelves.slice(1)) k.box(M.led, W - 0.08, 0.006, 0.012, 0, sy - 0.008, D / 2 - 0.03);
  const g = finish(par, k, cx, y0, z, Math.PI);
  // books
  const cols = [0x8c3b2f, 0x2f4a5c, 0xc9a24a, 0x3e5a47, 0xe6dfd0, 0x1f1f24, 0x6b4a72, 0xa66a3a, 0x9aa5ad, 0x2a3a66, 0xd0cbbf, 0x6d2f3a];
  const seg = W / 3;
  for (let si = 0; si < 7; si++) {
    const sy = shelves[si] + 0.035;
    for (let c = 0; c < 3; c++) {
      const sx = cx - (c - 1) * seg;        // shelf group is rotated by PI so x flips
      const len = seg - 0.06;
      const kind = R();
      if (kind < 0.7 || si < 2) {
        const run = bookRun(par, y0, sx, y0 + sy, z - 0.02, Math.PI, len, 0.34, 0.26, R, cols);
        // decor object standing in the gap at the end of the run
        if (len - run.end > 0.16 && R() < 0.8) {
          const dk = new Kit();
          const t = R();
          if (t < 0.34) dk.lathe(M.ceramic, [[0, 0], [0.05, 0], [0.07, 0.11], [0.035, 0.2], [0.028, 0.22]], 0, 0, 0);
          else if (t < 0.67) { dk.sph(M.brass, 0.05, 0, 0.05, 0); dk.sph(M.marbleD, 0.06, 0.05, 0.05, 0.02); }
          else dk.box(M.rust, 0.14, 0.2, 0.03, 0, 0, 0, { ry: 0.3, r: 0.004 });
          finish(par, dk, sx - (run.end + 0.08 - len / 2), y0 + sy, z - 0.02, 0);
        }
      } else if (kind < 0.85) {
        const dk = new Kit();
        trailingPlant(dk, M, 0, 0.22, 0, Math.floor(R() * 100));
        finish(par, dk, sx, y0 + sy, z - 0.05, 0);
      } else {
        const dk = new Kit();
        dk.box(M.blackMetal, 0.3, 0.22, 0.02, 0, 0, 0, { r: 0.004 });
        dk.box(M.paper, 0.26, 0.18, 0.005, 0, 0.02, 0.012);
        finish(par, dk, sx, y0 + sy, z - 0.1, 0);
      }
    }
  }
  // globe on the top shelf-left
  const gk = new Kit();
  gk.cyl(M.brass, 0.05, 0.06, 0.02, 0, 0, 0, { seg: 16 });
  gk.cyl(M.brass, 0.008, 0.008, 0.18, 0, 0.02, 0, { seg: 8 });
  gk.sph(pm('plain', { color: 0x4a7a9b, rough: 0.5, interior: true }), 0.14, 0, 0.32, 0, { seg: 24, seg2: 16 });
  gk.torus(M.brass, 0.15, 0.006, 0, 0.32, 0, { rx: 0.3, rz: 0.4 });
  finish(par, gk, cx + 1.1, y0 + 2.945, z - 0.06, 0);
  // rolling library ladder: a brass rail along the front of the top shelf, and an oak ladder hooked on it that leans back onto the shelves
  const lk = new Kit();
  const rz = D / 2 + 0.07, ry0 = 2.78;                                  // rail line (local; +z = into the room)
  lk.strut(M.brass, [-W / 2 + 0.03, ry0, rz], [W / 2 - 0.03, ry0, rz], 0.011, 0.011, { seg: 8 });
  for (const sx of [-1, 1]) lk.strut(M.brass, [sx * (W / 2 - 0.05), ry0, rz], [sx * (W / 2 - 0.05), ry0, D / 2], 0.009, 0.009, { seg: 6 });
  for (const sx of [-W / 6, W / 6]) lk.strut(M.brass, [sx, ry0, rz], [sx, ry0, D / 2], 0.009, 0.009, { seg: 6 });
  const lx = -0.7, foot = 0.62, half = 0.23;                            // ladder x position (local), foot distance out from the rail, half width
  const top = [lx, ry0 - 0.04, rz], bot = [lx, 0.0, rz + foot];
  for (const sx of [-1, 1]) {
    lk.strut(M.oak, [top[0] + sx * half, top[1], top[2] - 0.02], [bot[0] + sx * half, bot[1] + 0.03, bot[2]], 0.019, 0.021, { seg: 8 });
    lk.cyl(M.blackMetal, 0.03, 0.03, 0.025, bot[0] + sx * half, 0.03, bot[2] + 0.005, { rz: Math.PI / 2, cy: true, seg: 14 });          // castor wheels
    lk.box(M.brass, 0.03, 0.09, 0.035, top[0] + sx * half, ry0 - 0.02, rz - 0.01, { r: 0.004 });                                       // hooks over the rail
    lk.cyl(M.blackMetal, 0.02, 0.02, 0.012, top[0] + sx * half, ry0 + 0.0, rz + 0.025, { rx: Math.PI / 2, cy: true, seg: 12 });       // rail wheels
  }
  const rungs = 9;
  for (let i = 0; i < rungs; i++) {
    const t = 0.1 + (i / (rungs - 1)) * 0.82, y = top[1] + (bot[1] - top[1]) * t, zz = top[2] - 0.02 + (bot[2] - top[2] + 0.02) * t;
    lk.strut(M.oak, [lx - half, y, zz], [lx + half, y, zz], 0.014, 0.014, { seg: 8 });
  }
  finish(par, lk, cx, y0, z, Math.PI);
  colBox(cx, z - 0.15, W, 0.4, 0, y0, y0 + H);
  return { group: g, pos: new THREE.Vector3(cx, y0 + 1.5, z - 0.5) };
}
