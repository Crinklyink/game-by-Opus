// Kitchen: east-wall run (pantry, sink, range + hood, dishwasher, fridge), upper cabinets,
// waterfall island with stools, appliances, cookware and props.
import * as THREE from 'three';
import { Kit, mat4 } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { finish, colBox, stool } from './furniture.js';

export function buildKitchen(par, y0, ctx) {
  const M = palette();
  const lac = pm('paint', { color: 0x6b7d6e, rough: 0.48, interior: true });       // sage lacquer lowers
  const lacLight = pm('paint', { color: 0xdfd8ca, rough: 0.5, interior: true });
  const handles = M.brass;
  const L = 6.9, RD = 0.62, BH = 0.9;
  const k = new Kit();
  const out = {};

  // ---- toe kick & carcass ----
  k.box(M.blackMetal, L, 0.1, 0.5, L / 2, 0, 0.3);
  const door = (x0, x1, yb, yt, mat, handle = 'bar', hy = null, side = 0) => {
    const w = x1 - x0, h = yt - yb;
    k.box(mat, w - 0.006, h - 0.006, 0.022, (x0 + x1) / 2, yb + 0.003, RD - 0.004, { r: 0.004 });
    k.box(mat, w - 0.11, h - 0.11, 0.008, (x0 + x1) / 2, yb + 0.055, RD + 0.006, { r: 0.002 });   // shaker recess panel
    if (handle === 'bar') {
      const hx = side === 0 ? x1 - 0.06 : x0 + 0.06;
      k.cyl(handles, 0.006, 0.006, 0.18, hx, hy ?? yt - 0.14, RD + 0.035, { cy: true, seg: 8 });
      k.cyl(handles, 0.004, 0.004, 0.03, hx, (hy ?? yt - 0.14) + 0.075, RD + 0.02, { rx: Math.PI / 2, cy: true, seg: 6 });
      k.cyl(handles, 0.004, 0.004, 0.03, hx, (hy ?? yt - 0.14) - 0.075, RD + 0.02, { rx: Math.PI / 2, cy: true, seg: 6 });
    } else if (handle === 'long') {
      k.cyl(handles, 0.007, 0.007, w - 0.2, (x0 + x1) / 2, yt - 0.06, RD + 0.03, { rz: Math.PI / 2, cy: true, seg: 8 });
    }
  };
  const base = (x0, x1) => k.box(M.plasticW, x1 - x0, BH - 0.1, RD - 0.02, (x0 + x1) / 2, 0.1, (RD - 0.02) / 2, { r: 0.002 });

  // pantry (tall)
  k.box(M.plasticW, 0.9, 2.5, RD - 0.02, 0.45, 0.1, RD / 2 - 0.01);
  door(0.0, 0.45, 0.1, 1.3, lacLight, 'bar', 0.95, 1); door(0.45, 0.9, 0.1, 1.3, lacLight, 'bar', 0.95, 0);
  door(0.0, 0.45, 1.3, 2.55, lacLight, 'bar', 1.5, 1); door(0.45, 0.9, 1.3, 2.55, lacLight, 'bar', 1.5, 0);

  // sink section 0.9-2.9
  base(0.9, 2.9);
  door(0.9, 1.9, 0.1, BH, lac, 'bar', 0.75, 1); door(1.9, 2.9, 0.1, BH, lac, 'bar', 0.75, 0);
  // range section 2.9-4.4 : drawer stack under cooktop is replaced by oven
  base(2.9, 4.4);
  k.box(M.steel, 1.42, 0.62, 0.03, 3.65, 0.16, RD + 0.006, { r: 0.006 });
  k.box(M.glassBlack, 1.1, 0.34, 0.01, 3.65, 0.24, RD + 0.026, { r: 0.004 });
  k.cyl(M.steel, 0.012, 0.012, 1.15, 3.65, 0.6, RD + 0.055, { rz: Math.PI / 2, cy: true, seg: 10 });
  for (let i = 0; i < 5; i++) k.cyl(M.blackMetal, 0.016, 0.016, 0.02, 3.2 + i * 0.22, 0.7, RD + 0.025, { rx: Math.PI / 2, cy: true, seg: 14 });
  k.box(M.glassBlack, 0.3, 0.04, 0.005, 3.65, 0.76, RD + 0.012);
  // dishwasher 4.4-5.9
  base(4.4, 5.9);
  door(4.4, 5.9, 0.1, BH, lac, 'long');
  // fridge column 5.9-6.9 (its own module)
  // ---- countertop ----
  k.box(M.quartz, 5.0, 0.035, RD + 0.03, 3.4, BH, (RD + 0.03) / 2, { r: 0.003 });
  // sink cut-out visual: basin + faucet
  k.box(M.steel, 0.72, 0.006, 0.4, 1.9, BH + 0.036, 0.3, { r: 0.002 });         // rim
  k.box(M.blackMetal, 0.66, 0.004, 0.34, 1.9, BH + 0.041, 0.3);                  // dark basin (reads as recess)
  k.tube(M.brass, [[1.9, BH + 0.036, 0.06], [1.9, BH + 0.32, 0.06], [1.9, BH + 0.44, 0.12], [1.9, BH + 0.4, 0.24]], 0.012, { seg: 24, radial: 8 });
  k.cyl(M.brass, 0.028, 0.028, 0.03, 1.9, BH + 0.035, 0.06, { seg: 14 });
  k.cyl(M.brass, 0.008, 0.008, 0.07, 1.98, BH + 0.036, 0.06, { rz: -0.9 });
  // backsplash tile (subway) + shadow gap
  k.box(M.tileSubway, 6.0, 0.62, 0.012, 3.55, BH + 0.035, 0.006);
  // upper cabinets 1.45-2.95 in two tiers
  const up = (x0, x1) => {
    k.box(M.plasticW, x1 - x0, 1.5, 0.34, (x0 + x1) / 2, 1.45, 0.17);
    for (const [yb, yt] of [[1.45, 2.2], [2.2, 2.95]]) {
      const w = (x1 - x0) / (x1 - x0 > 1.2 ? 2 : 1);
      for (let x = x0; x < x1 - 0.01; x += w) door(x, x + w, yb, yt, lacLight, 'bar', yb + 0.14, ((x - x0) / w) % 2 === 0 ? 0 : 1);
    }
  };
  up(0.9, 2.9); up(4.4, 5.9);
  // hood + chimney over the range
  k.box(M.steel, 1.1, 0.2, 0.5, 3.65, 1.55, 0.25, { r: 0.008 });
  k.box(M.steel, 0.5, 1.4, 0.32, 3.65, 1.75, 0.16, { r: 0.006 });
  k.box(M.ledCool, 0.9, 0.006, 0.12, 3.65, 1.548, 0.3);
  // bulkhead above uppers to ceiling
  k.box(M.wall, L, 0.75, 0.36, L / 2, 2.95, 0.18);
  // under-cabinet LED strips
  k.box(M.led, 1.95, 0.008, 0.02, 1.9, 1.44, 0.3);
  k.box(M.led, 1.45, 0.008, 0.02, 5.15, 1.44, 0.3);
  // ---- fridge ----
  const FW = 0.94, FH = 1.86, FD = 0.74, fx = 6.42;
  k.box(M.steel, FW, FH, FD, fx, 0.06, FD / 2, { r: 0.01 });
  k.box(M.blackMetal, FW + 0.01, 0.006, FD + 0.01, fx, 1.25, FD / 2 + 0.002);      // seam fridge/freezer
  k.box(M.blackMetal, 0.006, 1.2, 0.01, fx - FW / 4 - 0.1, 0.67, FD + 0.002);
  for (const sx of [-1, 1]) k.cyl(M.steel, 0.012, 0.012, 0.9, fx + sx * 0.06, 1.24, FD + 0.06, { cy: true, seg: 10 });
  k.box(M.glassBlack, 0.24, 0.32, 0.01, fx + 0.22, 1.48, FD + 0.006, { r: 0.004 });
  k.box(M.ledCool, 0.16, 0.02, 0.004, fx + 0.22, 1.5, FD + 0.012);
  // magnets & photos on the fridge door
  const R = ctx.rand;
  for (let i = 0; i < 5; i++) k.box(pm('paint', { color: [0xe8e0c8, 0xd45b4b, 0x3f7a9b, 0xe0b040, 0xf2f2f2][i], rough: 0.7, interior: true }), 0.09 + R() * 0.05, 0.11 + R() * 0.05, 0.004, fx - 0.3 + (i % 3) * 0.2 + R() * 0.03, 1.4 + Math.floor(i / 3) * 0.2, FD + 0.005, { ry: (R() - 0.5) * 0.3 });
  // ---- cooktop ----
  k.box(M.glassBlack, 0.78, 0.008, 0.52, 3.65, BH + 0.036, 0.3, { r: 0.002 });
  // ---- counter props ----
  // kettle
  k.lathe(M.steel, [[0, 0], [0.085, 0], [0.1, 0.09], [0.075, 0.2], [0.04, 0.22], [0, 0.22]], 5.35, BH + 0.036, 0.22);
  k.box(M.blackMetal, 0.03, 0.14, 0.02, 5.35, BH + 0.06, 0.32, { rx: 0.4 });
  // toaster
  k.box(M.steel, 0.28, 0.18, 0.16, 4.75, BH + 0.036, 0.27, { r: 0.03, seg: 3 });
  k.box(M.blackMetal, 0.2, 0.004, 0.02, 4.75, BH + 0.218, 0.27);
  // knife block + utensil crock
  k.box(M.walnut, 0.12, 0.2, 0.16, 2.72, BH + 0.036, 0.2, { rz: -0.3, r: 0.006 });
  k.lathe(M.ceramic, [[0, 0], [0.06, 0], [0.065, 0.15], [0.055, 0.15]], 0.98, BH + 0.036, 0.2);
  for (let i = 0; i < 5; i++) k.cyl(i % 2 ? M.walnut : M.steel, 0.007, 0.007, 0.22, 0.98 + (R() - 0.5) * 0.05, BH + 0.15, 0.2 + (R() - 0.5) * 0.05, { rx: (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.4, seg: 6 });
  // cutting board + lemon slices
  k.box(M.oak, 0.42, 0.02, 0.28, 3.65 - 0.7, BH + 0.036, 0.33, { ry: 0.08, r: 0.006 });
  // soap dispenser
  k.lathe(M.blackCeramic, [[0, 0], [0.035, 0], [0.04, 0.16], [0.02, 0.18]], 2.5, BH + 0.036, 0.09);
  // olive oil + salt on the range side
  k.lathe(pm('plain', { color: 0x3a4a1c, rough: 0.1, physical: true, clearcoat: 1, interior: true }), [[0, 0], [0.035, 0], [0.04, 0.16], [0.015, 0.22], [0.015, 0.28]], 3.2, BH + 0.036, 0.52);
  const g = finish(par, k, -31.0, y0, 24.6, -Math.PI / 2);
  out.group = g;

  // ---- appliance interaction anchors (world) ----
  const wp = (lx, ly, lz) => new THREE.Vector3(-31.0 - lz, y0 + ly, 24.6 + lx);
  out.fridgePos = wp(fx, 1.0, 0.9);
  out.stovePos = wp(3.65, 1.0, 0.45);
  out.sinkPos = wp(1.9, 1.05, 0.35);
  out.coffeePos = wp(5.1, 1.2, 0.3);
  out.microPos = wp(0.45, 1.2, 0.3);
  out.underCabLights = [wp(1.9, 1.4, 0.3), wp(5.15, 1.4, 0.3)];
  out.hoodLight = wp(3.65, 1.45, 0.3);
  colBox(-31.3, 28.05, 0.7, 6.9, 0, y0, y0 + 2.6);

  // ---- island ----
  const ik = new Kit();
  const IL = 3.6, ID = 0.72;
  ik.box(M.blackMetal, IL - 0.2, 0.09, ID - 0.15, IL / 2, 0, ID / 2);
  ik.box(M.walnut, IL, BH - 0.09, ID, IL / 2, 0.09, ID / 2, { r: 0.006 });
  for (let i = 0; i < 4; i++) { const x0 = 0.1 + i * 0.85; ik.box(M.blackMetal, 0.006, 0.7, 0.006, x0, 0.16, ID + 0.003); ik.cyl(M.brass, 0.007, 0.007, 0.15, x0 + 0.42, 0.7, ID + 0.03, { rz: Math.PI / 2, cy: true, seg: 8 }); }
  ik.box(M.marbleW, IL + 0.06, 0.045, 1.28, IL / 2, BH, 0.6, { r: 0.004 });            // top with overhang on front (+z)
  ik.box(M.marbleW, 0.05, BH, 1.22, -0.005 + 0.0, 0.0, 0.62 - 0.0, {});              // waterfall side (north)
  ik.box(M.marbleW, 0.05, BH, 1.22, IL + 0.005, 0.0, 0.62, {});                        // (south)
  // fruit bowl with fruit + book
  ik.lathe(M.oak, [[0, 0], [0.12, 0.004], [0.2, 0.07], [0.21, 0.085], [0.195, 0.085], [0.11, 0.03], [0, 0.02]], 1.2, BH + 0.045, 0.9);
  const fruits = [0xc63a2c, 0xe08a2a, 0x8cc43f, 0xd94a3c, 0xe8c03a];
  for (let i = 0; i < 6; i++) ik.sph(pm('plain', { color: fruits[i % 5], rough: 0.35, interior: true }), 0.042, 1.2 + Math.cos(i * 1.05) * 0.08, BH + 0.12 + (i % 2) * 0.03, 0.9 + Math.sin(i * 1.05) * 0.08, { sy: 0.92 });
  ik.box(M.paper, 0.32, 0.03, 0.24, 2.4, BH + 0.045, 0.85, { ry: 0.25, r: 0.004 });
  ik.box(M.mustard, 0.325, 0.008, 0.245, 2.4, BH + 0.045, 0.85, { ry: 0.25 });
  ik.lathe(M.ceramic, [[0, 0], [0.05, 0], [0.07, 0.1], [0.04, 0.2], [0.03, 0.22], [0.034, 0.23], [0.026, 0.22]], 2.7, BH + 0.045, 0.7);
  for (let i = 0; i < 3; i++) ik.tube(M.leaf, [[2.7, BH + 0.25, 0.7], [2.7 + (i - 1) * 0.06, BH + 0.5, 0.7 + (i - 1) * 0.04], [2.7 + (i - 1) * 0.12, BH + 0.72 + i * 0.04, 0.7]], 0.004, { seg: 8, radial: 4 });
  // stools
  for (let i = 0; i < 3; i++) stool(ik, M, 0.75 + i * 1.05, 1.55);
  const ig = finish(par, ik, -33.0, y0, 26.4, -Math.PI / 2);
  colBox(-33.7, 28.2, 1.6, IL, 0, y0, y0 + 1.0);
  out.island = ig;
  out.pendantXZ = [[-33.85, 27.1], [-33.85, 28.2], [-33.85, 29.3]];
  return out;
}
