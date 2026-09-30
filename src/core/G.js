// Global game context. Everything hangs off this single object so modules
// don't need circular imports.
import * as THREE from 'three';

export const G = {
  THREE,
  renderer: null,
  scene: null,
  camera: null,
  q: null,              // active quality preset
  gpu: null,            // detected GPU info
  systems: [],          // objects with update(dt, t)
  colliders: [],        // static AABBs { minX,maxX,minZ,maxZ,minY,maxY }
  interactables: [],
  emitters: [],         // dynamic light emitters (see lights.js)
  glowSprites: null,
  flags: {},            // misc runtime flags
  time: { hour: 7.0, day: 1, speed: 2.0 }, // 1 real second = 2 game minutes at speed 2 (see clock)
  weather: { rain: 0, target: 0, wet: 0, storm: 0, flash: 0, cloud: 0.32, mist: 0 },
  // shared uniforms (each is a { value } so they can be shared by reference between materials)
  u: {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uWet: { value: 0 },
    uRain: { value: 0 },
    uLit: { value: 0.1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() },
    uGlowCol: { value: new THREE.Color() },
    uCityGlow: { value: new THREE.Color() },
    uCloudCov: { value: 0.3 },
    uCloudDark: { value: 0 },
    uDisk: { value: 1 },
    uFogDen: { value: 0.0011 },
    uFogH: { value: 0.006 },
    uFlash: { value: 0 },
    uNoise3: { value: null },
    uRes: { value: new THREE.Vector2(1280, 720) },
    tRefract: { value: null },
    // baked interior light volume (see gfx/sdf.js): signed distance field + sky-visibility SH
    tSdf: { value: null },
    tVis: { value: null },
    uSdfMin: { value: new THREE.Vector3() },
    uSdfInv: { value: new THREE.Vector3(1, 1, 1) },
    uSdfCfg: { value: new THREE.Vector4(0, 1, 1, 0) },     // x enabled, y AO strength, z bounce strength, w ambient floor
    uSdfCfg2: { value: new THREE.Vector4(0.16, 1, 0, 0) },   // x sun-bounce scale, y sky scale
    uSdfDbg: { value: 0 },                                  // debug view: 1 indirect only, 2 direct only, 3 AO only
  },
  occ: [],              // world-space light occluders { cx,cy,cz,hx,hy,hz,ry,t,r } collected while modelling
};
G.THREE = THREE;
if (typeof window !== 'undefined') window.__G = G;
