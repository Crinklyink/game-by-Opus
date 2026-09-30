// Pedestrians and shop NPCs: one instanced, vertex-animated humanoid (walk cycle in the vertex
// shader), umbrellas in the rain, and a small sidewalk/crosswalk waypoint AI that obeys the
// pedestrian signals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { patchMaterial } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { Signals, isRoad, ROAD_Y, WALK_Y } from './street.js';

const PARTS = { LEG_L: 0, LEG_R: 1, TORSO: 2, ARM_L: 3, ARM_R: 4, HEAD: 5, HAIR: 6, SHOE: 7, BAG: 8 };

function part(geo, id, pivot) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  const pv = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pv[i * 3] = pivot[0]; pv[i * 3 + 1] = pivot[1]; pv[i * 3 + 2] = pivot[2]; }
  geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(pv, 3));
  return geo;
}
const tr = (g, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz))); return g; };

function personGeometry() {
  const G_ = [];
  for (const sg of [-1, 1]) {
    const id = sg < 0 ? PARTS.LEG_L : PARTS.LEG_R, hip = [sg * 0.095, 0.93, 0];
    G_.push(part(tr(new THREE.CylinderGeometry(0.088, 0.058, 0.86, 10, 1), sg * 0.095, 0.5, 0), id, hip));
    G_.push(part(tr(new THREE.SphereGeometry(0.09, 8, 6), sg * 0.095, 0.93, 0), id, hip));
    G_.push(part(tr(new THREE.BoxGeometry(0.095, 0.07, 0.27), sg * 0.095, 0.045, 0.06), PARTS.SHOE, hip));
    // arms
    const sh = [sg * 0.245, 1.43, 0], aid = sg < 0 ? PARTS.ARM_L : PARTS.ARM_R;
    G_.push(part(tr(new THREE.CylinderGeometry(0.048, 0.04, 0.6, 8, 1), sg * 0.255, 1.14, 0), aid, sh));
    G_.push(part(tr(new THREE.SphereGeometry(0.048, 8, 6), sg * 0.255, 0.83, 0), aid, sh));
    G_.push(part(tr(new THREE.SphereGeometry(0.056, 8, 6), sg * 0.245, 1.43, 0), aid, sh));
  }
  // torso (tapered), neck, head, hair, bag
  G_.push(part(tr(new THREE.CylinderGeometry(0.2, 0.165, 0.56, 12, 1), 0, 1.2, 0, 1.0, 1, 0.62), PARTS.TORSO, [0, 1.0, 0]));
  G_.push(part(tr(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 8), 0, 1.5, 0), PARTS.HEAD, [0, 1.45, 0]));
  G_.push(part(tr(new THREE.SphereGeometry(0.105, 14, 12), 0, 1.63, 0.005, 0.92, 1.1, 1.0), PARTS.HEAD, [0, 1.45, 0]));
  G_.push(part(tr(new THREE.SphereGeometry(0.111, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 1.655, -0.006, 0.94, 1.08, 1.04), PARTS.HAIR, [0, 1.45, 0]));
  G_.push(part(tr(new THREE.BoxGeometry(0.27, 0.34, 0.13), 0, 1.22, -0.16), PARTS.BAG, [0, 1.0, 0]));
  return mergeGeometries(G_, false);
}

const PERSON_PROC = /* glsl */`
varying vec3 vPC;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float f = nz(wp*9.0).r;
  s.alb *= vPC * (0.9 + 0.2*f);
  s.rough = 0.8;
  s.h = 0.0;
}`;
const VERT = {
  head: `attribute float aPart; attribute vec3 aPivot; attribute vec3 aAnim; attribute vec3 aCShirt; attribute vec3 aCPants; attribute vec3 aCSkin; attribute vec3 aCHair; varying vec3 vPC; float pAng;`,
  normal: /* glsl */`
{
  float sp = max(aAnim.y, 0.0), sw = sin(aAnim.x) * 0.72 * sp;
  pAng = 0.0;
  if (aPart < 0.5) pAng = sw; else if (aPart < 1.5) pAng = -sw; else if (aPart > 2.5 && aPart < 3.5) pAng = -sw * 0.85; else if (aPart > 3.5 && aPart < 4.5) pAng = sw * 0.85;
  if (aAnim.y < -0.5) { if (aPart < 1.5 || (aPart > 6.5 && aPart < 7.5)) pAng = -1.4; else if (aPart > 2.5 && aPart < 4.5) pAng = -0.55; }
  float c = cos(pAng), s = sin(pAng);
  objectNormal = vec3(objectNormal.x, objectNormal.y * c - objectNormal.z * s, objectNormal.y * s + objectNormal.z * c);
}`,
  begin: /* glsl */`
{
  float sp = max(aAnim.y, 0.0);
  float c = cos(pAng), s = sin(pAng);
  vec3 d = transformed - aPivot;
  transformed = aPivot + vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c);
  float bob = abs(sin(aAnim.x)) * 0.028 * sp + sin(aAnim.x * 0.31 + aAnim.z * 20.0) * 0.004;
  transformed.y += bob;
  if (aPart > 1.5 && aPart < 2.5) transformed.x += sin(aAnim.x) * 0.012 * sp;
  vec3 pc = aCShirt;
  if (aPart < 1.5) pc = aCPants;
  else if (aPart < 2.5) pc = aCShirt;
  else if (aPart < 4.5) { bool low = position.y < aPivot.y - 0.33; pc = low ? aCSkin : aCShirt; }
  else if (aPart < 5.5) pc = aCSkin;
  else if (aPart < 6.5) pc = aCHair;
  else if (aPart < 7.5) pc = vec3(0.05);
  else pc = mix(aCShirt, aCHair, 0.6) * 0.8;
  vPC = pc;
}`,
};

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9b6a48, 0x6f4a33, 0x4a3122];
const HAIR = [0x141010, 0x2a1a10, 0x5a3a20, 0x8a6a3a, 0xc9b070, 0x8a8a8a, 0x8a2c1c];
const SHIRT = [0x2a3a52, 0x8a2c34, 0x2e5a48, 0xd4d0c4, 0x1c1c20, 0x4a5a78, 0xc79a34, 0x6a4a72, 0x3a6a8a, 0xb45a3a, 0xe8e6e0, 0x555a5e];
const PANTS = [0x1c2233, 0x2b2b2e, 0x3a4256, 0x5a4a3a, 0x1a1a1a, 0x4a5568, 0x6a6a68, 0x2c3a2c];

export class People {
  constructor(scene, q, ctx) {
    this.R = rng(1717);
    this.scene = scene; this.q = q;
    this.cap = 96;
    const geo = personGeometry();
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aAnim = attr(); this.aShirt = attr(); this.aPants = attr(); this.aSkin = attr(); this.aHair = attr();
    geo.setAttribute('aAnim', this.aAnim); geo.setAttribute('aCShirt', this.aShirt); geo.setAttribute('aCPants', this.aPants); geo.setAttribute('aCSkin', this.aSkin); geo.setAttribute('aCHair', this.aHair);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const uni = { uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color() }, uWetAmt: { value: 0.6 } };
    mat.customProgramCacheKey = () => 'person';
    mat.onBeforeCompile = (sh) => patchMaterial(sh, PERSON_PROC, uni, '', VERT);
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.layers.enable(1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
    // umbrellas
    const ug = mergeGeometries([
      (() => { const c = new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32); c.translate(0, -0.4, 0); return c.toNonIndexed(); })(),
      (() => { const c = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6); c.translate(0, -0.35, 0); return c.toNonIndexed(); })(),
    ].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
    this.umb = new THREE.InstancedMesh(ug, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), this.cap);
    this.umb.frustumCulled = false; this.umb.count = 0; this.umb.castShadow = true; this.umb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    { const c = new THREE.Color(); const cols = [0x1a1a1f, 0x8a1c2c, 0x2a4a7a, 0x2e6a4c, 0x111111, 0xd4a020, 0x6a3a7a]; for (let i = 0; i < this.cap; i++) this.umb.setColorAt(i, c.set(cols[i % cols.length])); }
    scene.add(this.umb);
    this.list = [];
    this.crossing = [];
    this.m = new THREE.Matrix4(); this.qq = new THREE.Quaternion(); this.e = new THREE.Euler(); this.pv = new THREE.Vector3(); this.sv = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    G.people = this;
  }

  _look(o) {
    const R = this.R, c = new THREE.Color();
    const i = this.list.length;
    const set = (a, hex, k = 1) => { c.set(hex); a.setXYZ(i, c.r * k, c.g * k, c.b * k); };
    set(this.aShirt, o.shirt ?? SHIRT[Math.floor(R() * SHIRT.length)]);
    set(this.aPants, o.pants ?? PANTS[Math.floor(R() * PANTS.length)]);
    set(this.aSkin, o.skin ?? SKIN[Math.floor(R() * SKIN.length)]);
    set(this.aHair, o.hair ?? HAIR[Math.floor(R() * HAIR.length)]);
    return i;
  }

  add(o) {
    const R = this.R;
    if (this.list.length >= this.cap) return null;
    const i = this._look(o);
    const p = {
      i, x: o.x, z: o.z, y: 0, yaw: o.yaw ?? R() * 6.28, speed: 0, v: o.v ?? 1.25 + R() * 0.4, phase: R() * 6.28, scale: 0.94 + R() * 0.13, girth: 0.93 + R() * 0.16,
      mode: o.mode ?? 'idle', umb: R() < 0.62, seed: R(), lat: (R() - 0.5) * 3, sit: !!o.sit, y0: o.sit ? ((o.seat ?? 0.45) - 0.93 * 1.0) : (o.y0 ?? null), state: 'out', wait: 0, level: o.level ?? 0, arm: 0,
      anim: o.anim ?? 0,
    };
    p.tx = p.x; p.tz = p.z;
    this.list.push(p);
    this.mesh.count = this.list.length; this.umb.count = this.list.length;
    return p;
  }

  // sidewalk walkers around the main intersection
  spawnWalkers(n) {
    const R = this.R;
    for (let k = 0; k < n; k++) {
      const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1, alongAve = R() < 0.55;
      const d = 14 + R() * 200;
      const lat = (R() - 0.5) * 2.4;
      const p = this.add({ x: alongAve ? sx * d : sx * (9.4 + lat), z: alongAve ? sz * (9.4 + lat) : sz * d, mode: 'walk' });
      if (!p) return;
      p.corner = [sx, sz]; p.alongAve = alongAve; p.lat = lat; p.state = R() < 0.5 ? 'in' : 'out';
      this._aim(p);
    }
  }

  _cornerPt(p) { const [sx, sz] = p.corner; return [sx * 9.3 + (p.alongAve ? 0 : p.lat), sz * 9.3 + (p.alongAve ? p.lat : 0)]; }
  _aim(p) {
    const [sx, sz] = p.corner;
    if (p.state === 'in') { const [cx, cz] = this._cornerPt(p); p.tx = p.alongAve ? cx : sx * (9.4 + p.lat); p.tz = p.alongAve ? sz * (9.4 + p.lat) : cz; }
    else if (p.state === 'out') { const far = 150 + this.R() * 90; if (p.alongAve) { p.tx = sx * far; p.tz = sz * (9.4 + p.lat); } else { p.tx = sx * (9.4 + p.lat); p.tz = sz * far; } }
  }

  update(dt, camPos) {
    const R = this.R;
    const rain = G.weather.rain;
    const P = G.player;
    this.crossing.length = 0;
    const pa = Signals.pedAvenue(), pc = Signals.pedCross();
    const remA = Signals.dur[3] - Signals.tin, remC = Signals.dur[0] - Signals.tin;
    for (const p of this.list) {
      if (p.mode === 'walk') {
        // ---- walking / waiting / crossing state machine ----
        if (p.state === 'wait') {
          p.speed = 0; p.wait += dt;
          const ok = p.cross.type === 'A' ? (pa === 'w' && remA > 9) : (pc === 'w' && remC > 9);
          if (ok) { p.state = 'cross'; }
        } else {
          const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
          const spd = p.state === 'cross' ? 1.6 : p.v;
          if (d < 0.35) {
            if (p.state === 'out') { p.state = 'in'; this._aim(p); }
            else if (p.state === 'in') {
              // arrived at the corner: decide to cross or turn
              const [sx, sz] = p.corner;
              const r = R();
              if (r < 0.5) {
                // cross the street we are walking along the side of
                const type = p.alongAve ? 'B' : 'A';
                p.cross = { type };
                if (type === 'A') { const [cx] = [sx * 9.1]; p.cx0 = cx; p.tx = cx; p.tz = -sz * 9.3; p.corner = [sx, -sz]; p.x = cx; p.z = sz * 9.3; p.alongAve = false; }
                else { const cz = sz * 9.1; p.tx = -sx * 9.3; p.tz = cz; p.corner = [-sx, sz]; p.x = sx * 9.3; p.z = cz; p.alongAve = true; }
                p.state = 'wait'; p.ccorner = p.corner; p.pending = true;
              } else {
                // turn onto the other street outward
                p.alongAve = !p.alongAve; p.state = 'out'; this._aim(p);
              }
            } else if (p.state === 'cross') {
              p.state = 'out'; if (R() < 0.35) p.alongAve = !p.alongAve; this._aim(p);
            }
          } else {
            const st = spd;
            p.speed += (st - p.speed) * (1 - Math.exp(-dt * 6));
            const nx = dx / d, nz = dz / d;
            p.x += nx * p.speed * dt; p.z += nz * p.speed * dt;
            const yawT = Math.atan2(nx, nz);
            let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            p.yaw += dy * (1 - Math.exp(-dt * 8));
          }
          if (p.state === 'cross') this.crossing.push(p);
        }
      } else {
        p.speed += (0 - p.speed) * (1 - Math.exp(-dt * 6));
      }
      // stopped-at-kerb pose: face the crossing
      if (p.state === 'wait') { const [tx, tz] = [p.tx - p.x, p.tz - p.z]; const yawT = Math.atan2(tx, tz); let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * (1 - Math.exp(-dt * 6)); }
      p.phase += p.speed * dt * 4.6;
      const gy = p.y0 != null ? p.y0 : (isRoad(p.x, p.z) ? ROAD_Y : WALK_Y + 0.02);
      p.y += (gy - p.y) * (1 - Math.exp(-dt * 14));
    }
    // ---- write instances ----
    const aa = this.aAnim.array;
    let ui = 0;
    this.list.forEach((p, k) => {
      const idle = p.mode !== 'walk' || p.state === 'wait';
      const sp = p.speed / 1.5;
      aa[k * 3] = p.phase; aa[k * 3 + 1] = p.sit ? -1 : (idle ? 0 : Math.min(1.4, sp)); aa[k * 3 + 2] = p.seed;
      this.e.set(0, p.yaw, 0); this.qq.setFromEuler(this.e);
      const sit = p.sit ? -0.45 : 0;
      this.pv.set(p.x, p.y + sit * 0, p.z);
      this.sv.set(p.scale * p.girth, p.scale, p.scale * p.girth);
      this.m.compose(this.pv, this.qq, this.sv);
      this.mesh.setMatrixAt(k, this.m);
      // umbrella
      const showU = p.umb && rain > 0.25 && p.mode === 'walk' && p.level === 0;
      if (showU) {
        this.e.set(0.12 * Math.sin(p.phase * 0.5), p.yaw, 0.08); this.qq.setFromEuler(this.e);
        this.pv.set(p.x, p.y + 2.02 * p.scale, p.z);
        this.sv.setScalar(1);
        this.umb.setMatrixAt(k, this.m.compose(this.pv, this.qq, this.sv));
      } else this.umb.setMatrixAt(k, this.zero);
    });
    this.aAnim.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true; this.umb.instanceMatrix.needsUpdate = true;
    for (const a of [this.aShirt, this.aPants, this.aSkin, this.aHair]) a.needsUpdate = true;
  }
}
