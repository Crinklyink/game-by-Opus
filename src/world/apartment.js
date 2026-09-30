// Floor-48 apartment: architecture, window wall, balcony, light groups + switches, doors,
// curtains, and placement of every furnishing. Registers interactables for the game layer.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Kit, addCollider } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { LightPool } from '../gfx/lights.js';
import { makeGlassPane } from '../gfx/glass.js';
import { Interact } from '../systems/interact.js';
import { APT_Y, CEIL_H, UNIT } from './consts.js';
import { makeScreen, drawTV } from './screens.js';
import * as F from './furniture.js';
import { buildKitchen } from './kitchen.js';
import { buildBed, buildDresser, buildWardrobe, buildReadingCorner, buildBathroom } from './bedbath.js';
import { buildDesk, officeChair, buildBookshelf } from './office.js';

const Y = APT_Y, CH = CEIL_H;
const HALL_X0 = -34.1, HALL_X1 = -20.4, HALL_Z0 = 32.6, HALL_Z1 = 36.4;

// ------------------------------------------------------------------ light groups
function makeGroup(name) {
  return { name, on: true, emitters: [], mats: [], toggleCb: [], set(v) { this.on = v; for (const e of this.emitters) e.on = v; for (const m of this.mats) m.mat.emissiveIntensity = v ? m.on : m.off; this.toggleCb.forEach((f) => f(v)); }, toggle() { this.set(!this.on); } };
}

// swap shared emissive palette materials inside a built object for group-owned clones
function retarget(obj, grp, M) {
  const map = new Map();
  const clone = (src, on, off) => { if (!map.has(src)) { const c = src.clone(); c.emissiveIntensity = on; map.set(src, c); grp.mats.push({ mat: c, on, off }); } return map.get(src); };
  const table = [[M.bulb, 7, 0.0], [M.bulbCool, 6, 0.0], [M.led, 4.5, 0.0], [M.ledCool, 4, 0.0], [M.shade, 1.6, 0.0]];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const [src, on, off] of table) if (o.material === src) o.material = clone(src, on, off);
  });
}

export function buildApartment(scene, ctx) {
  const M = palette();
  const R = ctx.rand;
  const par = new THREE.Group();
  par.name = 'apartment';
  scene.add(par);
  const out = { groups: {}, doors: [], curtains: [], screens: [], group: par };

  const emit = (o) => LightPool.add({ levelY: Y, levelRange: 12, zone: 'apartment', ...o });
  const groups = out.groups;
  for (const n of ['living', 'dining', 'kitchen', 'office', 'bedroom', 'bath', 'hall', 'shelf']) groups[n] = makeGroup(n);
  const LS = 0.55;
  const gEmit = (grp, o) => { const e = emit({ ...o, intensity: o.intensity * LS }); grp.emitters.push(e); return e; };

  // ================================================================== architecture
  const A = new Kit();
  const wall = (x0, x1, z0, z1, y0 = Y, h = CH, mat = M.wall, col = true) => {
    A.box(mat, x1 - x0, h, z1 - z0, (x0 + x1) / 2, y0, (z0 + z1) / 2);
    if (col) addCollider(x0, x1, z0, z1, y0, y0 + h, 1);
  };
  // floor slab (top at APT_Y) and hall floor
  A.box(M.floor, UNIT.x1 - UNIT.x0 + 0.4, 0.05, UNIT.z1 - UNIT.z0 + 0.2, (UNIT.x0 + UNIT.x1) / 2, Y - 0.05, (UNIT.z0 + UNIT.z1) / 2 - 0.0);
  A.box(M.carpet, HALL_X1 - HALL_X0, 0.05, HALL_Z1 - HALL_Z0 + 0.1, (HALL_X0 + HALL_X1) / 2, Y - 0.05, (HALL_Z0 + HALL_Z1) / 2);
  A.box(M.concrete, 39.6, 0.4, 39.6, -40, Y - 0.5, 40);                 // structural slab: stays inside the 40 x 40 m tower footprint

  // outer shell walls of the unit
  wall(-49.25, -49.0, UNIT.z0, 32.62);                                  // west
  wall(-31.0, -30.75, UNIT.z0, 32.62);                                  // east
  // south wall with the entry door opening (x -33.6..-32.4, h 2.4)
  wall(-49.25, -33.6, 32.4, 32.62); wall(-32.4, -30.75, 32.4, 32.62);
  A.box(M.wall, 1.2, CH - 2.4, 0.22, -33.0, Y + 2.4, 32.51);
  // living / bedroom partition (x=-42) with a door opening near the north end (z 21.6..22.8)
  wall(-42.1, -41.9, 22.8, 32.4); wall(-42.1, -41.9, UNIT.z0, 21.6);
  A.box(M.wall, 0.2, CH - 2.4, 1.2, -42.0, Y + 2.4, 22.2);
  // bath partition (z=29) with a door opening (x -45.3..-44.2)
  wall(-49.0, -45.3, 28.9, 29.1); wall(-44.2, -42.1, 28.9, 29.1);
  A.box(M.wall, 1.1, CH - 2.4, 0.2, -44.75, Y + 2.4, 29.0);
  // accent panels
  A.box(M.wallSage, 0.03, CH, 5.2, -41.885, Y, 26.9);                    // TV wall (living side)
  A.box(M.wallSage, 0.03, CH, 3.3, -41.885, Y, 31.0);
  A.box(M.wallBlue, 0.03, CH, UNIT.z1 - UNIT.z0 - 4.8, -48.985, Y, 24.4);         // headboard wall
  // baseboards + crown reveal
  const bb = (x0, x1, z0, z1) => A.box(M.trim, x1 - x0, 0.11, z1 - z0, (x0 + x1) / 2, Y, (z0 + z1) / 2);
  bb(-49.0, -48.97, UNIT.z0, 32.4); bb(-31.03, -31.0, UNIT.z0, 32.4);
  bb(-49.0, -33.6, 32.37, 32.4); bb(-32.4, -31.0, 32.37, 32.4);
  bb(-41.9, -41.87, 22.8, 32.4); bb(-41.97, -41.94, 22.8, 32.4);
  // window-wall: soffit / curtain pocket, mullions, base and top tracks
  A.box(M.wall, UNIT.x1 - UNIT.x0, 0.3, 0.55, (UNIT.x0 + UNIT.x1) / 2, Y + CH - 0.3, UNIT.z0 + 0.275);
  A.box(M.ledCool, UNIT.x1 - UNIT.x0 - 0.2, 0.015, 0.02, (UNIT.x0 + UNIT.x1) / 2, Y + CH - 0.305, UNIT.z0 + 0.5);   // cove strip (sky-lit, always on)
  const mx = [-49, -46, -43, -40, -37, -34, -31];
  for (const x of mx) A.box(M.blackMetal, 0.07, CH - 0.3, 0.14, x, Y, UNIT.z0 + 0.02, { r: 0.004 });
  A.box(M.blackMetal, 18, 0.07, 0.14, -40, Y, UNIT.z0 + 0.02);
  A.box(M.blackMetal, 18, 0.08, 0.14, -40, Y + CH - 0.38, UNIT.z0 + 0.02);
  // ceiling downlights + sprinkler heads
  const dlGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20);
  const dl = new THREE.InstancedMesh(dlGeo, pm('plain', { color: 0x050505, emissive: 0xfff0d0, emissiveI: 5.5, interior: true }), 64);
  let di = 0;
  const m4 = new THREE.Matrix4();
  const addDL = (x, z) => { m4.makeTranslation(x, Y + CH - 0.006, z); dl.setMatrixAt(di++, m4); };
  for (let x = -40.5; x <= -31.5; x += 1.9) for (let z = 24; z <= 31.5; z += 1.9) if (!(x > -34.5 && z > 25.5)) addDL(x, z);
  for (let x = -48; x <= -42.5; x += 2.0) for (let z = 21.6; z <= 27.6; z += 2.0) addDL(x, z);
  for (let x = -48.2; x <= -43; x += 1.7) addDL(x, 31);
  for (let x = -33.4; x <= -22; x += 2.3) addDL(x, 34.5);
  dl.count = di; dl.instanceMatrix.needsUpdate = true;
  par.add(dl);
  groups.living.mats.push({ mat: dl.material, on: 5.5, off: 0.0 });

  // ---- hallway ----
  wall(HALL_X0 - 0.25, HALL_X0, HALL_Z0, HALL_Z1, Y, CH, M.wallDark);              // west end
  wall(HALL_X0, HALL_X1, HALL_Z0, HALL_Z0 + 0.25, Y, CH, M.wallDark, false);        // north (shared with unit south)
  A.box(M.walnut, HALL_X1 - HALL_X0, 1.05, 0.03, (HALL_X0 + HALL_X1) / 2, Y + 0.1, HALL_Z0 + 0.0 + 0.0);
  addCollider(HALL_X0, HALL_X1, HALL_Z0 - 0.05, HALL_Z0, Y, Y + 3, 1);
  // south wall with elevator opening x -27.1..-24.9
  wall(HALL_X0, -27.1, HALL_Z1, HALL_Z1 + 0.3, Y, CH, M.wallDark); wall(-24.9, HALL_X1, HALL_Z1, HALL_Z1 + 0.3, Y, CH, M.wallDark);
  A.box(M.wallDark, 2.2, CH - 2.5, 0.3, -26.0, Y + 2.5, HALL_Z1 + 0.15);
  A.box(M.steel, 0.12, 2.5, 0.06, -27.16, Y, HALL_Z1 - 0.03); A.box(M.steel, 0.12, 2.5, 0.06, -24.84, Y, HALL_Z1 - 0.03); A.box(M.steel, 2.44, 0.12, 0.06, -26.0, Y + 2.5, HALL_Z1 - 0.03);
  // wainscot on hall walls
  A.box(M.walnut, HALL_X1 - HALL_X0, 1.05, 0.03, (HALL_X0 + HALL_X1) / 2, Y, HALL_Z1 - 0.015);
  A.box(M.brass, HALL_X1 - HALL_X0, 0.02, 0.035, (HALL_X0 + HALL_X1) / 2, Y + 1.05, HALL_Z1 - 0.018);
  // east end: window onto the city
  A.box(M.blackMetal, 0.08, CH, 4.0, HALL_X1, Y, (HALL_Z0 + HALL_Z1) / 2);
  wall(HALL_X1, HALL_X1 + 0.05, HALL_Z0, HALL_Z1, Y, CH, M.blackMetal);
  // neighbouring apartment doors on the hall's north side + exit door
  const neighbour = (x, n) => {
    A.box(M.walnut, 1.1, 2.4, 0.06, x, Y, HALL_Z0 - 0.0 + 0.01);
    A.box(M.brass, 0.2, 0.05, 0.02, x + 0.4, Y + 1.05, HALL_Z0 + 0.06);
    A.box(M.brass, 0.14, 0.09, 0.01, x, Y + 1.7, HALL_Z0 + 0.045);
    A.box(M.trim, 1.3, 0.08, 0.05, x, Y + 2.4, HALL_Z0 + 0.03);
  };
  neighbour(-29.6, 4802); neighbour(-25.0, 4803); neighbour(-22.0, 4804);
  // ================================================================== balcony
  const BX0 = -38.0, BX1 = -31.0, BZ0 = 15.55;
  A.box(M.concrete, BX1 - BX0, 0.27, UNIT.z0 - BZ0, (BX0 + BX1) / 2, Y - 0.3, (UNIT.z0 + BZ0) / 2);     // top sits 3 cm under the deck boards (no coplanar z-fighting)
  const deck = pm('woodfloor', { color: 0x8a6a48, col2: 0x4a3423, p: [0.14, 1.2, 0, 0], wet: 1, rough: 0.7 });
  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 0.03, UNIT.z0 - BZ0), deck);
  deckMesh.position.set((BX0 + BX1) / 2, Y - 0.015, (UNIT.z0 + BZ0) / 2); deckMesh.receiveShadow = true; par.add(deckMesh);
  // glass railings with steel posts + top rail
  const rail = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
    const n = Math.max(2, Math.round(len / 1.6));
    A.box(M.blackMetal, len, 0.05, 0.06, (x0 + x1) / 2, Y + 1.1, (z0 + z1) / 2, { ry: ang, r: 0.01 });
    for (let i = 0; i <= n; i++) A.box(M.blackMetal, 0.05, 1.12, 0.05, x0 + (dx * i) / n, Y, z0 + (dz * i) / n, { r: 0.006 });
    addCollider(Math.min(x0, x1) - 0.06, Math.max(x0, x1) + 0.06, Math.min(z0, z1) - 0.06, Math.max(z0, z1) + 0.06, Y, Y + 1.2, 1);
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), new THREE.MeshPhysicalMaterial({ color: 0xbfd6dc, roughness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    gm.position.set((x0 + x1) / 2, Y + 0.6, (z0 + z1) / 2); gm.rotation.y = -ang; par.add(gm);
  };
  rail(BX0, BZ0, BX1, BZ0); rail(BX0, BZ0, BX0, UNIT.z0); rail(BX1, BZ0, BX1, UNIT.z0);
  // balcony furniture: bistro table + 2 chairs + planters + string lights
  const BK = new Kit();
  const bx = -34.4, bz = 17.5;
  BK.cyl(M.blackMetal, 0.38, 0.38, 0.025, bx, 0.7, bz, { seg: 32 });
  BK.cyl(M.blackMetal, 0.03, 0.03, 0.7, bx, 0, bz, { seg: 10 });
  BK.cyl(M.blackMetal, 0.24, 0.26, 0.02, bx, 0, bz, { seg: 24 });
  for (const s of [-1, 1]) {
    const cx = bx + s * 0.75, cz = bz;
    BK.box(M.oak, 0.44, 0.04, 0.42, cx, 0.44, cz, { r: 0.01 });
    BK.box(M.oak, 0.44, 0.34, 0.03, cx, 0.5, cz + (s > 0 ? 0 : 0) - 0.19, { r: 0.008 });
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) BK.cyl(M.blackMetal, 0.011, 0.011, 0.44, cx + dx * 0.19, 0, cz + dz * 0.18, { seg: 6 });
  }
  BK.lathe(M.ceramic, [[0, 0], [0.05, 0], [0.06, 0.1], [0.05, 0.11], [0.048, 0.01]], bx, 0.725, bz);
  const planterMat = pm('concrete', { color: 0xb9b6ae, p: [0, 0, 0, 0], wet: 1 });
  for (const px of [-37.55, -31.5]) {
    BK.box(planterMat, 0.55, 0.55, 0.4, px, 0, 16.0, { r: 0.02 });
    BK.box(M.soil, 0.5, 0.02, 0.36, px, 0.54, 16.0);
  }
  const balc = F.finish(par, BK, 0, Y, 0, 0);
  F.monstera(par, Y + 0.55, -37.55, 16.0, 0.9, 21);
  const sk = new Kit(); F.snakePlant(sk, M, -31.5, Y + 0.55, 16.0, 4, 1.3); F.finish(par, sk, 0, 0, 0, 0);
  // string lights along the back (bulbs)
  const bulbGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const sl = new THREE.InstancedMesh(bulbGeo, pm('plain', { color: 0x050505, emissive: 0xffc47a, emissiveI: 9 }), 14);
  for (let i = 0; i < 14; i++) { const t = i / 13; m4.makeTranslation(BX0 + 0.25 + t * (BX1 - BX0 - 0.5), Y + 2.75 - Math.sin(t * Math.PI) * 0.22, 19.75); sl.setMatrixAt(i, m4); }
  par.add(sl);

  A.mesh(par, { reflect: true });

  // ---- window glass (6 bays) ----
  const glassPanes = [];
  for (let i = 0; i < 6; i++) {
    const cx = -49 + 1.5 + i * 3;
    const gp = makeGlassPane(par, 2.93, CH - 0.3, cx, Y + (CH - 0.3) / 2 + 0.04, UNIT.z0 + 0.03, 0, [i * 3.0, 0]);
    glassPanes.push(gp);
  }
  // sliding balcony door: bay 5 (x -34..-31) leaf slides in front of bay 4
  const slider = glassPanes[5];
  out.slider = { panes: slider, open: false, t: 0 };
  slider.adv.position.z = UNIT.z0 + 0.14; slider.simple.position.z = UNIT.z0 + 0.14;
  out.sliderCollider = addCollider(-34.0, -31.0, UNIT.z0 - 0.05, UNIT.z0 + 0.2, Y, Y + CH, 1);
  addCollider(-49.1, -34.0, UNIT.z0 - 0.12, UNIT.z0 + 0.06, Y, Y + CH, 1);
  // handle
  // ================================================================== curtains (sheer, per bay, two panels)
  const sheerMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const curtainGroup = new THREE.Group(); par.add(curtainGroup);
  const curtainBays = [0, 1, 2, 3, 4];
  const panelGeo = new THREE.PlaneGeometry(1, CH - 0.55, 24, 1);
  { const p = panelGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.5) * Math.PI * 7) * 0.035); panelGeo.computeVertexNormals(); }
  for (const b of curtainBays) for (const s of [0, 1]) {
    const m = new THREE.Mesh(panelGeo, sheerMat);
    m.position.set(-49 + b * 3 + (s ? 2.75 : 0.25), Y + (CH - 0.55) / 2, UNIT.z0 + 0.42);
    m.userData = { b, s, x0: -49 + b * 3 };
    curtainGroup.add(m); out.curtains.push(m);
  }
  out.curtainState = { closed: 0, target: 0 };
  out.updateCurtains = (dt) => {
    const c = out.curtainState; c.closed += (c.target - c.closed) * (1 - Math.exp(-dt * 2.2));
    for (const m of out.curtains) {
      const { s, x0 } = m.userData, w = 0.5 + c.closed * 1.0;
      m.scale.x = w;
      m.position.x = s ? x0 + 2.9 - w / 2 : x0 + 0.1 + w / 2;
    }
  };
  out.updateCurtains(1);

  // ================================================================== furniture
  const dec = (fn) => fn;
  // rugs
  F.rug(par, Y, -38.7, 27.0, 5.4, 4.6, 0, { color: 0xd9cfbb, col2: 0x8f6f52, freq: 1.4 });
  F.rug(par, Y, -46.0, 25.0, 3.6, 3.6, 0, { color: 0xa3aca3, col2: 0x5a655d, freq: 1.8 });
  F.rug(par, Y, -38.8, 22.9, 3.6, 2.6, 0.0, { color: 0x56665c, col2: 0x2b3830, freq: 2.2 });

  // living
  const S = F.sofa(par, Y, -37.15, 27.0, -Math.PI / 2);
  const AC = F.armchair(par, Y, -38.4, 24.8, -Math.PI / 4);
  F.coffeeTable(par, Y, -39.55, 27.0);
  F.sideTable(par, Y, -37.2, 24.55);
  const tvScreen = makeScreen(512, 288, drawTV, { fps: 6 });
  tvScreen.channel = 0; tvScreen.visible = true;
  const tv = F.tvUnit(par, Y, -41.68, 27.0, Math.PI / 2, tvScreen);
  const fl = F.floorLamp(par, Y, -36.3, 29.5, Math.PI);
  retarget(fl.group, groups.living, M);
  gEmit(groups.living, { pos: new THREE.Vector3(fl.lightPos.x, Y + 1.4, fl.lightPos.z), color: 0xffc078, intensity: 55, distance: 10 });
  gEmit(groups.living, { pos: new THREE.Vector3(-39.2, Y + 3.1, 26.2), color: 0xffdcb0, intensity: 70, distance: 13 });
  // shelf lights + art
  F.artwork(par, Y + 1.45, -41.83, 23.9, Math.PI / 2, 0.9, 1.2, 0, 'walnut');
  F.artwork(par, Y + 1.15, -41.83, 30.7, Math.PI / 2, 1.3, 0.85, 2, 'brass');
  F.artwork(par, Y + 1.4, -35.4, 32.36, Math.PI, 0.9, 0.7, 1, 'black');
  // plants
  F.monstera(par, Y, -33.55, 21.5, 1.15, 3);
  F.fiddleFig(par, Y, -41.35, 31.25, 1.0, 4);
  // dining
  const DT = F.diningTable(par, Y, -35.6, 23.2, 0);
  const ck = new Kit();
  F.diningChair(ck, M, -36.4, 22.35, 0); F.diningChair(ck, M, -34.8, 22.35, 0);
  F.diningChair(ck, M, -36.4, 24.05, Math.PI); F.diningChair(ck, M, -34.8, 24.05, Math.PI);
  F.diningChair(ck, M, -37.1, 23.2, Math.PI / 2); F.diningChair(ck, M, -34.1, 23.2, -Math.PI / 2);
  F.finish(par, ck, 0, Y, 0, 0);
  for (const [cx, cz] of [[-36.4, 22.35], [-34.8, 22.35], [-36.4, 24.05], [-34.8, 24.05]]) F.colBox(cx, cz, 0.5, 0.5, 0, Y, Y + 0.9);
  const diningMats = { ...M, bulb: (groups.dining.bulb = M.bulb.clone()) };
  groups.dining.mats.push({ mat: groups.dining.bulb, on: 7, off: 0 });
  for (const px of [-36.3, -35.6, -34.9]) F.pendant(par, px, Y + 2.05, 23.2, Y + CH, diningMats);
  gEmit(groups.dining, { pos: new THREE.Vector3(-35.6, Y + 2.0, 23.2), color: 0xffcf98, intensity: 60, distance: 8 });
  // kitchen
  const K = buildKitchen(par, Y, { rand: R });
  out.kitchen = K;
  retarget(K.group, groups.kitchen, M);
  const kBulb = M.bulb.clone(); groups.kitchen.mats.push({ mat: kBulb, on: 7, off: 0 }); kBulb.emissiveIntensity = 7;
  const kMats = { ...M, bulb: kBulb };
  for (const [px, pz] of K.pendantXZ) F.pendant(par, px, Y + 2.1, pz, Y + CH, kMats).group.scale.setScalar(0.8);
  gEmit(groups.kitchen, { pos: new THREE.Vector3(-33.9, Y + 2.3, 28.2), color: 0xffd0a0, intensity: 62, distance: 9 });
  gEmit(groups.kitchen, { pos: new THREE.Vector3(-31.7, Y + 1.35, 28.0), color: 0xfff0d8, intensity: 30, distance: 5 });
  // office
  const D = buildDesk(par, Y, -38.8, 21.95, 0, { rand: R });
  officeChair(par, Y, -38.8, 23.05, Math.PI);
  retarget(D.group, groups.office, M);
  gEmit(groups.office, { pos: new THREE.Vector3(D.lampPos.x, D.lampPos.y - 0.1, D.lampPos.z + 0.1), color: 0xffe0b0, intensity: 24, distance: 5 });
  out.deskScreens = D.screens;
  // bookshelf + ladder + radio
  const BS = buildBookshelf(par, Y, -40.1, 32.22, 3.5, 3.15, { rand: R });
  const radio = new Kit();
  radio.box(M.walnut, 0.3, 0.17, 0.13, 0, 0, 0, { r: 0.01 });
  radio.box(M.brass, 0.1, 0.11, 0.005, -0.07, 0.03, 0.067);
  radio.cyl(M.brass, 0.022, 0.022, 0.012, 0.09, 0.09, 0.07, { rx: Math.PI / 2, cy: true, seg: 14 });
  radio.cyl(M.brass, 0.022, 0.022, 0.012, 0.09, 0.05, 0.07, { rx: Math.PI / 2, cy: true, seg: 14 });
  radio.box(M.ledCool, 0.09, 0.008, 0.004, -0.07, 0.11, 0.068);
  F.finish(par, radio, -39.0, Y + 1.755, 32.1, Math.PI);
  retarget(BS.group, groups.shelf, M);
  gEmit(groups.shelf, { pos: new THREE.Vector3(-40.1, Y + 1.6, 31.6), color: 0xffd7a0, intensity: 22, distance: 4.5 });
  // entry console
  const EK = new Kit();
  EK.box(M.walnut, 1.3, 0.05, 0.3, 0, 0.8, 0, { r: 0.006 });
  EK.box(M.walnut, 1.28, 0.04, 0.28, 0, 0.3, 0);
  for (const s of [-1, 1]) EK.box(M.blackMetal, 0.03, 0.8, 0.28, s * 0.6, 0, 0);
  EK.lathe(M.brass, [[0, 0], [0.06, 0], [0.07, 0.08], [0.04, 0.14], [0.03, 0.15]], -0.42, 0.85, 0);
  EK.box(M.paper, 0.22, 0.04, 0.16, 0.28, 0.85, 0, { ry: 0.3, r: 0.004 });
  EK.pillow(M.rust, 0.22, 0.14, 0.2, 0.2, 0.34, 0.0, { e: 0.6 });
  F.finish(par, EK, -35.4, Y, 32.22, Math.PI);
  F.colBox(-35.4, 32.2, 1.3, 0.3, 0, Y, Y + 1);
  const shoe = new Kit();
  shoe.box(M.oak, 1.0, 0.05, 0.36, 0, 0.42, 0, { r: 0.01 }); shoe.box(M.blackMetal, 1.0, 0.03, 0.34, 0, 0.12, 0);
  for (const s of [-1, 1]) shoe.box(M.blackMetal, 0.03, 0.42, 0.34, s * 0.46, 0, 0);
  for (let i = 0; i < 3; i++) shoe.box(M.leatherBlack, 0.28, 0.1, 0.1, -0.32 + i * 0.3, 0.15, 0.0, { r: 0.03, ry: 0.15 * i });
  F.finish(par, shoe, -37.35, Y, 32.16, Math.PI);
  // bedroom
  const BED = buildBed(par, Y, -47.7, 25.0);
  retarget(BED.group, groups.bedroom, M);
  BED.lampPos.forEach((p) => gEmit(groups.bedroom, { pos: p, color: 0xffb870, intensity: 32, distance: 6 }));
  gEmit(groups.bedroom, { pos: new THREE.Vector3(-45.5, Y + 3.2, 25.0), color: 0xffe0c0, intensity: 46, distance: 10 });
  buildDresser(par, Y, -42.24, 25.9, -Math.PI / 2);
  buildWardrobe(par, Y, -47.6, 28.59, Math.PI, 2.6);
  const RC = buildReadingCorner(par, Y, -43.3, 21.95);
  retarget(RC.lamp.group, groups.bedroom, M);
  gEmit(groups.bedroom, { pos: new THREE.Vector3(RC.lamp.lightPos.x, RC.lamp.lightPos.y, RC.lamp.lightPos.z), color: 0xffbf80, intensity: 26, distance: 6 });
  artwork_bedroom(par, Y, M);
  // bath
  const B = buildBathroom(par, Y, { rand: R });
  retarget(B.group, groups.bath, M);
  gEmit(groups.bath, { pos: B.mirrorLightPos, color: 0xeaf2ff, intensity: 50, distance: 7 });
  gEmit(groups.bath, { pos: new THREE.Vector3(-45.5, Y + 3.1, 30.7), color: 0xfff2e0, intensity: 36, distance: 7 });
  // hall lights
  const hallBulb = M.led.clone(); groups.hall.mats.push({ mat: hallBulb, on: 4.5, off: 0.0 });
  gEmit(groups.hall, { pos: new THREE.Vector3(-30, Y + 3.2, 34.5), color: 0xffe2b8, intensity: 70, distance: 10, levelRange: 14, zone: 'hall' });
  gEmit(groups.hall, { pos: new THREE.Vector3(-23.5, Y + 3.2, 34.5), color: 0xffe2b8, intensity: 70, distance: 10, levelRange: 14, zone: 'hall' });

  // ================================================================== doors
  const doors = out.doors;
  const mkDoor = (o) => {
    const k = new Kit();
    const w = o.w, h = 2.4, t = 0.045;
    k.box(o.mat ?? M.walnut, w, h, t, w / 2, 0, 0, { r: 0.004 });
    k.box(M.brass, 0.14, 0.03, 0.06, w - 0.09, 1.02, 0, { r: 0.006 });
    k.cyl(M.brass, 0.012, 0.012, 0.07, w - 0.05, 1.02, 0.03, { rx: Math.PI / 2, cy: true, seg: 10 });
    if (o.peep) { k.cyl(M.brass, 0.008, 0.008, 0.02, w / 2, 1.55, 0.02, { rx: Math.PI / 2, cy: true, seg: 8 }); k.box(M.brass, 0.1, 0.06, 0.01, w / 2, 1.9, 0.024); }
    const pivot = new THREE.Group();
    const mesh = new THREE.Group(); k.mesh(mesh, {}); pivot.add(mesh);
    pivot.position.set(o.x, Y, o.z); pivot.rotation.y = o.rot0 ?? 0;
    par.add(pivot);
    // frame/architrave
    const fk = new Kit();
    fk.box(M.trim, 0.07, h + 0.07, 0.24, -0.035, 0, 0, {}); fk.box(M.trim, 0.07, h + 0.07, 0.24, w + 0.035, 0, 0, {}); fk.box(M.trim, w + 0.14, 0.07, 0.24, w / 2, h, 0, {});
    const fg = new THREE.Group(); fk.mesh(fg, {}); fg.position.copy(pivot.position); fg.rotation.y = pivot.rotation.y; par.add(fg);
    const d = { pivot, open: false, ang: 0, target: 0, col: o.col, w, name: o.name, closedRot: o.rot0 ?? 0 };
    doors.push(d);
    return d;
  };
  // entry door: hinge at x=-33.6 on the south wall (z 32.4), swings out into the hall
  const entry = mkDoor({ x: -33.6, z: 32.41, w: 1.2, dir: 1, rot0: 0, mat: M.walnut, peep: true, col: addCollider(-33.6, -32.4, 32.36, 32.5, Y, Y + 2.4, 1), name: 'front door' });
  const bed = mkDoor({ x: -42.0, z: 21.6, w: 1.2, dir: -1, rot0: -Math.PI / 2, mat: M.oak, col: addCollider(-42.06, -41.94, 21.6, 22.8, Y, Y + 2.4, 1), name: 'bedroom door' });
  const bath = mkDoor({ x: -45.3, z: 29.0, w: 1.1, dir: 1, rot0: 0, mat: M.oak, col: addCollider(-45.3, -44.2, 28.94, 29.06, Y, Y + 2.4, 1), name: 'bathroom door' });
  out.entryDoor = entry;

  // ================================================================== interactions
  const gm = () => G.game || {};
  const it = (o) => Interact.add(o);
  const doorInteract = (d, pos) => it({ pos, r: 0.9, label: () => (d.open ? `Close ${d.name}` : `Open ${d.name}`), act: () => { d.open = !d.open; d.target = d.open ? 1 : 0; G.audio?.door?.(d.open); if (d.col) d.col.on = !d.open; } });
  doorInteract(entry, new THREE.Vector3(-33.0, Y + 1.2, 32.4));
  doorInteract(bed, new THREE.Vector3(-42.0, Y + 1.2, 22.2));
  doorInteract(bath, new THREE.Vector3(-44.75, Y + 1.2, 29.0));
  // balcony slider
  it({ pos: new THREE.Vector3(-32.5, Y + 1.2, UNIT.z0 + 0.15), r: 1.2, label: () => (out.slider.open ? 'Close balcony door' : 'Open balcony door'), act: () => { out.slider.open = !out.slider.open; out.sliderCollider.on = !out.slider.open; G.audio?.door?.(out.slider.open); } });
  // light switches
  const sw = (name, label, pos, grp) => it({ pos, r: 0.28, label: () => `${grp.on ? 'Turn off' : 'Turn on'} ${label}`, act: () => { grp.toggle(); G.audio?.click?.(); } });
  sw('living', 'living room lights', new THREE.Vector3(-41.75, Y + 1.3, 30.0), groups.living);
  sw('dining', 'dining lights', new THREE.Vector3(-34.2, Y + 1.3, 21.6), groups.dining);
  sw('kitchen', 'kitchen lights', new THREE.Vector3(-31.1, Y + 1.3, 25.0), groups.kitchen);
  sw('office', 'desk lamp', new THREE.Vector3(D.lampPos.x, Y + 0.95, D.lampPos.z + 0.3), groups.office);
  sw('bedroom', 'bedroom lights', new THREE.Vector3(-42.2, Y + 1.3, 23.0), groups.bedroom);
  sw('bath', 'bathroom lights', new THREE.Vector3(-45.6, Y + 1.3, 28.9), groups.bath);
  sw('shelf', 'shelf lights', new THREE.Vector3(-42.0, Y + 1.3, 31.9), groups.shelf);
  // curtains
  it({ pos: new THREE.Vector3(-41.2, Y + 1.3, UNIT.z0 + 0.6), r: 1.0, maxDist: 3.2, label: () => (out.curtainState.target ? 'Open the curtains' : 'Close the curtains'), act: () => { out.curtainState.target = out.curtainState.target ? 0 : 1; G.audio?.click?.(); } });
  // TV
  it({ pos: new THREE.Vector3(-41.7, Y + 1.4, 27.0), r: 0.9, maxDist: 5, label: () => (tvScreen.on ? 'Turn TV off' : 'Turn TV on'), act: () => { tvScreen.setOn(!tvScreen.on); G.audio?.click?.(); } });
  it({ pos: new THREE.Vector3(-41.7, Y + 1.4, 27.0), r: 0.9, maxDist: 5, label: () => 'Change TV channel', en: () => tvScreen.on, act: () => { tvScreen.channel = (tvScreen.channel + 1) % 2; tvScreen.acc = 1; G.audio?.click?.(); } });
  // radio
  it({ pos: new THREE.Vector3(-39.0, Y + 1.85, 32.05), r: 0.35, label: () => (G.audio?.radioOn ? 'Turn radio off' : 'Turn radio on'), act: () => G.audio?.toggleRadio?.() });
  // trading desk
  it({ pos: new THREE.Vector3(-38.8, Y + 1.05, 22.1), r: 1.5, maxDist: 2.6, label: () => 'Use trading terminal', act: () => gm().openMarket?.() });
  // sofa
  it({ pos: new THREE.Vector3(-37.15, Y + 0.6, 27.0), r: 1.4, label: () => 'Sit on the sofa', act: () => gm().sit?.({ x: -37.35, y: Y + 0.98, z: 27.0, yaw: Math.PI / 2 + 0.0, kind: 'sofa' }) });
  it({ pos: new THREE.Vector3(-38.4, Y + 0.6, 24.8), r: 0.6, label: () => 'Sit in the armchair', act: () => gm().sit?.({ x: -38.4, y: Y + 0.98, z: 24.8, yaw: Math.PI * 0.75, kind: 'chair' }) });
  it({ pos: new THREE.Vector3(-38.8, Y + 0.6, 23.05), r: 0.5, label: () => 'Sit at the desk', act: () => gm().sit?.({ x: -38.8, y: Y + 1.02, z: 23.0, yaw: 0, kind: 'desk' }) });
  // kitchen
  it({ pos: K.fridgePos, r: 0.75, label: () => 'Open the fridge', act: () => gm().openFridge?.() });
  it({ pos: K.stovePos, r: 0.8, label: () => 'Cook something', act: () => gm().openCook?.() });
  it({ pos: K.sinkPos, r: 0.6, label: () => 'Drink some water', act: () => gm().drinkWater?.() });
  it({ pos: K.coffeePos, r: 0.5, label: () => 'Make coffee', act: () => gm().makeCoffee?.() });
  it({ pos: K.microPos, r: 0.5, label: () => 'Reheat leftovers', act: () => gm().reheat?.() });
  // bed / bath / books / plants
  it({ pos: BED.bedPos, r: 1.2, maxDist: 3, label: () => 'Sleep', act: () => gm().openSleep?.() });
  it({ pos: B.vanityPos, r: 0.9, label: () => 'Freshen up', act: () => gm().freshen?.() });
  it({ pos: B.showerPos, r: 0.8, label: () => 'Take a shower', act: () => gm().shower?.() });
  it({ pos: BS.pos, r: 1.0, maxDist: 2.8, label: () => 'Browse the bookshelf', act: () => gm().readBook?.() });
  it({ pos: new THREE.Vector3(-33.55, Y + 1.0, 21.5), r: 0.5, label: () => 'Water the monstera', act: () => gm().waterPlant?.() });

  // ================================================================== bookkeeping
  out.tvScreen = tvScreen;
  out.setAllLights = (v) => { for (const g of Object.values(groups)) g.set(v); };
  out.update = (dt, t) => {
    out.updateCurtains(dt);
    for (const d of doors) {
      d.ang += (d.target - d.ang) * (1 - Math.exp(-dt * 5));
      d.pivot.rotation.y = d.closedRot - d.ang * Math.PI * 0.5;
    }
    const s = out.slider; s.t += ((s.open ? 1 : 0) - s.t) * (1 - Math.exp(-dt * 3));
    const off = -3.0 * s.t;
    s.panes.adv.position.x = -32.5 + off; s.panes.simple.position.x = -32.5 + off;
  };
  // start with a comfy evening set of lights decided by the caller
  return out;
}

function artwork_bedroom(par, Y, M) {
  F.artwork(par, Y + 1.5, -48.86, 21.6, Math.PI / 2, 0.7, 0.9, 2, 'black');
  F.artwork(par, Y + 1.35, -42.15, 24.8, -Math.PI / 2, 1.0, 0.7, 0, 'brass');
}
