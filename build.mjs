// Bundles the whole game (three.js included) into ONE self-contained HTML file: dist/larper48.html
// Usage: npm run build   (needs `npm install` once for esbuild)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.join(root, p);
const result = await build({
  entryPoints: [r('src/main.js')],
  bundle: true, write: false, format: 'iife', minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8',
  alias: { three: r('vendor/three/three.module.js'), 'three/addons': r('vendor/three/addons') },
  logLevel: 'info',
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(r('src/ui/style.css'), 'utf8').replace(/\s*\n\s*/g, '\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Larper 48</title>
<style>${css}</style></head>
<body><div id="app"><canvas id="gl" tabindex="0"></canvas><div id="ui"></div></div>
<script>${js}</script></body></html>`;
fs.mkdirSync(r('dist'), { recursive: true });
fs.writeFileSync(r('dist/larper48.html'), html);
// Keep the same file URL for existing browser saves. This is the full, updated
// game, NOT a redirect (file:// localStorage can be keyed by the full path).
fs.writeFileSync(r('dist/floor48.html'), html);
console.log(`\n  dist/larper48.html  ${(html.length / 1024 / 1024).toFixed(2)} MB  - double-click it to play\n`);
