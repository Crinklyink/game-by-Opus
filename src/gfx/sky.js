// Atmosphere: sun/moon motion, sky palette, weather-driven grading, key light with
// shadow following the player, and a PMREM environment captured from the sky shader.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { clamp, lerp, smooth } from '../core/util.js';
import { COMMON, SKY } from './glsl.js';

// e = sun elevation (sin). columns: zenith, horizon, sun colour, sun intensity, mie glow colour
const K = [
  [-0.40, [0.002, 0.004, 0.012], [0.010, 0.016, 0.034], [1, 0.5, 0.2], 0.0, [0, 0, 0]],
  [-0.16, [0.005, 0.010, 0.030], [0.022, 0.030, 0.070], [1, 0.5, 0.2], 0.0, [0.05, 0.02, 0.04]],
  [-0.07, [0.020, 0.038, 0.105], [0.190, 0.110, 0.160], [1, 0.45, 0.15], 0.0, [0.5, 0.2, 0.2]],
  [0.00, [0.060, 0.100, 0.260], [0.900, 0.360, 0.140], [1, 0.42, 0.13], 1.0, [1.0, 0.4, 0.15]],
  [0.07, [0.100, 0.190, 0.420], [1.000, 0.550, 0.260], [1, 0.6, 0.28], 1.9, [1.0, 0.55, 0.25]],
  [0.18, [0.140, 0.300, 0.620], [0.860, 0.700, 0.600], [1, 0.78, 0.55], 2.7, [1.0, 0.7, 0.45]],
  [0.40, [0.160, 0.360, 0.760], [0.620, 0.760, 0.920], [1, 0.92, 0.82], 3.5, [1.0, 0.85, 0.7]],
  [0.85, [0.130, 0.320, 0.750], [0.580, 0.740, 0.940], [1, 0.97, 0.92], 4.0, [1.0, 0.9, 0.8]],
];

function sampleKeys(e) {
  let i = 0;
  while (i < K.length - 2 && e > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1];
  const t = clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
  const mix3 = (x, y) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return { zen: mix3(a[1], b[1]), hor: mix3(a[2], b[2]), sun: mix3(a[3], b[3]), sunI: lerp(a[4], b[4], t), glow: mix3(a[5], b[5]) };
}

export function windowLitFraction(h) {
  // fraction of rooms with lights on across the day
  const pts = [[0, 0.32], [1.5, 0.16], [4, 0.1], [5.5, 0.2], [7, 0.12], [9, 0.05], [15, 0.05], [17, 0.14], [18.5, 0.42], [20, 0.62], [22, 0.6], [23.5, 0.42], [24, 0.32]];
  for (let i = 0; i < pts.length - 1; i++) if (h >= pts[i][0] && h <= pts[i + 1][0]) {
    const t = (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return lerp(pts[i][1], pts[i + 1][1], t);
  }
  return 0.1;
}

export class Atmosphere {
  constructor(renderer, scene, q) {
    this.renderer = renderer; this.scene = scene; this.q = q;
    const u = G.u;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uNoise3: u.uNoise3, uSunDir: u.uSunDir, uMoonDir: u.uMoonDir, uZenith: u.uZenith, uHorizon: u.uHorizon, uSunCol: u.uSunCol,
        uGlowCol: u.uGlowCol, uCityGlow: u.uCityGlow, uNight: u.uNight, uCloudCov: u.uCloudCov, uCloudDark: u.uCloudDark, uDisk: u.uDisk,
        uTime: u.uTime, uFogDen: u.uFogDen, uFogH: u.uFogH, uFlash: u.uFlash,
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `varying vec3 vDir;\n${COMMON}\n${SKY}\nvoid main(){ vec3 rd = normalize(vDir); gl_FragColor = vec4(skyColor(rd), 1.0); }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    const geo = new THREE.SphereGeometry(3000, 64, 32);
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(geo, this.mat);
    this.envDome.frustumCulled = false;
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastEnv = { e: 9, oc: 9, t: -9 };

    // key light (sun or moon) with shadows
    const L = new THREE.DirectionalLight(0xffffff, 3);
    L.castShadow = true;
    L.shadow.mapSize.set(q.shadow, q.shadow);
    L.shadow.bias = -0.00022; L.shadow.normalBias = 0.05;
    L.shadow.camera.near = 1; L.shadow.camera.far = 900;
    scene.add(L, L.target);
    this.key = L;
    this.keyDir = new THREE.Vector3(0, 1, 0);
    this.shadowExtent = q.shadowExtent;
    this._cur = { ...G.weather };
    this.e = 0; this.night = 0; this.day = 1; this.oc = 0;
    this._tmpA = new THREE.Vector3(); this._tmpB = new THREE.Vector3();
    this.exposureBias = 1;
    this.envIntensity = 1;
  }

  update(dt, time, focus) {
    const u = G.u, W = G.weather;
    const hour = G.time.hour;
    // ---- celestial motion ----
    const th = (hour - 6) / 12 * Math.PI;
    u.uSunDir.value.set(Math.cos(th), Math.sin(th) * 0.88, -Math.sin(th) * 0.47).normalize();
    const s = u.uSunDir.value;
    u.uMoonDir.value.set(-s.x * 0.92 + 0.18, -s.y, -s.z * 0.92 + 0.12).normalize();
    const e = s.y;
    this.e = e;

    // ---- weather smoothing ----
    W.rain += (W.target - W.rain) * (1 - Math.exp(-dt * 0.35));
    if (Math.abs(W.rain - W.target) < 0.002) W.rain = W.target;
    W.wet += ((W.rain > 0.15 ? 1 : 0) - W.wet) * (1 - Math.exp(-dt * (W.rain > 0.15 ? 0.25 : 0.012)));
    const oc = clamp(W.rain * 1.0, 0, 1);
    this.oc = oc;
    const cloudBase = W.cloud ?? 0.32;
    u.uCloudCov.value = clamp(cloudBase + oc * 0.75, 0, 1);
    u.uCloudDark.value = clamp(oc * 0.8 + W.storm * 0.5, 0, 1);
    u.uWet.value = W.wet;
    u.uRain.value = W.rain;
    W.flash = Math.max(0, W.flash - dt * 2.6);
    u.uFlash.value = W.flash;

    // ---- palette ----
    const k = sampleKeys(e);
    const night = 1 - smooth(-0.10, 0.06, e);
    this.night = night; this.day = smooth(-0.10, 0.28, e);
    u.uNight.value = night;
    const grey = (c, amt, dark) => {
      const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      return [lerp(c[0], l * 0.95, amt) * (1 - dark), lerp(c[1], l * 1.0, amt) * (1 - dark), lerp(c[2], l * 1.08, amt) * (1 - dark)];
    };
    const zen = grey(k.zen, 0.8 * oc, 0.3 * oc), hor = grey(k.hor, 0.75 * oc, 0.12 * oc);
    u.uZenith.value.setRGB(zen[0], zen[1], zen[2]);
    u.uHorizon.value.setRGB(hor[0], hor[1], hor[2]);
    u.uSunCol.value.setRGB(k.sun[0], k.sun[1], k.sun[2]);
    u.uGlowCol.value.setRGB(k.glow[0], k.glow[1], k.glow[2]);
    const cg = 0.03 * night * (1 + oc * 1.5);
    u.uCityGlow.value.setRGB(0.82 * cg, 0.5 * cg, 0.3 * cg);
    u.uFogDen.value = 0.00082 + oc * 0.0017 + W.mist * 0.0011 + night * 0.0002;
    u.uLit.value = windowLitFraction(hour);

    // ---- key light ----
    const sunI = k.sunI * (1 - 0.82 * oc) * smooth(-0.03, 0.03, e);
    const moonY = u.uMoonDir.value.y;
    const moonI = 0.34 * smooth(-0.05, 0.25, moonY) * night * (1 - 0.6 * oc);
    const L = this.key;
    if (sunI >= moonI) {
      L.color.setRGB(k.sun[0], k.sun[1], k.sun[2]); L.intensity = sunI + W.flash * 2; this.keyDir.copy(s);
    } else {
      L.color.setRGB(0.6, 0.72, 1.0); L.intensity = moonI + W.flash * 2; this.keyDir.copy(u.uMoonDir.value);
    }
    // environment / exposure levels
    this.envIntensity = lerp(0.1, 0.82, this.day) * (1 - 0.15 * oc) + W.flash * 1.2;   // a little less sky fill in the shade keeps sunny streets from going flat
    this.scene.environmentIntensity = this.envIntensity;
    this.updateShadow(focus);

    // ---- sky follows camera ----
    this.dome.position.copy(G.camera.position);

    // ---- refresh env probe when the sky changed enough ----
    const now = time;
    const le = this.lastEnv;
    if (!this.envRT || (now - le.t > 0.45 && (Math.abs(e - le.e) > 0.018 || Math.abs(oc - le.oc) > 0.05 || W.flash > 0.5)) || now - le.t > 12) {
      this.captureEnv(); le.e = e; le.oc = oc; le.t = now;
    }
  }

  updateShadow(focus) {
    const L = this.key, dir = this.keyDir;
    const ext = this.shadowExtent;
    const cam = L.shadow.camera;
    if (cam.right !== ext) { cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.updateProjectionMatrix(); }
    const texel = (2 * ext) / L.shadow.mapSize.x;
    const right = this._tmpA.set(0, 1, 0).cross(dir).normalize();
    const up = this._tmpB.copy(dir).cross(right).normalize();
    const cx = Math.round(focus.dot(right) / texel) * texel;
    const cy = Math.round(focus.dot(up) / texel) * texel;
    const cz = focus.dot(dir);
    L.target.position.set(0, 0, 0).addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(dir, cz);
    L.position.copy(L.target.position).addScaledVector(dir, 420);
    L.target.updateMatrixWorld();
  }

  captureEnv() {
    G.u.uDisk.value = 0;
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 5000);
    G.u.uDisk.value = 1;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
