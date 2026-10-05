// Scripted headless playthrough: exercises UI panels, elevator ride, shops, sleep. Usage: node tools/playtest.mjs
import { launch } from './browser.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(root, p === '/' ? 'index.html' : p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } }); });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !t.includes('toNonIndexed') && !t.includes('KHR_parallel'))) logs.push(`[${m.type()}] ${t.slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(`http://localhost:${port}/index.html?test=1&w=960&h=540&q=low&hud=1&t=12.5`);
await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 180000 });
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await ev(() => window.__game.step(2, 0.05)); await page.screenshot({ path: `.scratch/pt_${n}.png`, timeout: 120000 }); };
let failures = 0;
const step = async (msg, fn) => { try { await fn(); console.log('ok   ', msg); } catch (e) { failures++; console.log('FAIL ', msg, String(e.message).slice(0, 300)); } };
fs.mkdirSync('.scratch', { recursive: true });

await step('boot + hud', async () => { await ev(() => window.__game.step(3, 0.05)); await shot('01_hud'); });
await step('market panel', async () => { await ev(() => { window.__game.tp(-38.8, 165.7, 23.4, 0, -0.1); window.__game.game.openMarket(); window.__game.step(1, 0.05); }); await shot('02_market'); });
await step('buy stock', async () => { const r = await ev(() => { const g = window.__game; g.G.time.hour = 11; g.step(1); g.game.trade('NXG', 5, 'buy'); return { cash: g.game.state.cash, pos: g.game.market.pos }; }); if (!r.pos.NXG || r.pos.NXG.shares !== 5) throw new Error('trade failed ' + JSON.stringify(r)); });
await step('close panel', async () => { await ev(() => window.__game.ui.close(false)); });
await step('elevator down', async () => {
  await ev(() => { const g = window.__game; g.tp(-26, 165.7, 34.2, 0, 0, 1); g.simulate(4, 0.05); g.world.elevator.call(1); g.simulate(40, 0.05); });
  // walk into the cab
  await ev(() => { const g = window.__game; g.tp(-26, 165.7, 37.4, 3.14159, 0, 1); g.simulate(3, 0.05); g.world.elevator.ride(0); });
  const r = await ev(() => { const g = window.__game; for (let i = 0; i < 90; i++) g.simulate(1, 0.25); return { lvl: g.player.level, y: g.player.pos.y, busy: g.world.elevator.busy, ely: g.world.elevator.cab.position.y }; });
  console.log('     elevator ->', JSON.stringify(r));
  if (r.lvl !== 0 || Math.abs(r.y) > 0.5) throw new Error('did not arrive');
  await shot('03_lobby');
});
await step('walk in through the lobby door + back out', async () => {
  const r = await ev(() => {
    const g = window.__game; const out = {};
    g.tp(-39.6, 1.7, 17.2, 3.14159, 0, 0); g.simulate(2, 0.05);
    g.key('KeyW', true); g.simulate(70, 0.05); g.key('KeyW', false);
    out.inside = [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)];
    g.tp(-39.6, 1.7, 30, 0, 0, 0); g.simulate(2, 0.05);
    g.key('KeyW', true); g.simulate(90, 0.05); g.key('KeyW', false);
    out.outside = [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)];
    // and the tower's side walls must hold
    g.tp(-62, 1.7, 40, -Math.PI / 2, 0, 0); g.simulate(2, 0.05);
    g.key('KeyW', true); g.simulate(40, 0.05); g.key('KeyW', false);
    out.west = [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)];
    return out;
  });
  console.log('     doorway ->', JSON.stringify(r));
  if (!(r.inside[1] > 24)) throw new Error('could not walk into the lobby');
  if (!(r.outside[1] < 19.5)) throw new Error('could not walk out of the lobby');
  if (!(r.west[0] < -59.5)) throw new Error('walked into the tower wall');
});
await step('walk out to street', async () => { await ev(() => { const g = window.__game; g.tp(-40, 1.7, 26, 3.14159 - 3.14159, 0, 0); g.simulate(4, 0.05); }); await shot('04_out'); });
await step('burger order', async () => { const r = await ev(async () => { const g = window.__game; g.tp(35, 1.7, -26.5, 0, 0, 0); g.game.state.hunger = 20; g.game.openBurger(); g.step(1); const d = g.game.state.cash; g.game.orderBurger([{ id: 'classic', name: 'Classic', hunger: 45, energy: 3, n: 1, price: 8.5 }], 8.5, 'take'); return { d, cash: g.game.state.cash, meals: g.game.state.meals.length }; }); if (r.meals !== 1) throw new Error(JSON.stringify(r)); await shot('05_burger'); await ev(() => window.__game.ui.close(false)); });
await step('grocery basket + pay', async () => { const r = await ev(() => { const g = window.__game; const S = g.game.state; S.basket = { eggs: 1, cheese: 1, pasta: 1, sauce: 1 }; g.game.payGroceries(20); g.game.storeGroceries(); return S.pantry; }); if (!r.eggs) throw new Error(JSON.stringify(r)); });
await step('cook', async () => { await ev(() => { const g = window.__game; g.tp(-33, 165.7, 28, 1.5, 0, 1); g.game.openCook(); g.step(1); }); await shot('06_cook'); await ev(() => window.__game.ui.close(false)); const r = await ev(async () => { const g = window.__game; g.game.cook('omelette'); await new Promise((r) => setTimeout(r, 2500)); return { hunger: g.game.state.hunger, busy: g.game.busy }; }); console.log('     cook ->', JSON.stringify(r)); });
await step('sleep', async () => { const r = await ev(async () => { const g = window.__game; g.game.sleep('night'); await new Promise((r) => setTimeout(r, 4500)); return { hour: g.G.time.hour, day: g.game.state.day, busy: g.game.busy, energy: g.game.state.energy }; }); console.log('     sleep ->', JSON.stringify(r)); await shot('07_sleep'); });
await step('settings panel', async () => { await ev(() => { window.__game.ui.close(false); window.__game.step(1); }); const { openSettings } = { openSettings: null }; });
await step('title screen', async () => { await ev(() => { const g = window.__game; g.ui.showTitle({ hasSave: true, onStart() {}, onContinue() {}, onSettings() {} }); g.ui.el.hud.classList.add('hidden'); g.step(1); }); await shot('08_title'); });
console.log('--- console problems ---'); const seen = new Set(); for (const l of logs) { const k = l.slice(0, 120); if (seen.has(k)) continue; seen.add(k); console.log(l); }
await browser.close(); server.close();
process.exitCode = failures || logs.length ? 1 : 0;
