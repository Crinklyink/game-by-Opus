// Real rAF-loop throughput (vsync/frame cap disabled) on the real GPU. Usage: node tools/fps.mjs "<query>" [W] [H]
import { launch } from './browser.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = '', W = '1920', H = '1080'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(root, p === '/' ? 'index.html' : p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } }); });
await new Promise((r) => server.listen(0, r));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('pageerror', (e) => console.log('pageerror ' + e.message));
await page.goto(`http://localhost:${server.address().port}/index.html?${query}`);
await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 240000 });
await page.evaluate(() => window.__game.start({ fresh: true, lock: false }));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const spots = [['apt-window', [-40, 166.2, 24, 0, -0.05], 17.5], ['apt-in', [-40, 166.2, 27, 2.6, 0], 17.5], ['street-day', [0, 1.7, 12, 0.8, 0], 13], ['street-long', [10, 1.7, -8, -2.2, 0], 13], ['rain-night', [0, 1.7, 12, 0.8, 0], 21.5, 1], ['diner', [30, 1.7, -20, 1.6, 0], 13], ['grocery', [40, 1.7, 25, 1.6, 0], 13]];
for (const [name, cam, t, rain] of spots) {
  if (only && !only.includes(name)) continue;
  const r = await page.evaluate(async ([cam, t, rain]) => {
    const g = window.__game; g.setTime(t); g.lights(t < 7.2 || t > 17.5); g.setRain(rain || 0); g.tp(cam[0], cam[1], cam[2], cam[3], cam[4]);
    await new Promise((res) => setTimeout(res, 1500));
    const f0 = g.frames(), t0 = performance.now(); await new Promise((res) => setTimeout(res, 4000));
    return { fps: (g.frames() - f0) / ((performance.now() - t0) / 1000), info: g.info() };
  }, [cam, t, rain]);
  console.log(`${name.padEnd(13)} ${r.fps.toFixed(1).padStart(6)} fps  (${(1000 / r.fps).toFixed(1)} ms)  calls ${r.info.calls}`);
}
await browser.close(); server.close();
