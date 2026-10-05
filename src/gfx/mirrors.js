// Real planar mirrors. Each mirror owns a plane (point + normal) and one or more quads on it (a wardrobe's two glass doors share
// one reflection). Every frame the nearest few mirrors that the camera can actually see are rendered with a reflected camera
// into a small half-float target, and the quads show that target through a projective lookup. Mirrors that are out of view
// keep their last picture and cost nothing. Quality scales with q.mirrors (render-target scale, 0 = off -> a dull silvered panel).
import * as THREE from 'three';
import { G } from '../core/G.js';

const VERT = /* glsl */`
uniform mat4 uTexMat;
varying vec4 vProj; varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vProj = uTexMat * w; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
uniform sampler2D tMirror; uniform vec2 uTexel; uniform float uOn; uniform vec3 uTint; uniform float uRound;
varying vec4 vProj; varying vec2 vUv;
void main(){
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = uRound > 0.5 ? 1.0 - smoothstep(0.46, 0.5, length(vUv - 0.5)) : smoothstep(0.0, 0.012, min(e.x, e.y));   // silvering fades out right at the cut edge
  vec3 c;
  if (uOn > 0.5) {
    vec2 uv = vProj.xy / vProj.w;
    c = texture2D(tMirror, uv).rgb * 0.5
      + texture2D(tMirror, uv + vec2( uTexel.x * 0.7,  uTexel.y * 0.7)).rgb * 0.125 + texture2D(tMirror, uv + vec2(-uTexel.x * 0.7,  uTexel.y * 0.7)).rgb * 0.125
      + texture2D(tMirror, uv + vec2( uTexel.x * 0.7, -uTexel.y * 0.7)).rgb * 0.125 + texture2D(tMirror, uv + vec2(-uTexel.x * 0.7, -uTexel.y * 0.7)).rgb * 0.125;
    c = min(c, vec3(24.0));
    if (any(isnan(c))) c = vec3(0.0);
  } else c = vec3(0.10, 0.11, 0.12);
  gl_FragColor = vec4(c * uTint * (0.35 + 0.65 * edge), 1.0);
}`;

export class MirrorSystem {
  constructor(renderer, q) {
    this.r = renderer; this.q = q;
    this.list = [];
    this.cam = new THREE.PerspectiveCamera();
    this.scale = q.mirrors ?? 0;
    this.max = 2;                      // mirrors re-rendered per frame
    this.range = 11;
    this._n = new THREE.Vector3(); this._c = new THREE.Vector3(); this._cp = new THREE.Vector3(); this._view = new THREE.Vector3(); this._look = new THREE.Vector3();
    this._tgt = new THREE.Vector3(); this._rot = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._qv = new THREE.Vector4();
    this._fr = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sp = new THREE.Sphere(); this._up = new THREE.Vector3(); this._rt = new THREE.Vector3();
    this.rendered = 0;
    G.mirrors = this;
  }

  // parent: Object3D the quads are added to. o: { pos:[x,y,z] (parent space), normal:[x,y,z], quads:[{ dx, dy, w, h, round }], res (long side px), tint, room:{x0,x1,y0,y1,z0,z1} }
  add(parent, o) {
    const n = new THREE.Vector3(...o.normal).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(n, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, n);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tMirror: { value: null }, uTexMat: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) }, uOn: { value: 0 }, uTint: { value: new THREE.Color(...(o.tint ?? [0.9, 0.93, 0.95])) }, uRound: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, toneMapped: false, fog: false,
    });
    const m = { parent, mat, meshes: [], res: o.res ?? 768, rt: null, room: o.room ?? null, localPos: new THREE.Vector3(...o.pos), localN: n, quat: q, radius: 0, size: new THREE.Vector2(), name: o.name || 'mirror', dynamic: !!o.dynamic };
    let maxd = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const quad of o.quads) {
      const geo = quad.round ? new THREE.CircleGeometry(quad.w / 2, 48) : new THREE.PlaneGeometry(quad.w, quad.h);
      if (quad.round) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const p = geo.attributes.position; uv.setXY(i, p.getX(i) / quad.w + 0.5, p.getY(i) / quad.w + 0.5); } }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.copy(q);
      mesh.position.copy(m.localPos).addScaledVector(right, quad.dx ?? 0).addScaledVector(up, quad.dy ?? 0);
      mesh.userData.mirror = m; mesh.frustumCulled = true;
      if (quad.round) mat.uniforms.uRound.value = 1;
      parent.add(mesh);
      m.meshes.push(mesh);
      minx = Math.min(minx, (quad.dx ?? 0) - quad.w / 2); maxx = Math.max(maxx, (quad.dx ?? 0) + quad.w / 2);
      miny = Math.min(miny, (quad.dy ?? 0) - (quad.h ?? quad.w) / 2); maxy = Math.max(maxy, (quad.dy ?? 0) + (quad.h ?? quad.w) / 2);
    }
    m.size.set(maxx - minx, maxy - miny);
    m.radius = Math.hypot(m.size.x, m.size.y) / 2;
    m.centerOff = new THREE.Vector3().copy(right).multiplyScalar((minx + maxx) / 2).addScaledVector(up, (miny + maxy) / 2);
    this.list.push(m);
    return m;
  }

  _ensureRT(m) {
    const long = Math.max(128, Math.round(m.res * this.scale));
    const asp = m.size.x / m.size.y;
    const w = asp >= 1 ? long : Math.max(128, Math.round(long * asp)), h = asp >= 1 ? Math.max(128, Math.round(long / asp)) : long;
    if (m.rt && m.rt.width === w && m.rt.height === h) return;
    if (m.rt) m.rt.dispose();
    m.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, samples: this.scale >= 0.8 ? Math.min(4, this.q.msaa || 0) : 0, generateMipmaps: false });
    m.mat.uniforms.tMirror.value = m.rt.texture;
    m.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  setScale(s) { this.scale = s; for (const m of this.list) { if (m.rt) { m.rt.dispose(); m.rt = null; m.mat.uniforms.uOn.value = 0; m.mat.uniforms.tMirror.value = null; } } }

  update(scene, camera) {
    this.rendered = 0;
    if (!this.scale) return;
    const camPos = this._cp.setFromMatrixPosition(camera.matrixWorld);
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._pm);
    const cands = [];
    for (const m of this.list) {
      m.parent.updateWorldMatrix(true, false);
      const wc = this._c.copy(m.localPos).applyMatrix4(m.parent.matrixWorld);
      const wn = this._n.copy(m.localN).transformDirection(m.parent.matrixWorld);
      const center = wc.clone().add(m.centerOff.clone().transformDirection(m.parent.matrixWorld).multiplyScalar(m.centerOff.length()));
      const dist = center.distanceTo(camPos);
      if (dist > this.range) continue;
      if (wn.dot(camPos.clone().sub(wc)) < 0.03) continue;                     // camera is behind the glass
      if (m.room) { const r = m.room; if (camPos.x < r.x0 || camPos.x > r.x1 || camPos.z < r.z0 || camPos.z > r.z1 || camPos.y < r.y0 || camPos.y > r.y1) continue; }
      this._sp.set(center, m.radius);
      if (!this._fr.intersectsSphere(this._sp)) continue;
      cands.push({ m, dist, wc: wc.clone(), wn: wn.clone() });
    }
    for (const m of this.list) if (!cands.some((c) => c.m === m)) { /* keep the last picture */ }
    cands.sort((a, b) => a.dist - b.dist);
    const todo = cands.slice(0, this.max);
    if (!todo.length) return;
    const r = this.r;
    const prevRT = r.getRenderTarget(), au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    // mirrors must not appear in their own reflection (feedback) - hide every mirror quad while capturing
    const visibility = this.list.flatMap((m) => m.meshes.map((mesh) => [mesh, mesh.visible]));
    for (const [mesh] of visibility) mesh.visible = false;
    try {
      for (const { m, wc, wn } of todo) {
        this._ensureRT(m);
        this._capture(scene, camera, m, wc, wn);
        m.mat.uniforms.uOn.value = 1; this.rendered++;
      }
    } finally {
      for (const [mesh, visible] of visibility) mesh.visible = visible;
      r.setRenderTarget(prevRT);
      r.shadowMap.autoUpdate = au;
    }
  }

  _capture(scene, camera, m, wc, wn) {
    const cam = this.cam, n = wn, rp = wc, cp = this._cp.setFromMatrixPosition(camera.matrixWorld);
    this._rot.extractRotation(camera.matrixWorld);
    const view = this._view.subVectors(rp, cp).reflect(n).negate().add(rp);
    const look = this._look.set(0, 0, -1).applyMatrix4(this._rot).add(cp);
    const tgt = this._tgt.subVectors(rp, look).reflect(n).negate().add(rp);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    cam.lookAt(tgt);
    cam.far = camera.far; cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    const tm = m.mat.uniforms.uTexMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane = the mirror plane, so the wall behind the glass never gets drawn
    const plane = this._plane.setFromNormalAndCoplanarPoint(n, rp).applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = cam.projectionMatrix, q = this._qv;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();
    const r = this.r;
    r.setRenderTarget(m.rt);
    r.clear();
    cam.layers.set(0);
    r.render(scene, cam);
  }
}
