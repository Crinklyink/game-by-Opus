// Several screenshots from ONE page load (shader compile + world build are the slow part in software GL).
// Usage: node tools/multishot.mjs "<query>" outPrefix '<json list>' [width] [height]
//   list item: { name, cam:[x,y,z,yaw,pitch], t:hour, lights:true|false, rain:0..1, frames:n, eval:"js", fov:deg }
import { launch } from './browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = '', prefix = '.scratch/m', listJson = '[]', W = '960', H = '540'] = process.argv.slice(2);
const shots = JSON.parse(listJson);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
fs.mkdirSync(path.dirname(prefix), { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.includes('[larper48]')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(`http://localhost:${port}/index.html?test=1&w=${W}&h=${H}&${query}`);
try {
  await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__bootError);
  if (err) logs.push('BOOT ERROR: ' + err);
  else {
    for (const s of shots) {
      await page.evaluate((s) => {
        const g = window.__game;
        if (s.t != null) { g.setTime(s.t); g.lights(s.lights ?? (s.t < 7.2 || s.t > 17.5)); }
        else if (s.lights != null) g.lights(s.lights);
        if (s.rain != null) g.setRain(s.rain);
        if (s.cam) g.tp(s.cam[0], s.cam[1], s.cam[2], s.cam[3] || 0, s.cam[4] || 0);
        if (s.fov) { g.player.fov = s.fov; }
      }, s);
      if (s.eval) { const r = await page.evaluate(s.eval); fs.writeFileSync(`${prefix}_${s.name}.txt`, typeof r === 'string' ? r : JSON.stringify(r, null, 1)); }
      await page.evaluate((n) => window.__game.step(n), s.frames ?? 10);
      await page.screenshot({ path: `${prefix}_${s.name}.png`, timeout: 280000 });
      logs.push('shot ' + s.name);
    }
    logs.push('info: ' + JSON.stringify(await page.evaluate(() => window.__game.info())));
  }
} catch (e) { logs.push('HARNESS ERROR: ' + e.message); }
const seen = new Set(); const outl = [];
for (const l of logs) { const k = l.slice(0, 160); if (seen.has(k)) continue; seen.add(k); outl.push(l.length > 1800 ? l.slice(0, 1800) + ' ...' : l); }
console.log(outl.slice(0, 80).join('\n'));
await browser.close(); server.close();
