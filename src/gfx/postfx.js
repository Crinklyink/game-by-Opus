// HDR post-processing pipeline (all custom, WebGL2):
//   scene (MSAA, half-float, depth texture) -> [rain-glass pass] -> GTAO-lite (half res, bilateral blur)
//   -> physically-based dual-filter bloom -> GPU auto-exposure -> depth-of-field (gather bokeh)
//   -> filmic tone-map + grade + vignette + grain + chromatic aberration (+ FXAA on Low)
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { G } from '../core/G.js';

export const LAYER_GLASS = 3;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const fsMat = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
  uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false, fog: false, ...extra,
});

const COPY_FRAG = 'uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = texture(tex, vUv); }';

const AO_FRAG = /* glsl */`
uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uProj; uniform vec2 uTexel;
uniform float uRadius, uStrength; uniform int uTaps;
varying vec2 vUv;
vec3 viewPos(vec2 uv){
  float d = texture(tDepth, uv).x;
  vec4 v = uProjInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);
  return v.xyz / v.w;
}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = texture(tDepth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 Pl = viewPos(vUv - vec2(uTexel.x, 0.0)), Pr = viewPos(vUv + vec2(uTexel.x, 0.0));
  vec3 Pd = viewPos(vUv - vec2(0.0, uTexel.y)), Pu = viewPos(vUv + vec2(0.0, uTexel.y));
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  vec2 rUV = uRadius * vec2(uProj[0][0], uProj[1][1]) * 0.5 / max(-P.z, 0.1);
  rUV = min(rUV, vec2(0.12));
  float occ = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uTaps) break;
    float fi = (float(i) + 0.5) / float(uTaps);
    float ang = fi * 6.2831853 * 2.5 + rot;
    vec2 off = vec2(cos(ang), sin(ang)) * sqrt(fi) * rUV;
    vec3 S = viewPos(vUv + off);
    vec3 V = S - P;
    float dist = length(V);
    float o = max(0.0, dot(N, V) / max(dist, 1e-4) - 0.12);
    o *= 1.0 - smoothstep(uRadius * 0.7, uRadius * 1.6, dist);
    occ += o;
  }
  float ao = 1.0 - uStrength * occ / float(uTaps) * 2.2;
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const AOBLUR_FRAG = /* glsl */`
uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; uniform mat4 uProjInv;
varying vec2 vUv;
float lin(vec2 uv){
  float d = texture(tDepth, uv).x;
  vec4 v = uProjInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);
  return -v.z / v.w;
}
void main(){
  float z0 = lin(vUv);
  float sum = 0.0, wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = lin(uv);
    float w = exp(-abs(z - z0) / max(0.15, z0 * 0.03)) * (1.0 - abs(float(i)) * 0.11);
    sum += texture(tAO, uv).r * w; wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

const DOWN_FRAG = /* glsl */`
uniform sampler2D tex; uniform vec2 uTexel; uniform float uKaris;
varying vec2 vUv;
vec3 T(vec2 o){ return texture(tex, vUv + o * uTexel).rgb; }
float kw(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main(){
  vec3 a = T(vec2(-2,-2)), b = T(vec2(0,-2)), c = T(vec2(2,-2));
  vec3 d = T(vec2(-1,-1)), e = T(vec2(1,-1));
  vec3 f = T(vec2(-2,0)), g = T(vec2(0,0)), h = T(vec2(2,0));
  vec3 i = T(vec2(-1,1)), j = T(vec2(1,1));
  vec3 k = T(vec2(-2,2)), l = T(vec2(0,2)), m = T(vec2(2,2));
  vec3 res;
  if (uKaris > 0.5) {
    vec3 g0 = (d+e+i+j)*0.25, g1 = (a+b+f+g)*0.25, g2 = (b+c+g+h)*0.25, g3 = (f+g+k+l)*0.25, g4 = (g+h+l+m)*0.25;
    float w0 = kw(g0)*0.5, w1 = kw(g1)*0.125, w2 = kw(g2)*0.125, w3 = kw(g3)*0.125, w4 = kw(g4)*0.125;
    res = (g0*w0 + g1*w1 + g2*w2 + g3*w3 + g4*w4) / (w0+w1+w2+w3+w4);
  } else {
    res = (d+e+i+j)*0.125 + (a+b+f+g)*0.03125 + (b+c+g+h)*0.03125 + (f+g+k+l)*0.03125 + (g+h+l+m)*0.03125;
  }
  gl_FragColor = vec4(res, 1.0);
}`;

const UP_FRAG = /* glsl */`
uniform sampler2D tex; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
void main(){
  vec3 s = texture(tex, vUv + uTexel*vec2(-1,-1)).rgb + texture(tex, vUv + uTexel*vec2(1,-1)).rgb
         + texture(tex, vUv + uTexel*vec2(-1, 1)).rgb + texture(tex, vUv + uTexel*vec2(1, 1)).rgb;
  s += 2.0*(texture(tex, vUv + uTexel*vec2(0,-1)).rgb + texture(tex, vUv + uTexel*vec2(0,1)).rgb
          + texture(tex, vUv + uTexel*vec2(-1,0)).rgb + texture(tex, vUv + uTexel*vec2(1,0)).rgb);
  s += 4.0*texture(tex, vUv).rgb;
  gl_FragColor = vec4(s * (1.0/16.0) * uWeight, 1.0);
}`;

const EXPO_FRAG = /* glsl */`
uniform sampler2D tMip; uniform sampler2D tPrev;
uniform float uDt, uMin, uMax, uKey, uUp, uDown;
varying vec2 vUv;
void main(){
  float sum = 0.0, wsum = 0.0;
  for (int y = 0; y < 7; y++) for (int x = 0; x < 7; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / 7.0;
    vec2 c = (uv - 0.5) * 2.0;
    float w = exp(-dot(c, c) * 1.6);
    vec3 col = texture(tMip, uv).rgb;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    sum += w * log(max(l, 1e-3)); wsum += w;
  }
  float avg = exp(sum / wsum);
  float target = clamp(uKey / avg, uMin, uMax);
  float prev = texture(tPrev, vec2(0.5)).r;
  float rate = target > prev ? uUp : uDown;
  gl_FragColor = vec4(prev + (target - prev) * (1.0 - exp(-uDt * rate)), 0.0, 0.0, 1.0);
}`;

const DOF_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform mat4 uProjInv; uniform vec2 uTexel;
uniform float uFocus, uAperture, uMaxCoc; uniform int uTaps;
varying vec2 vUv;
float linDepth(vec2 uv){
  float d = texture(tDepth, uv).x;
  vec4 v = uProjInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);
  return -v.z / v.w;
}
float coc(float z){ return clamp(abs(1.0/max(uFocus,0.1) - 1.0/max(z,0.1)) * uAperture, 0.0, uMaxCoc); }
void main(){
  float z0 = linDepth(vUv);
  float c0 = coc(z0);
  vec3 base = texture(tColor, vUv).rgb;
  if (uMaxCoc < 0.01) { gl_FragColor = vec4(base, 1.0); return; }
  vec3 acc = base; float wacc = 1.0;
  float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  for (int i = 0; i < 40; i++) {
    if (i >= uTaps) break;
    float fi = (float(i) + 0.5) / float(uTaps);
    float ang = float(i) * 2.39996323 + rot;
    vec2 o = vec2(cos(ang), sin(ang)) * sqrt(fi);
    vec2 uv = vUv + o * uMaxCoc * uTexel * 26.0;
    float z = linDepth(uv);
    float cz = coc(z);
    float reach = length(o) * uMaxCoc;
    float w = smoothstep(reach - 0.0006, reach + 0.0006, cz) ;
    if (z < z0 - 0.5) w = max(w, step(length(o)*uMaxCoc, cz)); // near-field bleeds over sharp background
    vec3 s = texture(tColor, uv).rgb;
    float lum = min(dot(s, vec3(0.2126,0.7152,0.0722)), 12.0);
    float bw = 1.0 + lum*lum*0.06;
    acc += s * w * bw; wacc += w * bw;
  }
  vec3 blurred = acc / wacc;
  gl_FragColor = vec4(mix(base, blurred, smoothstep(0.0, 0.0012, c0) ), 1.0);
}`;

const FINAL_FRAG = /* glsl */`
uniform sampler2D tColor, tBloom, tAO, tExposure;
uniform vec2 uTexel;
uniform float uBloomI, uAOAmt, uTime, uFade, uSat, uVig, uGrain, uCA, uContrast, uSharp, uExposureBias, uWarm, uFlash;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 ca = cc * r2 * uCA;
  vec3 col;
  col.r = texture(tColor, uv + ca).r;
  col.g = texture(tColor, uv).g;
  col.b = texture(tColor, uv - ca).b;
  if (uSharp > 0.0) {
    vec3 n = texture(tColor, uv + vec2(uTexel.x,0.0)).rgb + texture(tColor, uv - vec2(uTexel.x,0.0)).rgb
           + texture(tColor, uv + vec2(0.0,uTexel.y)).rgb + texture(tColor, uv - vec2(0.0,uTexel.y)).rgb;
    col += (col - n*0.25) * uSharp * 0.5;
    col = max(col, 0.0);
  }
  float ao = texture(tAO, uv).r;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(1.0, ao, uAOAmt / (1.0 + lum*0.5));
  col += texture(tBloom, uv).rgb * uBloomI;
  float ex = texture(tExposure, vec2(0.5)).r * uExposureBias;
  col *= ex;
  col += vec3(0.6,0.7,1.0) * uFlash * 0.05;
  col *= mix(vec3(1.0), vec3(1.04,1.0,0.94), uWarm);
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = mix(col, col*col*(3.0 - 2.0*col), uContrast);
  col *= 1.0 - uVig * smoothstep(0.32, 0.98, length(cc * vec2(1.25, 1.0)) * 1.55);
  col *= 1.0 - uFade;
  col = toSRGB(col);
  col += (h21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * (uGrain + 1.0/255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(renderer, q) {
    this.r = renderer;
    this.quad = new FullScreenQuad(null);
    this.fx = { fade: 0, sat: 1.0, vig: 0.28, grain: 0.022, ca: 0.0035, contrast: 0.22, warm: 0, bloom: 0.07, exposureBias: 1, aoAmt: 0.85, focus: 8, aperture: 1.0 };
    this.size = new THREE.Vector2(1280, 720);
    this.focus = 8;
    this.first = true;
    this.q = q;
    this.materials();
    this.setQuality(q, 1280, 720);
  }

  materials() {
    const u = (o) => o;
    this.mCopy = fsMat(COPY_FRAG, u({ tex: { value: null } }));
    this.mAO = fsMat(AO_FRAG, u({ tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.9 }, uStrength: { value: 1.0 }, uTaps: { value: 12 } }));
    this.mAOBlur = fsMat(AOBLUR_FRAG, u({ tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Matrix4() } }));
    this.mDown = fsMat(DOWN_FRAG, u({ tex: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } }));
    this.mUp = fsMat(UP_FRAG, u({ tex: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }), {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mExpo = fsMat(EXPO_FRAG, u({ tMip: { value: null }, tPrev: { value: null }, uDt: { value: 0.016 }, uMin: { value: 0.35 }, uMax: { value: 3 }, uKey: { value: 0.2 }, uUp: { value: 1.6 }, uDown: { value: 3.0 } }));
    this.mDof = fsMat(DOF_FRAG, u({ tColor: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 8 }, uAperture: { value: 1 }, uMaxCoc: { value: 0.004 }, uTaps: { value: 24 } }));
    this.mFinal = fsMat(FINAL_FRAG, u({
      tColor: { value: null }, tBloom: { value: null }, tAO: { value: null }, tExposure: { value: null }, uTexel: { value: new THREE.Vector2() },
      uBloomI: { value: 0.07 }, uAOAmt: { value: 0.8 }, uTime: { value: 0 }, uFade: { value: 0 }, uSat: { value: 1 }, uVig: { value: 0.3 }, uGrain: { value: 0.02 },
      uCA: { value: 0.003 }, uContrast: { value: 0.2 }, uSharp: { value: 0 }, uExposureBias: { value: 1 }, uWarm: { value: 0 }, uFlash: { value: 0 },
    }));
    this.mFxaa = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: VERT, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false });
    this.mBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
  }

  dispose() {
    for (const k of ['rtScene', 'rtRefract', 'rtAO', 'rtAO2', 'rtA', 'rtLDR', 'rtE0', 'rtE1']) if (this[k]) { this[k].dispose(); this[k] = null; }
    if (this.mips) this.mips.forEach((m) => m.dispose());
    this.mips = null;
  }

  setQuality(q, w = this.size.x, h = this.size.y) {
    this.q = q;
    this.resize(w, h, this.scale ?? q.res);
  }

  // w,h = drawing-buffer size of the canvas, scale = internal resolution scale
  resize(w, h, scale) {
    this.dispose();
    this.canvasW = w; this.canvasH = h; this.scale = scale;
    const q = this.q;
    const iw = Math.max(64, Math.round(w * scale)), ih = Math.max(64, Math.round(h * scale));
    this.size.set(iw, ih);
    const HF = THREE.HalfFloatType;
    const base = { type: HF, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    const depthTex = new THREE.DepthTexture(iw, ih);
    this.rtScene = new THREE.WebGLRenderTarget(iw, ih, { ...base, depthBuffer: true, depthTexture: depthTex, samples: q.msaa });
    this.depthTex = depthTex;
    if (q.glass) {
      this.rtRefract = new THREE.WebGLRenderTarget(Math.max(64, iw >> 1), Math.max(64, ih >> 1), { ...base, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    }
    if (q.ao) {
      const aw = Math.max(32, iw >> 1), ah = Math.max(32, ih >> 1);
      const b8 = { ...base, type: THREE.UnsignedByteType };
      this.rtAO = new THREE.WebGLRenderTarget(aw, ah, b8);
      this.rtAO2 = new THREE.WebGLRenderTarget(aw, ah, b8);
    }
    this.mips = [];
    let mw = iw >> 1, mh = ih >> 1;
    for (let i = 0; i < q.bloomLevels; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(Math.max(2, mw), Math.max(2, mh), base));
      mw >>= 1; mh >>= 1;
    }
    if (q.dof) this.rtA = new THREE.WebGLRenderTarget(iw, ih, base);
    if (q.fxaa) this.rtLDR = new THREE.WebGLRenderTarget(w, h, { ...base, type: THREE.UnsignedByteType });
    const ex = { ...base, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.rtE0 = new THREE.WebGLRenderTarget(1, 1, ex);
    this.rtE1 = new THREE.WebGLRenderTarget(1, 1, ex);
    this.first = true;
    G.u.uRes.value.set(iw, ih);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.quad.render(this.r);
  }

  render(scene, camera, dt, time, opts = {}) {
    const r = this.r, q = this.q, fx = this.fx;
    const iw = this.size.x, ih = this.size.y;
    const prevAuto = r.autoClear;

    // 1. main scene
    r.setRenderTarget(this.rtScene);
    r.autoClear = true;
    camera.layers.set(0);
    r.render(scene, camera);

    // 2. refractive glass pass (samples a mip-mapped copy of everything rendered so far)
    if (q.glass && this.rtRefract && opts.glass) {
      this.mCopy.uniforms.tex.value = this.rtScene.texture;
      this.pass(this.mCopy, this.rtRefract);
      G.u.tRefract = G.u.tRefract || { value: null };
      G.u.tRefract.value = this.rtRefract.texture;
      r.setRenderTarget(this.rtScene);
      r.autoClear = false;
      camera.layers.set(LAYER_GLASS);
      r.render(scene, camera);
      camera.layers.set(0);
      r.autoClear = true;
    }
    r.autoClear = prevAuto;
    camera.updateMatrixWorld();

    // 3. ambient occlusion
    let aoTex = this.whiteTex || (this.whiteTex = makeWhite());
    if (q.ao && this.rtAO) {
      const m = this.mAO.uniforms;
      m.tDepth.value = this.depthTex; m.uProjInv.value.copy(camera.projectionMatrixInverse); m.uProj.value.copy(camera.projectionMatrix);
      m.uTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height); m.uTaps.value = q.aoTaps; m.uRadius.value = opts.aoRadius ?? 0.85; m.uStrength.value = 1.0;
      this.pass(this.mAO, this.rtAO);
      const b = this.mAOBlur.uniforms;
      b.tDepth.value = this.depthTex; b.uProjInv.value.copy(camera.projectionMatrixInverse);
      b.tAO.value = this.rtAO.texture; b.uDir.value.set(1 / this.rtAO.width, 0);
      this.pass(this.mAOBlur, this.rtAO2);
      b.tAO.value = this.rtAO2.texture; b.uDir.value.set(0, 1 / this.rtAO.height);
      this.pass(this.mAOBlur, this.rtAO);
      aoTex = this.rtAO.texture;
    }

    // 4. bloom: downsample chain
    const mips = this.mips;
    let src = this.rtScene.texture, sw = iw, sh = ih;
    for (let i = 0; i < mips.length; i++) {
      const d = this.mDown.uniforms;
      d.tex.value = src; d.uTexel.value.set(1 / sw, 1 / sh); d.uKaris.value = i === 0 ? 1 : 0;
      this.pass(this.mDown, mips[i]);
      src = mips[i].texture; sw = mips[i].width; sh = mips[i].height;
    }
    // 5. auto exposure from a small mip (before bloom upsampling contaminates it)
    const eIdx = Math.min(3, mips.length - 1);
    const ex = this.mExpo.uniforms;
    ex.tMip.value = mips[eIdx].texture;
    ex.tPrev.value = this.rtE0.texture;
    ex.uDt.value = this.first ? 100 : dt;
    ex.uMin.value = opts.expMin ?? 0.45; ex.uMax.value = opts.expMax ?? 2.4; ex.uKey.value = opts.expKey ?? 0.2;
    this.pass(this.mExpo, this.rtE1);
    const t = this.rtE0; this.rtE0 = this.rtE1; this.rtE1 = t;
    this.first = false;
    // upsample chain (additive)
    for (let i = mips.length - 1; i > 0; i--) {
      const u = this.mUp.uniforms;
      u.tex.value = mips[i].texture; u.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); u.uWeight.value = 1.0;
      this.pass(this.mUp, mips[i - 1]);
    }

    // 6. depth of field
    let color = this.rtScene.texture;
    if (q.dof && this.rtA && opts.dof !== false) {
      const d = this.mDof.uniforms;
      d.tColor.value = color; d.tDepth.value = this.depthTex; d.uProjInv.value.copy(camera.projectionMatrixInverse);
      d.uTexel.value.set(1 / iw, 1 / ih); d.uFocus.value = this.focus; d.uAperture.value = fx.aperture * (opts.dofScale ?? 1);
      d.uMaxCoc.value = 0.0032 * (opts.dofScale ?? 1); d.uTaps.value = q.id === 'ultra' ? 32 : 20;
      this.pass(this.mDof, this.rtA);
      color = this.rtA.texture;
    }

    // 7. final composite
    const f = this.mFinal.uniforms;
    f.tColor.value = color; f.tBloom.value = mips[0].texture; f.tAO.value = aoTex; f.tExposure.value = this.rtE0.texture;
    f.uTexel.value.set(1 / iw, 1 / ih);
    f.uBloomI.value = fx.bloom; f.uAOAmt.value = q.ao ? fx.aoAmt : 0; f.uTime.value = time;
    f.uFade.value = fx.fade; f.uSat.value = fx.sat; f.uVig.value = fx.vig; f.uGrain.value = fx.grain; f.uCA.value = fx.ca;
    f.uContrast.value = fx.contrast; f.uSharp.value = this.scale < 0.98 ? 0.6 : 0.0; f.uExposureBias.value = fx.exposureBias; f.uWarm.value = fx.warm;
    f.uFlash.value = G.weather.flash;
    if (q.fxaa && this.rtLDR) {
      this.pass(this.mFinal, this.rtLDR);
      const a = this.mFxaa.uniforms;
      a.tDiffuse.value = this.rtLDR.texture; a.resolution.value.set(1 / this.canvasW, 1 / this.canvasH);
      this.pass(this.mFxaa, null);
    } else {
      this.pass(this.mFinal, null);
    }
  }
}

function makeWhite() {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
