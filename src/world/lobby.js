// Grand double-height lobby of Meridian Tower (ground floor): glass front with automatic doors,
// terrazzo floor with marble inlay, reception desk, slat wall, seating, mailboxes, cloud chandelier.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Kit, addCollider } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { LightPool } from '../gfx/lights.js';
import { Interact } from '../systems/interact.js';
import { canvasTex } from '../gfx/noise.js';
import * as F from './furniture.js';
import { LOBBY_H } from './consts.js';

const X0 = -52, X1 = -22, Z0 = 20.4, Z1 = 36.4, H = LOBBY_H;

export function buildLobby(scene, ctx) {
  const M = palette();
  const R = ctx.rand;
  const par = new THREE.Group(); par.name = 'lobby'; scene.add(par);
  const out = { doors: [] };
  const emit = (o) => LightPool.add({ levelY: 0, levelRange: 9, zone: 'lobby', ...o });
  const A = new Kit();
  const stone = pm('terrazzo', { color: 0xf0ebe0, col2: 0xb08a5a, rough: 0.3, interior: true });
  const darkStone = pm('marble', { color: 0x17181a, col2: 0xb8a067, physical: true, clearcoat: 0.6, ccRough: 0.06, interior: true });
  const slat = pm('woodfurn', { color: 0xc99d66, col2: 0x7d5530, p: [1, 0, 0, 0], interior: true });
  const warmPanel = pm('plain', { color: 0x120d08, emissive: 0xffb060, emissiveI: 0.85, interior: true });
  const warmLed = pm('plain', { color: 0x050505, emissive: 0xffc890, emissiveI: 2.4, interior: true });
  const lobbyWall = pm('plaster', { color: 0xdcd5c8, interior: true });
  const box = (mat, x0, x1, y0, y1, z0, z1, col = true) => {
    A.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, y0, (z0 + z1) / 2);
    if (col) addCollider(x0, x1, z0, z1, y0, y1, 0);
  };

  // ---------------- shell ----------------
  A.box(stone, X1 - X0, 0.15, Z1 - Z0, (X0 + X1) / 2, -0.15, (Z0 + Z1) / 2);                // floor
  A.box(M.concrete, 80, 0.3, 60, -40, -0.5, 40);
  A.box(M.ceiling, X1 - X0 + 0.5, 0.12, Z1 - Z0 + 0.5, (X0 + X1) / 2, H - 0.16, (Z0 + Z1) / 2);   // ceiling slab
  // marble inlay ring + border
  A.cyl(darkStone, 4.1, 4.1, 0.012, -38, 0, 28.2, { seg: 64 });
  A.cyl(stone, 3.9, 3.9, 0.014, -38, 0, 28.2, { seg: 64 });
  A.cyl(darkStone, 3.0, 3.0, 0.016, -38, 0, 28.2, { seg: 64 });
  A.cyl(stone, 2.85, 2.85, 0.018, -38, 0, 28.2, { seg: 64 });
  for (const [x0, x1, z0, z1] of [[X0, X1, Z0, Z0 + 0.25], [X0, X1, Z1 - 0.25, Z1], [X0, X0 + 0.25, Z0, Z1], [X1 - 0.25, X1, Z0, Z1]]) A.box(darkStone, x1 - x0, 0.01, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  // walls: west, east, south (elevator opening at x -27.1..-24.9)
  box(lobbyWall, X0 - 0.3, X0, 0, H, Z0, Z1 + 0.3);
  box(lobbyWall, X1, X1 + 0.3, 0, H, Z0, Z1 + 0.3);
  box(lobbyWall, X0, -27.1, 0, H, Z1, Z1 + 0.3);
  box(lobbyWall, -24.9, X1, 0, H, Z1, Z1 + 0.3);
  A.box(lobbyWall, 2.2, H - 2.45, 0.3, -26.0, 2.45, Z1 + 0.15);
  // slat feature wall on the south wall (west half), backlit
  A.box(warmPanel, 21.5, H - 0.4, 0.02, (X0 + (-30.3)) / 2 + 0.0, 0.2, Z1 - 0.06);
  for (let i = 0; i < 100; i++) {
    const x = X0 + 0.15 + i * 0.215;
    if (x > -30.6) break;
    A.box(slat, 0.07, H - 0.4, 0.09, x, 0.2, Z1 - 0.12, { r: 0.006 });
  }
  A.box(M.brass, 21.7, 0.04, 0.1, (X0 + -30.2) / 2, 0.16, Z1 - 0.12);
  // glass front: mullions + transom, doors at x -41.4..-38.6
  const glassBays = 10;
  const dx0 = -41.4, dx1 = -38.6;
  for (let i = 0; i <= glassBays; i++) { const x = X0 + i * ((X1 - X0) / glassBays); if (x > dx0 - 0.1 && x < dx1 + 0.1) continue; A.box(M.blackMetal, 0.09, H - 0.16, 0.18, x, 0.0, Z0 - 0.02, { r: 0.006 }); }
  A.box(M.blackMetal, X1 - X0, 0.12, 0.2, (X0 + X1) / 2, 3.5, Z0 - 0.02);
  A.box(M.blackMetal, X1 - X0, 0.15, 0.2, (X0 + X1) / 2, 0, Z0 - 0.02);
  A.box(M.blackMetal, X1 - X0, 0.18, 0.24, (X0 + X1) / 2, H - 0.34, Z0 - 0.02);
  // door frame (heavier) around the sliding doors
  A.box(M.steel, 0.14, 3.5, 0.24, dx0 - 0.07, 0, Z0 - 0.02); A.box(M.steel, 0.14, 3.5, 0.24, dx1 + 0.07, 0, Z0 - 0.02); A.box(M.steel, dx1 - dx0 + 0.28, 0.14, 0.24, -40, 3.36, Z0 - 0.02);
  // canopy over the entrance
  A.box(M.blackMetal, 8, 0.22, 3.6, -40, 4.15, Z0 - 1.9, { r: 0.01 });
  A.box(warmLed, 7.8, 0.02, 0.05, -40, 4.13, Z0 - 3.68);
  for (let i = 0; i < 6; i++) A.box(warmLed, 0.14, 0.01, 0.14, -43 + i * 1.2, 4.14, Z0 - 1.5);
  A.box(M.brass, 3.4, 0.36, 0.03, -40, 4.5, Z0 - 0.2);
  // reception desk + wall behind it
  const dk = new Kit();
  dk.box(darkStone, 4.8, 1.1, 0.8, 0, 0, 0, { r: 0.01 });
  dk.box(warmPanel, 4.6, 0.85, 0.03, 0, 0.1, 0.4);
  dk.box(M.marbleW, 5.0, 0.06, 1.0, 0, 1.1, -0.05, { r: 0.006 });
  dk.box(M.brass, 4.8, 0.03, 0.03, 0, 0.08, 0.42);
  dk.box(M.blackMetal, 0.5, 0.35, 0.04, -1.2, 1.16, -0.15, { rx: -0.35 }); dk.box(M.blackMetal, 0.1, 0.2, 0.04, -1.2, 1.16, -0.05);
  dk.lathe(M.ceramic, [[0, 0], [0.09, 0], [0.13, 0.16], [0.06, 0.3], [0.05, 0.32]], 1.6, 1.16, -0.1);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; dk.sph(pm('plain', { color: [0xe8b4c0, 0xf2e9c8, 0xc9a2d6, 0xf6f0ea][i % 4], rough: 0.5, interior: true }), 0.075, 1.6 + Math.cos(a) * 0.07, 1.5 + (i % 3) * 0.06, -0.1 + Math.sin(a) * 0.07, {}); }
  dk.tube(M.leaf, [[1.6, 1.36, -0.1], [1.62, 1.46, -0.1]], 0.006, { seg: 2, radial: 4 });
  F.finish(par, dk, -44.6, 0, 30.6, 0);
  addCollider(-47.2, -42.0, 30.0, 31.2, 0, 1.3, 0);
  // brass lettering "MERIDIAN" backdrop
  const sign = canvasTex(1024, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#e8c27a'; c.font = '600 72px "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.letterSpacing = '22px'; c.fillText('MERIDIAN TOWER', w / 2, h / 2);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: sign, transparent: true, metalness: 0.35, roughness: 0.35, emissive: 0xffc070, emissiveMap: sign, emissiveIntensity: 1.7 });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.75), signMat);
  sm.position.set(-44.6, 3.6, Z1 - 0.19); sm.rotation.y = Math.PI; par.add(sm);
  // seating group (west)
  F.sofa(par, 0, -49.9, 25.2, Math.PI / 2, { W: 2.6, mat: M.charcoal });
  F.sofa(par, 0, -45.1, 25.2, -Math.PI / 2, { W: 2.6, mat: M.charcoal });
  F.coffeeTable(par, 0, -47.5, 25.2);
  F.rug(par, 0, -47.5, 25.2, 5.6, 3.8, 0, { color: 0xc9b99a, col2: 0x6a5238, freq: 1.3 });
  F.floorLamp(par, 0, -51.3, 22.4, Math.PI / 2);
  // planters with big trees
  const planter = (x, z, s, seed) => { const k = new Kit(); k.box(darkStone, 1.0, 0.6, 1.0, 0, 0, 0, { r: 0.03 }); k.box(M.soil, 0.9, 0.02, 0.9, 0, 0.6, 0); F.finish(par, k, x, 0, z, 0); F.fiddleFig(par, 0.6, x, z, s, seed); addCollider(x - 0.55, x + 0.55, z - 0.55, z + 0.55, 0, 3, 0); };
  planter(-51.2, 34.6, 1.9, 5); planter(-23.0, 22.0, 1.9, 6); planter(-33.2, 22.2, 1.7, 7);
  // mailboxes near the elevator
  const mk = new Kit();
  for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) { mk.box(M.brass, 0.27, 0.24, 0.05, c * 0.29, r * 0.26, 0, { r: 0.004 }); mk.box(M.blackMetal, 0.06, 0.012, 0.01, c * 0.29, r * 0.26 + 0.1, 0.03); }
  F.finish(par, mk, -33.8 + 1.45, 0.75, Z1 - 0.06, Math.PI);
  A.box(M.blackMetal, 3.1, 0.06, 0.15, -30.6, 0.7, Z1 - 0.1);
  Interact.add({ pos: new THREE.Vector3(-31.8, 1.5, Z1 - 0.4), r: 1.3, maxDist: 2.8, label: () => 'Check your mailbox', act: () => G.game?.checkMail?.() });
  // console with flowers next to the elevator
  const ck = new Kit();
  ck.box(M.walnut, 1.6, 0.05, 0.4, 0, 0.8, 0, { r: 0.006 }); for (const s of [-1, 1]) ck.box(M.blackMetal, 0.04, 0.8, 0.36, s * 0.75, 0, 0);
  F.finish(par, ck, -21.6 - 1.6, 0, Z1 - 0.3, Math.PI);
  // wall art
  F.artwork(par, X1 - 0.18, 1.4, 27.5, -Math.PI / 2, 2.6, 1.7, 0, 'brass');
  F.artwork(par, X0 + 0.16, 1.5, 29.5, Math.PI / 2, 2.2, 1.5, 2, 'black');
  // decorative closed elevators + fire door
  for (const x of [-30.0, -22.9]) { A.box(M.steel, 1.4, 2.4, 0.06, x, 0, Z1 - 0.06, { r: 0.004 }); A.box(M.blackMetal, 0.01, 2.3, 0.07, x, 0.05, Z1 - 0.06); }
  // chandelier: a cloud of glass orbs
  const orbGeo = new THREE.SphereGeometry(1, 14, 10);
  const orbs = new THREE.InstancedMesh(orbGeo, pm('plain', { color: 0x0a0a0a, emissive: 0xffd39a, emissiveI: 4.2, interior: true }), 90);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const cordK = new Kit();
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 2.4, y = 2.7 + R() * 3.7, s = 0.05 + R() * 0.09;
    pv.set(-38 + Math.cos(a) * r, y, 28.2 + Math.sin(a) * r); sc.setScalar(s);
    m4.compose(pv, q, sc); orbs.setMatrixAt(i, m4);
    cordK.cyl(M.blackMetal, 0.003, 0.003, H - 0.2 - y, pv.x, y, pv.z, { seg: 3 });
  }
  par.add(orbs); cordK.mesh(par, { cast: false });
  // downlights strips
  for (let x = -50; x < -22; x += 4) A.box(warmLed, 0.08, 0.02, 12, x, H - 0.17, 28.4);
  A.mesh(par, { reflect: true });

  // lights
  const lights = [];
  const L = (x, y, z, i, d = 12, c = 0xffd6a0) => lights.push(emit({ pos: new THREE.Vector3(x, y, z), color: c, intensity: i * 0.85, distance: d }));
  L(-38, 4.6, 28.2, 150, 16); L(-46.5, 3.2, 25.2, 60, 9); L(-44.6, 2.6, 31.4, 55, 8); L(-28, 4.5, 30, 80, 12); L(-27, 3, 34.5, 45, 8); L(-40, 4, 22, 70, 10, 0xffe6c4);
  out.lights = lights;

  // ---------------- lobby windows (glass pane, static transparent) ----------------
  const glassMat = pm('plain', { color: 0x0a1518, rough: 0.02, glass: true, opacity: 0.1, side: THREE.DoubleSide, env: 2.2 });
  const gw = (X1 - X0) / glassBays;
  const fa = dx0 - 0.14, fb = dx1 + 0.14;            // door frame edges: glass stops here
  for (let i = 0; i < glassBays; i++) {
    const a0 = X0 + gw * i, b0 = a0 + gw;
    for (const [a, b] of [[a0, Math.min(b0, fa)], [Math.max(a0, fb), b0]]) {
      if (b - a < 0.1) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a - 0.1, H - 0.5), glassMat);
      m.position.set((a + b) / 2, (H - 0.5) / 2 + 0.15, Z0 - 0.02); par.add(m);
      addCollider(a, b, Z0 - 0.1, Z0 + 0.06, 0, H, 0);
    }
  }
  // the rest of the tower's ground floor is solid mass around the lobby
  addCollider(-60, X0 - 0.3, 20, 60, -1, H + 1, 0);
  addCollider(X1 + 0.3, -20, 20, 60, -1, H + 1, 0);
  addCollider(-60, -20, Z1 + 0.3, 60, -1, H + 1, 0);
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(dx1 - dx0 + 0.2, H - 3.5 - 0.5), glassMat);
  transom.position.set(-40, 3.5 + (H - 3.5 - 0.5) / 2 + 0.1, Z0 - 0.02); par.add(transom);
  // sliding doors: two glass leaves
  const leafMat = pm('plain', { color: 0x0a1518, rough: 0.02, glass: true, opacity: 0.12, side: THREE.DoubleSide, env: 2 });
  const leaf = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); const w = (dx1 - dx0) / 2;
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 3.3), leafMat); lm.position.set(s * w / 2, 1.7, 0); g.add(lm);
    const fk = new Kit(); fk.box(M.steel, 0.05, 3.32, 0.05, s * (w - 0.02), 0.04, 0); fk.box(M.steel, 0.05, 3.32, 0.05, 0, 0.04, 0); fk.box(M.steel, w, 0.05, 0.05, s * w / 2, 3.3, 0); fk.box(M.steel, w, 0.05, 0.05, s * w / 2, 0.04, 0);
    fk.cyl(M.steel, 0.02, 0.02, 1.0, s * 0.08, 1.1, 0.06, { seg: 8 }); fk.mesh(g, {});
    g.position.set(-40, 0, Z0 - 0.06); par.add(g); leaf.push({ g, s });
  }
  const doorBlock = addCollider(dx0, dx1, Z0 - 0.1, Z0 + 0.06, 0, H, 0);
  out.doorOpen = 0;
  out.update = (dt) => {
    const P = G.player;
    const near = P && P.level === 0 && Math.abs(P.pos.x + 40) < 3.4 && P.pos.z > Z0 - 4.2 && P.pos.z < Z0 + 3.2;
    out.doorOpen += ((near ? 1 : 0) - out.doorOpen) * (1 - Math.exp(-dt * 4));
    for (const l of leaf) l.g.position.x = -40 + l.s * out.doorOpen * 1.3;
    doorBlock.on = out.doorOpen < 0.6;
  };
  out.spawn = { x: -40, z: 24.5 };
  out.concierge = new THREE.Vector3(-44.6, 0, 32.1);
  return out;
}
