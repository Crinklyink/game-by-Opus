// Larper 48 desktop shell: a bare Chromium window with every GPU path switched on and no browser chrome,
// extensions, tab throttling or blocklist getting in the way of the WebGL2 renderer.
const { app, BrowserWindow, Menu, session, shell, dialog } = require('electron');
const path = require('node:path');
const { configureIdentity, option } = require('./identity.cjs');

// Must run before the single-instance lock, ready event, or any Session access.
configureIdentity(app);

const sw = app.commandLine.appendSwitch.bind(app.commandLine);
// ---- GPU: use the real (discrete) GPU through ANGLE/D3D11 and keep everything on it
sw('ignore-gpu-blocklist');               // Chrome blocklists some drivers; the game is built to tolerate them, so don't fall back to software
sw('enable-gpu-rasterization');
sw('enable-zero-copy');
sw('enable-webgl');
sw('force_high_performance_gpu');         // hybrid laptops: prefer the discrete GPU
if (process.platform === 'win32') sw('use-angle', 'd3d11');
else if (process.platform === 'darwin') sw('use-angle', 'metal');
// ---- scheduling: a game must never be throttled
sw('disable-renderer-backgrounding');
sw('disable-background-timer-throttling');
sw('disable-backgrounding-occluded-windows');
sw('autoplay-policy', 'no-user-gesture-required');   // audio engine starts without a gesture on reload / continue
sw('disable-features', 'CalculateNativeWinOcclusion,HardwareMediaKeyHandling,MediaSessionService');
if (option('UNCAPPED') === '1') { sw('disable-gpu-vsync'); sw('disable-frame-rate-limit'); }   // benchmarking only

app.disableDomainReliabilityReporting?.();
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, show: false, backgroundColor: '#05070b',
    title: 'Larper 48', autoHideMenuBar: true, fullscreenable: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, webgl: true,
      v8CacheOptions: 'bypassHeatCheck', spellcheck: false, enableWebSQL: false, devTools: !app.isPackaged || option('DEVTOOLS') === '1',
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); if (option('FULLSCREEN') === '1') win.setFullScreen(true); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if ((input.control || input.meta) && input.key.toLowerCase() === 'r' && app.isPackaged) e.preventDefault();   // an accidental reload would drop the unsaved game
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) e.preventDefault(); });
  win.webContents.on('render-process-gone', (_e, d) => { dialog.showErrorBox('Larper 48', `The renderer stopped (${d.reason}). Restart the game; if it keeps happening update your GPU driver.`); });
  const file = option('PAGE') ? path.resolve(option('PAGE')) : path.join(__dirname, '..', 'dist', 'larper48.html');
  win.loadFile(file, { search: option('QUERY') || '' });
}

app.whenReady().then(() => {
  // pointer lock + fullscreen are the only permissions the game needs
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'pointerLock' || perm === 'fullscreen'));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('gpu-info-update', () => { if (option('LOGGPU') === '1') console.log('[gpu]', JSON.stringify(app.getGPUFeatureStatus())); });
