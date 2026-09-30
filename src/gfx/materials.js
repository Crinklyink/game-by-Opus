// Procedural PBR materials.
// Every surface in the game is a MeshStandard/PhysicalMaterial patched (onBeforeCompile)
// so its albedo / roughness / metalness / bump / emissive come from a GLSL "surf()"
// function evaluated in object space against the shared 3D noise volume. That gives
// real high-frequency detail (grain, pores, weave, grout...) with no texture files,
// plus a shared atmospheric-fog model and wetness so rain affects everything.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { COMMON, SKY, PROC } from './glsl.js';

const cache = new Map();
export const interiorMats = new Set();

const SHARED = ['uNoise3', 'uTime', 'uNight', 'uWet', 'uSunDir', 'uMoonDir', 'uZenith', 'uHorizon', 'uSunCol', 'uGlowCol',
  'uCityGlow', 'uCloudCov', 'uCloudDark', 'uDisk', 'uFogDen', 'uFogH', 'uFlash'];

const VERT_HEAD = 'varying vec3 vWPos; varying vec3 vLocal; varying vec3 vWNormal; varying vec2 vUvP;';
const VERT_INJECT = /* glsl */`
{
  vec4 _wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _wp = instanceMatrix * _wp;
  #endif
  vWPos = (modelMatrix * _wp).xyz;
  vLocal = position;
  vec3 _n = objectNormal;
  #ifdef USE_INSTANCING
    _n = mat3(instanceMatrix) * _n;
  #endif
  vWNormal = normalize(mat3(modelMatrix) * _n);
  vUvP = uv;
}`;

const FRAG_LIB = /* glsl */`
struct S { vec3 alb; float rough; float metal; float h; vec3 emis; float ao; };
vec3 bumpN(vec3 pos, vec3 N, vec2 dH, float fd){
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 R1 = cross(sy, N), R2 = cross(N, sx);
  float det = dot(sx, R1) * fd;
  if (abs(det) < 1e-14) return N;
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * N - grad);
}`;

export function patchMaterial(shader, procSrc, uni, extra = '', vert = null) {
  for (const k of SHARED) shader.uniforms[k] = G.u[k];
  shader.uniforms.uScale = uni.uScale;
  shader.uniforms.uP = uni.uP;
  shader.uniforms.uCol2 = uni.uCol2;
  shader.uniforms.uWetAmt = uni.uWetAmt;
  if (uni.extra) for (const k in uni.extra) shader.uniforms[k] = uni.extra[k];

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_INJECT);

  if (vert) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + (vert.head || ''))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (vert.normal || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (vert.begin || ''));
  }

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vLocal; varying vec3 vWNormal; varying vec2 vUvP;
uniform float uScale, uWetAmt, uWet;
${COMMON}
${SKY}
${FRAG_LIB}
${extra}
${procSrc}
`)
    .replace('#include <color_fragment>', /* glsl */`
#include <color_fragment>
S ps; ps.alb = diffuseColor.rgb; ps.rough = roughness; ps.metal = metalness; ps.h = 0.0; ps.emis = vec3(0.0); ps.ao = 1.0;
vec3 pn = normalize(vWNormal);
surf(vLocal * uScale, pn, vWPos, ps);
float wetK = uWet * uWetAmt * mix(0.35, 1.0, clamp(pn.y, 0.0, 1.0));
ps.alb *= mix(1.0, 0.62, wetK);
ps.rough = mix(ps.rough, 0.07, wetK * 0.85);
diffuseColor.rgb = ps.alb;
`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(ps.rough, 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = ps.metal;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpN(-vViewPosition, normal, vec2(dFdx(ps.h), dFdy(ps.h)), faceDirection);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += ps.emis;')
    .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= ps.ao; reflectedLight.indirectSpecular *= mix(1.0, ps.ao, 0.6);')
    .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWPos);');
}

// pm('woodfloor', { color, col2, rough, metal, scale, p:[x,y,z,w], physical, sheen, clearcoat, wet, interior, ... })
export function pm(kind = 'plain', o = {}) {
  const key = kind + '|' + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const Cls = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = { color: o.color ?? 0xffffff, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, envMapIntensity: o.env ?? 1 };
  if (o.emissive != null) { params.emissive = o.emissive; params.emissiveIntensity = o.emissiveI ?? 1; }
  if (o.side != null) params.side = o.side;
  if (o.transparent) { params.transparent = true; params.opacity = o.opacity ?? 1; }
  if (o.physical) {
    if (o.sheen) { params.sheen = o.sheen; params.sheenRoughness = o.sheenRough ?? 0.5; params.sheenColor = new THREE.Color(o.sheenColor ?? 0xffffff); }
    if (o.clearcoat) { params.clearcoat = o.clearcoat; params.clearcoatRoughness = o.ccRough ?? 0.05; }
    if (o.ior) params.ior = o.ior;
    if (o.spec != null) params.specularIntensity = o.spec;
  }
  const m = new Cls(params);
  if (o.flat) m.flatShading = true;
  const uni = {
    uScale: { value: o.scale ?? 1 },
    uP: { value: new THREE.Vector4(...(o.p ?? [0, 0, 0, 0])) },
    uCol2: { value: new THREE.Color(o.col2 ?? 0x000000) },
    uWetAmt: { value: o.wet ?? 0 },
  };
  m.userData = { kind, o, uni };
  m.customProgramCacheKey = () => `pm:${kind}:${o.physical ? 1 : 0}`;
  m.onBeforeCompile = (shader) => patchMaterial(shader, PROC[kind] || PROC.plain, uni);
  if (o.interior) { interiorMats.add(m); if (G.interiorEnv) m.envMap = G.interiorEnv; }
  cache.set(key, m);
  return m;
}

// Emissive-only helper (bulbs, LEDs, neon tubes...). Emission is HDR so bloom picks it up.
export function glowMat(color, intensity = 6, o = {}) {
  return pm('plain', { color: 0x050505, rough: 0.4, emissive: color, emissiveI: intensity, ...o });
}

export function setInteriorEnv(tex) {
  G.interiorEnv = tex;
  for (const m of interiorMats) { m.envMap = tex; m.needsUpdate = false; }
}

// Unlit-but-fogged basic material for screens, sprites of light, decals.
export function screenMat(map, intensity = 1.6) {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(intensity, intensity, intensity), toneMapped: false });
  return m;
}
