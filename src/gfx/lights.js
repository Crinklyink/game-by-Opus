// Dynamic light pool. Forward rendering pays for every light on every pixel, so instead of
// hundreds of lights we keep a fixed number of PointLights (no shader recompiles) and
// reassign them every frame to the most important nearby "emitters" (lamps, signs, cars...)
// with smooth fading so nothing pops.
import * as THREE from 'three';
import { G } from '../core/G.js';

export class LightPool {
  constructor(scene, count) {
    this.slots = [];
    for (let i = 0; i < count; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 2);
      L.castShadow = false; L.visible = true;
      scene.add(L);
      this.slots.push({ L, em: null, cur: 0 });
    }
    this.tmp = [];
  }

  // emitter: { pos:Vector3|{x,y,z}, color:Color, intensity(cd), distance(m), on, k(0..1 fade), priority, group }
  static add(o) {
    const e = Object.assign({ color: new THREE.Color(1, 0.8, 0.55), intensity: 40, distance: 10, on: true, k: 1, priority: 1, pos: new THREE.Vector3() }, o);
    if (!(e.color instanceof THREE.Color)) e.color = new THREE.Color(e.color);
    if (!(e.pos instanceof THREE.Vector3)) e.pos = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
    e.k = e.on ? 1 : 0;
    G.emitters.push(e);
    return e;
  }

  update(dt, cam) {
    const cands = this.tmp; cands.length = 0;
    for (const e of G.emitters) {
      const target = e.on ? 1 : 0;
      e.k += (target - e.k) * (1 - Math.exp(-dt * 9));
      if (e.k < 0.01 && !e.on) continue;
      if (e.levelY != null && Math.abs(cam.y - e.levelY) > e.levelRange) continue;   // other floor
      const dx = e.pos.x - cam.x, dy = e.pos.y - cam.y, dz = e.pos.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (e.distance * 3.5) ** 2 && d2 > 900) continue;
      e._score = e.intensity * e.k * e.priority / (d2 + 6);
      cands.push(e);
    }
    cands.sort((a, b) => b._score - a._score);
    const n = this.slots.length;
    const top = new Set(cands.slice(0, n));
    // free slots whose emitter fell out of the top set (fade them out first)
    for (const s of this.slots) {
      if (s.em && !top.has(s.em)) { s.tgt = 0; if (s.cur < 0.02) s.em = null; }
      else if (s.em) s.tgt = 1;
    }
    // assign new emitters to free slots
    for (const e of top) {
      if (this.slots.some((s) => s.em === e)) continue;
      const free = this.slots.find((s) => !s.em);
      if (free) { free.em = e; free.cur = 0; free.tgt = 1; }
    }
    for (const s of this.slots) {
      const L = s.L;
      s.cur += ((s.tgt ?? 0) - s.cur) * (1 - Math.exp(-dt * 12));
      if (s.em) {
        L.position.copy(s.em.pos);
        L.color.copy(s.em.color);
        L.distance = s.em.distance;
        L.intensity = s.em.intensity * s.em.k * s.cur * (s.em.flicker ? 0.85 + 0.15 * Math.sin(G.u.uTime.value * 40) : 1);
      } else L.intensity = 0;
    }
  }
}
