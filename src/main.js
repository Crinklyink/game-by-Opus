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

  // ---------- world ----------
  const { GlowField } = await import('./gfx/glow.js');
  const glow = new GlowField(4096); G.glow = glow; scene.add(glow.mesh);
  const city = await import('./world/city.js');
  city.buildGround(scene); city.buildHills(scene);
  const sky = city.buildSkyline(scene, glow, q);
  city.buildTowerShell(scene, glow);
  log('skyline instances:', sky.count);
  const { LightPool } = await import('./gfx/lights.js');
  const pool = new LightPool(scene, q.lights); G.pool = pool;
  const { rng } = await import('./core/util.js');
  const { buildApartment } = await import('./world/apartment.js');
  const apt = buildApartment(scene, { rand: rng(99), glow }); G.apt = apt;
  const { InteriorProbe } = await import('./gfx/probe.js');
  const { APT_Y } = await import('./world/consts.js');
  const probe = q.probe ? new InteriorProbe(renderer, scene, new THREE.Vector3(-40, APT_Y + 1.5, 26), new THREE.Vector3(-49, APT_Y, 20.45), new THREE.Vector3(-31, APT_Y + 3.6, 32.4), 128) : null;
  const { updateScreens } = await import('./world/screens.js');
  log('colliders:', G.colliders.length, 'interactables:', (await import('./systems/interact.js')).Interact.items.length);

  G.time.hour = parseFloat(params.get('t') || '17.6');
  { const h = G.time.hour; apt.setAllLights(h < 7.2 || h > 17.5); }
  if (params.has('rain')) { G.weather.target = G.weather.rain = parseFloat(params.get('rain')); G.weather.wet = G.weather.rain > 0 ? 1 : 0; }

  const cam = { x: 0, y: 1.7, z: 6, yaw: 0, pitch: 0 };
  const applyCam = () => { camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ'); };
  if (params.has('cam')) { const c = params.get('cam').split(',').map(Number); Object.assign(cam, { x: c[0], y: c[1], z: c[2], yaw: c[3] || 0, pitch: c[4] || 0 }); }
  applyCam();

  let last = performance.now(), elapsed = 0, frames = 0;
  const focus = new THREE.Vector3();
  function tick(dt) {
    elapsed += dt; frames++;
    G.u.uTime.value = elapsed;
    applyCam();
    camera.updateMatrixWorld();
    focus.copy(camera.position);
    atmo.update(dt, elapsed, focus);
    for (const s of G.systems) s.update(dt, elapsed);
    pool.update(dt, camera.position);
    apt.update(dt, elapsed);
    updateScreens(dt, elapsed);
    const inApt = camera.position.y > APT_Y - 1 && camera.position.x > -60 && camera.position.x < -20 && camera.position.z > 10 && camera.position.z < 40;
    if (probe) probe.update(dt, inApt, frames === 2);
    glow.flush();
    post.render(scene, camera, dt, elapsed, { glass: true, expMin: 0.16, expKey: 0.19 });
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }
  if (!TEST) requestAnimationFrame(frame);

  window.__game = {
    G, cam, applyCam, renderer, scene, camera, post, atmo,
    setTime: (h) => { G.time.hour = h; },
    setRain: (r) => { G.weather.target = r; G.weather.rain = r; G.weather.wet = r > 0 ? 1 : 0; },
    frames: () => frames,
    step: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) tick(dt); return frames; },
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs?.length }),
  };
  window.__ready = true;
  log('ready');
}

boot().catch((e) => { console.error('BOOT FAILED', e); window.__bootError = String(e && e.stack || e); });
