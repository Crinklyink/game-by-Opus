// Headless screenshot harness (software GL). Usage:
//   node tools/shot.mjs "<query>" out.png [frames] [width] [height]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = '', out = '.scratch/shot.png', frames = '6', W = '960', H = '540'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.includes('[floor48]')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const url = `http://localhost:${port}/index.html?test=1&w=${W}&h=${H}&${query}`;
await page.goto(url);
try {
  await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__bootError);
  if (err) logs.push('BOOT ERROR: ' + err);
  else {
    await page.evaluate((n) => window.__game.step(n), +frames);
    await page.screenshot({ path: out, timeout: 120000 });
    logs.push('info: ' + JSON.stringify(await page.evaluate(() => window.__game.info())));
  }
} catch (e) { logs.push('HARNESS ERROR: ' + e.message); }
const seen = new Set(); const outl = [];
for (const l of logs) { const k = l.slice(0, 160); if (seen.has(k)) continue; seen.add(k); outl.push(l.length > 1800 ? l.slice(0, 1800) + ' ...' : l); }
console.log(outl.slice(0, 14).join('\n'));
await browser.close(); server.close();
