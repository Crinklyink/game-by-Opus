// A real elevator: the cab (with the player inside) travels 164.5 m between the lobby and
// floor 48. Landing doors + cab doors slide, floor indicators count, hum + ding via audio hooks.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Kit, addCollider } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { LightPool } from '../gfx/lights.js';
import { Interact } from '../systems/interact.js';
import { makeScreen } from './screens.js';
import { APT_Y } from './consts.js';
import { canvasTex } from '../gfx/noise.js';

const XC = -26, ZD = 36.4, OW = 2.2, OH = 2.45;
const LEVEL_Y = [0, APT_Y];

function drawFloor(ctx, w, h, t, s) {
  ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, w, h);
  const txt = s.text ?? 'L';
  ctx.fillStyle = s.color ?? '#ffb347';
  ctx.font = `bold ${Math.round(h * 0.78)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, w / 2 - (s.arrow ? h * 0.25 : 0), h * 0.54);
  if (s.arrow) {
    ctx.beginPath();
    const ax = w / 2 + h * 0.62 + (txt.length > 1 ? h * 0.2 : 0), ay = h * 0.5, d = s.arrow;
    ctx.moveTo(ax, ay - d * h * 0.22); ctx.lineTo(ax + h * 0.2, ay + d * h * 0.14); ctx.lineTo(ax - h * 0.2, ay + d * h * 0.14); ctx.fill();
  }
}

// stainless door leaf detailing: raised border rails around a slightly darker, recessed centre panel, on the face (dir) people see
function leafDetail(dk, M, cx, w, h, t, dir) {
  const rail = 0.04, inset = 0.07, z = dir * (t / 2 + 0.003);
  const hi = pm('metal', { color: 0xc3c7cc, p: [1, 110, 0, 0], interior: true }), lo = pm('metal', { color: 0x80868c, p: [1, 150, 0, 0], interior: true });
  dk.box(lo, w - 2 * inset, h - 2 * inset, 0.004, cx, inset, dir * (t / 2 + 0.001), { r: 0.002 });
  dk.box(hi, w - 2 * inset + rail, rail, 0.008, cx, inset - rail / 2, z, { r: 0.002 });
  dk.box(hi, w - 2 * inset + rail, rail, 0.008, cx, h - inset - rail / 2, z, { r: 0.002 });
  dk.box(hi, rail, h - 2 * inset - rail, 0.008, cx - (w - 2 * inset) / 2, inset + rail / 2, z, { r: 0.002 });
  dk.box(hi, rail, h - 2 * inset - rail, 0.008, cx + (w - 2 * inset) / 2, inset + rail / 2, z, { r: 0.002 });
  dk.box(M.blackMetal, w, 0.05, 0.012, cx, 0.0, dir * (t / 2 + 0.002));                       // kick plate shadow line
}

export function buildElevator(scene, opts = {}) {
  const M = palette();
  const E = {
    level: 1, doors: 0, moving: false, busy: false, y: LEVEL_Y[1], travelT: 0, from: 1, to: 1,
    displayText: '48',
  };

  // ---------------- cab ----------------
  const cab = new THREE.Group();
  cab.position.set(XC, LEVEL_Y[1], ZD);
  scene.add(cab);
  const k = new Kit();
  const mirror = pm('plain', { color: 0xc5ccd0, metal: 1, rough: 0.03, interior: true });
  const seam = pm('metal', { color: 0xb7bbc0, p: [1, 110, 0, 0], interior: true });
  const floorStone = pm('marble', { color: 0x202225, col2: 0x8f7c55, physical: true, clearcoat: 0.6, ccRough: 0.1, interior: true });
  const HW = 1.1, D0 = 0.08, D1 = 2.1, H = 2.6;
  k.box(floorStone, HW * 2 + 0.1, 0.1, D1 - D0 + 0.1, 0, -0.1, (D0 + D1) / 2);
  k.box(M.plasticW, HW * 2 + 0.1, 0.06, D1 - D0 + 0.1, 0, H, (D0 + D1) / 2);
  // back mirror (upper) + steel dado
  k.box(M.blackMetal, HW * 2, H - 0.95, 0.02, 0, 0.9, D1 + 0.01);
  G.mirrors?.add(cab, { name: 'cab', pos: [0, 0.9 + (H - 0.95) / 2, D1 - 0.002], normal: [0, 0, -1], quads: [{ w: HW * 2, h: H - 0.95 }], res: 1024, dynamic: true });
  k.box(seam, HW * 2, 0.9, 0.03, 0, 0, D1 + 0.015);
  k.box(M.brass, HW * 2, 0.03, 0.05, 0, 0.9, D1 - 0.005);
  // handrail
  k.cyl(M.brass, 0.018, 0.018, HW * 1.6, 0, 0.95, D1 - 0.1, { rz: Math.PI / 2, cy: true, seg: 12 });
  for (const s of [-1, 1]) k.cyl(M.brass, 0.012, 0.012, 0.1, s * HW * 0.78, 0.95, D1 - 0.05, { rx: Math.PI / 2, cy: true, seg: 8 });
  // side walls: walnut left, steel right (with button panel)
  k.box(M.walnutV, 0.04, H, D1 - D0, -HW - 0.02, 0, (D0 + D1) / 2);
  k.box(seam, 0.04, H, D1 - D0, HW + 0.02, 0, (D0 + D1) / 2);
  for (const zz of [0.7, 1.4]) { k.box(M.brass, 0.008, H - 0.1, 0.012, -HW + 0.002, 0.05, zz); }
  // button panel on right wall
  k.box(M.blackMetal, 0.02, 0.95, 0.24, HW - 0.005, 0.95, 0.5, { r: 0.004 });
  const btnOff = pm('plain', { color: 0x444, rough: 0.3, interior: true });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) k.cyl(M.chrome, 0.018, 0.018, 0.012, HW - 0.02, 1.0 + r * 0.14, 0.44 + c * 0.1, { rz: Math.PI / 2, cy: true, seg: 12 });
  const btnGlowMat = pm('plain', { color: 0x000000, emissive: 0xffb347, emissiveI: 3, interior: true });
  k.cyl(btnGlowMat, 0.011, 0.011, 0.014, HW - 0.024, 1.0 + 5 * 0.14, 0.44, { rz: Math.PI / 2, cy: true, seg: 10 });   // "48" lit
  k.cyl(btnGlowMat, 0.011, 0.011, 0.014, HW - 0.024, 1.0, 0.44, { rz: Math.PI / 2, cy: true, seg: 10 });            // "L" lit
  // ceiling panel
  const panel = pm('plain', { color: 0x050505, emissive: 0xfff0dc, emissiveI: 3.2, interior: true });
  k.box(panel, 1.5, 0.02, 1.3, 0, H - 0.03, 1.1);
  k.box(M.brass, 1.56, 0.02, 1.36, 0, H - 0.05, 1.1);
  // header above door + door track
  k.box(M.steel, HW * 2 + 0.1, H - OH, 0.1, 0, OH, D0 - 0.02);
  k.box(M.steel, HW * 2 + 0.12, 0.04, 0.08, 0, 0.0, D0 - 0.02);
  k.mesh(cab, { cast: true, receive: true });
  // floor indicator inside
  const inDisp = makeScreen(256, 128, drawFloor, { fps: 8 }); inDisp.text = '48'; inDisp.visible = true; inDisp.level = 1.3;
  const inMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), inDisp.mat);
  inMesh.position.set(0, OH + 0.08, D0 + 0.035); inMesh.rotation.y = 0; cab.add(inMesh);
  // cab door panels (two) sliding sideways along z = D0
  const dg = { '-1': new THREE.Group(), '1': new THREE.Group() };
  cab.add(dg['-1'], dg['1']);
  for (const s of [-1, 1]) { dg[s].position.set(0, 0, D0); const dk = new Kit(); dk.box(seam, OW / 2, OH, 0.05, s * OW / 4, 0, 0, { r: 0.003 }); leafDetail(dk, M, s * OW / 4, OW / 2, OH, 0.05, 1); dk.box(M.brass, 0.01, OH - 0.1, 0.055, s * 0.005, 0.05, 0); dk.mesh(dg[s], {}); }
  const cabLight = LightPool.add({ pos: new THREE.Vector3(XC, LEVEL_Y[1] + 2.4, ZD + 1.1), color: 0xffe9cc, intensity: 45, distance: 5.5, priority: 2, zone: 'elevator' });

  // ---------------- landings (frames, doors, indicators, call buttons) ----------------
  const landings = [];
  for (let L = 0; L < 2; L++) {
    const y0 = LEVEL_Y[L];
    const g = new THREE.Group(); g.position.set(XC, y0, ZD); scene.add(g);
    const lk = new Kit();
    lk.box(M.steel, 0.14, OH + 0.14, 0.08, -OW / 2 - 0.07, 0, -0.02, { r: 0.004 });
    lk.box(M.steel, 0.14, OH + 0.14, 0.08, OW / 2 + 0.07, 0, -0.02, { r: 0.004 });
    lk.box(M.steel, OW + 0.28, 0.14, 0.08, 0, OH, -0.02, { r: 0.004 });
    lk.box(M.blackMetal, OW, 0.05, 0.1, 0, -0.01, 0.0);
    // call panel to the right
    lk.box(M.steel, 0.12, 0.3, 0.02, OW / 2 + 0.4, 1.05, -0.03, { r: 0.006 });
    lk.cyl(M.chrome, 0.026, 0.026, 0.012, OW / 2 + 0.4, 1.12, -0.045, { rx: Math.PI / 2, cy: true, seg: 16 });
    lk.cyl(M.chrome, 0.026, 0.026, 0.012, OW / 2 + 0.4, 1.0, -0.045, { rx: Math.PI / 2, cy: true, seg: 16 });
    lk.mesh(g, {});
    const disp = makeScreen(256, 128, drawFloor, { fps: 8 }); disp.text = L === 0 ? 'L' : '48'; disp.visible = true; disp.level = 1.3;
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), disp.mat); dm.position.set(0, OH + 0.35, -0.065); dm.rotation.y = Math.PI; g.add(dm);
    const dmk = new Kit(); dmk.box(M.blackMetal, 0.48, 0.26, 0.03, 0, OH + 0.22, -0.045, { r: 0.006 }); dmk.mesh(g, {});
    const pg = { '-1': new THREE.Group(), '1': new THREE.Group() };
    for (const s of [-1, 1]) { pg[s].position.set(0, 0, -0.02); g.add(pg[s]); const dk = new Kit(); dk.box(seam, OW / 2 - 0.004, OH, 0.045, s * OW / 4, 0, 0, { r: 0.003 }); leafDetail(dk, M, s * OW / 4, OW / 2 - 0.004, OH, 0.045, -1); dk.box(M.blackMetal, 0.006, OH - 0.1, 0.05, s * 0.004, 0.05, 0); dk.mesh(pg[s], {}); }
    const block = addCollider(XC - OW / 2, XC + OW / 2, ZD - 0.16, ZD + 0.08, y0, y0 + OH, L);
    const cabWalls = [
      addCollider(XC - HW - 0.06, XC - HW + 0.01, ZD + 0.05, ZD + D1 + 0.06, y0, y0 + H, L),
      addCollider(XC + HW - 0.01, XC + HW + 0.06, ZD + 0.05, ZD + D1 + 0.06, y0, y0 + H, L),
      addCollider(XC - HW, XC + HW, ZD + D1, ZD + D1 + 0.08, y0, y0 + H, L),
    ];
    landings.push({ g, disp, pg, block, cabWalls, y0 });
    Interact.add({ pos: new THREE.Vector3(XC + OW / 2 + 0.4, y0 + 1.06, ZD - 0.05), r: 0.32, maxDist: 2.6, label: () => (E.level === L && E.doors > 0.5 ? 'Elevator is here' : 'Call the elevator'), act: () => E.call(L) });
  }
  // inside buttons
  Interact.add({ pos: new THREE.Vector3(XC + HW - 0.05, LEVEL_Y[1] + 1.4, ZD + 0.5), r: 0.4, maxDist: 2.4, en: () => E.level === 1 && !E.busy && G.player.level === 1 && G.player.pos.z > ZD + 0.3, label: () => 'Ride down to the lobby (L)', act: () => E.ride(0) });
  Interact.add({ pos: new THREE.Vector3(XC + HW - 0.05, LEVEL_Y[0] + 1.4, ZD + 0.5), r: 0.4, maxDist: 2.4, en: () => E.level === 0 && !E.busy && G.player.level === 0 && G.player.pos.z > ZD + 0.3, label: () => 'Ride up to floor 48', act: () => E.ride(1) });

  E.cab = cab; E.landings = landings; E.cabLight = cabLight;
  const setDisplays = (txt, arrow = 0) => { for (const d of [inDisp, ...landings.map((l) => l.disp)]) { d.text = txt; d.arrow = arrow; d.acc = 1; } };
  E.setDisplays = setDisplays;

  E.call = (L) => {
    if (E.busy) { G.game?.toast?.('The elevator is on its way.'); return; }
    if (E.level === L) { E.openDoors = true; return; }
    // summon: cab travels (invisibly) to this level
    E.busy = true; E.openDoors = false;
    const from = E.level;
    G.audio?.ding?.();
    G.game?.toast?.('Elevator arriving...');
    E.remote = { t: 0, dur: 5.5, from, to: L };
  };
  E.ride = (to) => {
    if (E.busy) return;
    E.busy = true; E.openDoors = false;
    G.player.lock++;
    E.riding = { phase: 'closing', t: 0, from: E.level, to };
    G.audio?.elevatorStart?.();
  };
  E.openDoors = true;

  E.update = (dt) => {
    // door animation
    const target = E.openDoors && !E.moving ? 1 : 0;
    E.doors += (target - E.doors) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(E.doors - target) < 0.004) E.doors = target;
    const open = E.doors * (OW / 2 - 0.02);
    for (const s of [-1, 1]) { dg[s].position.x = s * open * 0.98; }
    landings.forEach((l, i) => { const o = E.level === i ? open : 0; for (const s of [-1, 1]) l.pg[s].position.x = s * o * 0.98; });

    if (E.remote) {
      const r = E.remote; r.t += dt;
      const p = Math.min(1, r.t / r.dur);
      const y = LEVEL_Y[r.from] + (LEVEL_Y[r.to] - LEVEL_Y[r.from]) * p;
      const floorNum = r.to === 0 ? Math.max(1, Math.round(48 - p * 47)) : Math.max(1, Math.round(p * 47) + 1);
      E.setDisplays(p > 0.98 ? (r.to === 0 ? 'L' : '48') : String(floorNum), r.to > r.from ? 1 : -1);
      cab.position.y = y;
      cabLight.pos.y = y + 2.4;
      if (p >= 1) { E.remote = null; E.level = r.to; E.busy = false; E.openDoors = true; G.audio?.ding?.(); E.setDisplays(r.to === 0 ? 'L' : '48'); }
    }
    if (E.riding) {
      const r = E.riding; r.t += dt;
      const P = G.player;
      if (r.phase === 'closing') {
        E.openDoors = false;
        if (r.t > 1.7) { r.phase = 'moving'; r.t = 0; E.moving = true; }
      } else if (r.phase === 'moving') {
        const dur = 10.5;
        const p = Math.min(1, r.t / dur);
        const e = p * p * p * (p * (p * 6 - 15) + 10);
        const y = LEVEL_Y[r.from] + (LEVEL_Y[r.to] - LEVEL_Y[r.from]) * e;
        cab.position.y = y; cabLight.pos.y = y + 2.4;
        P.pos.y = y; P.eye = 1.68;
        const rise = LEVEL_Y[r.to] > LEVEL_Y[r.from];
        const floorNum = rise ? Math.min(48, Math.round(e * 47) + 1) : Math.max(1, 48 - Math.round(e * 47));
        E.setDisplays(p > 0.985 ? (r.to === 0 ? 'L' : '48') : String(floorNum), rise ? 1 : -1);
        G.elevProgress = p;
        // subtle vibration
        G.camera.position.y += Math.sin(r.t * 47) * 0.0012 * (1 - Math.abs(p - 0.5) * 1.6);
        if (p >= 1) { r.phase = 'opening'; r.t = 0; E.moving = false; E.level = r.to; P.level = r.to; P.pos.y = LEVEL_Y[r.to]; E.setDisplays(r.to === 0 ? 'L' : '48'); G.audio?.ding?.(); G.audio?.elevatorStop?.(); }
      } else if (r.phase === 'opening') {
        E.openDoors = true;
        if (r.t > 1.3) { E.riding = null; E.busy = false; P.lock = Math.max(0, P.lock - 1); }
      }
    }
    // colliders
    landings.forEach((l, i) => {
      const present = E.level === i && !E.moving && !E.remote;
      l.block.on = !(present && E.doors > 0.55);
      for (const c of l.cabWalls) c.on = present;
    });
  };
  return E;
}
