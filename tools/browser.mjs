// Shared browser launcher for the dev tools. Uses the machine's real Chrome/Edge + real GPU by default;
// set SOFT=1 to force the SwiftShader software renderer (CI / no GPU).
import { chromium } from 'playwright-core';
export async function launch() {
  const soft = process.env.SOFT === '1';
  const args = soft
    ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox']
    : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit', '--disable-gpu-vsync'];
  if (process.env.BROWSER_PATH) return chromium.launch({ executablePath: process.env.BROWSER_PATH, args, headless: true });
  for (const channel of soft ? [undefined] : ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch({ channel, args, headless: true }); } catch (e) { if (channel === undefined) throw e; }
  }
}
