import * as THREE from 'three';
import { G } from './core/G.js';
import { clamp, damp, nextFrame } from './core/util.js';
import { detectGPU, pickPreset, PRESETS } from './gfx/gpu.js';
import { createNoise3D } from './gfx/noise.js';
import { Atmosphere } from './gfx/sky.js';
import { PostFX } from './gfx/postfx.js';
import { pm } from './gfx/materials.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const canvas = document.getElementById('gl');
const ui = document.getElementById('ui');

function log(...a) { console.log('[floor48]', ...a); }

async function boot() {
  const gpu = detectGPU();
  G.gpu = gpu;
  G.params = params;
  G.test = TEST;
  if (!gpu.ok) { ui.innerHTML = '<div style="padding:40px;color:#fff;font:16px system-ui">WebGL2 is required. Please use a recent Chrome, Edge or Firefox with hardware acceleration enabled.</div>'; return; }
  const saved = (() => { try { return JSON.parse(localStorage.getItem('floor48.settings') || '{}'); } catch (e) { return {}; } })();
  const qKey = params.get('q') || saved.quality || 'auto';
  const q = pickPreset(gpu, qKey);
  G.q = q; G.qKey = qKey;
  log('GPU:', gpu.renderer, '| tier:', gpu.tier, '| preset:', q.id, '| samples:', q.msaa);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.info.autoReset = true;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 5000);
  camera.position.set(0, 1.7, 6);
  scene.add(camera);
  G.scene = scene; G.camera = camera;

  G.u.uNoise3.value = createNoise3D(64);
  const atmo = new Atmosphere(renderer, scene, q);
  G.atmo = atmo;
  const post = new PostFX(renderer, q);
  G.post = post;

  // ---------- resize handling ----------
  let scale = q.res;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
    let w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (params.has('w')) { w = +params.get('w'); h = +params.get('h') || Math.round(w * 9 / 16); }
    renderer.setSize(w, h, false);
    if (!params.has('w')) { canvas.style.width = '100%'; canvas.style.height = '100%'; } else { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.resize(w, h, scale);
  };
  resize();
  window.addEventListener('resize', resize);

  // ---------- test scene ----------
  const { buildTestScene } = await import('./world/testscene.js');
  buildTestScene(scene);

  G.time.hour = parseFloat(params.get('t') || '17.6');
  if (params.has('rain')) { G.weather.target = G.weather.rain = parseFloat(params.get('rain')); G.weather.wet = G.weather.rain > 0 ? 1 : 0; }

  const cam = { x: 0, y: 1.7, z: 6, yaw: 0, pitch: 0 };
  const applyCam = () => { camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ'); };
  if (params.has('cam')) { const c = params.get('cam').split(',').map(Number); Object.assign(cam, { x: c[0], y: c[1], z: c[2], yaw: c[3] || 0, pitch: c[4] || 0 }); }
  applyCam();

  let last = performance.now(), elapsed = 0, frames = 0;
  const focus = new THREE.Vector3();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed += dt; frames++;
    G.u.uTime.value = elapsed;
    applyCam();
    camera.updateMatrixWorld();
    focus.copy(camera.position);
    atmo.update(dt, elapsed, focus);
    for (const s of G.systems) s.update(dt, elapsed);
    post.render(scene, camera, dt, elapsed, { glass: false });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = {
    G, cam, applyCam, renderer, scene, camera, post, atmo,
    setTime: (h) => { G.time.hour = h; },
    setRain: (r) => { G.weather.target = r; G.weather.rain = r; G.weather.wet = r > 0 ? 1 : 0; },
    frames: () => frames,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs?.length }),
  };
  window.__ready = true;
  log('ready');
}

boot().catch((e) => { console.error('BOOT FAILED', e); window.__bootError = String(e && e.stack || e); });
