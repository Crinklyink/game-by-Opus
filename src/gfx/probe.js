// Interior reflection probe: a small cube map captured at the middle of the apartment, one
// face per frame, then prefiltered (PMREM) as ambient light for interior materials, while the
// raw cube (box-projected in the glass/floor shaders) supplies sharp room reflections.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { setInteriorEnv } from './materials.js';
import { glassUniforms } from './glass.js';

export class InteriorProbe {
  constructor(renderer, scene, pos, boxMin, boxMax, size = 128) {
    this.r = renderer; this.scene = scene;
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cam = new THREE.CubeCamera(0.1, 900, this.rt);
    this.cam.position.copy(pos);
    this.pos = pos.clone();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.env = null;
    this.face = 0;
    this.cycle = 0;
    this.timer = 0;
    const gu = glassUniforms();
    gu.uProbe.value = this.rt.texture;
    gu.uBoxMin.value.copy(boxMin); gu.uBoxMax.value.copy(boxMax); gu.uProbePos.value.copy(pos);
    this.gu = gu;
    this.busy = true;    // capture right away
    this.interval = 1.4;
    this.first = true;
  }

  // call every frame while the player is in the apartment. `force` recaptures everything immediately.
  update(dt, active, force = false) {
    if (!active) return;
    this.timer += dt;
    if (force || this.first) { this.busy = true; this.face = 0; }
    else if (!this.busy && this.timer > this.interval) { this.busy = true; this.face = 0; }
    if (!this.busy) return;
    const per = (force || this.first) ? 6 : 1;
    const r = this.r;
    const prevTarget = r.getRenderTarget();
    const sm = r.shadowMap, au = sm.autoUpdate;
    sm.autoUpdate = false;
    this.cam.updateMatrixWorld();
    for (let k = 0; k < per && this.face < 6; k++, this.face++) {
      const c = this.cam.children[this.face];
      c.layers.set(0);
      r.setRenderTarget(this.rt, this.face);
      r.render(this.scene, c);
    }
    sm.autoUpdate = au;
    r.setRenderTarget(prevTarget);
    if (this.face >= 6) {
      this.busy = false; this.timer = 0; this.first = false;
      const rt = this.pmrem.fromCubemap(this.rt.texture);
      if (this.env) this.env.dispose();
      this.env = rt;
      setInteriorEnv(rt.texture);
      this.gu.uProbeOn.value = 1;
    }
  }
}
