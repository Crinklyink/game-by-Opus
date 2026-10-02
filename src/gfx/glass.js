// Rain-on-glass window pane.
// Advanced path (High/Medium): drawn after the scene into the same HDR target, sampling a
// mip-chain copy of everything behind it. Beads + running drops refract/invert the city,
// misted glass blurs it, and the room (box-projected interior probe) reflects in the pane.
// Simple path (Low): a plain transparent physical pane.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { COMMON, SKY } from './glsl.js';
import { LAYER_GLASS } from './postfx.js';

const VERT = /* glsl */`
uniform vec2 uUvScale; uniform vec2 uUvOff;
varying vec3 vWPos; varying vec3 vN; varying vec2 vUvM;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWPos = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vUvM = uv * uUvScale + uUvOff;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${COMMON}
${SKY}
uniform sampler2D tRefract; uniform vec2 uRes; uniform float uRain;
uniform samplerCube uProbe; uniform vec3 uBoxMin, uBoxMax, uProbePos; uniform float uInside, uProbeOn, uWetGlass;
uniform vec2 uUvScale;
varying vec3 vWPos; varying vec3 vN; varying vec2 vUvM;

// static beads: returns (normal.xy, mask)
vec3 beads(vec2 uv, float sc, float dens, float seed, float t){
  vec2 p = uv * sc; vec2 id = floor(p); vec2 f = fract(p) - 0.5;
  float h1 = hash21(id + seed*3.7), h2 = hash21(id*1.37 + seed*9.1 + 4.2);
  vec2 c = (vec2(h1, h2) - 0.5) * 0.5;
  float rad = mix(0.07, 0.27, hash21(id + seed*5.3 + 1.7));
  float exist = step(hash21(id + seed*7.7 + 3.1), dens);
  float life = fract(t * 0.02 + h1 * 7.0);
  float k = smoothstep(0.0, 0.18, life) * smoothstep(1.0, 0.8, life);
  vec2 d = f - c;
  float r = rad * k + 1e-4;
  float dist = length(d) / r;
  float m = smoothstep(1.0, 0.82, dist) * exist;
  return vec3(d / r * m, m);
}

// running drops with trails, in metres. returns (normal.xy, headMask) and trail via out
vec3 runners(vec2 uv, float t, float cw, float dens, float seed, float H, out float trail){
  float col = floor(uv.x / cw);
  float xm = (fract(uv.x / cw) - 0.5) * cw;
  float rnd = hash11(col*7.31 + seed), rnd2 = hash11(col*3.17 + seed*2.0 + 5.0);
  float present = step(rnd2, dens);
  float period = mix(5.0, 12.0, rnd);
  float tt = t / period + rnd * 10.0;
  float cyc = floor(tt), ph = fract(tt);
  float hh = hash11(cyc*13.7 + col*2.1 + seed);
  float sp = ph + 0.035 * sin(ph * 38.0 + rnd*6.0) ;
  float yStart = H * (0.55 + 0.6*hh);
  float yHead = yStart - sp * (yStart + 0.2);
  float x0 = (hash11(cyc*5.3 + col) - 0.5) * cw * 0.5 + 0.004 * sin(uv.y * 38.0 + rnd*9.0);
  float rHead = mix(0.0055, 0.0105, rnd2);
  vec2 dv = vec2(xm - x0, (uv.y - yHead) * 0.7);
  float hd = length(dv) / rHead;
  float head = smoothstep(1.0, 0.72, hd) * present * step(0.0, yHead + 0.05);
  float above = step(yHead, uv.y) * step(uv.y, yStart);
  float tw = rHead * 0.34 * (0.55 + 0.45 * smoothstep(yStart, yHead, uv.y));
  float tr = smoothstep(tw, tw * 0.25, abs(xm - x0)) * above * present * (1.0 - smoothstep(0.55, 1.0, ph));
  trail = tr;
  return vec3(dv / rHead * head, head);
}

vec3 boxProject(vec3 pos, vec3 dir){
  vec3 t1 = (uBoxMax - pos) / dir, t2 = (uBoxMin - pos) / dir;
  vec3 tm = max(t1, t2);
  float t = min(min(tm.x, tm.y), tm.z);
  return pos + dir * t - uProbePos;
}

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;

  // ---- water on glass ----
  vec2 off = vec2(0.0); float clearM = 0.0; float rim = 0.0;
  float rainK = uRain;
  if (rainK > 0.02 || uWetGlass > 0.02) {
    float k = max(rainK, uWetGlass * 0.6);
    vec3 b1 = beads(vUvM, 9.0, 0.45 * k + 0.05, 1.0, uTime);
    vec3 b2 = beads(vUvM + 3.3, 22.0, 0.35 * k, 2.0, uTime * 1.3);
    float tr1, tr2;
    vec3 r1 = runners(vUvM, uTime, 0.16, 0.85 * k, 3.0, uUvScale.y, tr1);
    vec3 r2 = runners(vUvM + 0.31, uTime * 0.8, 0.09, 0.6 * k, 8.0, uUvScale.y, tr2);
    vec2 n = b1.xy * 0.9 + b2.xy * 0.5 + r1.xy * 1.1 + r2.xy * 0.8;
    off = -n * 0.05 + vec2(0.0, -0.002) * (tr1 + tr2);
    clearM = max(max(b1.z, b2.z * 0.8), max(max(r1.z, r2.z), max(tr1, tr2) * 0.75));
    rim = smoothstep(0.55, 1.0, length(n)) * clamp(b1.z + b2.z + r1.z + r2.z, 0.0, 1.0);
  }
  float dirt = nz(vec3(vUvM * 3.0, 0.4)).r;
  float mist = (uRain * 1.6 + uWetGlass * 1.2) + 0.1 * smoothstep(0.6, 0.95, dirt);
  float lod = mix(mist, 0.15, clearM);
  vec3 behind = textureLod(tRefract, clamp(suv + off, 0.001, 0.999), lod).rgb;
  behind *= vec3(0.94, 0.975, 0.985);
  behind = mix(behind, behind * 0.85 + vec3(0.02,0.025,0.03) * (0.5 + uZenith.b), (1.0 - clearM) * uRain * 0.35);

  // ---- reflection ----
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.045 + 0.955 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (uInside > 0.5 && uProbeOn > 0.5) {
    vec3 bp = boxProject(vWPos, R);
    refl = textureLod(uProbe, bp, 1.5 + mist * 2.0).rgb;
  } else if (uInside > 0.5) {
    refl = vec3(0.02);
  } else {
    refl = skyColor(R) * 0.9;
  }
  vec3 col = behind * (1.0 - fres) + refl * (fres + 0.02 + 0.05 * smoothstep(0.55, 0.9, dirt)) ;
  col += refl * rim * 0.6 + vec3(0.9, 0.95, 1.0) * rim * 0.05;
  gl_FragColor = vec4(col, 1.0);
}`;

let sharedMat = null;
export function glassUniforms() {
  return G.glassU || (G.glassU = {
    uProbe: { value: null }, uBoxMin: { value: new THREE.Vector3() }, uBoxMax: { value: new THREE.Vector3() }, uProbePos: { value: new THREE.Vector3() },
    uInside: { value: 1 }, uProbeOn: { value: 0 }, uWetGlass: { value: 0 },
  });
}

export function glassMaterial(uvScale) {
  const gu = glassUniforms();
  return new THREE.ShaderMaterial({
    uniforms: {
      tRefract: G.u.tRefract, uRes: G.u.uRes, uRain: G.u.uRain, uTime: G.u.uTime, uNoise3: G.u.uNoise3,
      uSunDir: G.u.uSunDir, uMoonDir: G.u.uMoonDir, uZenith: G.u.uZenith, uHorizon: G.u.uHorizon, uSunCol: G.u.uSunCol, uGlowCol: G.u.uGlowCol,
      uCityGlow: G.u.uCityGlow, uNight: G.u.uNight, uCloudCov: G.u.uCloudCov, uCloudDark: G.u.uCloudDark, uDisk: G.u.uDisk, uFogDen: G.u.uFogDen, uFogH: G.u.uFogH, uFlash: G.u.uFlash,
      uProbe: gu.uProbe, uBoxMin: gu.uBoxMin, uBoxMax: gu.uBoxMax, uProbePos: gu.uProbePos, uInside: gu.uInside, uProbeOn: gu.uProbeOn, uWetGlass: gu.uWetGlass,
      uUvScale: { value: new THREE.Vector2(uvScale[0], uvScale[1]) }, uUvOff: { value: new THREE.Vector2(uvScale[2] || 0, uvScale[3] || 0) },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthWrite: false, transparent: false, fog: false,
  });
}

const simpleMat = () => new THREE.MeshPhysicalMaterial({ color: 0xaabbcc, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 });

// Returns { group, advanced, simple }. Plane is centred at (cx,cy,cz), facing +z (rotate with ry).
export function makeGlassPane(parent, w, h, cx, cy, cz, ry = 0, uvOff = [0, 0]) {
  const geo = new THREE.PlaneGeometry(w, h);
  const adv = new THREE.Mesh(geo, glassMaterial([w, h, uvOff[0], uvOff[1]]));
  adv.layers.set(LAYER_GLASS);
  adv.position.set(cx, cy, cz); adv.rotation.y = ry; adv.frustumCulled = true; adv.renderOrder = 5;
  const simple = new THREE.Mesh(geo, simpleMat());
  simple.position.copy(adv.position); simple.rotation.y = ry; simple.renderOrder = 5;
  const useAdv = !!(G.q && G.q.glass);
  adv.visible = useAdv; simple.visible = !useAdv;
  parent.add(adv, simple);
  (G.glassPanes = G.glassPanes || []).push({ adv, simple });
  return { adv, simple };
}

export function setGlassQuality(on) {
  for (const p of G.glassPanes || []) { p.adv.visible = !!on; p.simple.visible = !on; }
}
