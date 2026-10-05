// Renderer-independent state machine; all movement waits for fully closed doors.
import { APT_Y } from './consts.js';
export const ELEVATOR = Object.freeze({ x: -26, z: 36.4, halfWidth: 1.1, depth: 2.1, levels: [0, APT_Y] });
export function inCab(pos, margin = 0) {
  return Math.abs(pos.x - ELEVATOR.x) <= ELEVATOR.halfWidth - margin &&
    pos.z >= ELEVATOR.z + 0.08 + margin && pos.z <= ELEVATOR.z + ELEVATOR.depth - margin;
}
export function safeElevatorPosition(pos) {
  if (!inCab(pos)) return { ...pos };
  const level = pos.level === 0 ? 0 : 1;
  return { ...pos, x: Math.max(-26.75, Math.min(-25.25, pos.x)),
    z: Math.max(36.85, Math.min(38.15, pos.z)), y: ELEVATOR.levels[level], level };
}

export function createElevatorMotion({ player, position = () => {}, display = () => {}, ding = () => {}, start = () => {}, stop = () => {}, toast = () => {} }) {
  const E = { level: 1, y: APT_Y, doors: 0, openDoors: true, busy: false, moving: false, riding: null, remote: null };
  const setY = (y) => { E.y = y; position(y); };
  const atDoor = (p) => p && p.level === E.level && Math.abs(p.pos.y - E.y) < 1 &&
    Math.abs(p.pos.x - ELEVATOR.x) < ELEVATOR.halfWidth + p.radius &&
    p.pos.z > ELEVATOR.z - p.radius - 0.16 && p.pos.z < ELEVATOR.z + ELEVATOR.depth + p.radius;
  E.reset = (level = 1) => {
    if (E.riding) { const p = player(); p.lock = Math.max(0, p.lock - 1); stop(); }
    E.level = level === 0 ? 0 : 1;
    E.riding = E.remote = null; E.busy = E.moving = false; E.doors = 0; E.openDoors = true;
    setY(ELEVATOR.levels[E.level]); display(E.level ? '48' : 'L', 0);
  };
  E.call = (to) => {
    if (![0, 1].includes(to) || E.busy) return false;
    if (to === E.level) { E.openDoors = true; return true; }
    if (atDoor(player())) { toast('Step clear of the elevator before calling it away.'); return false; }
    E.busy = true; E.openDoors = false;
    E.remote = { phase: 'closing', t: 0, from: E.level, to };
    toast('Elevator arriving...');
    return true;
  };
  E.ride = (to) => {
    const p = player();
    if (![0, 1].includes(to) || to === E.level || E.busy || E.doors < 0.95 || !p || p.lock > 0 || p.sit ||
        p.level !== E.level || Math.abs(p.pos.y - E.y) > 0.35 || !inCab(p.pos, p.radius + 0.02)) return false;
    E.busy = true; E.openDoors = false; p.lock++;
    p.vel?.set(0, 0, 0);
    E.riding = { phase: 'closing', t: 0, from: E.level, to };
    return true;
  };
  E.update = (dt) => {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const target = E.openDoors && !E.moving ? 1 : 0;
    E.doors += (target - E.doors) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(E.doors - target) < 0.004) E.doors = target;
    const r = E.riding || E.remote;
    if (!r) return;
    const p = player();
    if (r.phase === 'closing') {
      if (E.remote && atDoor(p)) { E.remote = null; E.busy = false; E.openDoors = true; return; }
      if (E.doors === 0) { r.phase = 'moving'; r.t = 0; E.moving = true; start(); }
    } else if (r.phase === 'moving') {
      r.t += dt;
      const progress = Math.min(1, r.t / (E.riding ? 10.5 : 5.5));
      const e = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      setY(ELEVATOR.levels[r.from] + (ELEVATOR.levels[r.to] - ELEVATOR.levels[r.from]) * e);
      if (E.riding) p.pos.y = E.y;
      const floor = 1 + Math.round(E.y / APT_Y * 47);
      display(String(floor), r.to > r.from ? 1 : -1);
      if (progress === 1) {
        r.phase = 'opening'; E.moving = false; E.level = r.to; E.openDoors = true;
        if (E.riding) p.level = r.to;
        display(r.to ? '48' : 'L', 0); ding(); stop();
      }
    } else if (r.phase === 'opening' && E.doors >= 0.95) {
      if (E.riding) p.lock = Math.max(0, p.lock - 1);
      E.riding = E.remote = null; E.busy = false;
    }
  };
  return E;
}
