// Full bundled-game regressions. Build first; SOFT=1 is for machines without a GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { launch } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, '.scratch'), { recursive: true });
const browser = await launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = pathToFileURL(path.join(root, 'dist/larper48.html'));
  url.search = 'test=1&q=medium&w=640&h=360&t=12&cam=-40,166.18,27,0,0';
  const boot = async () => {
    await page.goto(url.href);
    await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 180000 });
    assert.equal(await page.evaluate(() => window.__bootError || null), null);
  };
  await boot();
  assert.equal(await page.title(), 'Larper 48');
  console.log('PASS branded standalone boot');
  const ride = await page.evaluate(() => {
    const g = window.__game, e = g.world.elevator;
    g.tp(-26, 166.18, 37.4, Math.PI, 0, 1); g.simulate(100, 0.02);
    if (!e.ride(0)) throw new Error('down ride rejected');
    let maxError = 0, closedBeforeMove = true;
    for (let i = 0; i < 900; i++) {
      g.simulate(1, 0.02);
      if (e.moving) {
        maxError = Math.max(maxError, Math.abs(g.camera.position.y - (e.y + g.player.eye)));
        closedBeforeMove &&= e.doors === 0;
      }
      if (i === 250) g.game.save();
    }
    const down = { level: e.level, player: g.player.level, lock: g.player.lock, y: g.player.pos.y };
    if (!e.ride(1)) throw new Error('up ride rejected ' + JSON.stringify({ down, pos: g.player.pos, doors: e.doors, busy: e.busy, riding: e.riding, energy: g.game.state.energy, blockers: g.G.colliders.filter(c => c.on && c.lv === 0 && c.minX < -25.7 && c.maxX > -26.3 && c.minZ < 37.7 && c.maxZ > 37.1 && c.minY < 1.7 && c.maxY > 0.36) }));
    g.simulate(900, 0.02);
    return { maxError, closedBeforeMove, down, up: { level: e.level, player: g.player.level, lock: g.player.lock, y: g.player.pos.y }, saved: JSON.parse(localStorage.getItem('floor48.save.v1')) };
  });
  assert(ride.maxError < 1e-6); assert(ride.closedBeforeMove);
  assert.deepEqual(ride.down, { level: 0, player: 0, lock: 0, y: 0 });
  assert.deepEqual(ride.up, { level: 1, player: 1, lock: 0, y: 164.5 });
  assert.equal(ride.saved.pos.y, 164.5);
  console.log('PASS bidirectional elevator, synchronized camera, closed doors, safe mid-ride save');
  // Emulate an October save (no elevator field) made in a ground-floor cab.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('floor48.save.v1'));
    delete save.elevator;
    save.pos = { x: -26, y: 0, z: 37.4, yaw: Math.PI, level: 0 };
    save.state.cash = 1234.56;
    localStorage.setItem('floor48.save.v1', JSON.stringify(save));
    localStorage.setItem('floor48.settings', JSON.stringify({ quality: 'medium', sens: 1.3, vMaster: 0.4 }));
  });
  url.searchParams.set('keep', '1'); url.searchParams.delete('cam');
  await boot();
  const restored = await page.evaluate(() => {
    const g = window.__game;
    g.simulate(100, 0.02);
    return { cash: g.game.state.cash, sens: g.game.settings.sens, volume: g.game.settings.vMaster,
      playerLevel: g.player.level, cabLevel: g.world.elevator.level, canRide: g.world.elevator.ride(1) };
  });
  assert.equal(restored.cash, 1234.56); assert.equal(restored.sens, 1.3); assert.equal(restored.volume, 0.4);
  assert.equal(restored.playerLevel, 0); assert.equal(restored.cabLevel, 0); assert(restored.canRide);
  console.log('PASS October-format save/settings and ground-floor cab restoration');
  await page.evaluate(() => { const g = window.__game; g.simulate(900, 0.02); g.tp(-40, 166.18, 27, 0, 0, 1); g.step(2, 0.05); });
  await page.screenshot({ path: path.join(root, '.scratch/regression-apartment.png'), timeout: 120000 });
  // Exercise actual mirror, wet-street and night shaders, not only the apartment.
  for (const [name, cam, time, rain] of [
    ['elevator', [-26, 166.18, 37.2, Math.PI, 0, 1], 18.4, 0],
    ['street-rain', [-40, 1.84, 5, 0, 0, 0], 18.4, 1],
    ['night', [-40, 166.18, 27, 0, 0, 1], 22, 0],
  ]) {
    await page.evaluate(({ cam, time, rain }) => { const g = window.__game; g.tp(...cam); g.setTime(time); g.setRain(rain); g.lights(true); g.step(2, 0.05); }, { cam, time, rain });
    await page.screenshot({ path: path.join(root, `.scratch/regression-${name}.png`), timeout: 120000 });
    console.log(`PASS rendered ${name}`);
  }
  await page.evaluate(() => { const g = window.__game; g.player.dragLook = true; g.ui.close(false); });
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => window.__game.ui.paused));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__game.ui.modalOpen), false);
  console.log('PASS drag-look pause and resume');
  assert.deepEqual(errors, [], 'browser/shader errors');
  console.log('PASS no console, shader or page errors');
} finally { await browser.close(); }
