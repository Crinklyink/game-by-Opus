// Street props: trees, benches, bins, hydrants, bike racks, bus shelter, steam vents, street signs,
// the Central Green park (grass, paths, fountain, lamps, café) and Meridian Tower's entrance plaza.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { Kit, addCollider, mat4 } from './kit.js';
import { pm, patchMaterial, VERT } from '../gfx/materials.js';
import { pullBar } from './shapes.js';
import { canvasTex } from '../gfx/noise.js';
import { PROC } from '../gfx/glsl.js';
import { LightPool } from '../gfx/lights.js';
import { GpuParticles } from '../gfx/particles.js';
import { WALK_Y, ROAD_Y, groundMaterial } from './street.js';
import * as F from './furniture.js';
import { palette } from './palette.js';

const GY = WALK_Y + 0.02;

PROC.grass = /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float a = nz(wp*0.35).r, b = nz(wp*2.7).g, c = nz(wp*23.0).b, d = nz(wp*61.0).a;
  vec3 g1 = vec3(0.045, 0.12, 0.028), g2 = vec3(0.14, 0.27, 0.06);
  float dry = smoothstep(0.55, 0.85, nz(wp*0.11 + 3.0).b);
  vec3 col = mix(g1, g2, clamp(a*0.55 + b*0.5, 0.0, 1.0));
  col = mix(col, vec3(0.2, 0.19, 0.08), dry*0.4);
  s.alb = col * (0.75 + 0.5*c) * (0.9 + 0.2*d);
  s.rough = 0.88; s.h = (c - 0.5) * 0.02 * dfade(wp, 0.05); s.ao = 0.75 + 0.25*c;
}`;
PROC.water = /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float a = nz(vec3(wp.xz*0.9, uTime*0.05)).r, b = nz(vec3(wp.xz*2.4 + 4.0, uTime*0.09)).b;
  s.alb = vec3(0.01, 0.05, 0.07) * (0.7 + 0.6*a);
  s.rough = 0.03; s.metal = 0.0;
  s.h = ((a - 0.5) * 0.02 + (b - 0.5) * 0.01);
}`;

PROC.leaves = /* glsl */`
uniform sampler2D tLeaf;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec4 lt = texture(tLeaf, vUvP);
  float v = nz(wp*0.5).r, w = nz(wp*3.1).g;
  s.alb *= lt.rgb * (1.5 + 0.5*v) * (0.9 + 0.2*w);
  s.a = lt.a;
  s.rough = 0.6; s.h = 0.0;
  s.emis += s.alb * uSunCol * 0.05 * (1.0 - uNight);          // light bleeding through the leaves
}`;
// gentle wind for the whole crown (blobs + leaf cards move together); cards also flutter
const windHook = (flutter) => ({
  head: 'uniform float uTime; uniform float uWet;',
  begin: `
#ifdef USE_INSTANCING
  float wph = dot(instanceMatrix[3].xz, vec2(0.37, 0.53));
#else
  float wph = 0.0;
#endif
  float wh = clamp(position.y / 8.0, 0.0, 1.0); wh *= wh;
  float gust = 1.0 + 2.2 * uWet;
  transformed.x += (sin(uTime * 1.1 + wph) * 0.5 + sin(uTime * 2.3 + wph * 1.7) * 0.25) * 0.16 * wh * gust;
  transformed.z += cos(uTime * 0.9 + wph * 1.3) * 0.11 * wh * gust;
${flutter ? '  transformed += vec3(sin(uTime * 6.1 + position.x * 9.0 + position.z * 4.0), sin(uTime * 5.3 + position.y * 8.0), sin(uTime * 5.7 + position.z * 9.0 + position.x * 3.0)) * 0.02 * wh * gust;' : ''}
`,
});
VERT.canopy = windHook(false);
VERT.leaves = windHook(true);

// 2x2 atlas of leafy twigs, painted procedurally (alpha = leaf shapes, rgb = veins / tonal variation)
function makeLeafAtlas() {
  return canvasTex(1024, 1024, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.scale(w / 512, h / 512);       // drawn on a 512 grid, rendered at 2x so leaf edges stay crisp up close
    const RR = rng(90210);
    const leaf = (x, y, ang, len, wid, tone) => {
      c.save(); c.translate(x, y); c.rotate(ang);
      const g = c.createLinearGradient(0, -wid, 0, wid);
      g.addColorStop(0, `hsl(${88 + tone * 22}, 34%, ${58 + tone * 16}%)`); g.addColorStop(1, `hsl(${96 + tone * 16}, 40%, ${40 + tone * 14}%)`);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 0);
      c.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.72, -wid * 0.8, len, 0);
      c.bezierCurveTo(len * 0.72, wid * 0.8, len * 0.25, wid * 1.05, 0, 0);
      c.fill();
      c.strokeStyle = 'rgba(236,246,196,0.6)'; c.lineWidth = Math.max(1, wid * 0.1);
      c.beginPath(); c.moveTo(len * 0.02, 0); c.lineTo(len * 0.92, 0); c.stroke();
      c.lineWidth = Math.max(0.7, wid * 0.045); c.strokeStyle = 'rgba(220,236,170,0.34)';
      for (let k = 1; k <= 4; k++) { const vx = len * (0.14 + k * 0.16), dy = wid * 0.62 * (1 - k * 0.13); c.beginPath(); c.moveTo(vx, 0); c.lineTo(vx + len * 0.13, -dy); c.moveTo(vx, 0); c.lineTo(vx + len * 0.13, dy); c.stroke(); }
      c.restore();
    };
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
      const ox = cx * 256, oy = cy * 256, sx = ox + 128, sy = oy + 242;
      c.strokeStyle = '#3f321f'; c.lineWidth = 3.2; c.lineCap = 'round';
      const bx = sx + (RR() - 0.5) * 36;
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + (RR() - 0.5) * 30, oy + 140, bx, oy + 26); c.stroke();
      const n = 14 + Math.floor(RR() * 5);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), side = i % 2 ? 1 : -1;
        const px = sx + (bx - sx) * t * t + (RR() - 0.5) * 6, py = sy - t * 205;
        const len = (66 - t * 26) * (0.85 + RR() * 0.3), wid = len * (0.27 + RR() * 0.06);
        leaf(px, py, -Math.PI / 2 + side * (0.75 + RR() * 0.45) - t * side * 0.25, len, wid, RR());
      }
      leaf(bx, oy + 30, -Math.PI / 2 + (RR() - 0.5) * 0.4, 62, 17, RR());       // terminal leaf
    }
  }, { srgb: true, aniso: 8 });
}

// leaf cards scattered over the crown blobs (same layout for every tree: the whole crown is one shared geometry)
function makeLeafCards(defs, density = 1, seed = 4441) {
  const R2 = rng(seed);
  const pos = [], nor = [], uv = [], col = [];
  const nrm = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const b of defs) {
    const cnt = Math.round(b.r * b.r * 100 * density);
    for (let i = 0; i < cnt; i++) {
      let dx = R2() * 2 - 1, dy = R2() * 2 - 1, dz = R2() * 2 - 1; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      if (dy < -0.55 && R2() < 0.6) dy = -dy * 0.4;                         // fewer leaves hanging under the crown
      const rk = R2(), rr = b.r * (0.7 + rk * 0.55);
      const px = b.x + dx * rr, py = b.y + dy * rr * 0.86, pz = b.z + dz * rr;
      nrm.set(dx + (R2() - 0.5) * 0.9, dy + (R2() - 0.5) * 0.9, dz + (R2() - 0.5) * 0.9).normalize();
      t1.set(0, 1, 0).cross(nrm); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
      t2.copy(nrm).cross(t1).normalize();
      const ang = R2() * 6.2832, ca = Math.cos(ang), sa = Math.sin(ang);
      u.copy(t1).multiplyScalar(ca).addScaledVector(t2, sa); v.copy(t2).multiplyScalar(ca).addScaledVector(t1, -sa);
      const sz = (0.52 + R2() * 0.44) * (0.8 + b.r * 0.12) * 0.5;
      const cell = Math.floor(R2() * 4), cu = (cell % 2) * 0.5, cv = (1 - Math.floor(cell / 2)) * 0.5;
      const shade = (0.5 + 0.5 * Math.min(1, Math.max(0, dy * 0.6 + 0.55))) * (0.85 + R2() * 0.3) * (0.5 + 0.5 * rk);   // deeper leaves are darker
      const nx = dx * 0.7 + nrm.x * 0.3, ny = dy * 0.7 + nrm.y * 0.3, nz2 = dz * 0.7 + nrm.z * 0.3, nl = Math.hypot(nx, ny, nz2) || 1;
      const P = corners.map(([a, c]) => [px + (u.x * a + v.x * c) * sz, py + (u.y * a + v.y * c) * sz, pz + (u.z * a + v.z * c) * sz]);
      const UV = corners.map(([a, c]) => [cu + (a * 0.5 + 0.5) * 0.5, cv + (c * 0.5 + 0.5) * 0.5]);
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); uv.push(...UV[k]); nor.push(nx / nl, ny / nl, nz2 / nl); col.push(shade, shade, shade); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildProps(scene, glow, ctx) {
  const R = rng(777);
  const M = palette();
  const out = { update: null, steam: [] };
  const ground = groundMaterial(G.planar.uniforms);

  // ---------------------------------------------------------------- trees
  // three crown types (round, tall oval, broad plane-tree) so a street of trees stops repeating itself. Each has its own trunk + limb
  // geometry, solid crown core and leaf-card shell; instances of a type share them.
  const CROWNS = [
    { name: 'round', blobs: [[2.1, 0, 5.9, 0], [1.6, 1.4, 5.3, 0.4], [1.6, -1.3, 5.4, -0.5], [1.5, 0.3, 5.2, 1.4], [1.5, -0.4, 5.6, -1.4], [1.35, 0.2, 7.2, 0.1], [1.1, 1.5, 6.6, -1.2], [1.1, -1.6, 6.5, 1.0]], limbs: 6, trunkH: 4.4, seed: 2323, reach: [1.0, 1.7] },
    { name: 'oval', blobs: [[1.55, 0, 5.3, 0], [1.5, 0.35, 6.5, 0.25], [1.3, -0.35, 7.6, -0.2], [1.05, 0.2, 8.6, 0.05], [1.3, 0.85, 5.0, 0.6], [1.2, -0.85, 5.3, -0.6], [1.0, 0.1, 4.2, 0.9], [0.95, -0.5, 6.0, -1.0]], limbs: 7, trunkH: 4.2, seed: 5151, reach: [0.45, 0.95] },
    { name: 'broad', blobs: [[2.2, 0, 5.4, 0], [1.9, 1.9, 5.1, 0.4], [1.9, -1.8, 5.2, -0.4], [1.8, 0.3, 5.2, 1.9], [1.7, -0.4, 5.3, -1.8], [1.4, 0.2, 6.6, 0.1], [1.3, 1.6, 6.2, -1.3], [1.3, -1.5, 6.1, 1.4]], limbs: 8, trunkH: 3.7, seed: 7171, reach: [1.5, 2.3] },
  ];
  const buildTrunk = (cr) => {
    const parts = [];
    const add = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); parts.push(g); };
    const t = new THREE.CylinderGeometry(0.1, 0.17, cr.trunkH, 10, 4); t.translate(0, cr.trunkH / 2, 0); add(t);
    const flare = new THREE.CylinderGeometry(0.17, 0.3, 0.38, 10, 1); flare.translate(0, 0.19, 0); add(flare);
    const rr = rng(cr.seed);
    for (let i = 0; i < cr.limbs; i++) {
      const a = (i / cr.limbs) * Math.PI * 2 + rr() * 0.5, h0 = cr.trunkH - 1.3 + rr() * 1.1, len = cr.reach[0] + rr() * (cr.reach[1] - cr.reach[0]), h1 = h0 + 1.0 + rr() * 0.8;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, h0, 0), new THREE.Vector3(Math.cos(a) * len * 0.5, h0 + (h1 - h0) * 0.55, Math.sin(a) * len * 0.5), new THREE.Vector3(Math.cos(a) * len, h1, Math.sin(a) * len)]);
      add(new THREE.TubeGeometry(curve, 8, 0.06 - i * 0.003, 6, false));
    }
    return ctx.mergeGeometries(parts, false);
  };
  const blob = (r, x, y, z, det = 2) => { const g = new THREE.IcosahedronGeometry(r, det); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i); const nzv = Math.sin(vx * 3.1 + vy * 2.3) * Math.cos(vz * 2.7 + vx * 1.9); const k = 1 + 0.12 * nzv; p.setXYZ(i, vx * k, vy * k * 0.86, vz * k); } g.translate(x, y, z); g.computeVertexNormals(); return g.toNonIndexed(); };
  const buildCanopy = (cr) => { const parts = cr.blobs.map(([r, x, y, z]) => blob(r * 0.8, x, y, z)); for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return ctx.mergeGeometries(parts, false); };
  const treePos = [];
  for (let x = -150; x <= 150; x += 17) { if (Math.abs(x) < 16 || (x > -66 && x < -12)) continue; treePos.push([x + (R() - 0.5) * 2, 10.9]); if (Math.abs(x + 8.5) > 16) treePos.push([x + 8.5, -10.9]); }
  for (let z = -150; z <= 150; z += 17) { if (Math.abs(z) < 16) continue; treePos.push([10.9, z + 4]); treePos.push([-10.9, z - 4]); }
  // park trees
  const parkTrees = [];
  for (let k = 0; k < 70; k++) {
    const x = -104 + R() * 92, z = -104 + R() * 92;
    if (Math.hypot(x + 60, z + 60) < 11) continue;                     // fountain plaza
    if (Math.abs(x - z + 0) < 3.2 && false) continue;
    if (Math.abs((x + 60)) < 2.4 || Math.abs((z + 60)) < 2.4) continue;   // main paths
    if (x > -44 && x < -14 && z > -38 && z < -12) continue;              // café
    parkTrees.push([x, z]);
  }
  const allTrees = [...treePos.map(([x, z]) => ({ x, z, s: 0.85 + R() * 0.45 })), ...parkTrees.map(([x, z]) => ({ x, z, s: 1.0 + R() * 0.7 }))];
  allTrees.forEach((t) => { const r = R(); t.v = r < 0.42 ? 0 : r < 0.72 ? 1 : 2; });
  const trunkMat = pm('bark', { color: 0x5a4636, wet: 0.6 });
  const canopyMat = pm('canopy', { color: 0xffffff, rough: 0.7, wet: 0.4, side: THREE.DoubleSide });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true });
  const leafUni = { uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color(0) }, uWetAmt: { value: 0.3 }, extra: { tLeaf: { value: makeLeafAtlas() } } };
  leafMat.customProgramCacheKey = () => 'leaves';
  leafMat.onBeforeCompile = (shader) => patchMaterial(shader, PROC.leaves, leafUni, '', VERT.leaves);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  out.trees = { trunks: [], canopies: [], leaves: [] };
  CROWNS.forEach((cr, vi) => {
    const list = allTrees.filter((t) => t.v === vi), nV = list.length;
    if (!nV) return;
    const trunks = new THREE.InstancedMesh(buildTrunk(cr), trunkMat, nV), canopies = new THREE.InstancedMesh(buildCanopy(cr), canopyMat, nV);
    list.forEach((t, i) => {
      e.set(0, R() * 6.28, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(t.x, GY, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunks.setMatrixAt(i, m4); canopies.setMatrixAt(i, m4);
      canopies.setColorAt(i, col.setHSL(0.24 + (R() - 0.5) * 0.08, 0.55 + R() * 0.15, 0.42 + R() * 0.12));
      addCollider(t.x - 0.25, t.x + 0.25, t.z - 0.25, t.z + 0.25, -1, 4, 0);
    });
    for (const m of [trunks, canopies]) { m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.computeBoundingSphere(); m.layers.enable(1); scene.add(m); }
    // leaf cards: alpha-tested (+ alpha-to-coverage under MSAA), sharing the trees' instance matrices/colours
    const leaves = new THREE.InstancedMesh(makeLeafCards(cr.blobs.map(([r, x, y, z]) => ({ r, x, y, z })), ctx.q?.foliage ?? 1, 4441 + vi * 97), leafMat, nV);
    leaves.instanceMatrix = canopies.instanceMatrix; leaves.instanceColor = canopies.instanceColor;
    leaves.castShadow = false; leaves.receiveShadow = true; leaves.matrixAutoUpdate = false; leaves.updateMatrix(); leaves.computeBoundingSphere(); scene.add(leaves);
    out.trees.trunks.push(trunks); out.trees.canopies.push(canopies); out.trees.leaves.push(leaves);
  });


  // ---------------------------------------------------------------- small furniture (merged)
  const K = new Kit();
  const steel = M.steel, dark = pm('plastic', { color: 0x1a1c1e, rough: 0.5, wet: 1 }), wood = pm('woodfurn', { color: 0x8a5a2f, col2: 0x4a2c12, wet: 1 });
  const green = pm('paint', { color: 0x1f4a34, rough: 0.5, wet: 1 });
  const red = pm('paint', { color: 0xb02020, rough: 0.4, wet: 1 });
  const blue = pm('paint', { color: 0x1c3f8a, rough: 0.4, wet: 1 });
  const bench = (x, z, ry) => {
    const b = new Kit();
    // slatted seat and back with gaps, cast-iron ends with scrolled arm rests and a centre brace
    for (let i = 0; i < 5; i++) b.box(wood, 1.8, 0.038, 0.085, 0, 0.44, -0.2 + i * 0.1, { r: 0.012, seg: 3 });
    for (let i = 0; i < 4; i++) b.box(wood, 1.8, 0.07, 0.03, 0, 0.6 + i * 0.095, -0.28 - i * 0.02, { rx: -0.2, r: 0.01, seg: 3 });
    for (const s of [-1, 1]) {
      b.box(dark, 0.05, 0.43, 0.06, s * 0.84, 0, -0.26, { r: 0.008 }); b.box(dark, 0.05, 0.43, 0.06, s * 0.84, 0, 0.2, { r: 0.008 });
      b.box(dark, 0.05, 0.05, 0.6, s * 0.84, 0.42, -0.04, { r: 0.012 });
      b.strut(dark, [s * 0.84, 0.43, -0.28], [s * 0.86, 0.95, -0.42], 0.024, 0.02, { seg: 8 });
      b.box(dark, 0.06, 0.05, 0.5, s * 0.84, 0.66, -0.05, { r: 0.02, rx: 0.05 });
      b.strut(dark, [s * 0.84, 0.45, 0.2], [s * 0.84, 0.66, 0.16], 0.02, 0.02, { seg: 8 });
      b.torus(dark, 0.06, 0.012, s * 0.84, 0.55, 0.2, { rx: 0, ry: Math.PI / 2, seg: 14, seg2: 5 });
      for (const zz of [-0.4, 0.28]) b.box(steel, 0.09, 0.012, 0.09, s * 0.84, 0, zz, { r: 0.004 });
    }
    b.box(dark, 1.62, 0.03, 0.03, 0, 0.2, -0.04);
    F.finish(scene, b, x, GY, z, ry);
    F.colBox(x, z, ry ? 0.6 : 1.9, ry ? 1.9 : 0.6, 0, -1, 1, 0);
  };
  const bin = (x, z) => {
    K.lathe(green, [[0, 0.05], [0.2, 0.05], [0.235, 0.09], [0.245, 0.85], [0.23, 0.87], [0, 0.87]], x, GY, z, { seg: 18 });
    for (const yy of [0.15, 0.45, 0.78]) K.torus(dark, 0.242, 0.012, x, GY + yy, z, { rx: Math.PI / 2, seg: 20, seg2: 5 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; K.box(steel, 0.02, 0.5, 0.008, x + Math.cos(a) * 0.245, GY + 0.22, z + Math.sin(a) * 0.245, { ry: -a + Math.PI / 2 }); }   // perforated strips
    K.lathe(dark, [[0.235, 0.86], [0.27, 0.87], [0.27, 0.92], [0.12, 0.98], [0.1, 0.99], [0.0, 0.99]], x, GY, z, { seg: 18 });          // domed lid
    K.torus(steel, 0.12, 0.01, x, GY + 0.985, z, { rx: Math.PI / 2, seg: 16, seg2: 5 });
    K.box(dark, 0.3, 0.02, 0.12, x, GY + 0.0, z, { r: 0.006 });
    F.colBox(x, z, 0.5, 0.5, 0, -1, 1, 0);
  };
  const hydrant = (x, z) => {
    K.lathe(red, [[0, 0], [0.16, 0], [0.17, 0.04], [0.13, 0.07], [0.115, 0.15], [0.12, 0.5], [0.135, 0.56], [0.13, 0.6], [0.0, 0.6]], x, GY, z, { seg: 16 });
    K.lathe(red, [[0.0, 0.6], [0.11, 0.6], [0.125, 0.66], [0.09, 0.72], [0.0, 0.76]], x, GY, z, { seg: 16 });
    K.cyl(steel, 0.03, 0.03, 0.05, x, GY + 0.76, z, { seg: 6 });
    for (const sg of [-1, 1]) {
      K.cyl(red, 0.055, 0.055, 0.2, x + sg * 0.16, GY + 0.36, z, { rz: Math.PI / 2, cy: true, seg: 12 });
      K.cyl(steel, 0.05, 0.05, 0.025, x + sg * 0.27, GY + 0.36, z, { rz: Math.PI / 2, cy: true, seg: 6 });
      K.torus(steel, 0.06, 0.008, x + sg * 0.245, GY + 0.36, z, { rx: 0, ry: Math.PI / 2, seg: 12, seg2: 4 });
    }
    K.cyl(red, 0.075, 0.075, 0.17, x, GY + 0.34, z + 0.16, { rx: Math.PI / 2, cy: true, seg: 12 });
    K.cyl(steel, 0.07, 0.07, 0.022, x, GY + 0.34, z + 0.26, { rx: Math.PI / 2, cy: true, seg: 6 });
    K.torus(steel, 0.08, 0.008, x, GY + 0.34, z + 0.24, { rx: 0, seg: 12, seg2: 4 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.cyl(steel, 0.01, 0.01, 0.018, x + Math.cos(a) * 0.14, GY + 0.045, z + Math.sin(a) * 0.14, { seg: 6 }); }
    K.torus(steel, 0.11, 0.006, x, GY + 0.55, z, { rx: Math.PI / 2, seg: 16, seg2: 4 });
  };
  const bollard = (x, z) => { K.cyl(dark, 0.07, 0.07, 0.9, x, GY, z, { seg: 10 }); K.cyl(pm('plain', { color: 0xffffff, emissive: 0xffd9a0, emissiveI: 0.8 }), 0.072, 0.072, 0.05, x, GY + 0.8, z, { seg: 10 }); F.colBox(x, z, 0.2, 0.2, 0, -1, 1, 0); };
  const rack = (x, z, ry) => { const r = new Kit(); for (let i = 0; i < 5; i++) { r.tube(steel, [[i * 0.4, 0, 0], [i * 0.4, 0.75, 0], [i * 0.4 + 0.0, 0.85, 0.0], [i * 0.4 + 0.0, 0.85, 0.0]], 0.02, { seg: 6, radial: 6 }); } r.cyl(steel, 0.02, 0.02, 1.7, 0.8, 0.02, 0.0, { rz: Math.PI / 2, cy: true, seg: 6 }); F.finish(scene, r, x, GY, z, ry); };
  const meter = (x, z) => {
    K.cyl(steel, 0.03, 0.036, 1.1, x, GY, z, { seg: 10 });
    K.cyl(steel, 0.05, 0.05, 0.02, x, GY, z, { seg: 10 });
    K.box(dark, 0.15, 0.27, 0.11, x, GY + 1.08, z, { r: 0.035, seg: 4 });
    K.box(pm('plain', { color: 0x111111, emissive: 0x88ff88, emissiveI: 1.2 }), 0.09, 0.05, 0.005, x, GY + 1.27, z + 0.056);
    K.box(steel, 0.05, 0.028, 0.006, x, GY + 1.2, z + 0.056, { r: 0.004 });                            // coin slot plate
    K.box(pm('plain', { color: 0x1a2a4a, rough: 0.2, metal: 0.3 }), 0.12, 0.03, 0.09, x, GY + 1.345, z, { r: 0.006, rx: -0.3 });   // solar cell
    K.box(green, 0.09, 0.05, 0.006, x, GY + 1.14, z + 0.056, { r: 0.004 });
  };
  const mailbox = (x, z) => { K.box(blue, 0.5, 0.95, 0.42, x, GY, z, { r: 0.05 }); K.cyl(blue, 0.21, 0.21, 0.5, x, GY + 0.95, z, { rz: Math.PI / 2, cy: true, seg: 14 }); F.colBox(x, z, 0.55, 0.45, 0, -1, 1.4, 0); };
  const news = (x, z, c) => { K.box(pm('paint', { color: c, rough: 0.4, wet: 1 }), 0.5, 1.0, 0.45, x, GY, z, { r: 0.03 }); K.box(pm('plain', { color: 0xc8d4d8, metal: 0.4, rough: 0.05 }), 0.4, 0.35, 0.02, x, GY + 0.55, z + 0.225); F.colBox(x, z, 0.55, 0.5, 0, -1, 1.2, 0); };
  // place them along the avenue & cross-street sidewalks
  for (const z of [10.2, -10.2]) for (const x of [-140, -100, -30, 40, 88, 130]) { bin(x + (R() - 0.5) * 3, z * (R() < 0.5 ? 0.98 : 1)); }
  for (const [x, z] of [[-9.6, 8.8], [9.6, -8.8], [8.8, 9.6], [-8.8, -9.6]]) hydrant(x, z);
  for (let i = 0; i < 12; i++) { const s = R() < 0.5 ? 1 : -1; const x = -120 + R() * 240; if (Math.abs(x) < 14) continue; hydrant(x, s * 8.2); }
  for (let x = -120; x <= 120; x += 6) { if (Math.abs(x) < 16) continue; meter(x, 8.1); }
  for (let z = 22; z < 120; z += 6.2) { meter(7.6, z); meter(-7.6, z); meter(7.6, -z); meter(-7.6, -z); }
  for (const x of [-8.8, 8.8]) for (const z of [-8.8, 8.8]) { bollard(x * 1.0 + (x > 0 ? 1.3 : -1.3), z * 1.0); }
  mailbox(11.5, 8.4); mailbox(-11.5, -8.4); news(30, 11.1, 0x2a5a9a); news(-90, -8.0, 0xc03030); news(60, -11.2, 0x2a8a4a);
  for (const [x, z, ry] of [[24, 10.4, 0], [-84, 10.4, 0], [-30, -10.4, Math.PI], [52, -10.4, Math.PI], [-10.4, 30, Math.PI / 2], [10.4, -34, -Math.PI / 2], [10.4, 60, -Math.PI / 2]]) bench(x, z, ry);
  for (const [x, z, ry] of [[-92, 8.6, 0], [46, 8.6, 0], [21, -8.6, 0]]) rack(x, z, ry);
  // street sign blades at the corners
  const signTex = (txt) => canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#12503a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6); c.fillStyle = '#fff'; c.font = '700 28px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 1); });
  const signs = new THREE.Group();
  for (const [x, z, t1, t2] of [[8.9, 8.9, 'MERIDIAN AVE', 'HARBOR ST'], [-8.9, -8.9, 'MERIDIAN AVE', 'HARBOR ST']]) {
    K.cyl(steel, 0.035, 0.035, 3.3, x, GY, z, { seg: 8 });
    for (const [t, ry, y] of [[t1, 0, 3.1], [t2, Math.PI / 2, 3.4]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshStandardMaterial({ map: signTex(t), roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x228855, emissiveMap: signTex(t), emissiveIntensity: 0.25 })); m.position.set(x, y, z); m.rotation.y = ry; signs.add(m); }
  }
  scene.add(signs);
  K.mesh(scene, { reflect: true });

  // ---------------------------------------------------------------- bus shelter (avenue, south sidewalk)
  {
    const bx = 74, bz = 10.0;
    const b = new Kit();
    b.box(steel, 3.8, 0.07, 1.6, 0, 2.55, 0, { r: 0.02 });
    for (const sx of [-1, 1]) b.box(dark, 0.07, 2.55, 0.07, sx * 1.75, 0, -0.7);
    b.box(dark, 3.7, 0.08, 0.07, 0, 0.0, -0.7);
    b.box(dark, 3.7, 0.5, 0.05, 0, 0.85, -0.74);      // seat back
    b.box(wood, 2.6, 0.06, 0.4, 0.2, 0.45, -0.5, { r: 0.01 });
    const ad = canvasTex(256, 384, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff5d8a'); g.addColorStop(0.6, '#7a5cff'); g.addColorStop(1, '#2ad4ff'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.95)'; c.font = '800 46px Arial Black, Arial'; c.textAlign = 'center'; c.fillText('NEON', w / 2, 120); c.fillText('GRID', w / 2, 175); c.font = '500 22px Arial'; c.fillText('the city never sleeps', w / 2, 230); c.beginPath(); c.arc(w / 2, 310, 40, 0, 7); c.fill(); });
    F.finish(scene, b, bx, GY, bz, 0);
    const adMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.7), new THREE.MeshBasicMaterial({ map: ad, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    adMesh.position.set(bx + 1.2, GY + 1.25, bz - 0.68); scene.add(adMesh);
    const adB = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.7), adMesh.material); adB.position.set(bx + 1.2, GY + 1.25, bz - 0.72); adB.rotation.y = Math.PI; scene.add(adB);
    const glassBack = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshPhysicalMaterial({ color: 0x9ab8c4, transparent: true, opacity: 0.16, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false }));
    glassBack.position.set(bx - 0.65, GY + 1.55, bz - 0.7); scene.add(glassBack);
    LightPool.add({ pos: new THREE.Vector3(bx, GY + 2.3, bz), color: 0xe8f0ff, intensity: 45, distance: 8, priority: 1.1, on: true });
    F.colBox(bx, bz - 0.7, 3.8, 0.3, 0, -1, 2.5, 0);
    out.busStop = { x: bx, z: bz + 1.3 };
  }

  // ---------------------------------------------------------------- steam vents
  const ventPts = [[3.5, -3.2], [-14.5, 3.6], [-3.2, 34], [16, -4.5]];
  const vk = new Kit();
  const stripe = pm('paint', { color: 0xe8611a, rough: 0.6 });
  for (const [x, z] of ventPts) {
    vk.cyl(stripe, 0.22, 0.32, 1.1, x, ROAD_Y, z, { seg: 12 });
    vk.cyl(pm('paint', { color: 0xf0f0e8, rough: 0.6 }), 0.235, 0.29, 0.14, x, ROAD_Y + 0.5, z, { seg: 12 });
    vk.cyl(dark, 0.25, 0.25, 0.04, x, ROAD_Y + 1.1, z, { seg: 12 });
    const p = new GpuParticles(scene, { count: 26, life: 4.2, size0: 0.4, size1: 2.6, vel: [0.2, 1.1, 0.05], spread: 0.22, gravity: 0.12, alpha: 0.42, origin: [x, ROAD_Y + 1.15, z], color: 0xffffff });
    out.steam.push(p);
  }
  vk.mesh(scene, { reflect: true });
  for (const [x, z] of ventPts) addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, -1, 1.2, 0);

  const stoneM = pm('marble', { color: 0x1c1d20, col2: 0xb59a63, wet: 1 });
  // ---------------------------------------------------------------- Meridian Tower entrance plaza (x -64..-16, z 12..20)
  {
    const pk = new Kit();
    for (const x of [-62, -18]) { pk.box(stoneM, 2.6, 0.6, 2.6, x, GY, 16.3, { r: 0.04 }); pk.box(pm('plain', { color: 0x1a1108, rough: 1 }), 2.4, 0.02, 2.4, x, GY + 0.6, 16.3); addCollider(x - 1.3, x + 1.3, 15, 17.6, -1, 1, 0); }
    // long bench-planters
    for (const x of [-54, -47, -33, -26]) { pk.box(stoneM, 4.5, 0.5, 1.2, x, GY, 14.2, { r: 0.03 }); pk.box(wood, 4.3, 0.06, 0.5, x, GY + 0.5, 14.0, { r: 0.01 }); addCollider(x - 2.25, x + 2.25, 13.6, 14.8, -1, 1, 0); }
    // sculpture: stacked brass rings
    const brass = M.brass;
    for (let i = 0; i < 6; i++) pk.torus(brass, 0.9 - i * 0.1, 0.05, -40, GY + 1.0 + i * 0.32, 15.5, { rx: Math.PI / 2 + i * 0.08, rz: i * 0.25, seg: 40, seg2: 8 });
    pk.cyl(stoneM, 0.7, 0.8, 0.8, -40, GY, 15.5, { seg: 24 }); addCollider(-41, -39, 14.5, 16.5, -1, 3, 0);
    // low uplights
    for (let x = -60; x <= -18; x += 3.5) pk.box(pm('plain', { color: 0x050505, emissive: 0xffd39a, emissiveI: 2.8 }), 0.16, 0.06, 0.16, x, GY, 19.5);
    pk.mesh(scene, { reflect: true });
    for (const [x, z] of [[-54, 17], [-26, 17]]) LightPool.add({ pos: new THREE.Vector3(x, 2.6, z), color: 0xffd6a0, intensity: 40, distance: 12, priority: 1.1, on: true });
    for (const x of [-56, -22]) for (const z of [24, 34]) { /* tree planters inside lobby handled there */ }
    // trees in the plaza
    for (const x of [-58, -22]) { /* covered by street trees */ }
  }

  // ---------------------------------------------------------------- Central Green park (block -1,-1)
  {
    const cx = -60, cz = -60;
    // grass
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), pm('grass', { color: 0xffffff, rough: 0.9, wet: 0.5 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(cx, WALK_Y + 0.012, cz); grass.receiveShadow = true; grass.layers.enable(1);
    scene.add(grass);
    // paths on the ground material (plaza pavers)
    const pathMesh = (w, d, x, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), ground); m.position.set(x, WALK_Y + 0.02, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); };
    pathMesh(96, 3.4, cx, cz); pathMesh(3.4, 96, cx, cz);
    pathMesh(130, 3.0, cx, cz, Math.PI / 4); pathMesh(130, 3.0, cx, cz, -Math.PI / 4);
    // fountain plaza
    const fk = new Kit();
    const fstone = pm('marble', { color: 0xd8d4c8, col2: 0x8a8578, physical: true, clearcoat: 0.3, wet: 1 });
    fk.cyl(fstone, 8.6, 8.6, 0.16, cx, GY, cz, { seg: 64 });
    fk.cyl(fstone, 5.6, 5.6, 0.72, cx, GY, cz, { seg: 64, open: false });
    fk.torus(fstone, 5.5, 0.22, cx, GY + 0.72, cz, { rx: Math.PI / 2, seg: 64, seg2: 12 });
    fk.cyl(fstone, 0.9, 1.5, 1.4, cx, GY + 0.1, cz, { seg: 24 });
    fk.cyl(fstone, 2.2, 0.9, 0.3, cx, GY + 1.5, cz, { seg: 32 });
    fk.cyl(fstone, 0.3, 0.5, 1.4, cx, GY + 1.8, cz, { seg: 16 });
    fk.mesh(scene, { reflect: true });
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.3, 64), pm('water', { color: 0xffffff, rough: 0.03, wet: 0 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, GY + 0.58, cz); water.layers.enable(1); scene.add(water);
    addCollider(cx - 5.8, cx + 5.8, cz - 5.8, cz + 5.8, -1, 1.2, 0);
    const jets = [];
    jets.push(new GpuParticles(scene, { count: 90, life: 1.7, size0: 0.14, size1: 0.3, vel: [0, 5.6, 0], spread: 0.55, gravity: -9.8, alpha: 0.42, origin: [cx, GY + 2.3, cz], color: 0xd8f0ff }));
    jets.push(new GpuParticles(scene, { count: 60, life: 2.2, size0: 0.3, size1: 1.0, vel: [0, 0.6, 0], spread: 0.6, gravity: 0.1, alpha: 0.25, origin: [cx, GY + 0.7, cz], color: 0xe8f4ff }));
    out.jets = jets;
    // benches around + park lamps
    for (let a = 0; a < 8; a++) { const th = (a / 8) * Math.PI * 2 + 0.2, r = 10.2; bench(cx + Math.cos(th) * r, cz + Math.sin(th) * r, -th + Math.PI / 2); }
    const lk = new Kit(); const lampH = pm('plain', { color: 0x1a1a1a, emissive: 0xffe6b8, emissiveI: 0 }); out.parkLampMat = lampH;
    const lampPts = [];
    for (let a = 0; a < 10; a++) { const th = (a / 10) * Math.PI * 2, r = 16; lampPts.push([cx + Math.cos(th) * r, cz + Math.sin(th) * r]); }
    for (const t of [-1, 1]) for (const k of [-32, 32]) { lampPts.push([cx + t * 32, cz + k * 0.0 + k * 1]); }
    for (const [x, z] of lampPts) {
      lk.cyl(dark, 0.05, 0.08, 3.6, x, GY, z, { seg: 8 }); lk.cyl(dark, 0.1, 0.12, 0.4, x, GY, z, { seg: 8 });
      lk.sph(lampH, 0.2, x, GY + 3.75, z, { seg: 12, seg2: 8 });
      lk.cyl(dark, 0.22, 0.05, 0.12, x, GY + 3.9, z, { seg: 12 });
      const e = LightPool.add({ pos: new THREE.Vector3(x, GY + 3.6, z), color: 0xffe0b0, intensity: 200, distance: 22, on: false, priority: 1.05 });
      (out.parkLights = out.parkLights || []).push(e);
      glow.add(x, GY + 3.75, z, 0xffe6b8, 0, 0.3, 0, 100); out.parkGlow = out.parkGlow || []; out.parkGlow.push(glow.count - 1);
    }
    lk.mesh(scene, { reflect: true });
    // corner cafe pavilion
    const ck = new Kit();
    const px = -29, pz = -24;
    ck.box(stoneM, 22, 0.25, 12, px, GY, pz, {});
    ck.box(wood, 22, 0.2, 12.4, px, GY + 3.9, pz, { r: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ck.box(M.blackMetal, 0.2, 3.9, 0.2, px + sx * 10.5, GY + 0.25, pz + sz * 5.5);
    ck.box(pm('woodfurn', { color: 0xb08050, col2: 0x5a3820, wet: 1 }), 8, 0.05, 0.6, px - 4, GY + 1.0, pz - 5.7, { r: 0.01 });
    ck.box(M.marbleD, 8, 1.0, 0.9, px - 4, GY + 0.25, pz - 5.4, {});
    for (let i = 0; i < 8; i++) { const tx = px - 8 + (i % 4) * 4.6, tz = pz + 1.6 + Math.floor(i / 4) * 2.6; ck.cyl(M.blackMetal, 0.4, 0.4, 0.03, tx, GY + 0.95, tz, { seg: 18 }); ck.cyl(M.blackMetal, 0.03, 0.03, 0.7, tx, GY + 0.25, tz, { seg: 6 }); for (const s of [-1, 1]) { ck.box(M.blackMetal, 0.36, 0.03, 0.36, tx + s * 0.7, GY + 0.72, tz, { r: 0.006 }); } }
    ck.mesh(scene, { reflect: true });
    const cw = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshPhysicalMaterial({ color: 0x9db8c2, transparent: true, opacity: 0.12, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false }));
    cw.position.set(px, GY + 1.95, pz + 6.0); scene.add(cw);
    LightPool.add({ pos: new THREE.Vector3(px, GY + 3.3, pz), color: 0xffd6a0, intensity: 150, distance: 18, priority: 1.1, on: true });
    LightPool.add({ pos: new THREE.Vector3(px - 4, GY + 2.2, pz - 3.8), color: 0xffcf90, intensity: 90, distance: 10, priority: 1.1, on: true });
    const cs = pm('plain', { color: 0x050505, emissive: 0xffd39a, emissiveI: 3 });
    const ls = new Kit(); for (let i = 0; i < 10; i++) ls.sph(cs, 0.09, px - 9 + i * 2, GY + 3.7, pz + 5.9, { seg: 8, seg2: 6 }); ls.mesh(scene, { cast: false });
    addCollider(px - 11, px + 11, pz - 6.2, pz - 4.6, -1, 3, 0);
    out.cafe = { x: px, z: pz };
  }

  out.update = (dt, t) => {
    // ambient tint for steam/spray sprites, and lamp switching
    const A = G.u;
    const tint = new THREE.Color().copy(A.uHorizon.value).multiplyScalar(0.7).add(A.uZenith.value.clone().multiplyScalar(0.3)).add(A.uCityGlow.value.clone().multiplyScalar(5));
    tint.r = clamp(tint.r + 0.15, 0, 1.2); tint.g = clamp(tint.g + 0.15, 0, 1.2); tint.b = clamp(tint.b + 0.15, 0, 1.2);
    for (const s of out.steam) s.tint(tint);
    for (const j of out.jets) j.tint(tint);
    const on = clamp(Math.max(A.uNight.value, 1 - (G.atmo ? G.atmo.day : 1)), 0, 1);
    out.parkLampMat.emissiveIntensity = on * 8;
    const flag = on > 0.25;
    for (const e of out.parkLights) e.on = flag;
    for (const i of out.parkGlow) glow.setIntensity(i, on * 14);
  };
  return out;
}
