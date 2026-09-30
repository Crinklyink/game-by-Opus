// Street-aligned city blocks around the player: mid-rise buildings whose ground floors are lit
// storefronts (glass, awnings, atlas signs, neon, interior displays), rooftop clutter, street
// trees, benches, bins, hydrants, bike racks, bus shelter, steam vents.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/G.js';
import { rng, clamp, smooth } from '../core/util.js';
import { P, FLOOR_H } from './consts.js';
import { Kit, addCollider, mat4 } from './kit.js';
import { pm } from '../gfx/materials.js';
import { canvasTex } from '../gfx/noise.js';
import { facadeMaterial, facadeBoxGeometry } from '../gfx/facade.js';
import { PROC } from '../gfx/glsl.js';
import { patchMaterial } from '../gfx/materials.js';
import { WALK_Y } from './street.js';

const GY = WALK_Y + 0.02;

const SIGNS = ['PHARMACY', 'NOODLE BAR', 'CORNER CAFE', 'BOOKS & MORE', 'DRY CLEAN', 'TACOS EL SOL', 'VINYL VAULT', 'PIZZA SLICE', 'BANK', 'FLOWERS', 'BARBER', 'SUSHI KAI', 'BAKERY', 'WINE BAR', 'GYM 24/7', 'PHONE FIX', 'DELI', 'OPTICIAN', 'THAI HOUSE', 'ARCADE', 'YOGA STUDIO', 'LAUNDRY', 'ICE CREAM', 'RAMEN', 'HARDWARE', 'CHOCOLATIER', 'TEA HOUSE', 'PET SHOP', 'JAZZ CLUB', 'COFFEE ROASTERS', 'BOTANICA', 'CAMERAS', 'TAILOR', 'DINER', 'GALLERY', 'POKE BOWL', 'CRAFT BEER', 'NAILS', 'TOY BOX', 'CHEESE SHOP', 'SNEAKERS', 'ELECTRONICS', 'FRUIT MARKET', 'DUMPLINGS', 'BISTRO', 'KARAOKE', 'BOUTIQUE', 'MEDICAL'];
const PALETTES = [['#101820', '#ffcf4a'], ['#5a1626', '#ffe6d0'], ['#0d2b45', '#ff8b6a'], ['#1c1c1c', '#5be0c0'], ['#f2ece0', '#1b2b4a'], ['#204a2c', '#f6e7b0'], ['#3b1656', '#ffd3f0'], ['#111111', '#ff4d6d'], ['#14384a', '#e8f5ff'], ['#7a2a10', '#ffe08a']];

function makeSignAtlas() {
  const cols = 4, rows = 16, cw = 512, ch = 64;
  return canvasTex(cols * cw, rows * ch, (c, w, h) => {
    const R = rng(88);
    for (let i = 0; i < cols * rows; i++) {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      const pal = PALETTES[i % PALETTES.length];
      const neon = i % 3 === 0;
      const name = SIGNS[i % SIGNS.length];
      c.fillStyle = neon ? '#050508' : pal[0]; c.fillRect(x, y, cw, ch);
      if (!neon) { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y, cw, 4); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + ch - 5, cw, 5); }
      const fonts = ['700 34px "Trebuchet MS", sans-serif', '600 32px Georgia, serif', '800 30px Impact, "Arial Black", sans-serif', '500 30px "Courier New", monospace'];
      c.font = fonts[(i >> 2) % fonts.length]; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (neon) {
        const col = ['#ff3c8a', '#3cf0ff', '#ffd23c', '#7dff5c', '#ff7a2c'][i % 5];
        c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col; c.fillText(name, x + cw / 2, y + ch / 2 + 2); c.shadowBlur = 6; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.strokeText(name, x + cw / 2, y + ch / 2 + 2);
        c.shadowBlur = 0; c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(x + 10, y + 8, cw - 20, ch - 16);
      } else {
        c.fillStyle = pal[1]; c.fillText(name, x + cw / 2, y + ch / 2 + 2);
        c.strokeStyle = pal[1]; c.globalAlpha = 0.5; c.lineWidth = 2; c.strokeRect(x + 6, y + 6, cw - 12, ch - 12); c.globalAlpha = 1;
      }
    }
  }, { aniso: 8 });
}

function makeInteriorAtlas() {
  const S = 256, N = 4;
  return canvasTex(S * N, S * N, (c) => {
    const R = rng(4242);
    for (let i = 0; i < N * N; i++) {
      const x = (i % N) * S, y = Math.floor(i / N) * S;
      const kind = i % 8;
      const bg = ['#3a2a1c', '#1e2a3a', '#3a1e2a', '#2a3a2a', '#40382a', '#242a38', '#382a20', '#2a2438'][kind];
      const g = c.createLinearGradient(x, y, x, y + S); g.addColorStop(0, '#fff1d0'); g.addColorStop(0.16, bg); g.addColorStop(1, '#0c0a08');
      c.fillStyle = g; c.fillRect(x, y, S, S);
      // ceiling lights
      for (let k = 0; k < 7; k++) { const lx = x + 20 + k * 34, ly = y + 6 + (k % 2) * 6; const rg = c.createRadialGradient(lx, ly, 0, lx, ly, 42); rg.addColorStop(0, 'rgba(255,230,170,0.95)'); rg.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = rg; c.fillRect(lx - 42, ly - 42, 84, 130); }
      // back-wall shelves / displays
      const shelfCol = ['#c79a5a', '#7aa8d8', '#e58aa8', '#8ac89a', '#e8d090', '#9aa0e8', '#d89a6a', '#b0b8c0'][kind];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
        if (R() < 0.18) continue;
        c.fillStyle = `hsl(${(R() * 360) | 0} ${30 + R() * 50}% ${30 + R() * 35}%)`;
        const bw = 12 + R() * 14, bh = 14 + R() * 12;
        c.fillRect(x + 12 + k * 26, y + 62 + r * 26 - bh + 24, bw, bh);
      }
      c.fillStyle = shelfCol; for (let r = 0; r < 4; r++) c.fillRect(x + 8, y + 86 + r * 26, S - 16, 3);
      // counter + people silhouettes
      c.fillStyle = 'rgba(20,14,10,0.9)'; c.fillRect(x + 20, y + 178, S - 40, 46);
      c.fillStyle = shelfCol; c.globalAlpha = 0.6; c.fillRect(x + 20, y + 176, S - 40, 4); c.globalAlpha = 1;
      for (let k = 0; k < 3; k++) if (R() < 0.75) { const px = x + 40 + R() * (S - 90); c.fillStyle = 'rgba(10,8,8,0.9)'; c.beginPath(); c.arc(px, y + 150, 9, 0, 7); c.fill(); c.fillRect(px - 10, y + 158, 20, 36); }
      // warm floor glow
      const fg = c.createLinearGradient(x, y + 200, x, y + S); fg.addColorStop(0, 'rgba(255,200,140,0.0)'); fg.addColorStop(1, 'rgba(255,190,120,0.35)'); c.fillStyle = fg; c.fillRect(x, y + 200, S, S - 200);
    }
  }, { aniso: 4 });
}

// tree canopy shading
PROC.canopy = /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float a = nz(wp*0.9).r, b = nz(wp*5.0).g, c = nz(wp*17.0).b;
  vec3 dark = vec3(0.045, 0.13, 0.04), light = vec3(0.2, 0.36, 0.08);
  float leaf = smoothstep(0.32, 0.78, b*0.55 + c*0.55);
  vec3 col = mix(dark, light, clamp(a*0.45 + leaf*0.65 + (wp.y - 4.0)*0.02, 0.0, 1.0));
  s.alb = col * s.alb * 1.4;
  s.rough = 0.7; s.h = (c - 0.5) * 0.05 * dfade(wp, 0.06); s.ao = 0.55 + 0.45*a;
  s.emis += col * uSunCol * 0.06 * (1.0 - uNight);
}`;

let signMat, interiorMat, glassMat;

export function buildBlocks(scene, glow, planarOnly = false) {
  const R = rng(5150);
  const out = { boxes: [], colliders: [], update: null, storeFronts: 0 };
  const signAtlas = makeSignAtlas(), intAtlas = makeInteriorAtlas();
  signMat = new THREE.MeshBasicMaterial({ map: signAtlas, toneMapped: false, color: new THREE.Color(1, 1, 1) });
  interiorMat = new THREE.MeshBasicMaterial({ map: intAtlas, toneMapped: false, color: new THREE.Color(1, 1, 1) });
  glassMat = pm('plain', { color: 0x0a1518, rough: 0.02, glass: true, opacity: 0.12, side: THREE.DoubleSide, env: 2.4 });
  const K = new Kit();     // architecture/frames/awnings (merged by material)
  const metal = pm('metal', { color: 0x1c1e21, p: [0, 60, 0, 0], rough: 0.5 });
  const stone = pm('concrete', { color: 0x6b6c6e, p: [0, 0, 0, 0], wet: 1 });
  const trimW = pm('paint', { color: 0xd8d2c4, rough: 0.6, wet: 1 });
  const awnCols = [0x8a1c2c, 0x1c3a5c, 0x2a6a44, 0xd8a020, 0x222222, 0xc0c0b8, 0x7a3a86];
  const awnMats = awnCols.map((c) => pm('fabric', { color: c, physical: false, wet: 1 }));
  const instBoxes = [];
  const shopGeos = { sign: [], interior: [], glass: [] };

  const atlasQuad = (w, h, cellRect) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cellRect[0] + uv.getX(i) * (cellRect[2] - cellRect[0]), cellRect[1] + uv.getY(i) * (cellRect[3] - cellRect[1]));
    return g;
  };
  const signRect = (i) => { const cols = 4, rows = 16; const c = i % cols, r = Math.floor(i / cols) % rows; return [c / cols + 0.002, 1 - (r + 1) / rows + 0.001, (c + 1) / cols - 0.002, 1 - r / rows - 0.001]; };
  const intRect = (i) => { const N = 4, c = i % N, r = Math.floor(i / N) % N; return [c / N + 0.003, 1 - (r + 1) / N + 0.003, (c + 1) / N - 0.003, 1 - r / N - 0.003]; };
  const push = (geo, mat, m) => { K.push(mat, geo, m); };
  const place = (lx, ly, lz, ox, oz, th, ry = 0) => {
    // local (front = +z, +x along the frontage) -> world
    const c = Math.cos(th), s = Math.sin(th);
    return { x: ox + lx * c + lz * s, y: ly, z: oz - lx * s + lz * c, rot: th + ry };
  };
  const mat = (lx, ly, lz, ox, oz, th, rx = 0, ry = 0, rz = 0) => {
    const p = place(lx, ly, lz, ox, oz, th);
    return mat4(p.x, p.y, p.z, rx, th + ry, rz);
  };

  // ---------------- storefront ----------------
  function storefront(ox, oz, th, w, opts = {}) {
    out.storeFronts++;
    const sh = 4.4, gh = 3.1, gw = Math.max(2.2, w - 1.4);
    // stone plinth + glass + display + frames + door
    push(new THREE.BoxGeometry(w, 0.5, 0.42), stone, mat(0, 0.25, 0.12, ox, oz, th));
    push(new THREE.PlaneGeometry(gw, gh), glassMat, mat(0, 0.55 + gh / 2, 0.35, ox, oz, th));
    shopGeos.interior.push([atlasQuad(gw, gh, intRect(opts.interior ?? Math.floor(R() * 16))), mat(0, 0.55 + gh / 2, 0.3, ox, oz, th)]);
    for (const dx of [-gw / 2, gw / 2]) push(new THREE.BoxGeometry(0.1, gh + 0.1, 0.14), metal, mat(dx, 0.55 + gh / 2, 0.34, ox, oz, th));
    push(new THREE.BoxGeometry(gw, 0.1, 0.14), metal, mat(0, 0.55, 0.34, ox, oz, th)); push(new THREE.BoxGeometry(gw, 0.1, 0.14), metal, mat(0, 0.55 + gh, 0.34, ox, oz, th));
    const nm = Math.floor(gw / 2.6);
    for (let i = 1; i < nm; i++) push(new THREE.BoxGeometry(0.06, gh, 0.1), metal, mat(-gw / 2 + (gw * i) / nm, 0.55 + gh / 2, 0.34, ox, oz, th));
    // door: brighter glass slab with a handle
    const dx = (R() - 0.5) * (gw - 2.2);
    push(new THREE.BoxGeometry(1.1, 2.3, 0.08), metal, mat(dx, 1.2, 0.4, ox, oz, th));
    shopGeos.glass.push([new THREE.PlaneGeometry(0.96, 2.2), mat(dx, 1.2, 0.45, ox, oz, th)]);
    push(new THREE.BoxGeometry(0.03, 0.5, 0.05), pm('metal', { color: 0xcfd2d6, p: [0, 60, 0, 0] }), mat(dx + 0.4, 1.1, 0.5, ox, oz, th));
    // cornice + sign band + awning
    push(new THREE.BoxGeometry(w + 0.2, 0.28, 0.5), trimW, mat(0, sh + 0.1, 0.2, ox, oz, th));
    const si = opts.sign ?? Math.floor(R() * 64);
    const sw = Math.min(w - 0.8, 6.5);
    shopGeos.sign.push([atlasQuad(sw, sw / 8, signRect(si)), mat(0, 3.95 + 0.15, 0.48, ox, oz, th)]);
    push(new THREE.BoxGeometry(sw + 0.16, sw / 8 + 0.14, 0.12), metal, mat(0, 4.1, 0.42, ox, oz, th));
    if (R() < 0.6) {
      const am = awnMats[Math.floor(R() * awnMats.length)];
      const aw = gw * 0.92, ad = 1.35;
      const g = new THREE.BoxGeometry(aw, 0.06, ad); push(g, am, mat(0, 3.72, 0.25 + ad / 2, ox, oz, th, 0.36));
      push(new THREE.BoxGeometry(aw, 0.34, 0.05), am, mat(0, 3.5 - 0.05, 0.25 + ad - 0.06, ox, oz, th));
    }
    return { sh };
  }

  // ---------------- building along a frontage ----------------
  function frontBuilding(cx, cz, th, w, depth, floors, style, tint, bay) {
    // cx,cz = centre of the frontage line; front faces direction (sin th, cos th)
    const h = floors * FLOOR_H + 1.2;
    const nx = Math.sin(th), nz = Math.cos(th);
    const bcx = cx - nx * depth / 2, bcz = cz - nz * depth / 2;
    const horiz = Math.abs(nx) > 0.5;      // facing +-x  => footprint w along z
    instBoxes.push({ cx: bcx, cz: bcz, w: horiz ? depth : w, d: horiz ? w : depth, h, y0: 0, style, tint, bay, fh: FLOOR_H, seed: R() });
    // rooftop clutter
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const mw = 2.5 + R() * 5, md = 2.5 + R() * 5, mh = 1.6 + R() * 3;
      instBoxes.push({ cx: bcx + (R() - 0.5) * (Math.max(2, (horiz ? depth : w) - mw)), cz: bcz + (R() - 0.5) * (Math.max(2, (horiz ? w : depth) - md)), w: mw, d: md, h: mh, y0: h, style: 4, tint: 0x777a7f, bay: 4, fh: 4, seed: R() });
    }
    // parapet
    storefront(cx, cz, th, w);
    out.colliders.push(addCollider(bcx - (horiz ? depth : w) / 2, bcx + (horiz ? depth : w) / 2, bcz - (horiz ? w : depth) / 2, bcz + (horiz ? w : depth) / 2, -1, 60, 0));
  }

  const segments = (len, lo, hi) => { const seg = []; let rem = len; while (rem > hi * 1.6) { const w = lo + R() * (hi - lo); seg.push(w); rem -= w; } if (rem > lo) seg.push(rem); else if (seg.length) seg[seg.length - 1] += rem; else seg.push(rem); return seg; };
  const pickStyle = (floors) => { const r = R(); if (floors > 10) return r < 0.6 ? 0 : r < 0.85 ? 2 : 1; return r < 0.34 ? 3 : r < 0.68 ? 1 : r < 0.85 ? 2 : 0; };
  const tintFor = (st) => st === 0 ? [0x4b8196, 0x38607a, 0x7a6a4e, 0x5d6870, 0x407a68][Math.floor(R() * 5)] : st === 3 ? [0x9a5a45, 0x8b4e3c, 0xa66a4c, 0x7d4a3a][Math.floor(R() * 4)] : [0xb9b1a3, 0x9c9c9a, 0xcbbca3, 0xa7a49b, 0xc4c0b6][Math.floor(R() * 5)];

  function row(x0, z0, x1, z1, th, opts = {}) {
    // frontage line from (x0,z0) to (x1,z1), buildings face direction th
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    let pos = 0;
    for (const w of segments(len, 14, 30)) {
      const cx = x0 + tx * (pos + w / 2), cz = z0 + tz * (pos + w / 2);
      pos += w;
      if (opts.skip && opts.skip(cx, cz, w)) continue;
      const floors = 4 + Math.floor(R() * 10 * (opts.tall ?? 1));
      const st = pickStyle(floors);
      frontBuilding(cx, cz, th, w - 0.15, opts.depth ?? (16 + R() * 10), floors, st, tintFor(st), st === 0 ? 3 + R() * 1.2 : 3.4 + R() * 1.4);
    }
  }

  // generate every near block
  const special = new Set(['-1,0', '0,0', '0,-1', '-1,-1']);
  for (let i = -3; i <= 2; i++) for (let j = -3; j <= 2; j++) {
    const key = `${i},${j}`;
    const x0 = i * P + 12, x1 = (i + 1) * P - 12, z0 = j * P + 12, z1 = (j + 1) * P - 12;
    if (key === '-1,-1') continue;              // park (built separately)
    const D = 18 + R() * 8;
    const skipTower = key === '-1,0' ? (cx, cz, w) => (cx > -70 && cx < -10 && cz < 70) : null;
    // north row (faces -z), south row (faces +z), west row (faces -x), east row (faces +x)
    if (key !== '0,-1') row(x0, z0, x1, z0, Math.PI, { depth: D, skip: key === '-1,0' ? (cx, cz, w) => cx > -66 && cx < -14 : (key === '0,0' ? (cx, cz, w) => cx > 12 && cx < 66 : null) });
    else row(x0, z0, x1, z0, Math.PI, { depth: D });
    row(x0, z1, x1, z1, 0, { depth: D, skip: key === '0,-1' ? (cx, cz, w) => cx > 12 && cx < 58 : null });
    row(x0, z0 + D, x0, z1 - D, -Math.PI / 2, { depth: D });
    row(x1, z0 + D, x1, z1 - D, Math.PI / 2, { depth: D, skip: key === '-1,0' ? (cx, cz, w) => cz < 66 : null });
    // inner tall filler
    const ix0 = x0 + D + 3, ix1 = x1 - D - 3, iz0 = z0 + D + 3, iz1 = z1 - D - 3;
    if (ix1 - ix0 > 20 && iz1 - iz0 > 20 && key !== '-1,0' && key !== '0,0' && key !== '0,-1') {
      const nn = R() < 0.6 ? 1 : 2;
      for (let k = 0; k < nn; k++) {
        const w = (ix1 - ix0) * (nn === 1 ? 0.8 : 0.46), d = (iz1 - iz0) * 0.8, cx = nn === 1 ? (ix0 + ix1) / 2 : ix0 + (k + 0.5) * (ix1 - ix0) / 2, cz = (iz0 + iz1) / 2;
        const floors = 10 + Math.floor(R() * 22); const h = floors * FLOOR_H + 2, st = R() < 0.7 ? 0 : 2;
        instBoxes.push({ cx, cz, w, d, h, y0: 0, style: st, tint: tintFor(st), bay: 3 + R(), fh: FLOOR_H, seed: R() });
        instBoxes.push({ cx: cx + (R() - 0.5) * 4, cz: cz + (R() - 0.5) * 4, w: w * 0.6, d: d * 0.6, h: 2 + R() * 3, y0: h, style: 4, tint: 0x6f7378, bay: 4, fh: 4, seed: R() });
      }
    } else if (key === '-1,0') {
      // rest of the tower block: south + west parts behind the tower
      instBoxes.push({ cx: -86, cz: 80, w: 44, d: 44, h: 56, y0: 0, style: 1, tint: 0xb9b1a3, bay: 3.6, fh: FLOOR_H, seed: R() });
      instBoxes.push({ cx: -40, cz: 92, w: 60, d: 30, h: 38, y0: 0, style: 3, tint: 0x9a5a45, bay: 3.2, fh: FLOOR_H, seed: R() });
    }
  }

  // instanced facade boxes
  const mat0 = facadeMaterial(true);
  for (const b of instBoxes) if (b.h + b.y0 > 8) G.heights.push({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, h: b.h, y0: b.y0 });
  const geo = facadeBoxGeometry();
  const inst = new THREE.InstancedMesh(geo, mat0, instBoxes.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const info = new Float32Array(instBoxes.length * 4);
  instBoxes.forEach((b, k) => {
    m4.compose(new THREE.Vector3(b.cx, b.y0, b.cz), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
    inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setHex(b.tint));
    info[k * 4] = b.seed; info[k * 4 + 1] = b.style; info[k * 4 + 2] = b.bay; info[k * 4 + 3] = b.fh;
  });
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  inst.castShadow = true; inst.receiveShadow = true; inst.matrixAutoUpdate = false; inst.updateMatrix(); inst.computeBoundingSphere(); inst.layers.enable(1);
  scene.add(inst);
  out.inst = inst;

  // merged storefront geometry
  const merge = (arr, material) => {
    if (!arr.length) return;
    const geoms = arr.map(([g, m]) => { const q = g.clone(); if (q.index) { const t = q.toNonIndexed(); q.dispose(); return t.applyMatrix4(m); } return q.applyMatrix4(m); });
    for (const g of geoms) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const merged = mergeG(geoms);
    const me = new THREE.Mesh(merged, material); me.frustumCulled = true; me.layers.enable(1);
    scene.add(me); return me;
  };
  const mergeG = (geoms) => mergeGeometries(geoms, false);
  merge(shopGeos.interior, interiorMat);
  merge(shopGeos.sign, signMat);
  merge(shopGeos.glass, glassMat);
  K.mesh(scene, { reflect: true });

  out.update = (dt) => {
    const night = G.u.uNight.value, dusk = 1 - (G.atmo ? G.atmo.day : 1);
    const on = clamp(Math.max(night, dusk * 0.85), 0, 1);
    signMat.color.setScalar(0.85 + on * 1.9);
    interiorMat.color.setScalar(0.42 + on * 1.1);
    glassMat.opacity = 0.12 + (1 - on) * 0.08;
  };
  return out;
}
