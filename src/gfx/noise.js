// Tileable 3D noise volume used by every procedural material / the sky.
//   R: fbm value noise   G: cellular (1 - F1, cell centres bright)
//   B: second fbm        A: white-ish per-voxel hash (grain / sparkle)
// Stored as half floats so derivative-based bump mapping stays smooth.
import * as THREE from 'three';

export function createNoise3D(N = 64) {
  const data = new Uint16Array(N * N * N * 4);
  const toH = THREE.DataUtils.toHalfFloat;

  const h3 = (x, y, z, s) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  const vnoise = (x, y, z, f, seed) => {
    x *= f; y *= f; z *= f;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const g = (a, b, c) => h3(((xi + a) % f + f) % f, ((yi + b) % f + f) % f, ((zi + c) % f + f) % f, seed);
    const x00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * u;
    const x10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * u;
    const x01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * u;
    const x11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
  const fbm = (x, y, z, seed) => {
    let s = 0, a = 0.5, tot = 0;
    for (let o = 0, f = 4; o < 4; o++, f *= 2, a *= 0.5) { s += a * vnoise(x, y, z, f, seed + o * 17); tot += a; }
    return s / tot;
  };
  const cellF = 6;
  const cellular = (x, y, z) => {
    x *= cellF; y *= cellF; z *= cellF;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let best = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cx = xi + a, cy = yi + b, cz = zi + c;
      const wx = ((cx % cellF) + cellF) % cellF, wy = ((cy % cellF) + cellF) % cellF, wz = ((cz % cellF) + cellF) % cellF;
      const px = cx + h3(wx, wy, wz, 101), py = cy + h3(wx, wy, wz, 202), pz = cz + h3(wx, wy, wz, 303);
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < best) best = d;
    }
    return Math.min(1, Math.sqrt(best));
  };

  // normalise fbm to roughly 0..1 using its empirical range
  const norm = (v) => Math.min(1, Math.max(0, (v - 0.22) / 0.56));
  let i = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N, fy = y / N, fz = z / N;
    data[i++] = toH(norm(fbm(fx, fy, fz, 1)));
    data[i++] = toH(1 - cellular(fx, fy, fz));
    data[i++] = toH(norm(fbm(fx, fy, fz, 977)));
    data[i++] = toH(h3(x, y, z, 55));
  }

  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// ---- canvas texture helpers (signs, menus, art, labels) ----
export function canvasTex(w, h, draw, { srgb = true, aniso = 8, repeat = false, mip = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  t.userData.canvas = c;
  return t;
}
