// Pedestrians and shop NPCs: one instanced, vertex-animated humanoid (walk cycle in the vertex
// shader), umbrellas in the rain, and a small sidewalk/crosswalk waypoint AI that obeys the
// pedestrian signals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { patchMaterial } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { Signals, isRoad, ROAD_Y, WALK_Y } from './street.js';

// Colour categories (aPart) - what a part is made of. Motion is separate (aSw) so shoes/forearms can follow their limbs.
const PART = { LEG: 0, TORSO: 2, UPPER: 3, FORE: 4, HEAD: 5, HAIR: 6, SHOE: 7, BAG: 8, FACE: 9, BELT: 10, LONGHAIR: 11, JACKET: 12, HAT: 13, HAND: 14 };
// Motion groups (aSw): 1/2 thigh L/R (hip), 3/4 upper arm L/R (shoulder), 5/6 calf+shoe L/R (knee under hip), 7/8 forearm+hand L/R (elbow under shoulder)

function part(geo, id, pivot, sw = 0, pivot2 = pivot) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  geo.setAttribute('aSw', new THREE.Float32BufferAttribute(new Float32Array(n).fill(sw), 1));
  const pv = new Float32Array(n * 3), pv2 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pv.set(pivot, i * 3); pv2.set(pivot2, i * 3); }
  geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(pv, 3));
  geo.setAttribute('aPivot2', new THREE.Float32BufferAttribute(pv2, 3));
  return geo;
}
// translate / rotate(YXZ) / scale a geometry (normals follow via applyMatrix4)
const T = (g, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')), new THREE.Vector3(...s))); return g; };
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const ball = (rad, seg = 12) => new THREE.SphereGeometry(rad, seg, Math.max(6, seg - 4));

function personGeometry() {
  const G_ = [];
  const add = (g, id, pivot, sw, pivot2) => G_.push(part(g, id, pivot, sw, pivot2));
  for (const sg of [-1, 1]) {
    const hip = [sg * 0.095, 0.93, 0], knee = [sg * 0.095, 0.5, 0], sh = [sg * 0.25, 1.43, 0], elb = [sg * 0.25, 1.13, 0];
    const L = sg < 0;
    // ---- legs: thigh (hip) + kneecap; calf + shoe (knee under hip) ----
    add(T(lathe([[0, 0.5], [0.058, 0.5], [0.068, 0.6], [0.081, 0.72], [0.09, 0.86], [0.094, 0.94], [0, 0.945]], 16), [sg * 0.095, 0, 0]), PART.LEG, hip, L ? 1 : 2, hip);
    add(T(ball(0.06, 10), [sg * 0.095, 0.5, 0.006]), PART.LEG, hip, L ? 1 : 2, hip);
    add(T(lathe([[0, 0.075], [0.044, 0.075], [0.053, 0.09], [0.05, 0.13], [0.052, 0.25], [0.056, 0.4], [0.06, 0.49], [0, 0.505]], 14), [sg * 0.095, 0, 0]), PART.LEG, knee, L ? 5 : 6, hip);
    add(T(ball(1, 12), [sg * 0.095, 0.058, 0.058], [0.05, 0.044, 0.125]), PART.SHOE, knee, L ? 5 : 6, hip);          // shoe upper
    add(T(ball(1, 10), [sg * 0.095, 0.058, -0.035], [0.046, 0.04, 0.05]), PART.SHOE, knee, L ? 5 : 6, hip);        // heel
    add(T(new THREE.BoxGeometry(0.088, 0.014, 0.265), [sg * 0.095, 0.008, 0.052]), PART.SHOE, knee, L ? 5 : 6, hip); // sole
    // ---- arms: upper arm + elbow ball (shoulder); forearm + hand (elbow under shoulder) ----
    add(T(lathe([[0, 1.13], [0.038, 1.13], [0.043, 1.2], [0.049, 1.3], [0.054, 1.4], [0.05, 1.45], [0.034, 1.477], [0, 1.483]], 12), [sg * 0.25, 0, 0]), PART.UPPER, sh, L ? 3 : 4, sh);
    add(T(ball(0.04, 8), [sg * 0.25, 1.13, 0]), PART.UPPER, sh, L ? 3 : 4, sh);
    add(T(lathe([[0, 0.83], [0.026, 0.83], [0.03, 0.87], [0.036, 0.96], [0.041, 1.06], [0.04, 1.13], [0, 1.135]], 12), [sg * 0.25, 0, 0]), PART.FORE, elb, L ? 7 : 8, sh);
    add(T(ball(1, 10), [sg * 0.25, 0.795, 0.006], [0.029, 0.056, 0.04]), PART.HAND, elb, L ? 7 : 8, sh);
    add(T(ball(1, 8), [sg * 0.25 - sg * 0.02, 0.83, 0.03], [0.011, 0.028, 0.012], [0.3, 0, -sg * 0.3]), PART.HAND, elb, L ? 7 : 8, sh);   // thumb
    // ---- ear ----
    add(T(ball(1, 8), [sg * 0.088, 1.635, -0.004], [0.012, 0.028, 0.02]), PART.HEAD, [0, 1.45, 0], 0, [0, 1.45, 0]);
    // ---- eyes / brows (dark details) ----
    add(T(ball(1, 8), [sg * 0.033, 1.652, 0.087], [0.0105, 0.0095, 0.006]), PART.FACE, [0, 1.45, 0], 0, [0, 1.45, 0]);
    add(T(new THREE.BoxGeometry(0.034, 0.006, 0.008), [sg * 0.034, 1.674, 0.088], [1, 1, 1], [0, 0, sg * -0.12]), PART.FACE, [0, 1.45, 0], 0, [0, 1.45, 0]);
  }
  const P0 = [0, 1.0, 0], HP = [0, 1.45, 0];
  // ---- torso (elliptical loft), collar, belt + buckle ----
  add(T(lathe([[0, 0.88], [0.135, 0.885], [0.16, 0.95], [0.158, 1.03], [0.145, 1.12], [0.142, 1.16], [0.158, 1.26], [0.182, 1.35], [0.2, 1.41], [0.195, 1.455], [0.13, 1.485], [0.07, 1.5], [0, 1.505]], 20), [0, 0, 0], [1, 1, 0.62]), PART.TORSO, P0);
  add(T(new THREE.TorusGeometry(0.066, 0.014, 6, 16), [0, 1.494, 0.004], [1, 1, 1], [Math.PI / 2 - 0.25, 0, 0]), PART.TORSO, P0);
  add(T(new THREE.CylinderGeometry(0.163, 0.163, 0.036, 20, 1, true), [0, 1.03, 0], [1, 1, 0.62]), PART.BELT, P0);
  add(T(new THREE.BoxGeometry(0.036, 0.03, 0.012), [0, 1.03, 0.1]), PART.BELT, P0);
  // ---- jacket shell (visible on some people): open coat to mid-thigh ----
  add(T(lathe([[0, 0.76], [0.172, 0.76], [0.176, 0.88], [0.172, 1.03], [0.163, 1.16], [0.176, 1.27], [0.198, 1.355], [0.214, 1.41], [0.207, 1.46], [0.135, 1.488], [0.08, 1.508], [0, 1.51]], 20), [0, 0, 0], [1, 1, 0.66]), PART.JACKET, P0);
  add(T(new THREE.BoxGeometry(0.03, 0.34, 0.012), [0.062, 1.33, 0.113], [1, 1, 1], [0, 0, -0.22]), PART.JACKET, P0);   // lapels
  add(T(new THREE.BoxGeometry(0.03, 0.34, 0.012), [-0.062, 1.33, 0.113], [1, 1, 1], [0, 0, 0.22]), PART.JACKET, P0);
  // ---- neck, head (egg + jaw + nose + mouth), hair, long hair, hat ----
  add(T(new THREE.CylinderGeometry(0.046, 0.054, 0.1, 12), [0, 1.525, 0]), PART.HEAD, HP);
  add(T(ball(1, 16), [0, 1.642, 0.004], [0.089, 0.113, 0.099]), PART.HEAD, HP);
  add(T(ball(1, 12), [0, 1.588, 0.014], [0.072, 0.068, 0.084]), PART.HEAD, HP);
  add(T(new THREE.ConeGeometry(0.014, 0.038, 8), [0, 1.622, 0.106], [1, 1, 1], [Math.PI / 2 - 0.35, 0, 0]), PART.HEAD, HP);
  add(T(new THREE.BoxGeometry(0.038, 0.005, 0.006), [0, 1.594, 0.097]), PART.FACE, HP);
  add(T(new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), [0, 1.652, -0.008], [0.94, 1.02, 1.05]), PART.HAIR, HP);
  add(T(ball(1, 10), [0, 1.615, -0.06], [0.09, 0.09, 0.06]), PART.HAIR, HP);
  add(T(lathe([[0, 1.36], [0.05, 1.37], [0.085, 1.45], [0.102, 1.55], [0.108, 1.63], [0.06, 1.72], [0, 1.735]], 14), [0, 0, -0.058], [1, 1, 0.8]), PART.LONGHAIR, HP);
  add(T(new THREE.SphereGeometry(0.121, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), [0, 1.665, -0.004], [0.96, 1.0, 1.06]), PART.HAT, HP);
  add(T(new THREE.TorusGeometry(0.118, 0.016, 6, 20), [0, 1.668, -0.004], [1, 1, 1], [Math.PI / 2, 0, 0]), PART.HAT, HP);
  // ---- backpack with straps (shown on some people) ----
  add(T(new RoundedBoxGeometry(0.27, 0.34, 0.13, 3, 0.045), [0, 1.22, -0.16]), PART.BAG, P0);
  add(T(new RoundedBoxGeometry(0.2, 0.14, 0.05, 2, 0.02), [0, 1.14, -0.24]), PART.BAG, P0);
  for (const sg of [-1, 1]) {
    add(T(new THREE.BoxGeometry(0.036, 0.012, 0.22), [sg * 0.09, 1.478, -0.03]), PART.BAG, P0);
    add(T(new THREE.BoxGeometry(0.036, 0.3, 0.012), [sg * 0.09, 1.33, 0.098], [1, 1, 1], [0.05, 0, 0]), PART.BAG, P0);
  }
  return mergeGeometries(G_, false);
}

const PERSON_PROC = /* glsl */`
varying vec3 vPC;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float f = nz(wp*9.0).r, g = nz(wp*31.0).g;
  s.alb *= vPC * (0.9 + 0.2*f) * (0.95 + 0.1*g);
  s.rough = 0.8;
  s.h = 0.0;
}`;
const VERT = {
  head: `attribute float aPart; attribute float aSw; attribute vec3 aPivot; attribute vec3 aPivot2; attribute vec3 aAnim; attribute vec3 aCShirt; attribute vec3 aCPants; attribute vec3 aCSkin; attribute vec3 aCHair; varying vec3 vPC; uniform float uWet; float gA1, gA2;
vec3 rotX(vec3 d, float a){ float c = cos(a), s = sin(a); return vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c); }
void poseAngles(){
  float sp = max(aAnim.y, 0.0), sw = sin(aAnim.x) * 0.72 * sp;
  bool seated = aAnim.y < -0.5;
  gA1 = 0.0; gA2 = 0.0;
  if (aSw < 0.5) return;
  if (aSw < 2.5) { gA1 = aSw < 1.5 ? sw : -sw; if (seated) gA1 = -1.45; }
  else if (aSw < 4.5) { gA1 = aSw < 3.5 ? -sw * 0.85 : sw * 0.85; if (seated) gA1 = -0.5; }
  else if (aSw < 6.5) { float h = aSw < 5.5 ? sw : -sw; gA1 = seated ? -1.45 : h; gA2 = seated ? 1.5 : max(h, 0.0) * 0.85; }
  else { float a = aSw < 7.5 ? -sw * 0.85 : sw * 0.85; gA1 = seated ? -0.5 : a; gA2 = seated ? -1.15 : -(0.12 + 0.3 * sp); }
}`,
  normal: /* glsl */`
{
  poseAngles();
  if (aSw > 4.5) objectNormal = rotX(objectNormal, gA2);
  if (aSw > 0.5) objectNormal = rotX(objectNormal, gA1);
}`,
  begin: /* glsl */`
{
  float sp = max(aAnim.y, 0.0), seed = aAnim.z;
  vec3 pp = transformed;
  if (aSw > 4.5) pp = aPivot + rotX(pp - aPivot, gA2);
  if (aSw > 0.5) { vec3 hp = aSw > 4.5 ? aPivot2 : aPivot; pp = hp + rotX(pp - hp, gA1); }
  transformed = pp;
  float bob = abs(sin(aAnim.x)) * 0.028 * sp + sin(aAnim.x * 0.31 + seed * 20.0) * 0.004;
  transformed.y += bob;
  if (aPart > 1.5 && aPart < 2.5) transformed.x += sin(aAnim.x) * 0.012 * sp;
  // per-person outfit variety derived from the seed
  float hairStyle = floor(fract(seed * 7.13) * 3.0);                       // 0 short, 1 long, 2 hat
  bool bag = fract(seed * 13.7) < 0.42;
  bool jk = fract(seed * 3.31) < 0.3 + 0.5 * uWet;
  vec3 jcol = aCPants * 1.3 + vec3(0.035);
  vec3 pc = aCShirt;
  bool hide = false;
  if (aPart < 0.5) pc = aCPants;
  else if (aPart < 2.5) pc = jk ? jcol * 0.5 + aCShirt * 0.5 : aCShirt;
  else if (aPart < 3.5) pc = jk ? jcol : aCShirt;
  else if (aPart < 4.5) pc = jk ? jcol : aCSkin;
  else if (aPart < 5.5) pc = aCSkin;
  else if (aPart < 6.5) { pc = aCHair; hide = hairStyle > 1.5; }
  else if (aPart < 7.5) pc = vec3(0.045);
  else if (aPart < 8.5) { pc = mix(aCShirt, aCHair, 0.6) * 0.8; hide = !bag; }
  else if (aPart < 9.5) pc = vec3(0.035, 0.028, 0.025);
  else if (aPart < 10.5) pc = vec3(0.06, 0.04, 0.03);
  else if (aPart < 11.5) { pc = aCHair; hide = !(hairStyle > 0.5 && hairStyle < 1.5); }
  else if (aPart < 12.5) { pc = jcol; hide = !jk; }
  else if (aPart < 13.5) { pc = aCShirt * 0.55 + vec3(0.02); hide = hairStyle < 1.5; }
  else pc = aCSkin;
  if (hide) transformed = aPivot;
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
