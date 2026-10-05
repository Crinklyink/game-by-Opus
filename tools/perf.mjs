// GPU frame-time benchmark on the real GPU. Usage: node tools/perf.mjs "<query>" [W] [H]
// Runs a set of camera positions, syncing the GPU each frame (1px readPixels) and reporting ms/frame.
import { launch } from './browser.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = '', W = '1920', H = '1080'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(root, p === '/' ? 'index.html' : p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } }); });
await new Promise((r) => server.listen(0, r));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = []; page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[larper48] GPU')) logs.push(m.text().slice(0, 300)); }); page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto(`http://localhost:${server.address().port}/index.html?test=1&${query}`);
await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 240000 });
const spots = [
  ['apt-window', [-40, 166.2, 24, 0, -0.05], 17.5], ['apt-in', [-40, 166.2, 27, 2.6, 0], 17.5], ['apt-night', [-40, 166.2, 24, 0, 0], 22],
  ['street-day', [0, 1.7, 12, 0.8, 0], 13], ['street-long', [10, 1.7, -8, -2.2, 0], 13], ['street-night', [10, 1.7, -8, -2.2, 0], 21.5],
  ['rain-night', [0, 1.7, 12, 0.8, 0], 21.5, 1], ['diner', [30, 1.7, -20, 1.6, 0], 13], ['grocery', [40, 1.7, 25, 1.6, 0], 13],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; const out = [];
for (const [name, cam, t, rain] of spots) {
  if (only && !only.includes(name)) continue;
  const r = await page.evaluate(async ([cam, t, rain]) => {
    const g = window.__game; g.setTime(t); g.lights(t < 7.2 || t > 17.5); g.setRain(rain || 0); g.tp(cam[0], cam[1], cam[2], cam[3], cam[4]);
    const gl = g.renderer.getContext(), px = new Uint8Array(4);
    g.step(12); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const times = [];
    for (let i = 0; i < 20; i++) { const t0 = performance.now(); g.step(1, 1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b); return { med: times[10], p90: times[18], info: g.info() };
  }, [cam, t, rain]);
  out.push(`${name.padEnd(13)} ${r.med.toFixed(1).padStart(6)} ms (p90 ${r.p90.toFixed(1)})  calls ${r.info.calls}  tris ${(r.info.tris / 1e6).toFixed(2)}M`);
}
console.log(out.join('\n')); if (logs.length) console.log(logs.join('\n'));
await browser.close(); server.close();
