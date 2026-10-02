// Builds the desktop app: bundles the game (node build.mjs) then packages it with Electron into release/Floor48-<platform>-<arch>/
// Usage: npm run package        (output: release/Floor48-win32-x64/Floor48.exe on Windows)
import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const run = spawnSync(process.execPath, [path.join(root, 'build.mjs')], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status);

// only the shell and the single-file game ship; sources, tools, vendor and dev dependencies stay out
const keep = ['/package.json', '/electron', '/dist'];
const ignore = (p) => p !== '' && !keep.some((k) => p === k || p.startsWith(k + '/'));
const dest = path.join(root, 'release');
const out = await packager({
  dir: root, out: dest, name: 'Floor48', appVersion: '1.0.0', overwrite: true, prune: false, asar: true, ignore,
  platform: process.env.F48_PLATFORM || process.platform, arch: process.env.F48_ARCH || process.arch,
  appCopyright: 'Floor 48', win32metadata: { ProductName: 'Floor 48', FileDescription: 'Floor 48', OriginalFilename: 'Floor48.exe' },
});
for (const d of out) console.log('\n  packaged ->', path.relative(root, d));
const exe = path.join(out[0], process.platform === 'win32' ? 'Floor48.exe' : 'Floor48');
if (fs.existsSync(exe)) console.log('  run it: ' + path.relative(root, exe) + '\n');
