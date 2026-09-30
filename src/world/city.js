// The big city around the player: instanced skyline (window shader), a glowing street-grid
// ground with far traffic + lamps, distant hills, aircraft beacons, and Meridian Tower's shell.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { P, STREET_W, FLOOR_H, APT_Y, TOWER, TOWER_TOP, LOBBY_H } from './consts.js';
import { facadeMaterial, facadeBoxGeometry } from '../gfx/facade.js';
import { COMMON, SKY } from '../gfx/glsl.js';
import { pm } from '../gfx/materials.js';

const isCustom = (i, j) => i >= -3 && i <= 2 && j >= -3 && j <= 2;
const DOWNTOWN = { x: 40, z: -860 };

const GLASS_TINTS = [0x4b8196, 0x38607a, 0x7a6a4e, 0x5d6870, 0x407a68, 0x5670a0, 0x6a7d88];
const CONCRETE_TINTS = [0xb9b1a3, 0x9c9c9a, 0xcbbca3, 0xa7a49b, 0xc4c0b6, 0x8f9298];
const BRICK_TINTS = [0x9a5a45, 0x8b4e3c, 0xa66a4c, 0x7d4a3a];

export function setInfoAttr(geo, info) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = info[0]; a[i * 4 + 1] = info[1]; a[i * 4 + 2] = info[2]; a[i * 4 + 3] = info[3]; }
  geo.setAttribute('aInfo', new THREE.BufferAttribute(a, 4));
  return geo;
}

// ---------------------------------------------------------------------------------------
// skyline
// ---------------------------------------------------------------------------------------
function heightFor(cx, cz, R) {
  const dc = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z);
  const core = Math.exp(-Math.pow(dc / 620, 2));
  const r = R();
  let h;
  if (r < core * 0.9) h = 95 + core * (70 + R() * 190) * (0.55 + 0.45 * R());
  else if (r < 0.55) h = 30 + R() * 62 * (0.6 + core);
  else h = 12 + R() * 28;
  const dn = Math.hypot(cx, cz);
  if (dn < 300) h = Math.min(h, 38 + R() * 55);
  return h;
}

export function buildSkyline(scene, glow, q) {
  const R = rng(771125);
  const near = [], far = [];
  const beacons = [];

  function add(list, cx, cz, w, d, h, y0, style, tint, bay, fh) {
    list.push({ cx, cz, w, d, h, y0, style, tint, bay, fh, seed: R() });
  }
  const pickTint = (style) => style === 0 ? GLASS_TINTS[Math.floor(R() * GLASS_TINTS.length)] : style === 3 ? BRICK_TINTS[Math.floor(R() * BRICK_TINTS.length)] : CONCRETE_TINTS[Math.floor(R() * CONCRETE_TINTS.length)];

  function roofStuff(list, cx, cz, w, d, top, tall) {
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const mw = 3 + R() * Math.min(12, w * 0.3), md = 3 + R() * Math.min(12, d * 0.3), mh = 2 + R() * 4;
      const ox = (R() - 0.5) * (w - mw - 2), oz = (R() - 0.5) * (d - md - 2);
      add(list, cx + ox, cz + oz, mw, md, mh, top, 4, 0x777a7f, 4, 4);
    }
    if (tall) {
      const ah = 8 + R() * 38;
      add(list, cx + (R() - 0.5) * w * 0.3, cz + (R() - 0.5) * d * 0.3, 0.7, 0.7, ah, top, 4, 0x666666, 4, 4);
      // beacon at the tip
      return { x: cx, y: top + ah + 0.5, z: cz };
    }
    return null;
  }

  function building(list, cx, cz, w, d, h, tall) {
    const r = R();
    let style;
    if (h > 90) style = r < 0.78 ? 0 : 2;
    else if (h > 40) style = r < 0.4 ? 0 : r < 0.7 ? 1 : 2;
    else style = r < 0.45 ? 3 : r < 0.75 ? 1 : 2;
    const bay = style === 0 ? 3.0 + R() * 1.2 : style === 1 ? 3.4 + R() * 1.1 : style === 2 ? 5 + R() * 3 : 3.2;
    const fh = style === 3 ? 3.8 : FLOOR_H;
    const tint = pickTint(style);
    const shape = R();
    if (h > 110 && shape < 0.65) {
      // podium + tower + crown tiers
      const ph = 10 + R() * 10;
      add(list, cx, cz, w, d, ph, 0, 1, pickTint(1), 3.6, FLOOR_H);
      const tw = w * (0.55 + R() * 0.25), td = d * (0.55 + R() * 0.25);
      const ox = (R() - 0.5) * (w - tw) * 0.5, oz = (R() - 0.5) * (d - td) * 0.5;
      const th = h - ph;
      const cutoff = th * (0.72 + R() * 0.2);
      add(list, cx + ox, cz + oz, tw, td, cutoff, ph, style === 3 ? 0 : style, tint, bay, fh);
      const cw = tw * (0.6 + R() * 0.25), cd = td * (0.6 + R() * 0.25);
      add(list, cx + ox, cz + oz, cw, cd, th - cutoff, ph + cutoff, style === 3 ? 0 : style, tint, bay, fh);
      return roofStuff(list, cx + ox, cz + oz, cw, cd, h, true);
    }
    if (h > 60 && shape < 0.5) {
      const h1 = h * (0.6 + R() * 0.2);
      add(list, cx, cz, w, d, h1, 0, style, tint, bay, fh);
      add(list, cx + (R() - 0.5) * 6, cz + (R() - 0.5) * 6, w * 0.7, d * 0.7, h - h1, h1, style, tint, bay, fh);
      return roofStuff(list, cx, cz, w * 0.7, d * 0.7, h, h > 100);
    }
    add(list, cx, cz, w, d, h, 0, style, tint, bay, fh);
    return roofStuff(list, cx, cz, w, d, h, h > 100);
  }

  const N = 13;
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    if (isCustom(i, j)) continue;
    const bx0 = i * P + STREET_W / 2 + 1, bz0 = j * P + STREET_W / 2 + 1, bs = P - STREET_W - 2;
    const cx = bx0 + bs / 2, cz = bz0 + bs / 2;
    const dist = Math.hypot(cx, cz);
    const list = dist < 340 ? near : far;
    if (R() < 0.035) continue; // little park lot
    const layout = R();
    const hCell = heightFor(cx, cz, R);
    const pushB = (bcx, bcz, bw, bd, hh) => { const b = building(list, bcx, bcz, bw, bd, hh, hh > 100); if (b && hh > 110) beacons.push(b); };
    if (layout < 0.34) {                     // single big building
      const w = bs * (0.55 + R() * 0.4), d = bs * (0.55 + R() * 0.4);
      pushB(cx + (R() - 0.5) * (bs - w), cz + (R() - 0.5) * (bs - d), w, d, hCell);
    } else if (layout < 0.6) {               // twin
      const alongX = R() < 0.5;
      const a = bs * (0.4 + R() * 0.1), gap = 8;
      const b = bs - a - gap;
      if (alongX) { pushB(bx0 + a / 2, cz, a, bs * 0.85, hCell); pushB(bx0 + a + gap + b / 2, cz, b, bs * 0.8, hCell * (0.5 + R() * 0.6)); }
      else { pushB(cx, bz0 + a / 2, bs * 0.85, a, hCell); pushB(cx, bz0 + a + gap + b / 2, bs * 0.8, b, hCell * (0.5 + R() * 0.6)); }
    } else if (layout < 0.85) {              // quad
      const s = (bs - 8) / 2;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        pushB(bx0 + s / 2 + a * (s + 8), bz0 + s / 2 + b * (s + 8), s * (0.8 + R() * 0.2), s * (0.8 + R() * 0.2), hCell * (0.35 + R() * 0.75));
      }
    } else {                                  // perimeter block
      const t = 22;
      const hh = Math.min(hCell, 70);
      add(list, cx, bz0 + t / 2, bs, t, hh, 0, 1, pickTint(1), 3.6, FLOOR_H);
      add(list, cx, bz0 + bs - t / 2, bs, t, hh, 0, 1, pickTint(1), 3.6, FLOOR_H);
      add(list, bx0 + t / 2, cz, t, bs - 2 * t, hh * 0.9, 0, 1, pickTint(1), 3.6, FLOOR_H);
      add(list, bx0 + bs - t / 2, cz, t, bs - 2 * t, hh * 0.9, 0, 1, pickTint(1), 3.6, FLOOR_H);
    }
  }

  const mat = facadeMaterial(q.interiorMap > 0);
  const meshes = [];
  const makeMesh = (list, shadows) => {
    if (!list.length) return null;
    const geo = facadeBoxGeometry();
    const info = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach((b, k) => {
      m.compose(new THREE.Vector3(b.cx, b.y0, b.cz), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, col.setHex(b.tint));
      info[k * 4] = b.seed; info[k * 4 + 1] = b.style; info[k * 4 + 2] = b.bay; info[k * 4 + 3] = b.fh;
    });
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows; mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.computeBoundingSphere();
    scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  makeMesh(near, true);
  makeMesh(far, false);

  // aircraft warning lights
  beacons.forEach((b, i) => glow.add(b.x, b.y, b.z, 0xff2410, 9, 0.9, 1.7 + (i % 5) * 0.11, (i * 0.37) % 1));

  return { meshes, count: near.length + far.length, beacons };
}

// ---------------------------------------------------------------------------------------
// ground grid shader: streets, sidewalks, lamps, moving far traffic
// ---------------------------------------------------------------------------------------
const GROUND_VERT = 'varying vec3 vWPos; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const GROUND_FRAG = /* glsl */`
varying vec3 vWPos;
${COMMON}
${SKY}
uniform float uWet; uniform float uPitch;

vec3 lampField(vec2 w, float fp, vec2 axisDist, bool alongX, float s, float off, vec2 camDir, float wetK){
  // lamps every 34 m at 10 m off the street axis, staggered per side
  float side = off < 0.0 ? 0.0 : 0.5;
  float ls = abs(fract(s / 34.0 + side) - 0.5) * 34.0;
  float par = ls, perp = abs(off) - 10.0;
  // stretch the glow toward the camera on wet ground (reflection streak)
  vec2 lampDelta = alongX ? vec2(ls, perp) : vec2(perp, ls);
  vec2 stretchDir = normalize(camDir + 1e-4);
  float dp = dot(lampDelta, stretchDir);
  vec2 dq = lampDelta - dp * stretchDir;
  float dist = length(vec2(dp * mix(1.0, 0.22, wetK), length(dq)));
  float r = max(1.5, fp * 0.95);
  float g = exp(-dist*dist / (2.0*r*r)) * (1.5*1.5) / (r*r) ;
  float pool = exp(-dist*dist / (2.0*9.0*9.0));
  return vec3(min(g, 1.0), pool, 0.0);
}

void main(){
  vec3 wp = vWPos;
  vec2 w = wp.xz;
  float fp = length(fwidth(w));
  vec3 rd = normalize(wp - cameraPosition);
  vec2 nearest = floor(w / uPitch + 0.5) * uPitch;
  vec2 rel = w - nearest;
  vec2 sd = abs(rel);
  float dStreetZ = sd.x, dStreetX = sd.y;       // streets running along z / along x
  float dmin = min(dStreetZ, dStreetX);
  float road = 1.0 - smoothstep(7.0 - fp*0.5, 7.0 + fp*0.5, dmin);
  float walk = (1.0 - smoothstep(12.0 - fp*0.5, 12.0 + fp*0.5, dmin)) * (1.0 - road);
  float lot = 1.0 - road - walk;
  float n1 = nz(vec3(w*0.13, 0.5)).r, n2 = nz(vec3(w*0.9, 0.2)).b;
  vec3 asphalt = vec3(0.030, 0.031, 0.034) * (0.75 + 0.5*n1) * (0.9 + 0.2*n2);
  vec3 pave = vec3(0.13, 0.125, 0.115) * (0.8 + 0.4*n1);
  float hc = hash21(floor(w / uPitch));
  vec3 lotc = mix(vec3(0.05,0.055,0.05), vec3(0.09,0.085,0.075), hc) * (0.8 + 0.4*n2);
  vec3 alb = asphalt*road + pave*walk + lotc*lot;

  // lane markings
  float axisDist = min(dStreetX, dStreetZ);
  float centre = (1.0 - smoothstep(0.25, 0.25 + fp, abs(axisDist - 0.28))) * road;
  float sAlong = dStreetX < dStreetZ ? w.x : w.y;
  float dash = step(0.5, fract(sAlong / 9.0)) ;
  float laneLine = (1.0 - smoothstep(0.08, 0.08 + fp, abs(abs(axisDist) - 3.5))) * road * dash;
  alb = mix(alb, vec3(0.6,0.5,0.1), centre * 0.8);
  alb = mix(alb, vec3(0.5), laneLine * 0.6);

  // lighting
  float sunUp = max(uSunDir.y, 0.0);
  vec3 sunL = uSunCol * sunUp * 3.0 * (1.0 - uCloudCov*0.75) * (1.0 - uNight);
  vec3 amb = mix(uZenith, uHorizon, 0.35) * 0.75 + uCityGlow*2.0;
  vec3 col = alb * (sunL * 0.32 + amb);

  // street lamps + traffic (only near street axes)
  bool alongX = dStreetX < dStreetZ;
  float off = alongX ? rel.y : rel.x;
  float s = alongX ? w.x : w.y;
  float sAxis = alongX ? nearest.x : nearest.y;
  float distToIsect = abs(alongX ? rel.x : rel.y);
  vec2 camDir = normalize(cameraPosition.xz - w);
  float wetK = uWet;
  float night = smoothstep(0.0, 1.0, uNight*1.4 + (1.0 - sunUp*1.6)*0.25);
  if (dmin < 22.0) {
    vec3 lf = lampField(w, fp, sd, alongX, s, off, camDir, wetK);
    vec3 lampCol = vec3(1.0, 0.72, 0.42);
    col += lampCol * lf.x * 18.0 * night;
    col += alb * lampCol * lf.y * 4.0 * night * (road + walk);
  }
  // traffic dots
  if (road > 0.05) {
    float lane = 0.0; float best = 9.0;
    float laneOffs[4] = float[4](-5.25, -1.75, 1.75, 5.25);
    for (int i = 0; i < 4; i++) {
      float d = abs(off - laneOffs[i]);
      if (d < best) { best = d; lane = float(i); }
    }
    float dirn = off > 0.0 ? 1.0 : -1.0;
    float sp = 7.0 + 5.0 * hash11(lane*3.7 + sAxis*0.013 + (alongX ? 1.0 : 2.0));
    float ph = s - dirn * sp * uTime;
    float idx = floor(ph / 38.0);
    float loc = ph - idx * 38.0;
    float has = step(0.42, hash21(vec2(idx, lane + sAxis*0.07 + (alongX ? 0.0 : 100.0))));
    float cc = 8.0 + 20.0 * hash21(vec2(idx*1.3, lane + 4.0));
    float rC = max(0.9, fp * 0.9);
    float dl = loc - cc;
    float front = exp(-pow(dl - 2.2*dirn, 2.0) / (2.0*rC*rC) - best*best/(2.0*rC*rC));
    float rear = exp(-pow(dl + 2.2*dirn, 2.0) / (2.0*rC*rC) - best*best/(2.0*rC*rC));
    float en = min(1.0, 0.9/(rC*rC));
    // freeze cars near intersections crudely by fading their brightness at the cross street
    float nearX = smoothstep(9.0, 15.0, distToIsect);
    col += has * (vec3(1.0,0.92,0.75) * front * 9.0 + vec3(1.0,0.05,0.03) * rear * 5.0) * en * nearX * road * (0.35 + 0.65*night);
  }
  // wet ground reflects the sky
  if (uWet > 0.01) {
    vec3 Rr = reflect(rd, vec3(0.0,1.0,0.0));
    float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(-rd, vec3(0.0,1.0,0.0)), 0.0, 1.0), 5.0);
    float puddle = smoothstep(0.35, 0.6, nz(vec3(w*0.06, 0.7)).r) * (road + walk*0.6);
    col = mix(col, skyColor(Rr) * 0.7, clamp(F * uWet * (0.35 + 0.65*puddle), 0.0, 0.85));
  }
  col = applyFog(col, wp);
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildGround(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise3: G.u.uNoise3, uSunDir: G.u.uSunDir, uMoonDir: G.u.uMoonDir, uZenith: G.u.uZenith, uHorizon: G.u.uHorizon, uSunCol: G.u.uSunCol,
      uGlowCol: G.u.uGlowCol, uCityGlow: G.u.uCityGlow, uNight: G.u.uNight, uCloudCov: G.u.uCloudCov, uCloudDark: G.u.uCloudDark, uDisk: G.u.uDisk,
      uTime: G.u.uTime, uFogDen: G.u.uFogDen, uFogH: G.u.uFogH, uFlash: G.u.uFlash, uWet: G.u.uWet, uPitch: { value: P },
    },
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, side: THREE.DoubleSide, fog: false,
  });
  const g = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = -0.35;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------------------
// distant hills ring
// ---------------------------------------------------------------------------------------
export function buildHills(scene) {
  const seg = 360, rad = 3900;
  const pos = [], idx = [];
  const R = rng(4242);
  const ph = [R() * 6, R() * 6, R() * 6, R() * 6];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const hgt = 90 + 70 * Math.sin(a * 3 + ph[0]) + 45 * Math.sin(a * 7 + ph[1]) + 25 * Math.sin(a * 17 + ph[2]) + 12 * Math.sin(a * 41 + ph[3]);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    pos.push(x, -80, z, x, Math.max(20, hgt), z);
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise3: G.u.uNoise3, uSunDir: G.u.uSunDir, uMoonDir: G.u.uMoonDir, uZenith: G.u.uZenith, uHorizon: G.u.uHorizon, uSunCol: G.u.uSunCol,
      uGlowCol: G.u.uGlowCol, uCityGlow: G.u.uCityGlow, uNight: G.u.uNight, uCloudCov: G.u.uCloudCov, uCloudDark: G.u.uCloudDark, uDisk: G.u.uDisk,
      uTime: G.u.uTime, uFogDen: G.u.uFogDen, uFogH: G.u.uFogH, uFlash: G.u.uFlash,
    },
    vertexShader: 'varying vec3 vWPos; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWPos = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `varying vec3 vWPos;\n${COMMON}\n${SKY}\nvoid main(){
      vec3 base = mix(uZenith, uHorizon, 0.5) * 0.22 + uCityGlow * 1.5;
      float lite = clamp(0.35 + vWPos.y/260.0, 0.0, 1.0);
      vec3 col = base * (0.55 + 0.45*lite) * (1.0 + 0.5*nz(vWPos*0.004).r);
      gl_FragColor = vec4(applyFog(col, vWPos), 1.0); }`,
    side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------------------
// Meridian Tower exterior shell (player's tower). Ground zone/lobby is built in tower.js.
// ---------------------------------------------------------------------------------------
export function buildTowerShell(scene, glow) {
  const mat = facadeMaterial(true, true);
  const INFO = [0.37, 0, 3.0, FLOOR_H];
  const tint = new THREE.Color(0x3a5e74);
  const parts = [];
  const box = (x0, x1, y0, y1, z0, z1, materials) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    setInfoAttr(g, INFO);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = tint.r; col[i + 1] = tint.g; col[i + 2] = tint.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, materials || mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh); parts.push(mesh);
    return mesh;
  };
  const T = TOWER;
  const skin = 0.4;
  const yTop = APT_Y + 3.6;
  // main shaft
  box(T.x0, T.x1, LOBBY_H, APT_Y - 0.05, T.z0, T.z1);
  // top floor skin: north pieces around the unit's window wall (x -49..-31), full east/west/south skins
  box(T.x0, -49, APT_Y - 0.05, yTop, T.z0, T.z0 + skin);
  box(-31, T.x1, APT_Y - 0.05, yTop, T.z0, T.z0 + skin);
  box(T.x0, T.x0 + skin, APT_Y - 0.05, yTop, T.z0 + skin, T.z1);
  box(T.x1 - skin, T.x1, APT_Y - 0.05, yTop, T.z0 + skin, T.z1);
  box(T.x0 + skin, T.x1 - skin, APT_Y - 0.05, yTop, T.z1 - skin, T.z1);
  // roof slab (underside is the ceiling of the apartment => plaster on the -y face)
  const ceilMat = pm('plaster', { color: 0xeeeae2, interior: true });
  const roof = box(T.x0, T.x1, yTop, TOWER_TOP, T.z0, T.z1, [mat, mat, mat, ceilMat, mat, mat]);
  // parapet + crown
  const dark = pm('concrete', { color: 0x777a80, p: [1, 0, 0, 0] });
  const rb = (x0, x1, y0, y1, z0, z1, m) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); const me = new THREE.Mesh(g, m); me.castShadow = me.receiveShadow = true; me.matrixAutoUpdate = false; scene.add(me); return me; };
  const y1 = TOWER_TOP;
  rb(T.x0, T.x1, y1, y1 + 1.0, T.z0, T.z0 + 0.3, dark); rb(T.x0, T.x1, y1, y1 + 1.0, T.z1 - 0.3, T.z1, dark);
  rb(T.x0, T.x0 + 0.3, y1, y1 + 1.0, T.z0, T.z1, dark); rb(T.x1 - 0.3, T.x1, y1, y1 + 1.0, T.z0, T.z1, dark);
  // mechanical crown: stepped block + spire
  rb(-52, -28, y1, y1 + 7, 28, 52, mat);
  rb(-46, -34, y1 + 7, y1 + 12, 34, 46, mat);
  rb(-41, -39, y1 + 12, y1 + 34, 39, 41, dark);
  glow.add(-40, y1 + 34.3, 40, 0xff2410, 12, 1.1, 1.5, 0.15);
  // crown up-light strip (glowing edge)
  const strip = pm('plain', { color: 0x050505, emissive: 0xffd9a0, emissiveI: 3.2 });
  rb(-52, -28, y1 + 6.6, y1 + 6.9, 27.9, 28.0, strip);
  rb(-52, -28, y1 + 6.6, y1 + 6.9, 52.0, 52.1, strip);
  return { parts, roof };
}
