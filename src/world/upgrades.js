// Purchasable apartment upgrades. Everything is pre-built but hidden until bought.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Kit } from './kit.js';
import { palette } from './palette.js';
import { pm } from '../gfx/materials.js';
import { canvasTex } from '../gfx/noise.js';
import { LightPool } from '../gfx/lights.js';
import { Interact } from '../systems/interact.js';
import * as F from './furniture.js';
import { APT_Y } from './consts.js';

const Y = APT_Y;

export function buildUpgrades(scene, apt, kitchen) {
  const M = palette();
  const U = {};
  const grp = (id) => { const g = new THREE.Group(); g.visible = false; scene.add(g); U[id] = { group: g, on: false }; return g; };

  // ---- trailing plants everywhere ----
  {
    const g = grp('plants'); const k = new Kit();
    F.trailingPlant(k, M, -41.0, Y + 1.3 + 0.001, 32.0, 21);            // bookshelf top
    F.trailingPlant(k, M, -34.6, Y + 0.0, 20.9, 22);                    // window sill (floor level planter)
    F.trailingPlant(k, M, -48.4, Y + 0.6, 26.4, 23);                    // bedroom
    F.trailingPlant(k, M, -31.4, Y + 2.4, 24.3, 24);                    // pantry top
    F.trailingPlant(k, M, -42.3, Y + 0.92, 29.2, 25);
    k.mesh(g, {});
    // hanging planters from the ceiling over the window
    const hk = new Kit();
    for (const [x, z] of [[-45, 22.4], [-41.5, 21.3], [-33, 21.8]]) { hk.cyl(M.blackMetal, 0.004, 0.004, 1.6, x, Y + 2.0, z, { seg: 4 }); F.trailingPlant(hk, M, x, Y + 1.85, z, Math.floor(x * 3)); }
    hk.mesh(g, {});
  }
  // ---- ambient LEDs ----
  {
    const g = grp('leds');
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.3, 1.6), toneMapped: false });
    const k = new THREE.Group();
    const mk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
    mk(1.6, 0.02, 0.02, -41.86, Y + 0.44, 27.0); mk(0.02, 0.9, 0.02, -41.86, Y + 0.98, 26.05); mk(0.02, 0.9, 0.02, -41.86, Y + 0.98, 27.95); mk(1.6, 0.02, 0.02, -41.86, Y + 1.55, 27.0);
    mk(2.9, 0.012, 0.02, -38.8, Y + 0.68, 21.6);
    const e = LightPool.add({ pos: new THREE.Vector3(-41.3, Y + 1.0, 27.0), color: 0xff44ff, intensity: 14, distance: 5, on: false, levelY: Y, levelRange: 12, zone: 'apartment' });
    U.leds.update = (t) => { const c = new THREE.Color().setHSL((t * 0.03) % 1, 0.9, 0.55); mat.color.setRGB(c.r * 1.8, c.g * 1.8, c.b * 1.8); e.color.copy(c); };
    U.leds.emitter = e;
  }
  // ---- neon sign ----
  {
    const g = grp('neon');
    const tex = canvasTex(512, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = '800 96px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ff3d96'; c.shadowBlur = 28; c.fillStyle = '#ff5cab'; c.fillText('BUY LOW', w / 2, h / 2 + 4); c.shadowBlur = 8; c.fillStyle = '#ffe0f0'; c.globalAlpha = 0.9; c.fillText('BUY LOW', w / 2, h / 2 + 4); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2), depthWrite: false }));
    m.position.set(-36.7, Y + 2.15, 32.36); m.rotation.y = Math.PI; g.add(m);
    U.neon.emitter = LightPool.add({ pos: new THREE.Vector3(-36.7, Y + 2.1, 31.6), color: 0xff4fa8, intensity: 18, distance: 5, on: false, levelY: Y, levelRange: 12, zone: 'apartment' });
  }
  // ---- espresso machine ----
  {
    const g = grp('espresso'); const k = new Kit();
    const p = kitchen.coffeePos;
    k.box(M.steel, 0.36, 0.42, 0.34, 0, 0, 0, { r: 0.02 }); k.box(M.blackMetal, 0.36, 0.06, 0.34, 0, 0.42, 0, { r: 0.02 });
    k.cyl(M.chrome, 0.03, 0.03, 0.09, 0, 0.18, 0.2, { seg: 12 }); k.cyl(M.blackMetal, 0.028, 0.028, 0.16, 0.0, 0.03, 0.2, { seg: 10 });
    k.box(pm('plain', { color: 0x050505, emissive: 0xffb050, emissiveI: 3, interior: true }), 0.07, 0.02, 0.005, 0.1, 0.34, 0.172);
    k.cyl(M.ceramic, 0.04, 0.035, 0.08, 0.0, 0.03, 0.2, { seg: 12 });
    k.mesh(g, {});
    g.position.set(p.x, Y + 0.926, p.z);
    g.rotation.y = -Math.PI / 2;
  }
  // ---- gallery canvas (east wall near the balcony) ----
  {
    const g = grp('art'); const inner = new THREE.Group(); g.add(inner);
    F.artwork(inner, Y + 1.0, -30.97, 22.5, -Math.PI / 2, 2.6, 1.7, 1, 'brass');
  }
  // ---- telescope on the balcony ----
  {
    const g = grp('telescope'); const k = new Kit();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.cyl(M.brass, 0.012, 0.016, 1.15, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, { rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3, seg: 6 }); }
    k.cyl(M.blackMetal, 0.06, 0.06, 0.08, 0, 1.08, 0, { seg: 12 });
    k.lathe(M.brass, [[0.05, 0], [0.06, 0.1], [0.08, 0.8], [0.085, 0.86], [0.06, 0.86], [0.05, 0.05]], 0, 1.16, 0, { rx: 0 });
    k.cyl(M.blackMetal, 0.05, 0.05, 0.28, 0.02, 1.32, -0.02, { seg: 10 });
    k.mesh(g, {});
    g.position.set(-33.2, Y, 17.1); g.rotation.y = 0.5;
    g.children.forEach((m) => { if (m.isMesh) m.rotation.set(0, 0, 0); });
    const scopeRot = new THREE.Group();
  }
  // upgrade interactions
  Interact.add({ pos: new THREE.Vector3(-33.2, Y + 1.3, 17.1), r: 0.6, maxDist: 2.6, en: () => U.telescope.on, label: () => 'Look through the telescope', act: () => G.game?.telescope?.() });
  Interact.add({ pos: new THREE.Vector3(-36.7, Y + 2.15, 32.2), r: 0.9, maxDist: 3, en: () => U.neon.on, label: () => 'Admire the neon sign', act: () => G.game?.toast?.('"BUY LOW" — the sign is doing its best.') });

  U.set = (id, on) => {
    const u = U[id]; if (!u) return;
    u.on = on; u.group.visible = on;
    if (u.emitter) u.emitter.on = on;
  };
  U.update = (t) => { if (U.leds.on) U.leds.update(t); };
  return U;
}
