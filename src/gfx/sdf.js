// Interior light volume, baked at load from the shapes the apartment was modelled with.
//   tSdf : signed distance to the nearest solid (metres, 16-bit float, ~15 cm voxels)
//   tVis : L1 spherical-harmonic visibility of the open sky at every 40 cm (RGBA16F)
// Shaders use it for
//   * contact ambient occlusion (dark corners, under sofas/tables, behind furniture),
//   * soft shadows from the brightest lamps (sphere-traced through the field),
//   * position-dependent sky ambient (bright next to the windows, dim deeper in the room).
// Nothing here touches the GPU except the two textures, so baking costs a fraction of a second.
import * as THREE from 'three';
import { G } from '../core/G.js';

const H = THREE.DataUtils.toHalfFloat;
export const SDF = { ready: false, min: new THREE.Vector3(), max: new THREE.Vector3(), voxel: 0.15, count: 0 };

// 1x1x1 stand-ins so every material can compile before the bake exists
export function initSdfUniforms() {
  const one = new THREE.Data3DTexture(new Uint16Array([H(2)]), 1, 1, 1);
  one.format = THREE.RedFormat; one.type = THREE.HalfFloatType; one.minFilter = one.magFilter = THREE.LinearFilter; one.needsUpdate = true;
  const vis = new THREE.Data3DTexture(new Uint16Array([H(3.5), 0, 0, 0]), 1, 1, 1);
  vis.format = THREE.RGBAFormat; vis.type = THREE.HalfFloatType; vis.minFilter = vis.magFilter = THREE.LinearFilter; vis.needsUpdate = true;
  G.u.tSdf.value = one; G.u.tVis.value = vis;
}

// occ: [{cx,cy,cz,hx,hy,hz,ry,t,r}] world space; opts: { min, max (Vector3), voxel, emitters }
export function bakeSdf(occAll, opts) {
  const t0 = performance.now();
  const vox = opts.voxel ?? 0.15, MARGIN = 1.4, FAR = 1.5, SHRINK = 0.02;
  const mn = opts.min, mx = opts.max;
  const nx = Math.ceil((mx.x - mn.x) / vox), ny = Math.ceil((mx.y - mn.y) / vox), nz = Math.ceil((mx.z - mn.z) / vox);
  const sdf = new Float32Array(nx * ny * nz).fill(FAR);
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // ---- gather usable occluders: inside the volume, not tiny, not the shell of a light source ----
  const em = (opts.emitters || []).filter((e) => e.pos.x > mn.x && e.pos.x < mx.x && e.pos.z > mn.z && e.pos.z < mx.z && e.pos.y > mn.y && e.pos.y < mx.y);
  const occ = [];
  for (const o of occAll) {
    if (o.cx + o.hx < mn.x - MARGIN || o.cx - o.hx > mx.x + MARGIN || o.cz + o.hz < mn.z - MARGIN || o.cz - o.hz > mx.z + MARGIN || o.cy + o.hy < mn.y - MARGIN || o.cy - o.hy > mx.y + MARGIN) continue;
    const big = Math.max(o.hx, o.hy, o.hz), vol = 8 * o.hx * o.hy * o.hz;
    if (big < 0.04 || vol < 4e-4) continue;
    const dims = [o.hx, o.hy, o.hz].sort((a, b) => a - b);
    if (dims[0] < 0.012 && dims[1] < 0.05) continue;         // wires, blades, small plates
    if (dims[1] < 0.03 && dims[2] < 0.35) continue;          // thin rods and table legs are not solid enough to shadow
    // a lamp shade / pendant globe / fixture body contains its own light
    const c = Math.cos(o.ry), s = Math.sin(o.ry);
    let holdsLight = false;
    for (const e of em) {
      const dx = e.pos.x - o.cx, dz = e.pos.z - o.cz, dy = e.pos.y - o.cy;
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      if (Math.abs(lx) < o.hx + 0.12 && Math.abs(lz) < o.hz + 0.12 && Math.abs(dy) < o.hy + 0.12 && big < 0.8) { holdsLight = true; break; }
    }
    if (!holdsLight) occ.push(o);
  }
  // explicit shell: floor and ceiling slabs (the balcony has open sky above it)
  const Y0 = opts.floorY, CH = opts.ceilH;
  occ.push({ cx: (mn.x + mx.x) / 2, cy: Y0 - 0.55, cz: (mn.z + mx.z) / 2, hx: (mx.x - mn.x) / 2 + 1, hy: 0.5, hz: (mx.z - mn.z) / 2 + 1, ry: 0, t: 0, r: 0 });
  const zc0 = opts.ceilZ0, zc1 = mx.z + 1;
  occ.push({ cx: (mn.x + mx.x) / 2, cy: Y0 + CH + 0.5, cz: (zc0 + zc1) / 2, hx: (mx.x - mn.x) / 2 + 1, hy: 0.5, hz: (zc1 - zc0) / 2, ry: 0, t: 0, r: 0 });

  // ---- splat every occluder's distance into the voxels around it ----
  for (const o of occ) {
    const c = Math.cos(o.ry), s = Math.sin(o.ry);
    const wx = Math.abs(c) * o.hx + Math.abs(s) * o.hz, wz = Math.abs(s) * o.hx + Math.abs(c) * o.hz;
    const i0 = Math.max(0, Math.floor((o.cx - wx - MARGIN - mn.x) / vox)), i1 = Math.min(nx - 1, Math.ceil((o.cx + wx + MARGIN - mn.x) / vox));
    const j0 = Math.max(0, Math.floor((o.cy - o.hy - MARGIN - mn.y) / vox)), j1 = Math.min(ny - 1, Math.ceil((o.cy + o.hy + MARGIN - mn.y) / vox));
    const k0 = Math.max(0, Math.floor((o.cz - wz - MARGIN - mn.z) / vox)), k1 = Math.min(nz - 1, Math.ceil((o.cz + wz + MARGIN - mn.z) / vox));
    for (let k = k0; k <= k1; k++) {
      const pz = mn.z + (k + 0.5) * vox - o.cz;
      for (let j = j0; j <= j1; j++) {
        const py = mn.y + (j + 0.5) * vox - o.cy;
        for (let i = i0; i <= i1; i++) {
          const px = mn.x + (i + 0.5) * vox - o.cx;
          let d;
          if (o.t === 1) {                                   // upright cylinder
            const rr = Math.hypot(px, pz) - o.r, hh = Math.abs(py) - o.hy;
            d = Math.hypot(Math.max(rr, 0), Math.max(hh, 0)) + Math.min(Math.max(rr, hh), 0);
          } else if (o.t === 2) {                            // sphere
            d = Math.hypot(px, py, pz) - o.r;
          } else {
            const lx = c * px - s * pz, lz = s * px + c * pz;
            const qx = Math.abs(lx) - o.hx, qy = Math.abs(py) - o.hy, qz = Math.abs(lz) - o.hz;
            d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
          }
          d += SHRINK;
          const ii = idx(i, j, k);
          if (d < sdf[ii]) sdf[ii] = d;
        }
      }
    }
  }
  const sdfH = new Uint16Array(sdf.length);
  for (let i = 0; i < sdf.length; i++) sdfH[i] = H(Math.max(-FAR, Math.min(FAR, sdf[i])));
  const tex = new THREE.Data3DTexture(sdfH, nx, ny, nz);
  tex.format = THREE.RedFormat; tex.type = THREE.HalfFloatType; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;

  // ---- sky visibility (L1 SH) on a coarse grid, by sphere-tracing the field ----
  const vs = 0.4;
  const vx = Math.ceil((mx.x - mn.x) / vs), vy = Math.ceil((mx.y - mn.y) / vs), vz = Math.ceil((mx.z - mn.z) / vs);
  const nearest = (x, y, z) => {
    const i = Math.floor((x - mn.x) / vox), j = Math.floor((y - mn.y) / vox), k = Math.floor((z - mn.z) / vox);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return null;
    return sdf[idx(i, j, k)];
  };
  const NDIR = 40, dirs = [];
  for (let n = 0; n < NDIR; n++) { const yy = 1 - (2 * (n + 0.5)) / NDIR, rr = Math.sqrt(1 - yy * yy), ph = n * 2.399963; dirs.push([Math.cos(ph) * rr, yy, Math.sin(ph) * rr]); }
  const vis = new Float32Array(vx * vy * vz * 4), solid = new Uint8Array(vx * vy * vz);
  const K = (4 * Math.PI) / NDIR, Y0s = 0.282095, Y1s = 0.488603;
  for (let k = 0; k < vz; k++) for (let j = 0; j < vy; j++) for (let i = 0; i < vx; i++) {
    const px = mn.x + (i + 0.5) * vs, py = mn.y + (j + 0.5) * vs, pz = mn.z + (k + 0.5) * vs;
    const vi = (i + vx * (j + vy * k)) * 4;
    const d0 = nearest(px, py, pz);
    if (d0 !== null && d0 < 0.06) { solid[vi / 4] = 1; continue; }
    let c0 = 0, c1x = 0, c1y = 0, c1z = 0;
    for (const [dx, dy, dz] of dirs) {
      let t = 0.15, V = 0;
      for (let it = 0; it < 70; it++) {
        const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
        const d = nearest(x, y, z);
        if (d === null) { V = dy > -0.1 ? 1 : 0.22; break; }             // left the volume: sky (or ground seen through a window)
        if (d < 0.03) break;
        t += Math.max(d, 0.12);
      }
      if (V) { c0 += V * Y0s; c1x += V * Y1s * dx; c1y += V * Y1s * dy; c1z += V * Y1s * dz; }
    }
    vis[vi] = c0 * K; vis[vi + 1] = c1x * K; vis[vi + 2] = c1y * K; vis[vi + 3] = c1z * K;
  }
  // solid voxels borrow from their free neighbours so trilinear sampling never fades toward black at walls
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < vz; k++) for (let j = 0; j < vy; j++) for (let i = 0; i < vx; i++) {
      const vi = i + vx * (j + vy * k);
      if (!solid[vi]) continue;
      let a = 0, b = 0, c = 0, d = 0, n = 0;
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ii = i + di, jj = j + dj, kk = k + dk;
        if (ii < 0 || jj < 0 || kk < 0 || ii >= vx || jj >= vy || kk >= vz) continue;
        const ni = ii + vx * (jj + vy * kk);
        if (solid[ni]) continue;
        a += vis[ni * 4]; b += vis[ni * 4 + 1]; c += vis[ni * 4 + 2]; d += vis[ni * 4 + 3]; n++;
      }
      if (n) { vis[vi * 4] = a / n; vis[vi * 4 + 1] = b / n; vis[vi * 4 + 2] = c / n; vis[vi * 4 + 3] = d / n; solid[vi] = 0; }
    }
  }
  const visH = new Uint16Array(vis.length);
  for (let i = 0; i < vis.length; i++) visH[i] = H(vis[i]);
  const vtex = new THREE.Data3DTexture(visH, vx, vy, vz);
  vtex.format = THREE.RGBAFormat; vtex.type = THREE.HalfFloatType; vtex.minFilter = vtex.magFilter = THREE.LinearFilter;
  vtex.wrapS = vtex.wrapT = vtex.wrapR = THREE.ClampToEdgeWrapping; vtex.unpackAlignment = 1; vtex.needsUpdate = true;

  G.u.tSdf.value = tex; G.u.tVis.value = vtex;
  G.u.uSdfMin.value.copy(mn);
  G.u.uSdfInv.value.set(1 / (mx.x - mn.x), 1 / (mx.y - mn.y), 1 / (mx.z - mn.z));
  SDF.ready = true; SDF.min.copy(mn); SDF.max.copy(mx); SDF.voxel = vox; SDF.count = occ.length;
  SDF.ms = Math.round(performance.now() - t0);
  return SDF;
}
// GLSL shared by every interior material (see materials.js). SDF_AO_TAPS / SDF_STEPS / SDF_SOFT are macros.
export const SDF_GLSL = /* glsl */`
uniform sampler3D tSdf; uniform sampler3D tVis;
uniform vec3 uSdfMin, uSdfInv; uniform vec4 uSdfCfg; uniform float uSdfDbg;
float sdfFade(vec3 p){
  vec3 uvw = (p - uSdfMin) * uSdfInv;
  vec3 e = min(uvw, 1.0 - uvw);
  return uSdfCfg.x * smoothstep(0.0, 0.02, min(e.x, min(e.y, e.z)));
}
float sdfAt(vec3 p){ return textureLod(tSdf, (p - uSdfMin) * uSdfInv, 0.0).r; }
// contact / crevice occlusion: how much solid sits within ~1.2 m along the normal
float sdfAO(vec3 p, vec3 n){
  float occ = 0.0, w = 1.0, ws = 0.0;
  for (int i = 0; i < SDF_AO_TAPS; i++) {
    float h = 0.06 + 0.12 * float(i) * (1.0 + 0.36 * float(i));
    float d = sdfAt(p + n * h);
    occ += clamp((h - d) / h, 0.0, 1.0) * w;
    ws += w;
    w *= 0.8;
  }
  float ao = 1.0 - uSdfCfg.y * (occ / ws);
  return clamp(ao * ao * (1.5 - 0.5 * ao), 0.03, 1.0);   // slight contrast curve so open floor stays clean and corners get dark
}
// soft shadow from a point light: the distance field is sampled at geometrically spaced points along the ray
// (fixed count, so the result varies smoothly across a surface instead of banding like an adaptive march)
float sdfShadow(vec3 ro, vec3 lp, float k){
  vec3 d = lp - ro; float dist = length(d); d /= dist;
  float t0 = 0.12, t1 = max(dist - 0.35, t0 + 0.02);
  float ratio = pow(t1 / t0, 1.0 / float(SDF_STEPS - 1));
  float t = t0, res = 1.0;
  for (int i = 0; i < SDF_STEPS; i++) {
    float h = sdfAt(ro + d * t);
    res = min(res, k * h / t);
    t *= ratio;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
// a light's share that reaches this point after bouncing around the room (no direction, no shadow)
vec3 sdfBounce(vec3 col, vec3 lv, float cutoff, vec3 wn){
  float d2 = dot(lv, lv), d = sqrt(d2);
  float wrap = 0.55 + 0.45 * dot(wn, lv / max(d, 1e-3));
  float att = cutoff > 0.0 ? clamp(1.0 - pow(d / cutoff, 4.0), 0.0, 1.0) : 1.0;
  return col * (uSdfCfg.z * wrap * att * att / (d2 + 2.5));
}
// ambient: the sky seen through the windows (baked visibility SH, so it fades with distance from the glass)
// plus a small warm floor for everything the light bounced into
vec3 interiorIrr(vec3 p, vec3 n){
  vec3 uvw = clamp((p + n * 0.25 - uSdfMin) * uSdfInv, 0.0, 1.0);
  vec4 v = textureLod(tVis, uvw, 0.0);
  float A = clamp(0.282095 * v.x + 0.325735 * dot(v.yzw, n), 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, 0.3) + uCityGlow;
  float day = clamp(uSunDir.y * 2.0 + 0.2, 0.0, 1.0) * (1.0 - uNight);
  vec3 sunBounce = uSunCol * (0.16 * day) * mix(0.35, 1.0, clamp(v.x * 0.9, 0.0, 1.0));
  vec3 moon = vec3(0.10, 0.15, 0.26) * (0.05 * uNight);                 // cool city/moon light through the glass at night
  vec3 amb = vec3(uSdfCfg.w) + sunBounce + (uHorizon + uCityGlow) * 0.05;
  return 3.14159265 * (sky * A + moon * (0.25 + A) + amb);
}
`;
