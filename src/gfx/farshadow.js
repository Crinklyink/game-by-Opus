// Far-field sun shadows: a height map of every building in the city (max-filtered mip chain) that shaders
// march toward the sun, so towers throw long soft shadows across streets and other buildings well beyond the
// range of the sun's shadow map.
import * as THREE from 'three';
import { G } from '../core/G.js';

const H = THREE.DataUtils.toHalfFloat;
const SIZE = 1024, EXT = 640, MIPS = 8;
export const FAR = { ready: false, boxes: 0 };

// buildings register their footprints while the world is built
G.heights = G.heights || [];

export function initFarShadow() {
  const t = new THREE.DataTexture(new Uint16Array([H(0)]), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  G.u.tHeight.value = t;
  G.u.uHeightCfg.value.set(-EXT, -EXT, 1 / (2 * EXT), 0);
}

export function bakeHeights() {
  const N = SIZE, cell = (2 * EXT) / N;
  const base = new Float32Array(N * N);
  for (const b of G.heights) {
    const top = (b.y0 || 0) + b.h;
    if (top < 6) continue;
    const x0 = Math.max(0, Math.floor((b.cx - b.w / 2 + EXT) / cell)), x1 = Math.min(N - 1, Math.floor((b.cx + b.w / 2 + EXT) / cell));
    const z0 = Math.max(0, Math.floor((b.cz - b.d / 2 + EXT) / cell)), z1 = Math.min(N - 1, Math.floor((b.cz + b.d / 2 + EXT) / cell));
    if (x1 < 0 || z1 < 0 || x0 > N - 1 || z0 > N - 1) continue;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * N + x; if (top > base[i]) base[i] = top; }
    FAR.boxes++;
  }
  // max-filtered mip chain (conservative: a distant sample never misses a narrow tower)
  const levels = [{ data: base, w: N }];
  for (let l = 1; l < MIPS; l++) {
    const p = levels[l - 1], w = p.w >> 1, d = new Float32Array(w * w);
    for (let z = 0; z < w; z++) for (let x = 0; x < w; x++) {
      const a = p.data[(2 * z) * p.w + 2 * x], b = p.data[(2 * z) * p.w + 2 * x + 1], c = p.data[(2 * z + 1) * p.w + 2 * x], e = p.data[(2 * z + 1) * p.w + 2 * x + 1];
      d[z * w + x] = Math.max(a, b, c, e);
    }
    levels.push({ data: d, w });
  }
  const toHalf = (l) => { const u = new Uint16Array(l.data.length); for (let i = 0; i < u.length; i++) u[i] = H(Math.min(l.data[i], 60000)); return u; };
  const tex = new THREE.DataTexture(toHalf(levels[0]), N, N, THREE.RedFormat, THREE.HalfFloatType);
  tex.mipmaps = levels.map((l) => ({ data: toHalf(l), width: l.w, height: l.w }));
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapNearestFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  G.u.tHeight.value = tex;
  G.u.uHeightCfg.value.set(-EXT, -EXT, 1 / (2 * EXT), 1);
  FAR.ready = true;
}

export const FAR_GLSL = /* glsl */`
uniform sampler2D tHeight; uniform vec4 uHeightCfg;
float farSun(vec3 wp){
  if (uHeightCfg.w < 0.5 || uSunDir.y < 0.02) return 1.0;
  float sh = 1.0, t = 3.0;
  for (int i = 0; i < 16; i++) {
    vec3 p = wp + uSunDir * t;
    vec2 uv = (p.xz - uHeightCfg.xy) * uHeightCfg.z;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float lod = clamp(log2(max(t * 0.3, 1.25) / ${(2 * EXT / SIZE).toFixed(4)}), 0.0, ${MIPS - 1}.0);
    float h = textureLod(tHeight, uv, lod).r;
    sh = min(sh, clamp((p.y - (h - 1.6)) / (1.2 + t * 0.05), 0.0, 1.0));
    t *= 1.42;
    if (sh < 0.01) break;
  }
  return sh * sh * (3.0 - 2.0 * sh);
}
`;
