// GPU-animated billboard particle emitters (steam, fountain spray, smoke). All motion is computed
// in the vertex shader from a time uniform, so hundreds of emitters cost nothing on the CPU.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { FOG_T } from './glsl.js';

const VERT = /* glsl */`
${FOG_T}
attribute vec4 aSeed;
uniform float uTime, uLife, uSize0, uSize1, uGravity, uSpread, uRes2;
uniform vec3 uOrigin, uVel; uniform float uAlpha;
varying vec2 vUv; varying float vA; varying float vFog;
void main(){
  float life = uLife * (0.7 + 0.6*aSeed.w);
  float t = mod(uTime + aSeed.x * life, life);
  float k = t / life;
  vec3 v = uVel + (aSeed.xyz - 0.5) * 2.0 * uSpread;
  vec3 wp = uOrigin + v * t + vec3(0.0, 0.5 * uGravity * t * t, 0.0);
  wp.xz += vec2(sin(t*1.7 + aSeed.y*6.28), cos(t*1.3 + aSeed.z*6.28)) * 0.08 * k * uSize1;
  float size = mix(uSize0, uSize1, k) * (0.8 + 0.4*aSeed.y);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  mv.xy += position.xy * size;
  vUv = position.xy * 2.0;
  vA = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.45, 1.0, k)) * uAlpha;
  vFog = fogTrans(wp);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uTint;
varying vec2 vUv; varying float vA; varying float vFog;
void main(){
  float d = dot(vUv, vUv);
  if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.1, d) * vA;
  gl_FragColor = vec4(uColor * uTint * vFog, a);
}`;

export class GpuParticles {
  constructor(scene, o) {
    const n = o.count ?? 60;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const seed = new Float32Array(n * 4); for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n;
    this.uniforms = {
      uTime: G.u.uTime, uFogDen: G.u.uFogDen, uFogH: G.u.uFogH,
      uLife: { value: o.life ?? 3 }, uSize0: { value: o.size0 ?? 0.3 }, uSize1: { value: o.size1 ?? 1.2 }, uGravity: { value: o.gravity ?? 0 }, uSpread: { value: o.spread ?? 0.3 },
      uOrigin: { value: new THREE.Vector3(...(o.origin ?? [0, 0, 0])) }, uVel: { value: new THREE.Vector3(...(o.vel ?? [0, 1, 0])) }, uAlpha: { value: o.alpha ?? 0.5 },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) }, uTint: { value: new THREE.Color(1, 1, 1) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
    scene.add(this.mesh);
  }
  // tint the sprite by ambient light (call from a system)
  tint(c) { this.uniforms.uTint.value.copy(c); }
}
