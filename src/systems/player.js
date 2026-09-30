// First-person controller: pointer-lock look (with drag fallback), circle-vs-AABB collision
// against G.colliders, stepping on kerbs, head-bob, sit poses, interaction picking.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { clamp, damp } from '../core/util.js';
import { Interact } from './interact.js';

const _fwd = new THREE.Vector3();

export class Player {
  constructor(camera, canvas) {
    this.cam = camera; this.canvas = canvas;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.level = 1;
    this.eye = 1.68; this.radius = 0.3;
    this.keys = Object.create(null);
    this.locked = false; this.dragLook = false; this.dragging = false;
    this.sens = 1;
    this.lock = 0;                 // >0 => movement disabled (cutscenes / menus)
    this.hover = null;
    this.sit = null; this.sitBlend = 0; this.sitFrom = null; this.standPos = null;
    this.bob = 0; this.stepAcc = 0; this.moving = 0; this.crouch = false;
    this.groundY = () => this.pos.y;
    this.surface = () => 'wood';
    this.onStep = null; this.onInteract = null;
    this.fov = 74;
    this.camPos = new THREE.Vector3();
    this.lean = 0;
    this._bind();
  }

  _bind() {
    const kd = (e) => {
      if (e.repeat && e.code !== 'KeyE') { /* ignore repeats except for E */ }
      this.keys[e.code] = true;
      if (G.ui && G.ui.modalOpen) return;
      if (e.code === 'KeyE' || e.code === 'Enter') this.interact();
      if (e.code === 'KeyC') this.crouch = !this.crouch;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    };
    const ku = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
    window.addEventListener('mousemove', (e) => {
      if (G.ui && G.ui.modalOpen) return;
      if (this.locked || (this.dragLook && this.dragging)) {
        this.yaw -= e.movementX * 0.0022 * this.sens;
        this.pitch = clamp(this.pitch - e.movementY * 0.0022 * this.sens, -1.5, 1.5);
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (G.ui && G.ui.modalOpen) return;
      if (G.ui && !G.ui.started) return;
      if (this.dragLook) { this.dragging = true; return; }
      if (!this.locked) this.requestLock();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && G.ui && G.ui.started && !G.ui.modalOpen && !G.ui.paused && !this.dragLook) G.ui.onLockLost?.();
    });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; this.locked = false; G.ui?.toast?.('Mouse capture unavailable here - drag with the mouse to look around.'); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.dragLook = true; });
    } catch (e) { this.dragLook = true; }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  teleport(x, y, z, yaw = this.yaw, level = this.level) {
    this.pos.set(x, y, z); this.yaw = yaw; this.level = level; this.vel.set(0, 0, 0);
    this.sit = null; this.sitBlend = 0;
  }

  interact() {
    if (this.lock > 0 && !this.sit) return;
    if (this.sit) { this.standUp(); return; }
    if (this.hover) { this.hover.act?.(); this.onInteract?.(this.hover); }
  }

  sitDown(pose) {
    if (this.sit) return;
    this.standPos = this.pos.clone();
    this.sit = pose; this.sitBlend = 0;
    this.sitFrom = { x: this.pos.x, y: this.pos.y + this.eye, z: this.pos.z };
    this.sitYaw0 = this.yaw;
  }
  standUp() {
    if (!this.sit) return;
    this.sit = null;
    if (this.standPos) this.pos.copy(this.standPos);
  }

  collide(px, pz) {
    const r = this.radius, y0 = this.pos.y, y1 = this.pos.y + this.eye;
    const cs = G.colliders;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (!c.on || (c.lv !== this.level && c.lv !== 2)) continue;
        if (y1 < c.minY + 0.05 || y0 + 0.36 > c.maxY) continue;
        if (px < c.minX - r || px > c.maxX + r || pz < c.minZ - r || pz > c.maxZ + r) continue;
        const cx = clamp(px, c.minX, c.maxX), cz = clamp(pz, c.minZ, c.maxZ);
        let dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; px += dx * k; pz += dz * k; }
          else {
            // centre inside the box: push out through the nearest face
            const l = px - c.minX, rr = c.maxX - px, t = pz - c.minZ, b = c.maxZ - pz;
            const m = Math.min(l, rr, t, b);
            if (m === l) px = c.minX - r; else if (m === rr) px = c.maxX + r; else if (m === t) pz = c.minZ - r; else pz = c.maxZ + r;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return [px, pz];
  }

  update(dt) {
    const k = this.keys;
    const cam = this.cam;
    const modal = G.ui && G.ui.modalOpen;

    // ---- look with arrow keys as a fallback ----
    if (!modal) {
      if (k.ArrowLeft) this.yaw += 1.8 * dt;
      if (k.ArrowRight) this.yaw -= 1.8 * dt;
      if (k.KeyQ && this.sit) { /* nothing */ }
    }

    if (this.sit) {
      this.sitBlend = Math.min(1, this.sitBlend + dt * 2.2);
      const s = this.sit, e = this.sitBlend * this.sitBlend * (3 - 2 * this.sitBlend);
      const x = this.sitFrom.x + (s.x - this.sitFrom.x) * e, y = this.sitFrom.y + (s.y - this.sitFrom.y) * e, z = this.sitFrom.z + (s.z - this.sitFrom.z) * e;
      // limit look to a cone around the seat direction
      let dyaw = this.yaw - s.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      dyaw = clamp(dyaw, -1.25, 1.25); this.yaw = s.yaw + dyaw;
      this.pitch = clamp(this.pitch, -0.9, 0.7);
      this.camPos.set(x, y, z);
      if (!modal && (k.KeyW || k.KeyS || k.KeyA || k.KeyD || k.Space) && this.sitBlend > 0.6) this.standUp();
    } else if (this.lock <= 0 && !modal) {
      // ---- walking ----
      const fw = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const rt = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      const sprint = (k.ShiftLeft || k.ShiftRight) && !this.crouch;
      const speed = this.crouch ? 1.5 : sprint ? 5.2 : 3.0;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      let wx = -sy * fw + cy * rt, wz = -cy * fw - sy * rt;
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
      const accel = len > 0 ? 14 : 10;
      this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
      let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      // resolve X then Z separately so we slide along walls
      let [rx, rz] = this.collide(nx, this.pos.z);
      this.pos.x = rx;
      [rx, rz] = this.collide(this.pos.x, nz);
      this.pos.z = rz;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.moving = sp / 5.2;
      this.bob += sp * dt * 1.9;
      this.stepAcc += sp * dt;
      if (this.stepAcc > (sprint ? 1.25 : 0.85)) { this.stepAcc = 0; this.onStep?.(this.surface(this.pos.x, this.pos.z), sprint ? 1.3 : 1); }
      const gy = this.groundY(this.pos.x, this.pos.z);
      this.pos.y = damp(this.pos.y, gy, 22, dt);
      const eyeT = this.crouch ? 1.08 : 1.68;
      this.eye = damp(this.eye, eyeT, 9, dt);
      const bobA = 0.022 * Math.min(1, this.moving * 1.4) * (sprint ? 1.4 : 1);
      this.lean = damp(this.lean, -rt * 0.012 * Math.min(1, this.moving * 2), 8, dt);
      this.camPos.set(this.pos.x + Math.cos(this.bob) * bobA * 0.6, this.pos.y + this.eye + Math.sin(this.bob * 2) * bobA, this.pos.z);
    } else {
      // locked or in a modal: keep the camera where it is, but hold the vertical eye position
      this.vel.multiplyScalar(0.8);
      this.camPos.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
      if (this.lock > 0) this.pos.y = damp(this.pos.y, this.groundY(this.pos.x, this.pos.z), 22, dt);
    }

    cam.position.copy(this.camPos);
    cam.rotation.set(this.pitch, this.yaw, this.lean, 'YXZ');
    cam.updateMatrixWorld();
    cam.fov = this.fov;

    // ---- interaction pick ----
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.hover = (this.lock > 0 && !this.sit) || modal ? null : Interact.pick(cam.position, _fwd);
    if (this.sit && !modal) this.hover = { label: () => 'Stand up', act: () => this.standUp() , isStand: true };
  }
}
