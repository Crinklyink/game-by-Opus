// Procedural modelling kit. Everything is authored as primitives (bevelled boxes, lathes,
// tubes, extrusions, pillows, leaves...) and merged per material so a whole detailed
// room costs only a handful of draw calls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/G.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

export function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Kit {
  constructor() { this.g = new Map(); this.tris = 0; }

  push(mat, geo, m4) {
    if (geo.index) geo = geo.toNonIndexed();
    if (m4) geo.applyMatrix4(m4);
    // keep only attributes we need so merging never fails
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let arr = this.g.get(mat);
    if (!arr) this.g.set(mat, arr = []);
    arr.push(geo);
    this.tris += geo.attributes.position.count / 3;
    return geo;
  }

  // box: (x,z) centre, y = bottom. o: r (bevel), ry/rx/rz rotation (about its own centre), cy (true if y is centre)
  box(mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const r = o.r ?? 0;
    const geo = r > 0.0005 ? new RoundedBoxGeometry(w, h, d, o.seg ?? 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
    const cy = o.cy ? y : y + h / 2;
    return this.push(mat, geo, mat4(x, cy, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  // cylinder / cone: y = bottom
  cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 20, 1, o.open ?? false);
    return this.push(mat, geo, mat4(x, o.cy ? y : y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  sph(mat, r, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.SphereGeometry(r, o.seg ?? 20, o.seg2 ?? 14);
    return this.push(mat, geo, mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  }

  torus(mat, R, r, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.TorusGeometry(R, r, o.seg2 ?? 10, o.seg ?? 28);
    return this.push(mat, geo, mat4(x, y, z, o.rx ?? Math.PI / 2, o.ry || 0, o.rz || 0));
  }

  // lathe profile: array of [radius, y]
  lathe(mat, pts, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg ?? 28);
    return this.push(mat, geo, mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, 1, o.sz ?? 1));
  }

  // extrude a 2D shape (x,y in shape space) by depth along local +z, placed with base at (x,y,z)
  extrude(mat, shape, depth, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: o.bevel != null, bevelThickness: o.bevel ?? 0, bevelSize: o.bevel ?? 0, bevelSegments: 2, curveSegments: o.seg ?? 12 });
    return this.push(mat, geo, mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  // tube along points
  tube(mat, pts, r, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
    const geo = new THREE.TubeGeometry(curve, o.seg ?? 32, r, o.radial ?? 8, false);
    return this.push(mat, geo, null);
  }

  plane(mat, w, h, x, y, z, o = {}) {
    const geo = new THREE.PlaneGeometry(w, h, o.sw ?? 1, o.sh ?? 1);
    return this.push(mat, geo, mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  // superellipsoid cushion / pillow (bulges to a rounded box; e<1 boxier)
  pillow(mat, w, h, d, x, y, z, o = {}) {
    const e = o.e ?? 0.55;
    const geo = new THREE.SphereGeometry(1, o.seg ?? 24, o.seg2 ?? 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const sg = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
      px = sg(px) * w / 2; py = sg(py) * h / 2; pz = sg(pz) * d / 2;
      // centre dimple + slight seam pinch
      const rr = Math.sqrt((px / (w / 2)) ** 2 + (pz / (d / 2)) ** 2);
      py -= Math.sign(py) * (o.dimple ?? 0.06) * h * Math.max(0, 1 - rr);
      p.setXYZ(i, px, py, pz);
    }
    geo.computeVertexNormals();
    return this.push(mat, geo, mat4(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  // draped cloth: a plane with a height function (u,v in [0,1]) -> y offset; returns geometry
  cloth(mat, w, d, x, y, z, fn, o = {}) {
    const sw = o.sw ?? 48, sh = o.sh ?? 48;
    const geo = new THREE.PlaneGeometry(w, d, sw, sh);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5, v = p.getZ(i) / d + 0.5;
      p.setY(i, fn(u, v));
    }
    geo.computeVertexNormals();
    return this.push(mat, geo, mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0));
  }

  // merge everything into one mesh per material and add to parent
  mesh(parent, o = {}) {
    const out = [];
    for (const [mat, arr] of this.g) {
      const geo = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true;
      if (o.static !== false) { m.matrixAutoUpdate = false; m.updateMatrix(); }
      if (o.reflect) m.layers.enable(1);
      parent.add(m); out.push(m);
    }
    return out;
  }
}

export function addCollider(x0, x1, z0, z1, y0 = -1, y1 = 400, lv = 1) {
  const c = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), minY: y0, maxY: y1, lv, on: true };
  G.colliders.push(c);
  return c;
}

// heart/oval leaf geometry: u across (-1..1), v along (0..1). Curved droop, midrib fold. uv attr for vein shading.
export function leafGeometry(len, wid, droop = 0.4, fold = 0.25, seg = 10, heart = 0.0) {
  const cols = 6, rows = seg;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const wv = wid * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.85) * (1 + heart * Math.max(0, 0.25 - v) * 4);
    for (let i = 0; i <= cols; i++) {
      const u = (i / cols) * 2 - 1;
      const x = u * wv;
      const y = -droop * len * v * v + Math.abs(u) * wv * fold * 0.6;
      const z = v * len;
      pos.push(x, y, z); uv.push(i / cols, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
