// Dynamic light pool. Forward rendering pays for every light on every pixel, so instead of
// hundreds of lights we keep a fixed number of PointLights + SpotLights (no shader recompiles)
// and reassign them every frame to the most important nearby "emitters" (lamps, signs, cars,
// ceiling downlights...) with smooth fading so nothing pops.
// Slots are kept sorted strongest-first: the first few get the expensive SDF soft shadows (see sdf.js).
import * as THREE from 'three';
import { G } from '../core/G.js';

const _fwd = new THREE.Vector3();

function makeSet(scene, count, make) {
  const set = { lights: [], st: [] };
  for (let i = 0; i < count; i++) {
    const L = make();
    L.castShadow = false; L.visible = true;
    scene.add(L);
    set.lights.push(L);
  }
  return set;
}

export class LightPool {
  static zone = 'street';
  constructor(scene, count, spotCount = 0) {
    this.pt = makeSet(scene, count, () => new THREE.PointLight(0xffffff, 0, 10, 2));
    this.sp = makeSet(scene, spotCount, () => { const L = new THREE.SpotLight(0xffffff, 0, 10, 0.9, 0.6, 2); scene.add(L.target); return L; });
    this.cp = []; this.cs = [];
  }

  // emitter: { pos, color, intensity(cd), distance(m), on, k(0..1 fade), priority, zone, spot:{ dir, angle, penumbra } }
  static add(o) {
    const e = Object.assign({ color: new THREE.Color(1, 0.8, 0.55), intensity: 40, distance: 10, on: true, k: 1, priority: 1, pos: new THREE.Vector3() }, o);
    if (!(e.color instanceof THREE.Color)) e.color = new THREE.Color(e.color);
    if (!(e.pos instanceof THREE.Vector3)) e.pos = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
    if (e.spot) e.spot = Object.assign({ dir: new THREE.Vector3(0, -1, 0), angle: 0.9, penumbra: 0.6 }, e.spot);
    e.k = e.on ? 1 : 0;
    G.emitters.push(e);
    return e;
  }

  update(dt, cam, camera) {
    const cp = this.cp, cs = this.cs; cp.length = 0; cs.length = 0;
    if (camera) camera.getWorldDirection(_fwd); else _fwd.set(0, 0, -1);
    const spotsOn = this.sp.lights.length > 0;
    for (const e of G.emitters) {
      const target = e.on ? 1 : 0;
      e.k += (target - e.k) * (1 - Math.exp(-dt * 9));
      if (e.k < 0.01 && !e.on) continue;
      if (e.levelY != null && Math.abs(cam.y - e.levelY) > e.levelRange) continue;   // other floor
      const dx = e.pos.x - cam.x, dy = e.pos.y - cam.y, dz = e.pos.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (e.distance * 3.5) ** 2 && d2 > 900) continue;
      const ez = e.zone || 'street', cz = LightPool.zone;
      const zk = ez === cz ? (ez === 'street' ? 1 : 8) : (ez !== 'street' ? 0.12 : (cz === 'street' ? 1 : 0.2));
      e._score = e.intensity * e.k * e.priority * zk / (d2 + 6);
      if (e.spot) {
        if (!spotsOn) continue;
        // prefer what the player is looking toward; lights already lit get a bonus so the set doesn't flicker
        const f = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / (Math.sqrt(d2) + 1e-3);
        e._score *= (0.72 + 0.28 * Math.max(f, -0.3)) * (e._slot ? 1.35 : 1);
        cs.push(e);
      } else {
        e._score *= e._slot ? 1.15 : 1;
        cp.push(e);
      }
    }
    this.fill(this.pt, cp, dt, false);
    this.fill(this.sp, cs, dt, true);
  }

  fill(set, cands, dt, spot) {
    cands.sort((a, b) => b._score - a._score);
    const n = set.lights.length;
    const top = cands.length > n ? cands.slice(0, n) : cands;
    const topSet = new Set(top);
    // states: one per active emitter; fade in when chosen, out when dropped
    const prev = set.st;
    const next = [];
    for (const s of prev) {
      if (topSet.has(s.em)) { s.tgt = 1; topSet.delete(s.em); next.push(s); }
      else { s.tgt = 0; s.cur += (0 - s.cur) * (1 - Math.exp(-dt * 12)); if (s.cur > 0.02) next.push(s); else s.em._slot = false; }
    }
    for (const e of topSet) { next.push({ em: e, cur: 0, tgt: 1 }); e._slot = true; }
    // strongest first (fading-out states sink to the end)
    for (const s of next) s.rank = s.tgt ? s.em._score : -1 + s.cur;
    next.sort((a, b) => b.rank - a.rank);
    if (next.length > n) { for (const s of next.slice(n)) s.em._slot = false; next.length = n; }
    set.st = next;
    for (let i = 0; i < n; i++) {
      const L = set.lights[i], s = next[i];
      if (!s) { L.intensity = 0; continue; }
      s.cur += (s.tgt - s.cur) * (1 - Math.exp(-dt * 12));
      const e = s.em;
      L.position.copy(e.pos);
      L.color.copy(e.color);
      L.distance = e.distance;
      L.intensity = e.intensity * e.k * s.cur * (e.flicker ? 0.85 + 0.15 * Math.sin(G.u.uTime.value * 40) : 1);
      if (spot) {
        const sp = e.spot;
        L.angle = sp.angle; L.penumbra = sp.penumbra;
        L.target.position.set(e.pos.x + sp.dir.x, e.pos.y + sp.dir.y, e.pos.z + sp.dir.z);
        L.target.updateMatrixWorld();
      }
    }
  }
}
