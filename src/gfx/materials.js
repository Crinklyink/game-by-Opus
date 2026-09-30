// Procedural PBR materials.
// Every surface in the game is a MeshStandard/PhysicalMaterial patched (onBeforeCompile)
// so its albedo / roughness / metalness / bump / emissive come from a GLSL "surf()"
// function evaluated in object space against the shared 3D noise volume. That gives
// real high-frequency detail (grain, pores, weave, grout...) with no texture files,
// plus a shared atmospheric-fog model and wetness so rain affects everything.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { COMMON, SKY, PROC } from './glsl.js';
import { SDF_GLSL } from './sdf.js';
import { FAR_GLSL } from './farshadow.js';

// optional per-kind vertex code for pm() materials: { head, normal, begin } (see patchMaterial)
export const VERT = {};

const cache = new Map();
export const interiorMats = new Set();

const SHARED = ['uNoise3', 'uTime', 'uNight', 'uWet', 'uSunDir', 'uMoonDir', 'uZenith', 'uHorizon', 'uSunCol', 'uGlowCol',
  'uCityGlow', 'uCloudCov', 'uCloudDark', 'uDisk', 'uFogDen', 'uFogH', 'uFlash', 'tSdf', 'tVis', 'uSdfMin', 'uSdfInv', 'uSdfCfg', 'uSdfCfg2', 'uSdfDbg', 'tHeight', 'uHeightCfg'];

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
struct S { vec3 alb; float rough; float metal; float h; vec3 emis; float ao; float a; };
vec3 bumpN(vec3 pos, vec3 N, vec2 dH, float fd){
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 R1 = cross(sy, N), R2 = cross(N, sx);
  float det = dot(sx, R1) * fd;
  if (abs(det) < 1e-14) return N;
  vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * N - grad);
}`;

// ---- light-loop surgery ---------------------------------------------------------------------------
// Interior materials (uni.sdf) swap three.js' flat environment irradiance for the baked light volume
// (sky visibility through the windows) and add contact AO, SDF soft shadows on the strongest pooled
// lights and a wrap-lit bounce from every pooled light. See gfx/sdf.js.
const rep = (src, from, to, tag) => {
  if (!src.includes(from)) { console.error('[floor48] shader chunk patch missed:', tag); return src; }
  return src.replace(from, to);
};
let _lightsBegin = null, _lightsBase = null, _lightsMaps = null;
const SUN_FAR = 'getDirectionalLightInfo( directionalLight, directLight );';
// every patched material: the sun is also shadowed by the distant city (height map march)
function lightsBase() {
  if (_lightsBase) return _lightsBase;
  return (_lightsBase = rep(THREE.ShaderChunk.lights_fragment_begin, SUN_FAR, SUN_FAR + '\n\t\tdirectLight.color *= farSunV;', 'sunfar'));
}
function lightsBegin() {
  if (_lightsBegin) return _lightsBegin;
  let c = lightsBase();
  c = rep(c, 'IncidentLight directLight;', /* glsl */`IncidentLight directLight;
#ifdef SDF_ON
vec3 sdfFill = vec3(0.0);
vec3 sdfWN = normalize(geometryNormal * mat3(viewMatrix));
float sdfDbgSh = 1.0;
#endif`, 'directLight');
  c = rep(c, 'getPointLightInfo( pointLight, geometryPosition, directLight );', /* glsl */`getPointLightInfo( pointLight, geometryPosition, directLight );
#ifdef SDF_ON
	if (sdfF > 0.0) {
		vec3 sdfLv = (pointLight.position - geometryPosition) * mat3(viewMatrix);
		#if UNROLLED_LOOP_INDEX < SDF_LIGHTS
		if (directLight.visible) { float shv = sdfShadow(sdfP + pn * 0.04, vWPos + sdfLv, SDF_SOFT); if (UNROLLED_LOOP_INDEX == 0) sdfDbgSh = shv; directLight.color *= mix(1.0, shv, sdfF * smoothstep(0.04, 0.38, dot(sdfWN, normalize(sdfLv)))); }
		#endif
		sdfFill += sdfBounce(pointLight.color, sdfLv, pointLight.distance, sdfWN);
	}
#endif`, 'point');
  c = rep(c, 'getSpotLightInfo( spotLight, geometryPosition, directLight );', /* glsl */`getSpotLightInfo( spotLight, geometryPosition, directLight );
#ifdef SDF_ON
	if (sdfF > 0.0) {
		vec3 sdfLv = (spotLight.position - geometryPosition) * mat3(viewMatrix);
		#if UNROLLED_LOOP_INDEX < SDF_SPOTS
		if (directLight.visible) directLight.color *= mix(1.0, sdfShadow(sdfP + pn * 0.04, vWPos + sdfLv, SDF_SOFT), sdfF * smoothstep(0.04, 0.38, dot(sdfWN, normalize(sdfLv))));
		#endif
		sdfFill += 0.6 * sdfBounce(spotLight.color, sdfLv, spotLight.distance, sdfWN);
	}
#endif`, 'spot');
  c = rep(c, '#if defined( RE_IndirectDiffuse )\n\tvec3 iblIrradiance = vec3( 0.0 );', /* glsl */`#ifdef SDF_ON
reflectedLight.indirectDiffuse += sdfFill * BRDF_Lambert( material.diffuseColor );
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );`, 'ibl');
  return (_lightsBegin = c);
}
function lightsMaps() {
  if (_lightsMaps) return _lightsMaps;
  let c = THREE.ShaderChunk.lights_fragment_maps;
  c = rep(c, 'iblIrradiance += getIBLIrradiance( geometryNormal );', /* glsl */`iblIrradiance += getIBLIrradiance( geometryNormal );
		#ifdef SDF_ON
		if (sdfF > 0.0) iblIrradiance = mix(iblIrradiance, interiorIrr(vWPos, sdfWN), sdfF);
		#endif`, 'maps');
  return (_lightsMaps = c);
}

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

  const q = G.q || {};
  const sdfDefs = uni.sdf ? `#define SDF_ON
#define SDF_AO_TAPS ${q.sdfTaps ?? 5}
#define SDF_STEPS ${q.sdfSteps ?? 16}
#define SDF_LIGHTS ${q.sdfLights ?? 3}
#define SDF_SPOTS ${q.sdfSpots ?? 2}
#define SDF_SOFT 8.0
` : '';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vLocal; varying vec3 vWNormal; varying vec2 vUvP;
uniform float uScale, uWetAmt, uWet;
${sdfDefs}
${COMMON}
${SKY}
${FAR_GLSL}
${uni.sdf ? SDF_GLSL : ''}
${FRAG_LIB}
${extra}
${procSrc}
`)
    .replace('#include <lights_fragment_begin>', uni.sdf ? lightsBegin() : lightsBase())
    .replace('#include <lights_fragment_maps>', uni.sdf ? lightsMaps() : '#include <lights_fragment_maps>')
    .replace('#include <color_fragment>', /* glsl */`
#include <color_fragment>
S ps; ps.alb = diffuseColor.rgb; ps.rough = roughness; ps.metal = metalness; ps.h = 0.0; ps.emis = vec3(0.0); ps.ao = 1.0; ps.a = 1.0;
vec3 pn = normalize(vWNormal);
surf(vLocal * uScale, pn, vWPos, ps);
float wetK = uWet * uWetAmt * mix(0.35, 1.0, clamp(pn.y, 0.0, 1.0));
ps.alb *= mix(1.0, 0.62, wetK);
ps.rough = mix(ps.rough, 0.07, wetK * 0.85);
diffuseColor.rgb = ps.alb;
diffuseColor.a *= ps.a;
float sdfF = 0.0, sdfAOv = 1.0; vec3 sdfP = vWPos;
#ifdef SDF_ON
sdfF = sdfFade(vWPos);
if (sdfF > 0.0) { sdfP = vWPos + pn * 0.03; sdfAOv = mix(1.0, sdfAO(sdfP, pn), sdfF); }
#endif
float farSunV = sdfF > 0.02 ? 1.0 : farSun(vWPos + pn * 0.15);      // inside a lit interior the sun's shadow map is exact; outside, the distant city shades the sun
`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(ps.rough, 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = ps.metal;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpN(-vViewPosition, normal, vec2(dFdx(ps.h), dFdy(ps.h)), faceDirection);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += ps.emis;')
    .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= ps.ao * sdfAOv; reflectedLight.indirectSpecular *= mix(1.0, ps.ao * sdfAOv, 0.6);\nreflectedLight.directDiffuse *= mix(1.0, sdfAOv, 0.55); reflectedLight.directSpecular *= mix(1.0, sdfAOv, 0.55);\n#ifdef SDF_ON\nif (uSdfDbg > 0.5) { if (uSdfDbg < 1.5) { reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); } else if (uSdfDbg < 2.5) { reflectedLight.indirectDiffuse = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); } else if (uSdfDbg < 3.5) { reflectedLight.directDiffuse = vec3(sdfAOv * 0.5); reflectedLight.indirectDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); } else { reflectedLight.directDiffuse = vec3(sdfDbgSh * 0.5); reflectedLight.indirectDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); } }\n#endif')
    .replace('#include <fog_fragment>', 'gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(48.0)); if (any(isnan(gl_FragColor.rgb))) gl_FragColor.rgb = vec3(0.0);\ngl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWPos);');
}

// pm('woodfloor', { color, col2, rough, metal, scale, p:[x,y,z,w], physical, sheen, clearcoat, wet, interior, ... })
export function pm(kind = 'plain', o = {}) {
  const key = kind + '|' + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const Cls = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = { color: o.color ?? 0xffffff, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, envMapIntensity: o.env ?? 1 };
  if (o.emissive != null) { params.emissive = o.emissive; params.emissiveIntensity = o.emissiveI ?? 1; }
  if (o.side != null) params.side = o.side;
  if (o.transparent) { params.transparent = true; params.opacity = o.opacity ?? 1; if (o.depthWrite === false) params.depthWrite = false; }
  if (o.alphaTest) params.alphaTest = o.alphaTest;
  if (o.glass) {   // clear glass: the surface adds its (Fresnel) reflections on top of what is behind it instead of being scaled by alpha
    Object.assign(params, { transparent: true, opacity: o.opacity ?? 0.08, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  }
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
    sdf: !!(o.interior || o.sdf),
  };
  m.userData = { kind, o, uni };
  m.customProgramCacheKey = () => `pm:${kind}:${o.physical ? 1 : 0}:${uni.sdf ? 1 : 0}`;
  m.onBeforeCompile = (shader) => patchMaterial(shader, PROC[kind] || PROC.plain, uni, '', VERT[kind] || null);
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
  for (const m of interiorMats) {
    // a PMREM's layout size is compiled into the shader: a different-sized env needs a recompile or it samples garbage
    if (m.envMap && tex && m.envMap.image && tex.image && m.envMap.image.height !== tex.image.height) m.needsUpdate = true;
    m.envMap = tex;
  }
}

// Unlit-but-fogged basic material for screens, sprites of light, decals.
export function screenMat(map, intensity = 1.6) {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(intensity, intensity, intensity), toneMapped: false });
  return m;
}
