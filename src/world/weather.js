// Weather: procedural daily forecast (mist, clouds, rain, storms with lightning + delayed thunder)
// and the rain-streak particle system (GPU animated, sheltered under canopies, clipped by windows).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp, smooth, lerp } from '../core/util.js';

const VERT = /* glsl */`
attribute vec3 aRand;
uniform float uTime, uHeight, uSpread, uSpeed, uLen, uThick, uAspect, uInt;
uniform vec3 uCenter, uWind;
uniform vec4 uShelA[4]; uniform float uShelH[4];
uniform float uClipOn, uClipZ;
varying float vA;
void main(){
  float S = uSpread;
  vec2 xz = mod(aRand.xz * 2.0 * S - uCenter.xz + S, 2.0 * S) - S + uCenter.xz;
  float fall = mod(aRand.y * uHeight + uTime * uSpeed, uHeight);
  float y = uCenter.y + uHeight * 0.45 - fall;
  vec3 head = vec3(xz.x, y, xz.y);
  head.xz += uWind.xz * (fall / uSpeed);
  vec3 vel = vec3(uWind.x, -uSpeed, uWind.z);
  vec3 tail = head - normalize(vel) * uLen * (0.6 + 0.8 * fract(aRand.x * 91.7));
  float visible = step(aRand.y * 0.999, uInt);
  for (int i = 0; i < 4; i++) {
    if (head.x > uShelA[i].x && head.x < uShelA[i].z && head.z > uShelA[i].y && head.z < uShelA[i].w && head.y < uShelH[i]) visible = 0.0;
  }
  if (uClipOn > 0.5 && head.z > uClipZ) visible = 0.0;
  vec4 a = projectionMatrix * viewMatrix * vec4(tail, 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(head, 1.0);
  vec2 sa = a.xy / a.w, sb = b.xy / b.w;
  vec2 d = (sb - sa) * vec2(uAspect, 1.0);
  float dl = length(d);
  vec2 dir = dl > 1e-5 ? d / dl : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
  float t = position.y + 0.5;
  vec4 pcl = mix(a, b, t);
  pcl.xy += nrm * position.x * uThick * pcl.w;
  gl_Position = pcl;
  float dist = length((viewMatrix * vec4(head, 1.0)).xyz);
  vA = visible * (0.10 + 0.9 * t) * smoothstep(S * 1.5, S * 0.4, dist) * smoothstep(0.3, 1.4, dist);
}`;
const FRAG = /* glsl */`
uniform vec3 uTint; varying vec4 dummy;
varying float vA;
void main(){ gl_FragColor = vec4(uTint, vA * 0.55); }`.replace('varying vec4 dummy;\n', '');

export class Weather {
  constructor(scene, q) {
    this.scene = scene; this.q = q;
    this.R = rng(31337);
    const n = q.rain ?? 3000;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    const r = new Float32Array(n * 3); for (let i = 0; i < r.length; i++) r[i] = Math.random();
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(r, 3));
    g.instanceCount = n;
    this.u = {
      uTime: G.u.uTime, uHeight: { value: 34 }, uSpread: { value: 22 }, uSpeed: { value: 15 }, uLen: { value: 0.9 }, uThick: { value: 0.0011 }, uAspect: { value: 1.78 }, uInt: { value: 0 },
      uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(1.2, 0, 0.4) }, uTint: { value: new THREE.Color(0.7, 0.75, 0.85) },
      uShelA: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] }, uShelH: { value: [0, 0, 0, 0] },
      uClipOn: { value: 0 }, uClipZ: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 15;
    scene.add(this.mesh);
    this.shelters = [
      { a: [-44.5, 16.2, -35.5, 20.4], h: 4.2 },      // tower entrance canopy
      { a: [72, 9.1, 76, 10.9], h: 2.6 },             // bus shelter
      { a: [-40, -30.2, -18, -17.8], h: 3.9 },        // cafe pavilion
      { a: [0, 0, 0, 0], h: 0 },
    ];
    this.shelters.forEach((s, i) => { this.u.uShelA.value[i].set(...s.a); this.u.uShelH.value[i] = s.h; });
    // ---- forecast ----
    this.day = -1; this.plan = { rains: [] };
    this.nextFlash = 8; this.thunder = [];
    this.forced = null;
    G.weatherSys = this;
  }

  planDay(day) {
    const R = this.R;
    this.day = day;
    const p = { rains: [], cloud: 0.15 + R() * 0.4, mist: R() < 0.35 ? 0.4 + R() * 0.5 : 0 };
    // day 1 starts clear so the first impression is a clean skyline
    if (day > 1 && R() < 0.42) {
      const start = 9 + R() * 12, dur = 1.5 + R() * 4.5;
      p.rains.push({ start, end: start + dur, k: 0.45 + R() * 0.55, storm: R() < 0.3 });
    }
    if (day > 2 && R() < 0.18) { const start = R() * 5, dur = 1 + R() * 2; p.rains.push({ start, end: start + dur, k: 0.5 + R() * 0.4, storm: false }); }
    this.plan = p;
  }

  force(kind) {
    this.forced = kind === 'auto' ? null : kind;
  }

  update(dt, camera, player) {
    const W = G.weather, h = G.time.hour;
    if (this.day !== G.time.day) this.planDay(G.time.day);
    let target = 0, storm = 0;
    for (const r of this.plan.rains) if (h >= r.start && h <= r.end) { target = r.k; storm = r.storm ? 1 : 0; }
    if (this.forced === 'clear') { target = 0; storm = 0; } else if (this.forced === 'rain') { target = 0.7; storm = 0; } else if (this.forced === 'storm') { target = 1; storm = 1; }
    W.target = target;
    W.storm += (storm - W.storm) * (1 - Math.exp(-dt * 0.4));
    W.cloud = lerp(W.cloud ?? 0.3, this.plan.cloud, 1 - Math.exp(-dt * 0.05));
    const mist = (this.plan.mist) * (1 - smooth(6.5, 9.5, h)) * smooth(3.5, 5.5, h);
    W.mist += (mist - W.mist) * (1 - Math.exp(-dt * 0.1));

    // ---- lightning ----
    if (W.storm > 0.5 && W.rain > 0.5) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = 5 + this.R() * 14;
        const dist = 400 + this.R() * 3500;
        this.pulse = { t: 0, n: 2 + Math.floor(this.R() * 3) };
        this.thunder.push({ t: dist / 343, strength: clamp(1 - dist / 4200, 0.2, 1) });
      }
    }
    if (this.pulse) {
      const p = this.pulse; p.t += dt;
      const k = (p.t * 6.5) % 1, idx = Math.floor(p.t * 6.5);
      if (idx >= p.n * 2) { this.pulse = null; }
      else W.flash = Math.max(W.flash, idx % 2 === 0 ? (1 - k) * (idx === 0 ? 1 : 0.7) : 0);
    }
    for (const th of this.thunder) th.t -= dt;
    while (this.thunder.length && this.thunder[0].t <= 0) { const th = this.thunder.shift(); G.audio?.thunder?.(th.strength); }

    // ---- rain particles ----
    const cam = camera.position;
    const inApt = player && player.level === 1 && cam.x > -49.3 && cam.x < -30.7 && cam.z > 20.4 && cam.z < 32.5 && cam.y > 150;
    const outdoors = !(G.indoor);
    const u = this.u;
    const rain = W.rain;
    u.uCenter.value.copy(cam);
    u.uAspect.value = camera.aspect;
    let inten = rain * (outdoors || inApt ? 1 : 0);
    // when looking from the apartment interior, rain only exists outside the window plane
    u.uClipOn.value = inApt ? 1 : 0; u.uClipZ.value = 20.3;
    u.uInt.value = inten;
    u.uSpeed.value = 14 + W.storm * 4;
    u.uWind.value.set(1.0 + W.storm * 4, 0, 0.5 + W.storm * 1.5);
    const amb = new THREE.Color().copy(G.u.uHorizon.value).multiplyScalar(0.55).add(G.u.uCityGlow.value.clone().multiplyScalar(6)).addScalar(0.05);
    u.uTint.value.copy(amb).multiplyScalar(0.9);
    this.mesh.visible = inten > 0.01;
  }
}
