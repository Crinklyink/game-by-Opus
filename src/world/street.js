// Street level: procedural ground (asphalt, markings, crosswalks, pavers, puddles, ripples,
// planar wet reflections), raised sidewalk platforms, lamps, traffic signals with a working phase
// controller, trees and street furniture.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp, smooth } from '../core/util.js';
import { patchMaterial, pm, glowMat } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { Kit, addCollider, mat4 } from './kit.js';
import { LightPool } from '../gfx/lights.js';
import { P } from './consts.js';

export const ROAD_Y = -0.15, WALK_Y = -0.02;
export const NEAR_I = [-3, 2], NEAR_J = [-3, 2];

// -------------------------------------------------------------------------------------------
// ground shader
// -------------------------------------------------------------------------------------------
PROC.ground = /* glsl */`
uniform sampler2D tPlanar; uniform mat4 uPlanarMat; uniform float uPlanarOn; uniform float uRain;
float ripple(vec2 p, float t, float rain){
  vec2 g = p * 3.4; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)); vec2 cid = id + o; vec2 r = hash22(cid);
    float ph = fract(t * (0.55 + r.x*0.6) + r.y * 7.0);
    vec2 d = f - o - (r - 0.5) * 0.6; float dist = length(d);
    float ring = sin(dist*44.0 - ph*15.0) * exp(-dist*6.5) * (1.0 - ph) * smoothstep(0.0, 0.08, ph);
    h += ring * step(hash21(cid + 3.7), rain * 1.15);
  }
  return h;
}
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 w = wp.xz;
  vec2 rel = w - floor(w / 120.0 + 0.5) * 120.0;
  vec2 sd = abs(rel);
  float dmin = min(sd.x, sd.y);
  float wet = uWet;
  if (n.y < 0.5) {                                   // vertical faces: kerb stone
    float t = nz(vec3(wp.x*0.6, wp.y*3.0, wp.z*0.6)).r;
    s.alb = vec3(0.36,0.355,0.34) * (0.75 + 0.5*t) * mix(1.0, 0.6, wet);
    s.rough = mix(0.85, 0.35, wet); s.h = 0.0; return;
  }
  bool top = wp.y > -0.09;
  float fp = length(fwidth(w));
  float n1 = nz(vec3(w*0.11, 0.37)).r, n2 = nz(vec3(w*0.85, 0.71)).b, sp = nz(vec3(w*48.0, 0.9)).g, big = nz(vec3(w*0.031, 0.2)).r;
  vec3 col; float rough; float hgt = 0.0; float refl = 0.0;
  float puddle = 0.0; float aoJ = 1.0;
  if (!top) {
    // ------- asphalt -------
    col = vec3(0.052, 0.053, 0.058) * (0.7 + 0.6*n1) * (0.9 + 0.22*n2);
    col += vec3(0.075) * smoothstep(0.84, 0.95, sp) * (1.0 - smoothstep(0.02, 0.2, fp));
    // patches (repaired asphalt is darker/smoother)
    float repair = smoothstep(0.62, 0.66, nz(vec3(w*0.07, 0.55)).b);
    col *= mix(1.0, 0.72, repair);
    bool alongX = sd.y < sd.x;               // street running east-west
    float off = alongX ? rel.y : rel.x;
    float along = alongX ? w.x : w.y;
    float dAlong = alongX ? sd.x : sd.y;     // distance to the nearest intersection centre along this street
    bool inter = (sd.x < 7.0 && sd.y < 7.0);
    // tyre wear: two polished bands per lane
    if (!inter) {
      float wb = smoothstep(0.55, 0.1, abs(abs(fract(abs(off)/3.5 + 0.5) - 0.5)*3.5 - 0.0));
      col *= 1.0 - 0.10*wb;
      // oil drips in lane centres
      float oil = smoothstep(0.7, 0.8, nz(vec3(along*0.11, off*0.6, 0.3)).r) * smoothstep(1.4, 0.3, abs(abs(off) - 1.75));
      col *= 1.0 - 0.35*oil;
    }
    // markings
    float mark = 0.0; vec3 mcol = vec3(0.62);
    float aw = max(0.05, fp);
    if (!inter) {
      float dy1 = smoothstep(0.06 + aw, 0.06, abs(abs(off) - 0.17));
      mark = max(mark, dy1); mcol = mix(mcol, vec3(0.62, 0.46, 0.08), dy1);
      float dash = step(0.35, fract(along / 9.0));
      float laneEdge = alongX ? 3.5 : 4.25;
      float ld = smoothstep(0.07 + aw, 0.07, abs(abs(off) - laneEdge)) * (alongX ? dash : 1.0);
      mark = max(mark, ld);
      if (!alongX) { float bay = smoothstep(0.05 + aw, 0.05, abs(fract(along / 6.2 + 0.5) - 0.5) * 6.2 - 0.0) * step(4.25, abs(off)) * step(abs(off), 6.7); mark = max(mark, bay * 0.85); }
      float ed = smoothstep(0.08 + aw, 0.08, abs(abs(off) - 6.75));
      mark = max(mark, ed);
      if (dAlong > 7.5) {
        // crosswalk zebra just outside the crossing street
        float cw = step(7.6, dAlong) * step(dAlong, 10.6) * step(abs(off), 6.6);
        float zebra = step(fract(off / 1.0 + 0.25), 0.5);
        mark = max(mark, cw * zebra);
        float stop = step(11.2, dAlong) * step(dAlong, 11.65) * step(abs(off), 6.6) * step(0.4, abs(off));
        mark = max(mark, stop);
      }
    } else {
      // box-junction clean asphalt with a faint stop-line ghost
      col *= 1.04;
    }
    float chip = smoothstep(0.55, 0.9, nz(vec3(w*5.0, 0.4)).g) * mark;
    col = mix(col, mcol * (0.75 + 0.25*n2) * (1.0 - 0.3*chip), mark * 0.92 * (1.0 - 0.45*wet));
    // cracks
    float crack = smoothstep(0.012, 0.0, abs(nz(vec3(w*0.9 + 0.3, 0.1)).r - 0.5) - 0.0) * smoothstep(0.55, 0.75, big) * (1.0 - smoothstep(0.02, 0.12, fp));
    col *= 1.0 - 0.6*crack;
    rough = 0.9 - 0.12*repair;
    hgt = (sp - 0.5) * 0.0025 * (1.0 - smoothstep(0.006, 0.05, fp)) - crack*0.004*(1.0 - smoothstep(0.005, 0.03, fp));
    // gutter strip next to the kerb is dirtier & wetter
    float gut = smoothstep(1.3, 0.0, 7.0 - min(sd.x, sd.y) ) * smoothstep(0.0, 0.2, 7.0 - min(sd.x, sd.y)) * (inter ? 0.0 : 1.0);
    col *= 1.0 - 0.25*gut;
    puddle = (smoothstep(0.44, 0.6, nz(vec3(w*0.16, 0.9)).r*0.7 + n1*0.3) * (0.5 + 0.9*gut)) ;
    refl = 1.0;
  } else {
    // ------- sidewalk / plaza -------
    float side = dmin - 7.0;                          // metres from the kerb
    bool plaza = dmin > 12.0;
    vec2 gsz = plaza ? vec2(0.75) : vec2(1.5);
    vec2 gid = floor(w / gsz), gf = fract(w / gsz);
    float joint = min(min(gf.x, 1.0-gf.x)*gsz.x, min(gf.y, 1.0-gf.y)*gsz.y);
    float jw = max(0.024, fp * 1.4);                               // joints widen to a pixel at range but keep their average darkness
    float jm = smoothstep(jw * 0.5, jw, joint);
    float jd = (1.0 - jm) * min(1.0, 0.03 / jw);
    float tone = hash21(gid);
    vec3 base = plaza ? vec3(0.145, 0.133, 0.122) : vec3(0.155, 0.153, 0.147);
    col = base * (0.85 + 0.3*tone) * (0.8 + 0.4*n1) * (0.92 + 0.16*n2);
    float gfade = 1.0 - smoothstep(0.03, 0.22, fp);
    float grain = mix(0.5, nz(vec3(w*22.0, 0.3)).g, gfade);
    col *= 0.94 + 0.12*grain;
    col *= 1.0 - 0.45*jd;
    // kerb granite band
    float granite = 1.0 - smoothstep(0.24, 0.3, side);
    col = mix(col, vec3(0.34, 0.335, 0.33) * (0.8 + 0.4*nz(vec3(w*15.0, 0.6)).b), granite);
    // gum + stains
    float gum = smoothstep(0.9, 0.95, nz(vec3(w*2.7, 0.7)).g) * smoothstep(0.3, 0.6, tone);
    col = mix(col, vec3(0.12), gum*0.7);
    col *= 1.0 - 0.28*smoothstep(0.55, 0.9, nz(vec3(w*0.5, 0.2)).b);
    // tactile paving strip at the crosswalk ends
    float tact = step(7.05, dmin) * step(dmin, 8.0);
    rough = 0.86 - 0.2*granite;
    aoJ = 1.0 - 0.7 * jd;                              // joints read as darkness + occlusion (a height step here shimmers into dots)
    hgt = (grain - 0.5) * 0.0006 * (1.0 - smoothstep(0.006, 0.05, fp));
    puddle = smoothstep(0.5, 0.66, nz(vec3(w*0.2, 0.4)).r*0.6 + n1*0.4) * 0.8;
    refl = 0.55;
  }
  // ------- wetness -------
  float film = wet * (0.55 + 0.45*puddle);              // thin water film everywhere while wet
  float pud = wet * puddle;
  col *= mix(1.0, 0.55, clamp(film*0.7 + pud*0.5, 0.0, 1.0));
  rough = mix(rough, 0.22, clamp(film, 0.0, 1.0));
  rough = mix(rough, 0.035, clamp(pud*1.4, 0.0, 1.0));
  float rip = uRain > 0.02 ? ripple(w, uTime, uRain) * clamp(pud*2.0 + film*0.5, 0.0, 1.0) : 0.0;
  hgt += rip * 0.0011;
  s.alb = col; s.rough = rough; s.metal = 0.0; s.h = hgt; s.ao = aoJ;
  // ------- planar reflection -------
  if (uPlanarOn > 0.5 && wet > 0.02) {
    vec3 V = normalize(cameraPosition - wp);
    float ndv = clamp(V.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec4 pc = uPlanarMat * vec4(wp, 1.0);
    vec2 ruv = pc.xy / pc.w;
    vec2 grad = vec2(dFdx(hgt), dFdy(hgt)) * 220.0;
    ruv += grad * 0.4 + (nz(vec3(w*3.0, uTime*0.02)).rg - 0.5) * 0.004 * (1.0 - pud);
    float lod = clamp(rough * 5.5, 0.0, 6.0);
    vec3 rc = textureLod(tPlanar, clamp(ruv, 0.002, 0.998), lod).rgb;
    float k = clamp(film * 0.9 + pud, 0.0, 1.0) * refl;
    s.emis += rc * F * k * (0.55 + 0.45*pud);
  }
}
`;

let groundMat = null;
export function groundMaterial(planarUniforms) {
  if (groundMat) return groundMat;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 1 });
  const uni = {
    uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color(0) }, uWetAmt: { value: 0 },
    extra: { tPlanar: planarUniforms.tPlanar, uPlanarMat: planarUniforms.uPlanarMat, uPlanarOn: planarUniforms.uPlanarOn, uRain: G.u.uRain },
  };
  m.customProgramCacheKey = () => 'ground';
  m.onBeforeCompile = (shader) => patchMaterial(shader, PROC.ground, uni);
  groundMat = m;
  return m;
}

// -------------------------------------------------------------------------------------------
// ground helpers
// -------------------------------------------------------------------------------------------
const mod = (a, b) => ((a % b) + b) % b;
export function isRoad(x, z) {
  const dx = Math.min(mod(x, P), P - mod(x, P)), dz = Math.min(mod(z, P), P - mod(z, P));
  return dx < 7 || dz < 7;
}
export function groundY(x, z) {
  return isRoad(x, z) ? ROAD_Y : WALK_Y + 0.02;
}

// -------------------------------------------------------------------------------------------
// traffic signal controller
// -------------------------------------------------------------------------------------------
export const Signals = {
  t: 0,
  // 0 A green, 1 A yellow, 2 all red, 3 B green, 4 B yellow, 5 all red
  dur: [22, 3.2, 2.2, 13, 3.2, 2.2],
  phase: 0, tin: 0,
  update(dt) {
    this.t += dt; this.tin += dt;
    while (this.tin >= this.dur[this.phase]) { this.tin -= this.dur[this.phase]; this.phase = (this.phase + 1) % 6; }
  },
  // vehicle state for avenue (A: east-west) / cross street (B: north-south): 'g' | 'y' | 'r'
  A() { return this.phase === 0 ? 'g' : this.phase === 1 ? 'y' : 'r'; },
  B() { return this.phase === 3 ? 'g' : this.phase === 4 ? 'y' : 'r'; },
  // pedestrians crossing the avenue walk with cross-street traffic (B); crossing the cross street walk with A
  pedAvenue() { return this.phase === 3 ? (this.tin > this.dur[3] - 4.5 ? 'f' : 'w') : 'x'; },
  pedCross() { return this.phase === 0 ? (this.tin > this.dur[0] - 5 ? 'f' : 'w') : 'x'; },
};

// -------------------------------------------------------------------------------------------
// build
// -------------------------------------------------------------------------------------------
export function buildStreet(scene, glow, planar, ctx) {
  const R = ctx.rand;
  const out = { lamps: [], update: null };
  const M = { ground: groundMaterial(planar.uniforms) };
  out.groundMat = M.ground;

  // ---- ground plane (roads) ----
  const gg = new THREE.PlaneGeometry(760, 760, 1, 1); gg.rotateX(-Math.PI / 2);
  const gm = new THREE.Mesh(gg, M.ground); gm.position.y = ROAD_Y; gm.receiveShadow = true;
  scene.add(gm);
  out.ground = gm;

  // ---- sidewalk / block platforms ----
  const platK = [];
  const platGeoms = [];
  for (let i = NEAR_I[0]; i <= NEAR_I[1]; i++) for (let j = NEAR_J[0]; j <= NEAR_J[1]; j++) {
    const x0 = i * P + 7, x1 = (i + 1) * P - 7, z0 = j * P + 7, z1 = (j + 1) * P - 7;
    const g = new THREE.BoxGeometry(x1 - x0, 0.7, z1 - z0);
    g.translate((x0 + x1) / 2, WALK_Y - 0.35, (z0 + z1) / 2);
    platGeoms.push(g);
  }
  const mergeGeometries = ctx.mergeGeometries;
  const platform = new THREE.Mesh(mergeGeometries(platGeoms.map((g) => g.toNonIndexed())), M.ground);
  platform.receiveShadow = true; platform.castShadow = false;
  scene.add(platform);
  out.platform = platform;

  // ---- street lamps ----
  const lampK = new Kit();
  const poleMat = pm('metal', { color: 0x2b2f33, p: [1, 60, 0, 0], rough: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(1.0, 0.92, 0.78), emissiveIntensity: 0, roughness: 0.4 });
  out.lampHead = headMat;
  const emitters = [];
  const addLamp = (x, z, faceX, faceZ) => {
    const px = x, pz = z;
    lampK.cyl(poleMat, 0.055, 0.1, 8.6, px, 0, pz, { seg: 10 });
    lampK.cyl(poleMat, 0.14, 0.16, 0.5, px, 0, pz, { seg: 10 });
    const ax = px + faceX * 2.0, az = pz + faceZ * 2.0;
    lampK.tube(poleMat, [[px, 8.4, pz], [px + faceX * 0.5, 9.05, pz + faceZ * 0.5], [ax, 9.05, az]], 0.035, { seg: 16, radial: 6 });
    // head
    const ang = Math.atan2(faceX, faceZ);
    lampK.box(poleMat, 0.9, 0.13, 0.34, ax, 8.98, az, { ry: ang + Math.PI / 2, r: 0.03 });
    out.lamps.push({ x: ax, y: 8.9, z: az });
  };
  // avenue lamps (both sides, staggered), cross street lamps
  for (let x = -230; x <= 230; x += 34) {
    if (Math.abs(x) < 16) continue;
    addLamp(x, 9.0, 0, -1);
    addLamp(x + 17, -9.0, 0, 1);
  }
  for (let z = -230; z <= 230; z += 34) {
    if (Math.abs(z) < 16) continue;
    addLamp(9.0, z + 8, -1, 0);
    addLamp(-9.0, z - 9, 1, 0);
  }
  lampK.mesh(scene, { reflect: true });
  const heads = new Kit();
  for (const l of out.lamps) heads.box(headMat, 0.78, 0.03, 0.26, l.x, l.y - 0.07, l.z);
  heads.mesh(scene, { cast: false, reflect: true });
  for (const l of out.lamps) {
    const e = LightPool.add({ pos: new THREE.Vector3(l.x, l.y - 0.3, l.z), color: 0xfff0d8, intensity: 210, distance: 24, on: false, priority: 1.1 });
    emitters.push(e);
    l.glow = glow.add(l.x, l.y - 0.08, l.z, 0xfff0d8, 0, 0.32, 0, 100);
    l.e = e;
  }
  out.lampEmitters = emitters;

  // ---- traffic signals (poles + heads at the 4 corners of the main intersection) ----
  const sig = { red: [], yel: [], grn: [], walk: [], hand: [] };
  const mk = (name, hex) => new THREE.MeshStandardMaterial({ color: 0x080808, emissive: new THREE.Color(hex), emissiveIntensity: 0, roughness: 0.3 });
  const matsA = { r: mk('rA', 0xff2418), y: mk('yA', 0xffb000), g: mk('gA', 0x22ff77) };
  const matsB = { r: mk('rB', 0xff2418), y: mk('yB', 0xffb000), g: mk('gB', 0x22ff77) };
  const pedA = { walk: mk('wA', 0xffffff), hand: mk('hA', 0xff6a00) };      // crossing the avenue (with B)
  const pedB = { walk: mk('wB', 0xffffff), hand: mk('hB', 0xff6a00) };      // crossing the cross street (with A)
  out.sigMats = { A: matsA, B: matsB, pedA, pedB };
  const sk = new Kit();
  const bodyMat = pm('plastic', { color: 0x141516, rough: 0.5 });
  const lampKit = { A: new Kit(), B: new Kit(), pA: new Kit(), pB: new Kit() };
  const glowSig = [];
  const head = (kit, phaseMats, x, y, z, ry, sigId) => {
    // black housing + 3 lamps (r, y, g) facing +z local, rotated by ry
    sk.box(bodyMat, 0.32, 0.95, 0.26, x, y - 0.47, z, { ry, r: 0.02 });
    sk.box(bodyMat, 0.38, 0.03, 0.34, x + Math.sin(ry) * 0.04, y + 0.03, z + Math.cos(ry) * 0.04, { ry });
    const c = Math.cos(ry), s = Math.sin(ry);
    ['r', 'y', 'g'].forEach((k2, i) => {
      const yy = y - 0.17 - i * 0.29;
      const lx = x + s * 0.14, lz = z + c * 0.14;
      kit[k2 === 'r' ? 'r' : k2 === 'y' ? 'y' : 'g'].push({ x: lx, y: yy, z: lz, ry });
      glowSig.push({ x: lx + s * 0.06, y: yy, z: lz + c * 0.06, color: k2 === 'r' ? 0xff2418 : k2 === 'y' ? 0xffb000 : 0x22ff77, phase: sigId, k: k2 });
    });
  };
  const lampsA = { r: [], y: [], g: [] }, lampsB = { r: [], y: [], g: [] };
  const pedHeads = { A: { walk: [], hand: [] }, B: { walk: [], hand: [] } };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 8.3, pz = sz * 8.3;
    sk.cyl(poleMat, 0.07, 0.09, 4.4, px, 0, pz, { seg: 10 });
    sk.cyl(poleMat, 0.15, 0.17, 0.4, px, 0, pz, { seg: 10 });
    // vehicle head for the avenue (faces -sx), on a short arm toward the road
    sk.tube(poleMat, [[px, 4.2, pz], [px, 4.5, pz - sz * 1.4], [px, 4.5, pz - sz * 3.0]], 0.045, { seg: 10, radial: 6 });
    head(lampsA, matsA, px, 4.75, pz - sz * 3.0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'A');
    // vehicle head for the cross street (faces -sz), on an arm toward the road
    sk.tube(poleMat, [[px, 4.0, pz], [px - sx * 1.4, 4.3, pz], [px - sx * 3.0, 4.3, pz]], 0.045, { seg: 10, radial: 6 });
    head(lampsB, matsB, px - sx * 3.0, 4.55, pz, sz > 0 ? Math.PI : 0, 'B');
    // pedestrian heads: one for each crosswalk at this corner
    for (const which of ['A', 'B']) {
      const ry = which === 'A' ? (sz > 0 ? Math.PI : 0) : (sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      const ox = which === 'A' ? sx * 0.0 : 0, oz = 0;
      const hx = px + (which === 'A' ? -sx * 0.4 : 0), hz = pz + (which === 'B' ? -sz * 0.4 : 0);
      const c2 = Math.cos(ry), s2 = Math.sin(ry);
      sk.box(bodyMat, 0.34, 0.34, 0.16, hx, 2.6, hz, { ry, r: 0.02 });
      pedHeads[which].hand.push({ x: hx + s2 * 0.085, y: 2.7, z: hz + c2 * 0.085, ry });
      pedHeads[which].walk.push({ x: hx + s2 * 0.085, y: 2.5, z: hz + c2 * 0.085, ry });
    }
    // beg button
    sk.box(pm('metal', { color: 0xd8b030, p: [0, 40, 0, 0] }), 0.12, 0.2, 0.05, px + (sx > 0 ? -0.09 : 0.09), 1.1, pz + (sz > 0 ? -0.09 : 0.09), {});
    addCollider(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15, -1, 4.5, 0);
  }
  sk.mesh(scene, { reflect: true });
  const lampGeo = new THREE.CircleGeometry(0.115, 20);
  const addLamps = (mat, arr) => { arr.forEach((l) => { const m = new THREE.Mesh(lampGeo, mat); m.position.set(l.x, l.y, l.z); m.rotation.y = l.ry; scene.add(m); m.layers.enable(1); }); };
  addLamps(matsA.r, lampsA.r); addLamps(matsA.y, lampsA.y); addLamps(matsA.g, lampsA.g);
  addLamps(matsB.r, lampsB.r); addLamps(matsB.y, lampsB.y); addLamps(matsB.g, lampsB.g);
  const pedGeo = new THREE.PlaneGeometry(0.24, 0.24);
  const walkTex = ctx.canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 14, 6, 0, 7); c.fill(); c.fillRect(27, 22, 10, 18); c.lineWidth = 5; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(29, 40); c.lineTo(22, 58); c.moveTo(35, 40); c.lineTo(43, 58); c.moveTo(27, 26); c.lineTo(18, 36); c.moveTo(37, 26); c.lineTo(46, 34); c.stroke(); }, { srgb: true });
  const handTex = ctx.canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff7a10'; c.fillRect(20, 26, 24, 26); c.fillRect(20, 10, 5, 22); c.fillRect(27, 6, 5, 24); c.fillRect(34, 8, 5, 22); c.fillRect(41, 14, 5, 20); c.fillRect(10, 30, 12, 6); }, { srgb: true });
  const pedMats = {};
  for (const key of ['A', 'B']) {
    const walk = new THREE.MeshBasicMaterial({ map: walkTex, color: new THREE.Color(0, 0, 0), toneMapped: false });
    const hand = new THREE.MeshBasicMaterial({ map: handTex, color: new THREE.Color(0, 0, 0), toneMapped: false });
    pedMats[key] = { walk, hand };
    for (const l of pedHeads[key].walk) { const m = new THREE.Mesh(pedGeo, walk); m.position.set(l.x, l.y, l.z); m.rotation.y = l.ry; scene.add(m); }
    for (const l of pedHeads[key].hand) { const m = new THREE.Mesh(pedGeo, hand); m.position.set(l.x, l.y, l.z); m.rotation.y = l.ry; scene.add(m); }
  }
  // glow sprites for signals: one per lamp (colour per phase mats)
  const sigGlow = glowSig.map((g) => ({ ...g, idx: glow.add(g.x, g.y, g.z, g.color, 0, 0.16, 0, 0) }));

  const setMats = (mats, st) => { mats.r.emissiveIntensity = st === 'r' ? 5 : 0.0; mats.y.emissiveIntensity = st === 'y' ? 5 : 0.0; mats.g.emissiveIntensity = st === 'g' ? 5 : 0.0; };
  let blink = 0;
  out.update = (dt, t) => {
    Signals.update(dt);
    const A = Signals.A(), B = Signals.B();
    setMats(matsA, A); setMats(matsB, B);
    const pa = Signals.pedAvenue(), pc = Signals.pedCross();
    blink += dt;
    const on = (st) => (st === 'w' ? 1 : st === 'f' ? (Math.floor(blink * 2.5) % 2 ? 1 : 0.0) : 0);
    // 'A' peds cross the avenue (walk with B): key A -> pedAvenue ; 'B' peds cross the cross street: pedCross
    pedMats.A.walk.color.setScalar(1.6 * (pa === 'w' ? 1 : 0)); pedMats.A.hand.color.setScalar(1.6 * (pa === 'w' ? 0 : pa === 'f' ? (Math.floor(blink * 2.5) % 2 ? 0 : 1) : 1));
    pedMats.B.walk.color.setScalar(1.6 * (pc === 'w' ? 1 : 0)); pedMats.B.hand.color.setScalar(1.6 * (pc === 'w' ? 0 : pc === 'f' ? (Math.floor(blink * 2.5) % 2 ? 0 : 1) : 1));
    for (const g of sigGlow) {
      const st = g.phase === 'A' ? A : B;
      const lit = (g.k === 'r' && st === 'r') || (g.k === 'y' && st === 'y') || (g.k === 'g' && st === 'g');
      glow.setIntensity(g.idx, lit ? 26 : 0);
    }
    // lamps follow the day/night state
    const night = G.u.uNight.value, dusk = 1 - smooth(0.1, 0.55, G.atmo ? G.atmo.day : 1);
    const lampOn = clamp(Math.max(night, dusk * 0.9), 0, 1);
    headMat.emissiveIntensity = lampOn * 9;
    const on2 = lampOn > 0.25;
    for (const l of out.lamps) { l.e.on = on2; glow.setIntensity(l.glow, lampOn * 16); }
    out.lampOn = lampOn;
  };
  out.signalState = { A: () => Signals.A(), B: () => Signals.B(), pedAvenue: () => Signals.pedAvenue(), pedCross: () => Signals.pedCross() };
  return out;
}
