// Additive light-halo sprites for every emissive thing that is too far / too small for a
// real light: street lamps, tail lights, beacons, neon, distant windows... Sprites keep a
// minimum pixel size (energy conserving) so far lights never shimmer, and are fogged.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { FOG_T } from './glsl.js';

const VERT = /* glsl */`
${FOG_T}
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize; attribute vec2 aFx;
uniform vec2 uRes; uniform float uTime;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float dist = max(-mv.z, 0.01);
  float pix = 2.0 * dist / (projectionMatrix[1][1] * uRes.y);
  float size = max(aSize, pix * 1.7);
  float energy = min(1.0, (aSize*aSize) / (size*size));
  float blink = 1.0;
  if (aFx.x > 0.0) { float ph = fract(uTime / aFx.x + aFx.y); blink = smoothstep(0.0, 0.05, ph) * smoothstep(0.3, 0.16, ph); }
  else if (aFx.x < 0.0) { float fl = fract(sin(floor(uTime*(8.0)) * 91.7 + aFx.y*40.0) * 4375.5); blink = fl > 0.93 ? 0.35 : 1.0; }
  vCol = aCol.rgb * aCol.a * energy * blink * fogTrans(aPos);
  vUv = position.xy * 2.0;
  mv.xy += position.xy * size * 2.0;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec2 vUv; varying vec3 vCol;
void main(){
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 9.0);
  float halo = (1.0 / (1.0 + d2 * 22.0)) * smoothstep(1.0, 0.55, sqrt(d2));
  gl_FragColor = vec4(vCol * (core * 1.3 + halo * 0.3), 1.0);
}`;

export class GlowField {
  constructor(max = 2048) {
    this.max = max; this.count = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aFx = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize); g.setAttribute('aFx', this.aFx);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uRes: G.u.uRes, uTime: G.u.uTime, uFogDen: G.u.uFogDen, uFogH: G.u.uFogH },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
    this.dirty = true;
  }

  // returns an index handle. blink: period seconds (>0 flash, <0 flicker, 0 steady)
  add(x, y, z, color, intensity = 5, size = 0.3, blink = 0, phase = 0) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.set(i, x, y, z, color, intensity, size, blink, phase);
    this.geo.instanceCount = this.count;
    return i;
  }

  set(i, x, y, z, color, intensity, size, blink = 0, phase = 0) {
    if (i < 0) return;
    const c = color.isColor ? color : new THREE.Color(color);
    this.aPos.setXYZ(i, x, y, z);
    this.aCol.setXYZW(i, c.r, c.g, c.b, intensity);
    this.aSize.setX(i, size);
    this.aFx.setXY(i, blink, phase);
    this.dirty = true;
  }

  setIntensity(i, intensity) { if (i >= 0) { this.aCol.setW(i, intensity); this.dirty = true; } }
  setPos(i, x, y, z) { if (i >= 0) { this.aPos.setXYZ(i, x, y, z); this.dirty = true; } }

  flush() {
    if (!this.dirty) return;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aFx.needsUpdate = true;
    this.dirty = false;
  }
}
