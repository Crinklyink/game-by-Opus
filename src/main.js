import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './core/G.js';
import { clamp, damp, nextFrame, rng } from './core/util.js';
import { detectGPU, pickPreset } from './gfx/gpu.js';
import { createNoise3D, canvasTex } from './gfx/noise.js';
import { pm } from './gfx/materials.js';
import { Atmosphere } from './gfx/sky.js';
import { PostFX } from './gfx/postfx.js';
import { GlowField } from './gfx/glow.js';
import { LightPool } from './gfx/lights.js';
import { PlanarReflection } from './gfx/planar.js';
import { InteriorProbe } from './gfx/probe.js';
import { setInteriorEnv } from './gfx/materials.js';
import * as city from './world/city.js';
import * as streetMod from './world/street.js';
import { buildBlocks } from './world/blocks.js';
import { buildProps } from './world/props.js';
import { Traffic } from './world/traffic.js';
import { People } from './world/people.js';
import { Weather } from './world/weather.js';
import { buildApartment } from './world/apartment.js';
import { buildElevator } from './world/elevator.js';
import { buildLobby } from './world/lobby.js';
import { buildBurger, buildGrocery } from './world/shops.js';
import { buildUpgrades } from './world/upgrades.js';
import { updateScreens } from './world/screens.js';
import { Kit, addCollider } from './world/kit.js';
import { APT_Y } from './world/consts.js';
import { Player } from './systems/player.js';
import { Game, loadSettings } from './systems/game.js';
import { zoneAt } from './systems/zones.js';
import { GameAudio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { showPause, openSettings } from './ui/panels.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const canvas = document.getElementById('gl');
const log = (...a) => console.log('[floor48]', ...a);

async function boot() {
  const ui = new UI(document.getElementById('ui'));
  G.ui = ui;
  const gpu = detectGPU();
  G.gpu = gpu; G.params = params; G.test = TEST;
  if (!gpu.ok) { ui.el.loading.innerHTML = '<h2>WebGL2 required</h2><p>Please use a recent Chrome, Edge or Firefox with hardware acceleration enabled.</p>'; return; }
  const settings = loadSettings();
  const qKey = params.get('q') || settings.quality || 'auto';
  const q = pickPreset(gpu, qKey);
  G.q = q; G.qKey = qKey;
  log('GPU:', gpu.renderer, '| tier:', gpu.tier, '| preset:', q.id, '| msaa:', q.msaa);
  ui.setLoading(0.02, 'Warming up the GPU');
  await nextFrame();

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.info.autoReset = false;
  G.renderer = renderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.08, 5000);
  scene.add(camera);
  G.scene = scene; G.camera = camera;
  G.u.uNoise3.value = createNoise3D(64);
  const atmo = new Atmosphere(renderer, scene, q); G.atmo = atmo;
  const post = new PostFX(renderer, q); G.post = post;
  const planar = new PlanarReflection(renderer, q); G.planar = planar;
  const glow = new GlowField(6144); G.glow = glow; scene.add(glow.mesh);
  const pool = new LightPool(scene, q.lights); G.pool = pool;
  atmo.dome.layers.enable(1); glow.mesh.layers.enable(1);
  const audio = new GameAudio(); G.audio = audio;
  // neutral warm "room" environment for interiors other than the apartment (which has its own live probe)
  const roomEnv = (() => {
    const sc = new THREE.Scene();
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 v; void main(){ float y = normalize(v).y; vec3 top = vec3(1.0,0.9,0.75)*1.1; vec3 mid = vec3(0.55,0.5,0.45)*0.7; vec3 bot = vec3(0.2,0.17,0.14)*0.5; vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.7)) : mix(mid, bot, pow(-y, 0.6)); gl_FragColor = vec4(c,1.0); }' });
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), m));
    const pm2 = new THREE.PMREMGenerator(renderer);
    const rt = pm2.fromScene(sc, 0.02, 1, 100);
    return rt.texture;
  })();
  setInteriorEnv(roomEnv); let envMode = 'room';

  // ---------------------------------------------------------------- resolution handling
  let scale = Math.min(q.res, settings.res || 1);
  let maxScale = scale;
  let dyn = settings.dyn && !TEST;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
    let w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (params.has('w')) { w = +params.get('w'); h = +params.get('h') || Math.round(w * 9 / 16); }
    renderer.setSize(w, h, false);
    if (params.has('w')) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; } else { canvas.style.width = '100%'; canvas.style.height = '100%'; }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.resize(w, h, scale);
    planar.resize(post.size.x, post.size.y);
  };
  resize();
  window.addEventListener('resize', resize);
  const setRes = (s, d) => { maxScale = Math.min(q.res, s); scale = maxScale; dyn = d && !TEST; resize(); };

  // ---------------------------------------------------------------- build the world
  const step = async (p, msg, fn) => { ui.setLoading(p, msg); await nextFrame(); const t0 = performance.now(); await fn(); log(msg, Math.round(performance.now() - t0) + 'ms'); };
  const W = {};
  const ctxB = { rand: rng(4711), mergeGeometries, canvasTex };
  await step(0.08, 'Raising the skyline', async () => {
    city.buildGround(scene); city.buildHills(scene);
    W.skyline = city.buildSkyline(scene, glow, q); W.skyline.meshes.forEach((m) => m.layers.enable(1));
    W.tower = city.buildTowerShell(scene, glow); W.tower.parts.forEach((m) => m.layers.enable(1));
  });
  await step(0.22, 'Laying the streets', async () => { W.street = streetMod.buildStreet(scene, glow, planar, ctxB); });
  await step(0.32, 'Building city blocks', async () => { W.blocks = buildBlocks(scene, glow); });
  await step(0.42, 'Planting trees and street furniture', async () => { W.props = buildProps(scene, glow, ctxB); });
  await step(0.5, 'Bringing in the people', async () => { W.people = new People(scene, q, {}); W.people.spawnWalkers(Math.round(34 * (q.peds ?? 1))); });
  await step(0.56, 'Starting traffic', async () => { W.traffic = new Traffic(scene, glow, q, {}); G.traffic = W.traffic; });
  await step(0.66, 'Furnishing the apartment', async () => { W.apt = buildApartment(scene, { rand: rng(99), glow }); G.apt = W.apt; });
  await step(0.76, 'Installing the elevator', async () => { W.elevator = buildElevator(scene); G.elevator = W.elevator; W.lobby = buildLobby(scene, { rand: rng(31) }); });
  await step(0.84, 'Opening the shops', async () => { W.shops = { burger: buildBurger(scene, glow, { rand: rng(51) }), grocery: buildGrocery(scene, glow, { rand: rng(52) }) }; });
  await step(0.9, 'Details and weather', async () => {
    W.weatherSys = new Weather(scene, q);
    W.upgrades = buildUpgrades(scene, W.apt, W.apt.kitchen || { coffeePos: new THREE.Vector3(-31.4, APT_Y + 0.926, 30.2) });
    const stone = pm('marble', { color: 0x18191b, col2: 0x8a7a52, wet: 1 });
    const bk = new Kit();
    bk.box(stone, 7.7, 7, 0.4, -56.15, 0, 20.2); bk.box(stone, 1.7, 7, 0.4, -20.85, 0, 20.2);
    bk.box(stone, 0.4, 7, 40, -59.8, 0, 40); bk.box(stone, 0.4, 7, 40, -20.2, 0, 40); bk.box(stone, 40, 7, 0.4, -40, 0, 59.8);
    bk.mesh(scene, { reflect: true });
    addCollider(-340, 340, -345, -335, -1, 400, 0); addCollider(-340, 340, 335, 345, -1, 400, 0); addCollider(-345, -335, -340, 340, -1, 400, 0); addCollider(335, 345, -340, 340, -1, 400, 0);
    addCollider(-60, -20, 20, 60, -1, 8, 0);      // the tower's solid base (the lobby door colliders open a way in)
  });

  // ---------------------------------------------------------------- player + systems
  const player = new Player(camera, canvas); G.player = player;
  player.groundY = (x, z) => (player.level === 1 ? APT_Y : streetMod.groundY(x, z));
  player.surface = (x, z) => {
    const zn = G.game?.zone?.name;
    if (zn === 'apartment' || zn === 'balcony') return z > 29 && x < -42 ? 'tile' : 'wood';
    if (zn === 'hall') return 'carpet'; if (zn === 'elevator') return 'metal';
    if (zn === 'lobby' || zn === 'burger' || zn === 'grocery') return 'tile';
    if (zn === 'park') return G.weather.wet > 0.4 ? 'wet' : 'grass';
    return G.weather.wet > 0.4 ? 'wet' : 'pave';
  };
  player.onStep = (surf, k) => audio.footstep(surf, k);
  player.fov = settings.fov; player.sens = settings.sens;
  const world = { ...W };
  const game = new Game({ ui, audio, player, world, post, atmo, camera });
  game.setRes = setRes;
  ui.onLockLost = () => { if (ui.started && !ui.modalOpen && !ui.paused) showPause(game); };
  const probe = q.probe ? new InteriorProbe(renderer, scene, new THREE.Vector3(-40, APT_Y + 1.5, 26), new THREE.Vector3(-49, APT_Y, 20.45), new THREE.Vector3(-31, APT_Y + 3.6, 32.4), 128) : null;
  const inApt = () => player.level === 1 && camera.position.y > APT_Y - 1 && camera.position.x > -60 && camera.position.x < -20 && camera.position.z > 10 && camera.position.z < 40;

  const titleCam = { t: 0 };
  const setTitleCam = (dt) => {
    titleCam.t += dt; const t = titleCam.t;
    camera.position.set(-40.5 + Math.sin(t * 0.07) * 1.6, APT_Y + 1.45, 27.2 + Math.cos(t * 0.05) * 0.4);
    camera.rotation.set(-0.03 + Math.sin(t * 0.09) * 0.012, 0.16 + Math.sin(t * 0.06) * 0.1, 0, 'YXZ');
    camera.fov = 66; camera.updateMatrixWorld();
  };

  // ---------------------------------------------------------------- loop
  let started = false, elapsed = 0, frames = 0, last = performance.now();
  const focus = new THREE.Vector3();
  let fpsAcc = 0, fpsN = 0, fpsShow = 0, slow = 0, fast = 0;
  const carInfo = [];

  G.time.hour = parseFloat(params.get('t') || (game.hasSave() ? 18.6 : 18.4));
  if (params.has('rain')) { const r = parseFloat(params.get('rain')); G.weather.target = G.weather.rain = r; G.weather.wet = r > 0.1 ? 1 : 0; world.weatherSys.forced = r > 0.1 ? (r > 0.9 ? 'storm' : 'rain') : 'clear'; }
  world.apt.setAllLights(G.time.hour < 7.2 || G.time.hour > 17.5);
  camera.position.set(-40, APT_Y + 1.5, 27);

  function tick(dt, render = true) {
    elapsed += dt; frames++;
    renderer.info.reset();
    G.u.uTime.value = elapsed;
    if (started) { game.update(dt); player.update(dt); } else { setTitleCam(dt); G.time.hour = (G.time.hour + dt * 0.012) % 24; }
    camera.updateProjectionMatrix();
    focus.copy(camera.position);
    atmo.shadowExtent = camera.position.y > 100 ? Math.min(30, q.shadowExtent) : q.shadowExtent;
    atmo.update(dt, elapsed, focus);
    world.weatherSys.update(dt, camera, player);
    world.street.update(dt, elapsed);
    world.blocks.update(dt);
    world.props.update(dt, elapsed);
    world.people.update(dt, camera.position);
    world.traffic.update(dt, camera.position);
    world.apt.update(dt, elapsed);
    world.elevator.update(dt);
    world.lobby.update(dt);
    world.shops.grocery.update(dt);
    world.upgrades.update(elapsed);
    updateScreens(dt, elapsed);
    { const zn = game.zone ? game.zone.name : 'apartment'; LightPool.zone = (zn === 'apartment' || zn === 'balcony') ? 'apartment' : (zn === 'park' || zn === 'street') ? 'street' : zn;
      const want = (zn === 'apartment' || zn === 'balcony' || zn === 'hall') && probe && probe.env ? 'probe' : 'room';
      if (want !== envMode) { envMode = want; setInteriorEnv(want === 'probe' ? probe.env.texture : roomEnv); } }
    pool.update(dt, camera.position);
    if (probe && render) probe.update(dt, inApt(), frames === 2);
    if (started) { const h = player.hover; ui.setPrompt(h ? (typeof h.label === 'function' ? h.label() : h.label) : null); }
    if (audio.ready) {
      carInfo.length = 0;
      for (const c of world.traffic.cars) { const lane = c.lane; const x = lane.ox + lane.dx * c.s, z = lane.oz + lane.dz * c.s; const d = Math.hypot(x - camera.position.x, z - camera.position.z, Math.max(0, camera.position.y - 2) * 0.3); if (d < 90) carInfo.push({ d, v: c.v }); }
      const zn = game.zone || zoneAt(player.pos.x, player.pos.y, player.pos.z, player.level, world.shops);
      audio.update(dt, { zone: zn, y: camera.position.y, rain: G.weather.rain, storm: G.weather.storm, night: G.u.uNight.value, day: atmo.day, cars: carInfo, riding: !!world.elevator.moving, sheltered: false });
    }
    glow.flush();
    const modal = started && ui.modalOpen;
    post.focus = damp(post.focus, clamp(player.hover ? player.hover.pos.distanceTo(camera.position) : 14, 1.2, 60), 4, dt);
    if (!render) return;
    planar.update(scene, camera, streetMod.ROAD_Y, camera.position.y < 40 && G.u.uWet.value > 0.03 && (!game.zone || !game.zone.indoor));
    post.render(scene, camera, dt, elapsed, { glass: true, expMin: 0.24, expKey: 0.2, dof: !modal, dofScale: 0.8 });
    // dynamic resolution + fps overlay
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) {
      const ms = (fpsAcc / fpsN) * 1000; fpsShow = 1000 / ms;
      if (dyn && frames > 90) {
        if (ms > 21) { slow++; fast = 0; } else if (ms < 12.5) { fast++; slow = 0; } else { slow = 0; fast = 0; }
        if (slow >= 3 && scale > 0.6) { scale = Math.max(0.6, scale - 0.05); slow = 0; resize(); }
        if (fast >= 8 && scale < maxScale) { scale = Math.min(maxScale, scale + 0.05); fast = 0; resize(); }
      }
      if (game.settings.fps) ui.perf(`${fpsShow.toFixed(0)} fps  ${ms.toFixed(1)} ms\n${gpu.renderer.replace(/ANGLE \(|\)/g, '').slice(0, 46)}\npreset ${q.id}  scale ${Math.round(scale * 100)}%\ncalls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`);
      fpsAcc = 0; fpsN = 0;
    }
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- start / title
  const startGame = ({ fresh, lock }) => {
    started = true; ui.started = true;
    ui.hideTitle();
    if (fresh) { game.newGame(); ui.toast('Good morning. The city is waking up below.', 4500); setTimeout(() => ui.toast('Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · look with the mouse · <kbd>E</kbd> to interact', 7000), 3200); }
    else if (!game.load()) game.newGame();
    game.applySettings();
    audio.start();
    if (lock !== false) player.requestLock();
    canvas.focus();
  };
  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); ui.toast(audio.muted ? 'Audio muted' : 'Audio on', 1500); }
    if (e.code === 'F3') { game.settings.fps = !game.settings.fps; ui.perf(game.settings.fps ? ' ' : ''); e.preventDefault(); }
    if (e.code === 'F9') { ui.el.hud.classList.toggle('hidden'); e.preventDefault(); }
    if (e.code === 'Tab') { ui.el.goals.classList.toggle('hide'); e.preventDefault(); }
  });

  ui.setLoading(0.94, 'Compiling shaders');
  await nextFrame();
  try { if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))]); } catch (e) { /* ignore */ }
  ui.setLoading(1, 'Ready');

  window.__game = {
    G, game, player, camera, post, atmo, world, renderer, scene, audio, ui,
    tp: (x, y, z, yaw = 0, pitch = 0, level) => { player.teleport(x, y - 1.68, z, yaw, level ?? (y > 100 ? 1 : 0)); player.pitch = pitch; player.eye = 1.68; },
    setTime: (h) => { G.time.hour = h; },
    setRain: (r) => { world.weatherSys.forced = r > 0.1 ? (r > 0.9 ? 'storm' : 'rain') : 'clear'; G.weather.target = G.weather.rain = r; G.weather.wet = r > 0.1 ? 1 : 0; },
    lights: (v) => world.apt.setAllLights(v), start: (o = { fresh: true, lock: false }) => startGame(o),
    key: (code, down = true) => { player.keys[code] = down; },
    step: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) tick(dt); return frames; },
    simulate: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) tick(dt, false); return frames; },
    frames: () => frames, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs?.length, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures }),
  };
  window.__ready = true;
  if (!TEST) requestAnimationFrame(frame);

  if (TEST) {
    ui.hideLoading(); ui.el.title.classList.add('gone');
    startGame({ fresh: !params.has('keep'), lock: false });
    G.time.hour = parseFloat(params.get('t') || '18.4');
    world.apt.setAllLights(G.time.hour < 7.2 || G.time.hour > 17.5);
    if (params.has('cam')) { const c = params.get('cam').split(',').map(Number); window.__game.tp(c[0], c[1], c[2], c[3] || 0, c[4] || 0); }
    if (params.has('hud')) ui.el.hud.classList.remove('hidden'); else ui.el.hud.classList.add('hidden');
  } else {
    ui.hideLoading();
    ui.showTitle({
      hasSave: game.hasSave(),
      onStart: () => startGame({ fresh: true }),
      onContinue: () => startGame({ fresh: false }),
      onSettings: () => openSettings(game, true),
    });
    let auto = false; try { auto = sessionStorage.getItem('floor48.continue') === '1'; sessionStorage.removeItem('floor48.continue'); } catch (e) { /* ignore */ }
    if (auto && game.hasSave()) startGame({ fresh: false, lock: false });
  }
  log('ready');
}

boot().catch((e) => { console.error('BOOT FAILED', e); window.__bootError = String(e && e.stack || e); const l = document.querySelector('#loading p'); if (l) l.textContent = 'Something went wrong: ' + (e && e.message || e); });
