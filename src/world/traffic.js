// Traffic: IDM car-following on lanes, obeying the signal controller, stopping for the
// player and pedestrians, brake/head/tail lights, glow sprites, headlight beams on the road,
// plus parked cars. All rendering goes through instanced CarType parts (vehicles.js).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { CarType, CAR_COLORS } from './vehicles.js';
import { Signals, ROAD_Y } from './street.js';
import { LightPool } from '../gfx/lights.js';
import { canvasTex } from '../gfx/noise.js';

const LEN = 520, HALF = LEN / 2, STOP_S = HALF - 11.6;

function makeLanes() {
  const L = [];
  const add = (street, dirx, dirz, ox, oz, offs) => L.push({ street, dx: dirx, dz: dirz, ox, oz, cars: [], id: L.length });
  // avenue: eastbound on +z lanes, westbound on -z lanes
  add('A', 1, 0, -HALF, 1.75); add('A', 1, 0, -HALF, 5.25);
  add('A', -1, 0, HALF, -1.75); add('A', -1, 0, HALF, -5.25);
  // cross street (one lane each way + parking): southbound (+z) on -x, northbound (-z) on +x
  add('B', 0, 1, -2.6, -HALF); add('B', 0, -1, 2.6, HALF);
  return L;
}

export class Traffic {
  constructor(scene, glow, q, ctx) {
    this.R = rng(90210);
    this.m = new THREE.Matrix4(); this.q4 = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.q = q; this.glow = glow;
    this.lanes = makeLanes();
    const dens = q.traffic ?? 1;
    this.types = {
      sedan: new CarType(scene, 'sedan', 36), hatch: new CarType(scene, 'hatch', 30), suv: new CarType(scene, 'suv', 30), van: new CarType(scene, 'van', 16),
    };
    this.cars = []; this.parked = [];
    const names = ['sedan', 'sedan', 'hatch', 'suv', 'suv', 'van', 'hatch', 'sedan'];
    const perLane = [7, 6, 7, 6, 8, 8].map((n) => Math.max(3, Math.round(n * dens)));
    this.lanes.forEach((lane, li) => {
      let s = 8 + this.R() * 20;
      for (let k = 0; k < perLane[li]; k++) {
        const name = names[Math.floor(this.R() * names.length)];
        const t = this.types[name];
        if (t.n >= t.cap - 10) continue;
        const car = this.makeCar(t, name, lane, s);
        s += 30 + this.R() * 55;
        lane.cars.push(car); this.cars.push(car);
      }
      lane.cars.sort((a, b) => b.s - a.s);
    });
    // parked cars along the cross street (both sides, north and south of the avenue)
    for (const side of [-1, 1]) for (const half of [-1, 1]) {
      for (let k = 0; k < 15; k++) {
        if (this.R() < 0.42) continue;
        const z = half * (26 + k * 6.2);
        const name = names[Math.floor(this.R() * names.length)]; const t = this.types[name];
        if (t.n >= t.cap) continue;
        const face = side < 0 ? 1 : -1;                 // parked in the direction of traffic on that side
        this.addParked(t, name, side * 5.6 + (this.R() - 0.5) * 0.25, z, face > 0 ? Math.PI / 2 * -1 : Math.PI / 2, false);
      }
    }
    // beams
    const bt = canvasTex(64, 64, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,240,210,0.95)'); g.addColorStop(0.5, 'rgba(255,235,190,0.35)'); g.addColorStop(1, 'rgba(255,230,180,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      const m = c.createLinearGradient(0, 0, 0, h); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.3, 'rgba(0,0,0,0)'); m.addColorStop(0.7, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = m; c.fillRect(0, 0, w, h);
    }, { srgb: true, mip: false });
    const beamGeo = new THREE.PlaneGeometry(9, 4.2); beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(5.6, 0, 0);
    this.beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ map: bt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(0.55, 0.5, 0.4), fog: false }), this.cars.length + 4);
    this.beams.frustumCulled = false; this.beams.count = 0; this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.beams.renderOrder = 6; this.beams.layers.enable(1);
    scene.add(this.beams);
    for (const t of Object.values(this.types)) t.finish();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.horn = 0;
    this.stats = { moving: this.cars.length, parked: this.parked.length };
    for (const t of Object.values(this.types)) { t.flush(); }
  }

  makeCar(type, name, lane, s) {
    const i = type.alloc();
    const car = {
      type, name, i, lane, s, v: 6 + this.R() * 5, v0: 11 + this.R() * 4.5, len: type.S.len, accel: 0, spin: 0, brake: 0, blockT: 0,
      color: CAR_COLORS[Math.floor(this.R() * CAR_COLORS.length)], taxi: name === 'sedan' && this.R() < 0.14, plate: Math.floor(this.R() * 16),
      glow: [this.glow.add(0, -100, 0, 0xfff2d8, 0, 0.22), this.glow.add(0, -100, 0, 0xfff2d8, 0, 0.22), this.glow.add(0, -100, 0, 0xff2010, 0, 0.16), this.glow.add(0, -100, 0, 0xff2010, 0, 0.16)],
      emitter: LightPool.add({ pos: new THREE.Vector3(), color: 0xfff0d8, intensity: 120, distance: 18, on: false, priority: 1.2 }),
      driver: true, bounce: this.R() * 6,
    };
    if (car.taxi) car.color = 0xf2b910;
    type.setColor(i, car.color); type.setPlate(i, car.plate); type.setSign(i, car.taxi);
    return car;
  }

  addParked(type, name, x, z, heading, driver) {
    const i = type.alloc();
    const car = { type, i, x, z, heading, name };
    const color = CAR_COLORS[Math.floor(this.R() * CAR_COLORS.length)];
    type.setColor(i, color); type.setPlate(i, Math.floor(this.R() * 16)); type.setSign(i, false);
    this.e.set(0, heading, 0); this.q4.setFromEuler(this.e); this.m.compose(this.p.set(x, ROAD_Y + 0.0, z), this.q4, this.one);
    type.set(i, this.m, this.R() * 6, 0, { driver: false });
    type.setLights(i, 0, 0, 0);
    this.parked.push(car);
    return car;
  }

  update(dt, camPos) {
    const night = G.u.uNight.value, rain = G.weather.rain;
    const lightsOn = night > 0.3 || rain > 0.45 || (G.atmo && G.atmo.day < 0.45);
    const A = Signals.A(), B = Signals.B();
    const P = G.player;
    const px = P ? P.pos.x : 1e9, pz = P ? P.pos.z : 1e9, playerOnRoad = P && P.level === 0 && P.pos.y < 0.05 - 0.1;
    const peds = G.people ? G.people.crossing : null;
    for (const lane of this.lanes) {
      const st = lane.street === 'A' ? A : B;
      const cars = lane.cars;
      for (let k = 0; k < cars.length; k++) {
        const c = cars[k];
        const leader = k > 0 ? cars[k - 1] : null;
        let gap = 1e6, dv = 0;
        if (leader) { gap = leader.s - leader.len / 2 - (c.s + c.len / 2); dv = c.v - leader.v; }
        // wrap-around leader: the last car sees the first one's tail at the start
        // signal
        const front = c.s + c.len / 2 + 0.2;
        const dStop = STOP_S - front;
        if (dStop > -1.0 && dStop < 90 && st !== 'g') {
          const canStop = dStop > (c.v * c.v) / (2 * 4.2) - 0.5;
          if (st === 'r' || (st === 'y' && canStop)) if (dStop < gap) { gap = Math.max(dStop, 0.05); dv = c.v; }
        }
        // player / pedestrians in front of the car
        const tx = lane.dx, tz = lane.dz;
        const cx = lane.ox + tx * c.s, cz = lane.oz + tz * c.s;
        const check = (ox, oz, r) => {
          const rx = ox - cx, rz = oz - cz; const ahead = rx * tx + rz * tz; const lat = Math.abs(rx * -tz + rz * tx);
          if (ahead > c.len / 2 && ahead < 40 && lat < r) { const g = ahead - c.len / 2 - 1.6; if (g < gap) { gap = Math.max(g, 0.05); dv = c.v; c.blockT += dt; return true; } }
          return false;
        };
        let blocked = false;
        if (playerOnRoad) blocked = check(px, pz, 1.7) || blocked;
        if (peds) for (const p of peds) blocked = check(p.x, p.z, 1.9) || blocked;
        if (!blocked) c.blockT = Math.max(0, c.blockT - dt * 2);
        if (c.blockT > 3.2 && Math.random() < dt * 0.6) { G.audio?.horn?.(cx, 1, cz); c.blockT = 1.5; }
        // IDM
        const amax = 2.1, b = 3.2, s0 = 2.0, Th = 1.25;
        const sStar = s0 + Math.max(0, c.v * Th + (c.v * dv) / (2 * Math.sqrt(amax * b)));
        let acc = amax * (1 - Math.pow(c.v / c.v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2));
        acc = clamp(acc, -7, amax);
        c.accel = acc;
        c.v = Math.max(0, c.v + acc * dt);
        c.s += c.v * dt;
        c.spin += (c.v * dt) / c.type.S.wheelR;
        const brk = acc < -0.9 || (c.v < 0.4 && gap < 6);
        c.brake += ((brk ? 1 : 0) - c.brake) * (1 - Math.exp(-dt * 14));
      }
      // recycle cars that left the far end
      if (cars.length && cars[0].s > LEN + 12) {
        const c = cars.shift();
        const tail = cars.length ? cars[cars.length - 1] : null;
        c.s = tail ? Math.min(-6, tail.s - tail.len - 20 - this.R() * 40) : -10;
        if (c.s < -60) c.s = -60;
        c.color = c.taxi ? c.color : CAR_COLORS[Math.floor(this.R() * CAR_COLORS.length)];
        c.type.setColor(c.i, c.color); c.plate = Math.floor(this.R() * 16); c.type.setPlate(c.i, c.plate);
        c.v = c.v0 * 0.8;
        cars.push(c);
      }
    }
    // write instances
    const cy = camPos.y;
    let bi = 0;
    for (const c of this.cars) {
      const lane = c.lane;
      const x = lane.ox + lane.dx * c.s, z = lane.oz + lane.dz * c.s;
      const heading = Math.atan2(-lane.dz, lane.dx);
      const susp = Math.sin(c.bounce + G.u.uTime.value * (2 + c.v * 0.4)) * 0.004 * Math.min(1, c.v / 6);
      this.e.set(0, heading, clamp(c.accel * 0.004, -0.03, 0.02), 'YXZ'); this.q4.setFromEuler(this.e);
      this.p.set(x, ROAD_Y + susp, z);
      this.m.compose(this.p, this.q4, this.one);
      const t = c.type;
      const steer = 0;
      t.set(c.i, this.m, c.spin, steer, { driver: true });
      const hd = lightsOn ? 1 : 0;
      t.setLights(c.i, hd, lightsOn ? 0.35 : 0.06, c.brake);
      // glow sprites (near front/rear corners in world space)
      const S = t.S, fx = Math.cos(heading), fz = -Math.sin(heading), sx = -fz, sz = fx;
      const glow = this.glow;
      const hx = x + fx * (S.len / 2), hz = z + fz * (S.len / 2), tx2 = x - fx * (S.len / 2), tz2 = z - fz * (S.len / 2);
      const hy = ROAD_Y + S.y0 + 0.55, ty = ROAD_Y + S.y0 + 0.66;
      const intH = hd * 20, intT = (lightsOn ? 4 : 0) + c.brake * 22;
      glow.set(c.glow[0], hx + sx * S.hw * 0.62, hy, hz + sz * S.hw * 0.62, 0xfff2d8, intH, 0.2);
      glow.set(c.glow[1], hx - sx * S.hw * 0.62, hy, hz - sz * S.hw * 0.62, 0xfff2d8, intH, 0.2);
      glow.set(c.glow[2], tx2 + sx * S.hw * 0.66, ty, tz2 + sz * S.hw * 0.66, 0xff2010, intT, 0.14);
      glow.set(c.glow[3], tx2 - sx * S.hw * 0.66, ty, tz2 - sz * S.hw * 0.66, 0xff2010, intT, 0.14);
      // real light from the nearest cars only (pool decides)
      c.emitter.pos.set(x + fx * (S.len / 2 + 2.6), ROAD_Y + 0.75, z + fz * (S.len / 2 + 2.6));
      c.emitter.on = lightsOn && Math.abs(x - camPos.x) < 60 && Math.abs(z - camPos.z) < 60;
      // beam decal
      if (lightsOn && cy < 30) {
        this.e.set(0, heading, 0); this.q4.setFromEuler(this.e);
        this.beams.setMatrixAt(bi++, this.m.compose(this.p.set(x + fx * S.len / 2 - fx * 0.2, ROAD_Y + 0.02, z + fz * S.len / 2 - fz * 0.2), this.q4, this.one));
      }
    }
    this.beams.count = bi; this.beams.instanceMatrix.needsUpdate = true;
    for (const t of Object.values(this.types)) t.flush();
  }
}
