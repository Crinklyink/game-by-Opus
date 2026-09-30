// Kitchen: east-wall run (pantry with microwave, sink, range + hood, dishwasher, fridge), upper cabinets,
// fluted waterfall island with stools, appliances, cookware and props.
import * as THREE from 'three';
import { Kit, mat4 } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { rng } from '../core/util.js';
import { finish, colBox, stool } from './furniture.js';
import { shakerDoor, pullBar, flutes, mug, bookStack, branchVase, plate, cushion, stemGlass } from './shapes.js';
import { leafGeometry } from './kit.js';

export function buildKitchen(par, y0, ctx) {
  const M = palette();
  const lac = pm('paint', { color: 0x6b7d6e, rough: 0.46, interior: true });       // sage lacquer lowers
  const lacLight = pm('paint', { color: 0xdfd8ca, rough: 0.48, interior: true });
  const carcass = pm('paint', { color: 0x2b2c2e, rough: 0.7, interior: true });
  const handles = M.brass;
  const L = 6.9, RD = 0.62, BH = 0.9;
  const k = new Kit();
  const out = {};
  const R = ctx.rand;

  // ---- toe kick & carcass ----
  k.box(M.blackMetal, L, 0.1, 0.5, L / 2, 0, 0.3);
  const door = (x0, x1, yb, yt, mat, handle = 'bar', hy = null, side = 0) => {
    const w = x1 - x0 - 0.006, h = yt - yb - 0.006, cx = (x0 + x1) / 2;
    const o = { pull: handles, pullSide: side };
    if (handle === 'none') o.pull = null;
    else if (handle === 'long') { o.pullLen = w - 0.24; o.pullY = h - 0.06; }
    else { o.pullVert = true; o.pullLen = 0.2; o.pullX = (side === 0 ? 1 : -1) * (w / 2 - 0.05); o.pullY = (hy ?? yt - 0.14) - yb; }
    shakerDoor(k, mat, w, h, cx, yb + 0.003, RD - 0.004, o);
  };
  const base = (x0, x1) => k.box(carcass, x1 - x0, BH - 0.1, RD - 0.02, (x0 + x1) / 2, 0.1, (RD - 0.02) / 2, { r: 0.002 });

  // pantry (tall) with a built-in microwave niche
  k.box(carcass, 0.9, 2.5, RD - 0.02, 0.45, 0.1, RD / 2 - 0.01);
  door(0.0, 0.45, 0.1, 0.95, lacLight, 'bar', 0.6, 1); door(0.45, 0.9, 0.1, 0.95, lacLight, 'bar', 0.6, 0);
  door(0.0, 0.45, 1.36, 2.55, lacLight, 'bar', 1.6, 1); door(0.45, 0.9, 1.36, 2.55, lacLight, 'bar', 1.6, 0);
  k.box(M.steel, 0.86, 0.36, 0.06, 0.45, 0.98, RD - 0.025, { r: 0.006 });                    // microwave body in a niche
  k.box(M.glassBlack, 0.56, 0.28, 0.01, 0.34, 1.02, RD + 0.008, { r: 0.004 });
  k.box(M.blackMetal, 0.2, 0.28, 0.01, 0.76, 1.02, RD + 0.008, { r: 0.004 });
  k.box(M.ledCool, 0.08, 0.02, 0.004, 0.76, 1.28, RD + 0.014);
  for (let i = 0; i < 6; i++) k.box(M.steel, 0.026, 0.026, 0.006, 0.7 + (i % 2) * 0.05, 1.05 + Math.floor(i / 2) * 0.05, RD + 0.014, { r: 0.004 });
  pullBar(k, M.steel, 0.66 - 0.04, 1.02, RD + 0.012, 0.26, true);

  // sink section 0.9-2.9
  base(0.9, 2.9);
  door(0.9, 1.9, 0.1, BH, lac, 'bar', 0.7, 1); door(1.9, 2.9, 0.1, BH, lac, 'bar', 0.7, 0);
  // range section 2.9-4.4: oven under the cooktop
  base(2.9, 4.4);
  k.box(M.steel, 1.42, 0.7, 0.03, 3.65, 0.14, RD + 0.006, { r: 0.008 });
  k.box(M.glassBlack, 1.1, 0.38, 0.01, 3.65, 0.2, RD + 0.026, { r: 0.004 });
  k.box(M.steel, 1.42, 0.05, 0.03, 3.65, 0.14, RD + 0.006);
  k.cyl(M.steel, 0.013, 0.013, 1.15, 3.65, 0.62, RD + 0.058, { rz: Math.PI / 2, cy: true, seg: 12 });
  for (const sx of [-1, 1]) k.cyl(M.steel, 0.007, 0.007, 0.05, 3.65 + sx * 0.56, 0.62, RD + 0.033, { rx: Math.PI / 2, cy: true, seg: 8 });
  for (let i = 0; i < 5; i++) {
    const kx = 3.2 + i * 0.22;
    k.cyl(M.blackMetal, 0.018, 0.016, 0.026, kx, 0.79, RD + 0.026, { rx: Math.PI / 2, cy: true, seg: 16 });
    k.box(M.steel, 0.003, 0.014, 0.004, kx, 0.79 + 0.008, RD + 0.041);
  }
  k.box(M.glassBlack, 0.34, 0.04, 0.006, 3.65, 0.71, RD + 0.008, { r: 0.002 });
  k.box(M.ledCool, 0.1, 0.012, 0.004, 3.65, 0.712, RD + 0.012);
  // dishwasher 4.4-5.9
  base(4.4, 5.9);
  door(4.4, 5.9, 0.1, BH, lac, 'long');
  k.box(M.steel, 1.2, 0.04, 0.012, 5.15, BH - 0.055, RD + 0.014, { r: 0.004 });
  // ---- countertop, with a real undermount cut-out ----
  const CT = 0.035, CD = RD + 0.03, cz = CD / 2;
  const sx0 = 1.54, sx1 = 2.26, sz0 = 0.13, sz1 = 0.5;
  k.box(M.quartz, sx0 - 0.9, CT, CD, (0.9 + sx0) / 2, BH, cz, { r: 0.003 });
  k.box(M.quartz, 5.9 - sx1, CT, CD, (sx1 + 5.9) / 2, BH, cz, { r: 0.003 });
  k.box(M.quartz, sx1 - sx0, CT, sz0, (sx0 + sx1) / 2, BH, sz0 / 2, { r: 0.003 });
  k.box(M.quartz, sx1 - sx0, CT, CD - sz1, (sx0 + sx1) / 2, BH, (sz1 + CD) / 2, { r: 0.003 });
  // basin: steel walls, sloped floor with drain, dish rack + tap set
  const bw = sx1 - sx0 - 0.02, bd = sz1 - sz0 - 0.02, bcx = (sx0 + sx1) / 2, bcz = (sz0 + sz1) / 2, bh = 0.22;
  k.box(M.steel, bw, bh, 0.008, bcx, BH - bh + CT, sz0 + 0.014, { r: 0.002 }); k.box(M.steel, bw, bh, 0.008, bcx, BH - bh + CT, sz1 - 0.014, { r: 0.002 });
  k.box(M.steel, 0.008, bh, bd, sx0 + 0.014, BH - bh + CT, bcz, { r: 0.002 }); k.box(M.steel, 0.008, bh, bd, sx1 - 0.014, BH - bh + CT, bcz, { r: 0.002 });
  k.box(M.steel, bw, 0.008, bd, bcx, BH - bh + CT, bcz);
  k.cyl(M.blackMetal, 0.035, 0.035, 0.004, bcx, BH - bh + CT + 0.008, bcz, { seg: 16 });
  k.tube(M.steel, [[bcx, BH + CT, 0.065], [bcx, BH + 0.3, 0.065], [bcx + 0.0, BH + 0.42, 0.11], [bcx, BH + 0.38, 0.25], [bcx, BH + 0.33, 0.27]], 0.0125, { seg: 30, radial: 10 });
  k.cyl(M.steel, 0.03, 0.03, 0.05, bcx, BH + CT, 0.065, { seg: 16 });
  k.strut(M.steel, [bcx + 0.03, BH + CT + 0.03, 0.065], [bcx + 0.11, BH + CT + 0.1, 0.065], 0.008, 0.008, { seg: 8 });
  k.cyl(M.blackCeramic, 0.026, 0.028, 0.14, 2.42, BH + CT, 0.09, { seg: 16 }); k.cyl(M.steel, 0.008, 0.008, 0.06, 2.42, BH + CT + 0.14, 0.09, { seg: 6 });    // soap pump
  k.box(pm('plain', { color: 0xe6c94a, rough: 0.9, interior: true }), 0.09, 0.03, 0.06, 2.42, BH + CT, 0.2, { r: 0.008, ry: 0.4 });                          // sponge
  // backsplash tile (subway) with switches + sockets, shadow gap
  k.box(M.tileSubway, 6.0, 0.62, 0.012, 3.55, BH + 0.035, 0.006);
  for (const sxx of [1.1, 2.6, 4.6, 5.4]) { k.box(M.plasticW, 0.075, 0.075, 0.008, sxx, BH + 0.22, 0.016, { r: 0.004 }); k.box(M.plasticB, 0.012, 0.03, 0.004, sxx - 0.012, BH + 0.22, 0.021); k.box(M.plasticB, 0.012, 0.03, 0.004, sxx + 0.012, BH + 0.22, 0.021); }
  // upper cabinets 1.45-2.95 in two tiers
  const up = (x0, x1) => {
    k.box(carcass, x1 - x0, 1.5, 0.34, (x0 + x1) / 2, 1.45, 0.17);
    for (const [yb, yt] of [[1.45, 2.2], [2.2, 2.95]]) {
      const w = (x1 - x0) / (x1 - x0 > 1.2 ? 2 : 1);
      for (let x = x0; x < x1 - 0.01; x += w) {
        const lower = yb === 1.45, side = ((x - x0) / w) % 2 === 0 ? 0 : 1;
        door(x, x + w, yb, yt, lacLight, 'bar', lower ? yt - 0.16 : yb + 0.16, side);
      }
    }
  };
  up(0.9, 2.9); up(4.4, 5.9);
  // open glass shelf above the sink window-side: cups + plates visible between uppers
  k.box(M.oak, 1.5, 0.035, 0.3, 3.65 + 0.0, 2.15, 0.15 - 0.0, { r: 0.004 });
  const shelfY = 2.19;
  for (let i = 0; i < 7; i++) plate(k, M.ceramic, 3.14, shelfY + i * 0.016, 0.15, 0.115);                                   // stacked plates
  for (let i = 0; i < 4; i++) k.lathe(M.ceramic, [[0, 0], [0.05, 0], [0.09, 0.03], [0.1, 0.07], [0.095, 0.07], [0.085, 0.035], [0, 0.005]], 3.42, shelfY + i * 0.045, 0.15, { seg: 22 });   // nested bowls
  for (let i = 0; i < 3; i++) stemGlass(k, M.glass, 3.9 + i * 0.085, shelfY, 0.12, 1);
  for (let i = 0; i < 3; i++) mug(k, i % 2 ? M.ceramic : M.blackCeramic, 4.16 + i * 0.09, shelfY, 0.14, { r: 0.036, h: 0.085, ry: 0.5 + i });
  // hood: sloped canopy (extruded trapezoid) + chimney
  const hs = new THREE.Shape(); hs.moveTo(0, 0); hs.lineTo(0.52, 0); hs.lineTo(0.52, 0.02); hs.lineTo(0.28, 0.24); hs.lineTo(0, 0.24); hs.closePath();
  k.extrude(M.steel, hs, 1.1, 3.65 + 0.55, 1.5, 0.0, { ry: -Math.PI / 2, bevel: 0.004, seg: 4 });
  k.box(M.steel, 0.5, 1.5, 0.3, 3.65, 1.74, 0.15, { r: 0.006 });
  k.box(M.steel, 0.52, 0.02, 0.32, 3.65, 1.74, 0.15);
  k.box(M.ledCool, 0.9, 0.006, 0.12, 3.65, 1.498, 0.3);
  for (let i = 0; i < 12; i++) k.box(M.blackMetal, 0.018, 0.003, 0.06, 3.65 - 0.1 + (i % 6) * 0.04, 1.497, 0.24 + Math.floor(i / 6) * 0.1);
  // bulkhead above uppers to ceiling + crown
  k.box(M.wall, L, 0.75, 0.36, L / 2, 2.95, 0.18);
  k.box(M.trim, 1.9, 0.04, 0.02, 1.9, 2.93, 0.35); k.box(M.trim, 1.5, 0.04, 0.02, 5.15, 2.93, 0.35);
  // under-cabinet LED strips
  k.box(M.led, 1.95, 0.008, 0.02, 1.9, 1.44, 0.3);
  k.box(M.led, 1.45, 0.008, 0.02, 5.15, 1.44, 0.3);
  // ---- fridge (two-door with freezer drawer) ----
  const FW = 0.94, FH = 1.86, FD = 0.74, fx = 6.42;
  k.box(M.steel, FW, FH, FD, fx, 0.06, FD / 2, { r: 0.012, seg: 3 });
  k.box(M.blackMetal, FW + 0.012, 0.006, FD + 0.012, fx, 1.25, FD / 2 + 0.002);      // seam fridge/freezer
  k.box(M.blackMetal, 0.006, 1.2, 0.01, fx - 0.005, 1.27, FD + 0.002);
  k.box(M.blackMetal, FW * 0.98, 0.02, 0.008, fx, 0.13, FD + 0.002);                 // bottom grille
  for (let i = 0; i < 8; i++) k.box(M.blackMetal, FW * 0.9, 0.003, 0.004, fx, 0.075 + i * 0.006, FD + 0.003);
  pullBar(k, M.steel, fx - 0.06, 1.3, FD + 0.002, 0.7, true); pullBar(k, M.steel, fx + 0.06, 1.3, FD + 0.002, 0.7, true);
  pullBar(k, M.steel, fx, 0.7, FD + 0.002, 0.72, false);
  k.box(M.glassBlack, 0.24, 0.32, 0.01, fx + 0.22, 1.48, FD + 0.006, { r: 0.004 });
  k.box(M.ledCool, 0.16, 0.02, 0.004, fx + 0.22, 1.5, FD + 0.012);
  for (const sx of [-1, 1]) for (const yy of [0.5, 1.75]) k.cyl(M.steel, 0.01, 0.01, 0.05, fx + sx * (FW / 2 - 0.02), yy, FD + 0.005, { rx: Math.PI / 2, cy: true, seg: 8 });
  // magnets, photos, a child's drawing and a list on the fridge door
  for (let i = 0; i < 6; i++) k.box(pm('paint', { color: [0xe8e0c8, 0xd45b4b, 0x3f7a9b, 0xe0b040, 0xf2f2f2, 0x7a9e6a][i], rough: 0.7, interior: true }), 0.09 + R() * 0.06, 0.11 + R() * 0.06, 0.004, fx - 0.3 + (i % 3) * 0.2 + R() * 0.03, 1.4 + Math.floor(i / 3) * 0.2, FD + 0.005, { ry: (R() - 0.5) * 0.3 });
  for (let i = 0; i < 6; i++) k.cyl(pm('plain', { color: [0xd94a3c, 0x2f6fa8, 0xe8c03a, 0x2a9d6a, 0xd94a3c, 0x1b1b1d][i], rough: 0.4, interior: true }), 0.008, 0.008, 0.008, fx - 0.3 + (i % 3) * 0.2 + 0.03, 1.46 + Math.floor(i / 3) * 0.2, FD + 0.01, { rx: Math.PI / 2, cy: true, seg: 8 });
  // ---- cooktop: ceramic glass with four burner rings ----
  k.box(M.glassBlack, 0.78, 0.008, 0.52, 3.65, BH + 0.036, 0.3, { r: 0.002 });
  const ringM = pm('plain', { color: 0x2a2a2d, rough: 0.35, metal: 0.5, interior: true });
  for (const [bx, bz, br] of [[3.49, 0.19, 0.09], [3.81, 0.19, 0.075], [3.49, 0.41, 0.075], [3.81, 0.41, 0.1]]) { k.torus(ringM, br, 0.003, bx, BH + 0.041, bz, { rx: Math.PI / 2, seg: 30, seg2: 4 }); k.torus(ringM, br * 0.55, 0.002, bx, BH + 0.041, bz, { rx: Math.PI / 2, seg: 24, seg2: 4 }); }
  // ---- counter props ----
  // kettle: cylindrical body, spout, lid knob and an arched handle
  { const kx = 4.28, kz = 0.42, ky = BH + 0.042;
    k.lathe(M.steel, [[0, 0], [0.085, 0], [0.098, 0.012], [0.1, 0.14], [0.088, 0.19], [0.05, 0.215], [0.0, 0.22]], kx, ky, kz, { seg: 28 });
    k.cyl(M.blackMetal, 0.012, 0.012, 0.03, kx, ky + 0.218, kz, { seg: 8 }); k.sph(M.blackMetal, 0.016, kx, ky + 0.255, kz, { seg: 8, seg2: 6 });
    k.strut(M.steel, [kx + 0.085, ky + 0.09, kz], [kx + 0.185, ky + 0.2, kz], 0.028, 0.013, { seg: 10 });
    k.tube(M.blackMetal, [[kx - 0.06, ky + 0.2, kz], [kx - 0.13, ky + 0.27, kz], [kx - 0.16, ky + 0.16, kz], [kx - 0.11, ky + 0.06, kz]], 0.009, { seg: 16, radial: 6 });
  }
  // espresso machine
  const ex = 5.35, ez = 0.3, eh = BH + CT;
  k.box(M.steel, 0.3, 0.34, 0.3, ex, eh, ez, { r: 0.02, seg: 3 });
  k.box(M.blackMetal, 0.3, 0.05, 0.3, ex, eh, ez);
  k.box(M.blackMetal, 0.26, 0.012, 0.16, ex, eh + 0.05, ez + 0.06);                                   // drip tray
  k.cyl(M.steel, 0.032, 0.03, 0.03, ex, eh + 0.24, ez + 0.1, { seg: 14 });                            // group head
  k.cyl(M.blackMetal, 0.008, 0.008, 0.13, ex + 0.07, eh + 0.235, ez + 0.14, { rx: Math.PI / 2 - 0.2, cy: true, seg: 8 });
  k.cyl(M.blackMetal, 0.04, 0.04, 0.05, ex, eh + 0.34, ez, { seg: 18 });
  k.box(M.plasticB, 0.09, 0.09, 0.006, ex - 0.09, eh + 0.24, ez + 0.152, { r: 0.004 }); k.box(M.ledCool, 0.03, 0.006, 0.004, ex - 0.09, eh + 0.26, ez + 0.156);
  mug(k, M.ceramic, ex, eh + 0.062, ez + 0.06, { r: 0.032, h: 0.06, ry: 1.2 });
  // toaster
  k.box(M.steel, 0.28, 0.18, 0.16, 4.72, eh, 0.34, { r: 0.03, seg: 3 });
  k.box(M.blackMetal, 0.2, 0.004, 0.02, 4.72, eh + 0.182, 0.34); k.box(M.blackMetal, 0.2, 0.004, 0.02, 4.72, eh + 0.182, 0.29);
  k.box(M.blackMetal, 0.04, 0.02, 0.012, 4.86, eh + 0.05, 0.42);
  // knife block, utensil crock, cutting board with lemons, salt & pepper, oil, herbs
  k.box(M.walnut, 0.12, 0.2, 0.16, 2.9 - 0.18 + 0.0, eh, 0.2, { rz: -0.3, r: 0.006 });
  k.lathe(M.ceramic, [[0, 0], [0.06, 0], [0.065, 0.15], [0.055, 0.15]], 0.98, eh, 0.2, { seg: 20 });
  for (let i = 0; i < 5; i++) k.cyl(i % 2 ? M.walnut : M.steel, 0.007, 0.007, 0.22, 0.98 + (R() - 0.5) * 0.05, eh + 0.12, 0.2 + (R() - 0.5) * 0.05, { rx: (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.4, seg: 6 });
  k.box(M.oak, 0.42, 0.02, 0.28, 3.0 - 0.0, eh, 0.33, { ry: 0.08, r: 0.006 });
  for (let i = 0; i < 3; i++) k.cyl(pm('plain', { color: 0xe3c229, rough: 0.5, interior: true }), 0.024, 0.024, 0.006, 2.95 + i * 0.05, eh + 0.02, 0.33 + i * 0.02, { seg: 12 });
  k.sph(pm('plain', { color: 0xe3c229, rough: 0.5, interior: true }), 0.038, 3.12, eh + 0.055, 0.32, { sy: 0.85 });
  k.lathe(pm('plain', { color: 0x3a4a1c, rough: 0.1, physical: true, clearcoat: 1, interior: true }), [[0, 0], [0.035, 0], [0.04, 0.16], [0.015, 0.22], [0.015, 0.28], [0.0, 0.28]], 3.2, eh, 0.575, { seg: 16 });
  k.lathe(M.ceramic, [[0, 0], [0.028, 0], [0.03, 0.07], [0.02, 0.09], [0, 0.09]], 3.05, eh, 0.575, { seg: 12 }); k.lathe(M.ceramic, [[0, 0], [0.028, 0], [0.03, 0.07], [0.02, 0.09], [0, 0.09]], 3.11, eh, 0.575, { seg: 12 });
  k.lathe(M.terracotta, [[0, 0], [0.04, 0], [0.05, 0.08], [0.045, 0.085], [0, 0.08]], 1.15, eh, 0.1, { seg: 14 });
  for (let i = 0; i < 9; i++) { const a = i * 0.7; k.push(M.leafLight, leafGeometry(0.085, 0.022, 0.25, 0.15, 5, 0), mat4(1.15 + Math.cos(a) * 0.015, eh + 0.075, 0.1 + Math.sin(a) * 0.015, -0.6 - (i % 3) * 0.25, a, 0)); }
  const g = finish(par, k, -31.0, y0, 24.6, -Math.PI / 2);
  out.group = g;

  // ---- appliance interaction anchors (world) ----
  const wp = (lx, ly, lz) => new THREE.Vector3(-31.0 - lz, y0 + ly, 24.6 + lx);
  out.fridgePos = wp(fx, 1.0, 0.9);
  out.stovePos = wp(3.65, 1.0, 0.45);
  out.sinkPos = wp(1.9, 1.05, 0.35);
  out.coffeePos = wp(5.35, 1.2, 0.3);
  out.microPos = wp(0.45, 1.2, 0.3);
  out.underCabLights = [wp(1.9, 1.4, 0.3), wp(5.15, 1.4, 0.3)];
  out.hoodLight = wp(3.65, 1.45, 0.3);
  colBox(-31.3, 28.05, 0.7, 6.9, 0, y0, y0 + 2.6);

  // ---- island: fluted walnut front, marble waterfall top, cookbook, herbs, fruit, stools ----
  const ik = new Kit();
  const IL = 3.6, ID = 0.72;
  ik.box(M.blackMetal, IL - 0.2, 0.09, ID - 0.15, IL / 2, 0, ID / 2);
  ik.box(M.walnut, IL, BH - 0.09, ID - 0.03, IL / 2, 0.09, (ID - 0.03) / 2, { r: 0.006 });
  const nF = 4, fw = (IL - 0.14) / nF;
  for (let i = 0; i < nF; i++) {
    const cxx = 0.07 + fw * (i + 0.5);
    ik.box(M.walnut, fw - 0.012, BH - 0.14, 0.02, cxx, 0.11, ID - 0.02, { r: 0.004 });
    flutes(ik, M.walnut, fw - 0.05, BH - 0.18, cxx, 0.13, ID - 0.006, 15, 0.0085);
    pullBar(ik, M.brass, cxx, BH - 0.14, ID - 0.005, 0.22, false);
  }
  ik.box(M.marbleW, IL + 0.06, 0.045, 1.28, IL / 2, BH, 0.6, { r: 0.004 });            // top with overhang on front (+z)
  ik.box(M.marbleW, 0.05, BH, 1.22, -0.005 + 0.0, 0.0, 0.62 - 0.0, {});              // waterfall side (north)
  ik.box(M.marbleW, 0.05, BH, 1.22, IL + 0.005, 0.0, 0.62, {});                        // (south)
  // fruit bowl with fruit + cookbook stack + vase of branches + herbs + board
  ik.lathe(M.oak, [[0, 0], [0.12, 0.004], [0.2, 0.07], [0.21, 0.085], [0.195, 0.085], [0.11, 0.03], [0, 0.02]], 1.2, BH + 0.045, 0.9, { seg: 32 });
  const fruits = [0xc63a2c, 0xe08a2a, 0x8cc43f, 0xd94a3c, 0xe8c03a];
  for (let i = 0; i < 8; i++) ik.sph(pm('plain', { color: fruits[i % 5], rough: 0.35, interior: true }), 0.042, 1.2 + Math.cos(i * 0.9) * 0.085, BH + 0.12 + (i % 2) * 0.03, 0.9 + Math.sin(i * 0.9) * 0.085, { sy: 0.92 });
  bookStack(ik, M.paper, [{ c: M.mustard, w: 0.32, d: 0.24, h: 0.03 }, { c: pm('paint', { color: 0x2f4a3c, rough: 0.5, interior: true }), w: 0.28, d: 0.21, h: 0.026, j: -1 }], 2.4, BH + 0.045, 0.85, 0.25);
  const rr = rng(66);
  branchVase(ik, M.ceramic, M.walnut, M.leafLight, 2.85, BH + 0.045, 0.7, rr, { h: 0.24, n: 5, len: 0.55, leafGeo: leafGeometry(0.08, 0.03, 0.3, 0.2, 5, 0) });
  ik.box(M.oak, 0.34, 0.022, 0.22, 0.5, BH + 0.045, 0.85, { r: 0.006, ry: -0.2 });
  // stools
  for (let i = 0; i < 3; i++) stool(ik, M, 0.75 + i * 1.05, 1.55);
  const ig = finish(par, ik, -33.0, y0, 26.4, -Math.PI / 2);
  colBox(-33.7, 28.2, 1.6, IL, 0, y0, y0 + 1.0);
  out.island = ig;
  out.pendantXZ = [[-33.85, 27.1], [-33.85, 28.2], [-33.85, 29.3]];
  return out;
}
