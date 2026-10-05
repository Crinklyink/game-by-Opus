// Planar reflection of the world in a horizontal plane (wet streets). Renders a reduced-resolution
// mirrored view of everything on layer 1 into a half-float target that ground shaders sample.
import * as THREE from 'three';
import { G } from '../core/G.js';

export const LAYER_REFLECT = 1;

export class PlanarReflection {
  constructor(renderer, q) {
    this.r = renderer; this.q = q;
    this.rt = null;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(LAYER_REFLECT);
    this.textureMatrix = new THREE.Matrix4();
    this.planeY = 0;
    this.active = false;
    this.uniforms = { tPlanar: { value: null }, uPlanarMat: { value: this.textureMatrix }, uPlanarOn: { value: 0 } };
    this._n = new THREE.Vector3(0, 1, 0);
    this._rp = new THREE.Vector3(); this._cp = new THREE.Vector3(); this._view = new THREE.Vector3(); this._tgt = new THREE.Vector3();
    this._look = new THREE.Vector3(); this._rot = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._qv = new THREE.Vector4();
  }

  resize(w, h) {
    const s = this.q.planar || 0;
    const rw = Math.max(64, Math.round(w * s)), rh = Math.max(64, Math.round(h * s));
    if (s && this.rt?.width === rw && this.rt?.height === rh) return;
    if (this.rt) { this.rt.dispose(); this.rt = null; }
    this.uniforms.tPlanar.value = null;
    if (!s) return;
    this.rt = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true, samples: 0 });
    this.uniforms.tPlanar.value = this.rt.texture;
  }

  update(scene, camera, planeY, enable) {
    this.active = !!(enable && this.rt);
    this.uniforms.uPlanarOn.value = this.active ? 1 : 0;
    if (!this.active) return;
    const cam = this.cam, n = this._n, rp = this._rp.set(0, planeY, 0), cp = this._cp.setFromMatrixPosition(camera.matrixWorld);
    if (cp.y < planeY + 0.05) { this.uniforms.uPlanarOn.value = 0; return; }
    this._rot.extractRotation(camera.matrixWorld);
    const view = this._view.subVectors(rp, cp);
    view.reflect(n).negate().add(rp);
    const look = this._look.set(0, 0, -1).applyMatrix4(this._rot).add(cp);
    const tgt = this._tgt.subVectors(rp, look).reflect(n).negate().add(rp);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    cam.lookAt(tgt);
    cam.far = camera.far; cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near-plane clipping so nothing below the plane is drawn
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
    const prev = r.getRenderTarget(), au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    try {
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, cam);
    } finally {
      r.setRenderTarget(prev);
      r.shadowMap.autoUpdate = au;
    }
  }
}
