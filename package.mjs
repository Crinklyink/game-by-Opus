// Builds the desktop app: bundles the game (node build.mjs) then packages it with Electron into release/Larper48-<platform>-<arch>/
// Usage: npm run package        (output: release/Larper48-win32-x64/Larper48.exe on Windows)
import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import identity from './electron/identity.cjs';
const { APP_ID, option } = identity;

const root = path.dirname(fileURLToPath(import.meta.url));
const run = spawnSync(process.execPath, [path.join(root, 'build.mjs')], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status || 1);

// only the shell and the single-file game ship; sources, tools, vendor and dev dependencies stay out
const keep = ['/package.json', '/electron', '/dist'];
const ignore = (p) => p !== '' && !keep.some((k) => p === k || p.startsWith(k + '/'));
const targetPlatform = option('PLATFORM') || process.platform;
const dest = path.join(root, 'release');
const out = await packager({
  dir: root, out: dest, name: 'Larper48', appVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, appBundleId: APP_ID, overwrite: true, prune: false, asar: true, ignore,
  platform: targetPlatform, arch: option('ARCH') || process.arch,
  appCopyright: 'Larper 48', win32metadata: { ProductName: 'Larper 48', FileDescription: 'Larper 48', OriginalFilename: 'Larper48.exe' },
});
for (const d of out) console.log('\n  packaged ->', path.relative(root, d));
for (const d of out) {
  const exe = targetPlatform === 'darwin' ? path.join(d, 'Larper48.app') : path.join(d, targetPlatform === 'win32' ? 'Larper48.exe' : 'Larper48');
  if (fs.existsSync(exe)) console.log('  run it: ' + path.relative(root, exe) + '\n');
}
