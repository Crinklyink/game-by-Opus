import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import identity from '../electron/identity.cjs';
import { createElevatorMotion, ELEVATOR, safeElevatorPosition } from '../src/world/elevator-motion.js';
import { SAVE_KEY, SETTINGS_KEY, CONTINUE_KEY, BACKUP_KEY, exportBackup, importBackup } from '../src/systems/storage.js';
import { Player } from '../src/systems/player.js';
import { Game } from '../src/systems/game.js';
import { G } from '../src/core/G.js';
import { InteriorProbe } from '../src/gfx/probe.js';
import { PostFX } from '../src/gfx/postfx.js';

function lift() {
  const p = { pos: { x: -26, y: ELEVATOR.levels[1], z: 37.4 }, level: 1, radius: 0.3, lock: 0 };
  const e = createElevatorMotion({ player: () => p });
  const advance = (seconds) => { for (let i = 0; i < seconds * 60; i++) e.update(1 / 60); };
  advance(2);
  return { p, e, advance };
}

test('ride is rejected outside the cab, at the threshold, while closed, or at the same floor', () => {
  const { p, e } = lift();
  assert.equal(e.ride(1), false);
  p.pos.x = -24; assert.equal(e.ride(0), false);
  p.pos.x = -26; p.pos.z = 36.5; assert.equal(e.ride(0), false);
  p.pos.z = 37.4; e.doors = 0; assert.equal(e.ride(0), false);
  assert.equal(p.lock, 0);
});

test('round-trip waits for doors, carries the player, rejects spam, and releases only its own lock', () => {
  const { p, e, advance } = lift();
  for (const target of [0, 1]) {
    const y = e.y;
    assert.equal(e.ride(target), true);
    assert.equal(e.ride(target), false);
    assert.equal(e.call(target), false);
    assert.equal(p.lock, 1);
    advance(0.5); assert.equal(e.y, y); assert.equal(e.moving, false);
    advance(2); assert.equal(e.moving, true); assert.equal(e.doors, 0);
    p.lock++; // e.g. another cutscene owns a lock
    advance(14);
    assert.equal(e.level, target); assert.equal(p.level, target);
    assert.equal(p.pos.y, ELEVATOR.levels[target]); assert.equal(e.y, p.pos.y);
    assert.equal(p.lock, 1); assert.equal(e.busy, false); assert(e.doors >= 0.95);
    p.lock--;
  }
});

test('remote calls close first and will not send an occupied cab away', () => {
  const { p, e, advance } = lift();
  assert.equal(e.call(0), false);
  p.pos = { x: -26, y: 0, z: 34 }; p.level = 0;
  assert.equal(e.call(0), true);
  advance(0.5); assert.equal(e.y, ELEVATOR.levels[1]);
  advance(10); assert.equal(e.level, 0); assert.equal(e.busy, false); assert.equal(p.lock, 0);
});

test('mid-ride saves snap to a reachable landing and reset clears transient locks', () => {
  const { p, e, advance } = lift();
  e.ride(0); advance(6);
  assert(p.pos.y > 0 && p.pos.y < ELEVATOR.levels[1]);
  const pos = safeElevatorPosition({ ...p.pos, yaw: 0.4, level: p.level });
  assert.equal(pos.y, ELEVATOR.levels[1]); assert.equal(pos.level, 1);
  e.reset(pos.level); assert.equal(p.lock, 0); assert.equal(e.busy, false); assert.equal(e.y, pos.y);
  const street = { x: 0, y: 0.16, z: 0, level: 0 };
  assert.deepEqual(safeElevatorPosition(street), street);
});

class MemoryStorage {
  data = new Map();
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
const fixture = () => ({ state: { v: 1, cash: 1724.5 }, market: { prices: [['NXG', 10, 10]] },
  pos: { x: -26, y: 0, z: 37.4, yaw: 0, level: 0 } });
test('legacy storage IDs remain stable; save/settings transfer retains previous data', () => {
  assert.equal(SAVE_KEY, 'floor48.save.v1'); assert.equal(SETTINGS_KEY, 'floor48.settings'); assert.equal(CONTINUE_KEY, 'floor48.continue');
  const old = new MemoryStorage(), target = new MemoryStorage();
  old.setItem(SAVE_KEY, JSON.stringify(fixture())); old.setItem(SETTINGS_KEY, '{"quality":"high","sens":1.4}');
  target.setItem(SAVE_KEY, 'previous-save');
  importBackup(exportBackup(old), target);
  assert.equal(target.getItem(SAVE_KEY), old.getItem(SAVE_KEY));
  assert.equal(target.getItem(SETTINGS_KEY), old.getItem(SETTINGS_KEY));
  assert.equal(JSON.parse(target.getItem(BACKUP_KEY)).save, 'previous-save');
  assert.equal(old.getItem(SAVE_KEY), target.getItem(SAVE_KEY));
  assert.throws(() => importBackup('{"format":"wrong"}', target));
  assert.equal(target.getItem(SAVE_KEY), old.getItem(SAVE_KEY));
});
test('failed import rolls back after a settings write', () => {
  const s = new MemoryStorage(); s.setItem(SAVE_KEY, 'original'); s.setItem(SETTINGS_KEY, '{}');
  const set = s.setItem.bind(s); let fail = true;
  s.setItem = (k, v) => { if (k === SAVE_KEY && fail) { fail = false; throw new Error('quota'); } set(k, v); };
  assert.throws(() => importBackup(JSON.stringify({ format: 'larper48-backup', version: 1, save: JSON.stringify(fixture()), settings: '{"quality":"low"}' }), s));
  assert.equal(s.getItem(SAVE_KEY), 'original'); assert.equal(s.getItem(SETTINGS_KEY), '{}');
});
test('desktop identity pins userData and sessionData independently of branding', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'larper-profile-'));
  const calls = [];
  try {
    identity.configureIdentity({ getPath: (k) => { assert.equal(k, 'appData'); return dir; }, setPath: (k, p) => calls.push([k, p]), setAppUserModelId: (id) => calls.push(['appId', id]) });
    assert.deepEqual(calls, [['userData', path.join(dir, 'Floor 48')], ['sessionData', path.join(dir, 'Floor 48')], ['appId', 'com.larper48.game']]);
    assert(fs.existsSync(calls[0][1]));
    assert.equal(identity.option('PAGE', { F48_PAGE: 'old' }), 'old');
    assert.equal(identity.option('PAGE', { F48_PAGE: 'old', L48_PAGE: 'new' }), 'new');
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('title-screen quality restart does not overwrite a save; failed in-game save does not reload', () => {
  const oldLocation = globalThis.location, oldSession = globalThis.sessionStorage;
  let reloads = 0, saves = 0;
  globalThis.location = { reload: () => reloads++ }; globalThis.sessionStorage = new MemoryStorage();
  try {
    const game = { ui: { started: false }, save: () => { saves++; return false; } };
    Game.prototype.applyQualityRestart.call(game);
    assert.equal(reloads, 1); assert.equal(saves, 0); assert.equal(sessionStorage.getItem(CONTINUE_KEY), null);
    game.ui.started = true; Game.prototype.applyQualityRestart.call(game);
    assert.equal(reloads, 1); assert.equal(saves, 1);
  } finally { globalThis.location = oldLocation; globalThis.sessionStorage = oldSession; }
});
test('camera follows platform height without ground snapping; long sprint steps cannot cross a thin wall', () => {
  const window0 = globalThis.window, document0 = globalThis.document;
  globalThis.window = { addEventListener() {} }; globalThis.document = { addEventListener() {} };
  const colliders = G.colliders, ui = G.ui;
  try {
    G.ui = null;
    const p = new Player(new THREE.PerspectiveCamera(), { addEventListener() {} });
    p.pos.set(0, 80, 0); p.lock = 1; p.groundY = () => 164.5; p.update(0.05);
    assert.equal(p.pos.y, 80); assert.equal(p.cam.position.y, 81.68);
    p.lock = 0; p.pos.set(0, 0, 0); p.groundY = () => 0;
    G.colliders = [{ on: true, lv: 1, minX: -2, maxX: 2, minZ: -0.65, maxZ: -0.6, minY: 0, maxY: 3 }];
    p.keys.KeyW = p.keys.ShiftLeft = true;
    p.update(0.25);
    assert(p.pos.z >= -0.30001, 'sprinted through the wall');
  } finally { G.colliders = colliders; G.ui = ui; globalThis.window = window0; globalThis.document = document0; }
});
test('reflection probe uses six distinct axis directions and generates mipmaps once per cycle', () => {
  const captures = [], restored = {};
  const renderer = { compile() {}, coordinateSystem: THREE.WebGLCoordinateSystem, shadowMap: { autoUpdate: true },
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: (rt, face) => { restored.rt = rt; restored.face = face; },
    render: (_scene, camera) => captures.push({ dir: camera.getWorldDirection(new THREE.Vector3()).toArray().map(Math.round), mipmaps: probe.rt.texture.generateMipmaps }) };
  const probe = new InteriorProbe(renderer, new THREE.Scene(), new THREE.Vector3(), new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1), 16);
  const env = { texture: new THREE.Texture() };
  probe.pmrem.fromCubemap = (_tex, previous) => { assert(previous === null || previous === env); return env; };
  probe.update(0.05, true);
  assert.equal(new Set(captures.map((x) => x.dir.join(','))).size, 6);
  assert.equal(captures.filter((x) => x.mipmaps).length, 1);
  assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(restored.rt, null);
  probe.update(0.05, true, true); assert.equal(probe.env, env);
});
test('resize reuses targets for unchanged dimensions and preserves exposure on scale changes', () => {
  const post = new PostFX({}, { res: 1, msaa: 0, bloomLevels: 2 });
  const target = post.rtScene, exposure = post.rtE0;
  post.first = false;
  post.resize(1280, 720, 1); assert.equal(post.rtScene, target);
  post.resize(1280, 720, 0.75); assert.notEqual(post.rtScene, target);
  assert.equal(post.rtE0, exposure); assert.equal(post.first, false);
  post.dispose();
});
test('canonical build and compatibility file match and carry new branding', () => {
  const canonical = fs.readFileSync(new URL('../dist/larper48.html', import.meta.url), 'utf8');
  const legacy = fs.readFileSync(new URL('../dist/floor48.html', import.meta.url), 'utf8');
  assert.equal(canonical, legacy);
  assert(canonical.includes('<title>Larper 48</title>')); assert(canonical.includes('LARPER <span>48</span>'));
  assert(!canonical.includes('[floor48]')); assert(!canonical.includes('<h2>Floor 48</h2>'));
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.name, 'larper-48'); assert.equal(pkg.productName, 'Larper 48');
});
