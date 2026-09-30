// Interaction registry: anything the player can look at + press E on.
import * as THREE from 'three';

export const Interact = {
  items: [],
  add(o) {
    o.maxDist = o.maxDist ?? 2.7;
    o.r = o.r ?? 0.5;
    o.pos = o.pos.isVector3 ? o.pos : new THREE.Vector3(o.pos.x, o.pos.y, o.pos.z);
    this.items.push(o);
    return o;
  },
  // find the best interactable along a view ray
  pick(origin, dir) {
    let best = null, bs = 1e9;
    for (const it of this.items) {
      if (it.en && !it.en()) continue;
      const vx = it.pos.x - origin.x, vy = it.pos.y - origin.y, vz = it.pos.z - origin.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0.15 || t > it.maxDist) continue;
      const px = vx - dir.x * t, py = vy - dir.y * t, pz = vz - dir.z * t;
      const d = Math.sqrt(px * px + py * py + pz * pz);
      if (d > it.r + t * 0.04) continue;
      const score = t + d * 2.5;
      if (score < bs) { bs = score; best = it; }
    }
    return best;
  },
};
