// Pedestrians and shop NPCs: one instanced, vertex-animated humanoid (walk cycle in the vertex
// shader), umbrellas in the rain, and a small sidewalk/crosswalk waypoint AI that obeys the
// pedestrian signals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../core/G.js';
import { rng, clamp } from '../core/util.js';
import { patchMaterial } from '../gfx/materials.js';
import { PROC } from '../gfx/glsl.js';
import { Signals, isRoad, ROAD_Y, WALK_Y } from './street.js';

// Colour categories (aPart) - what a part is made of. Motion is separate (aSw) so shoes/forearms can follow their limbs.
const PART = { LEG: 0, TORSO: 2, UPPER: 3, FORE: 4, HEAD: 5, HAIR: 6, SHOE: 7, BAG: 8, FACE: 9, BELT: 10, LONGHAIR: 11, JACKET: 12, HAT: 13, HAND: 14, EYEW: 15, LIPS: 16 };
// Motion groups (aSw): 1/2 thigh L/R (hip), 3/4 upper arm L/R (shoulder), 5/6 calf+shoe L/R (knee under hip), 7/8 forearm+hand L/R (elbow under shoulder)

function part(geo, id, pivot, sw = 0, pivot2 = pivot) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  geo.setAttribute('aSw', new THREE.Float32BufferAttribute(new Float32Array(n).fill(sw), 1));
  const pv = new Float32Array(n * 3), pv2 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pv.set(pivot, i * 3); pv2.set(pivot2, i * 3); }
  geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(pv, 3));
  geo.setAttribute('aPivot2', new THREE.Float32BufferAttribute(pv2, 3));
  return geo;
}
// translate / rotate(YXZ) / scale a geometry (normals follow via applyMatrix4)
const T = (g, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')), new THREE.Vector3(...s))); return g; };
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const ball = (rad, seg = 12) => new THREE.SphereGeometry(rad, seg, Math.max(6, seg - 4));

function personGeometry() {
  const G_ = [];
  const add = (g, id, pivot, sw, pivot2) => G_.push(part(g, id, pivot, sw, pivot2));
  for (const sg of [-1, 1]) {
    const hip = [sg * 0.095, 0.93, 0], knee = [sg * 0.095, 0.5, 0], sh = [sg * 0.25, 1.43, 0], elb = [sg * 0.25, 1.13, 0];
    const L = sg < 0;
    // ---- legs: thigh (hip) + kneecap; calf + shoe (knee under hip) ----
    add(T(lathe([[0, 0.5], [0.058, 0.5], [0.068, 0.6], [0.081, 0.72], [0.09, 0.86], [0.094, 0.94], [0, 0.945]], 16), [sg * 0.095, 0, 0]), PART.LEG, hip, L ? 1 : 2, hip);
    add(T(ball(0.06, 10), [sg * 0.095, 0.5, 0.006]), PART.LEG, hip, L ? 1 : 2, hip);
    add(T(lathe([[0, 0.075], [0.044, 0.075], [0.053, 0.09], [0.05, 0.13], [0.052, 0.25], [0.056, 0.4], [0.06, 0.49], [0, 0.505]], 14), [sg * 0.095, 0, 0]), PART.LEG, knee, L ? 5 : 6, hip);
    add(T(ball(1, 12), [sg * 0.095, 0.058, 0.058], [0.05, 0.044, 0.125]), PART.SHOE, knee, L ? 5 : 6, hip);          // shoe upper
    add(T(ball(1, 10), [sg * 0.095, 0.058, -0.035], [0.046, 0.04, 0.05]), PART.SHOE, knee, L ? 5 : 6, hip);        // heel
    add(T(new THREE.BoxGeometry(0.088, 0.014, 0.265), [sg * 0.095, 0.008, 0.052]), PART.SHOE, knee, L ? 5 : 6, hip); // sole
    // ---- arms: upper arm + elbow ball (shoulder); forearm + hand (elbow under shoulder) ----
    add(T(lathe([[0, 1.13], [0.038, 1.13], [0.043, 1.2], [0.049, 1.3], [0.054, 1.4], [0.05, 1.45], [0.034, 1.477], [0, 1.483]], 12), [sg * 0.25, 0, 0]), PART.UPPER, sh, L ? 3 : 4, sh);
    add(T(ball(0.04, 8), [sg * 0.25, 1.13, 0]), PART.UPPER, sh, L ? 3 : 4, sh);
    add(T(ball(1, 10), [sg * 0.232, 1.425, 0], [0.062, 0.058, 0.06]), PART.UPPER, sh, L ? 3 : 4, sh);          // deltoid
    add(T(ball(1, 8), [sg * 0.25, 1.17, -0.012], [0.05, 0.03, 0.05]), PART.UPPER, sh, L ? 3 : 4, sh);        // bicep bulge
    add(T(lathe([[0, 0.83], [0.026, 0.83], [0.03, 0.87], [0.036, 0.96], [0.041, 1.06], [0.04, 1.13], [0, 1.135]], 12), [sg * 0.25, 0, 0]), PART.FORE, elb, L ? 7 : 8, sh);
    add(T(ball(1, 10), [sg * 0.25, 0.795, 0.006], [0.029, 0.056, 0.04]), PART.HAND, elb, L ? 7 : 8, sh);
    add(T(ball(1, 8), [sg * 0.25 - sg * 0.02, 0.83, 0.03], [0.011, 0.028, 0.012], [0.3, 0, -sg * 0.3]), PART.HAND, elb, L ? 7 : 8, sh);   // thumb
    for (let f = 0; f < 4; f++) {                                                                      // fingers: relaxed, slightly curled
      const fx = sg * 0.25 + (f - 1.5) * 0.0105 * 1.0, len = [0.036, 0.042, 0.04, 0.03][f];
      add(T(ball(1, 6), [fx, 0.748 - (len - 0.036) * 0.4, 0.014 + f * 0.0015], [0.0058, len, 0.0072], [0.22 + f * 0.03, 0, 0]), PART.HAND, elb, L ? 7 : 8, sh);
    }
    add(T(new THREE.TorusGeometry(0.0425, 0.0075, 6, 14), [sg * 0.25, 0.865, 0], [1, 1, 1], [Math.PI / 2, 0, 0]), PART.UPPER, elb, L ? 7 : 8, sh);   // sleeve cuff
    add(T(new THREE.TorusGeometry(0.0525, 0.008, 6, 14), [sg * 0.095, 0.115, 0], [1, 1, 1], [Math.PI / 2, 0, 0]), PART.LEG, knee, L ? 5 : 6, hip);    // trouser hem
    add(T(new THREE.TorusGeometry(0.0485, 0.006, 6, 14), [sg * 0.095, 0.078, 0.004], [1, 1, 1], [Math.PI / 2 - 0.1, 0, 0]), PART.SHOE, knee, L ? 5 : 6, hip);   // shoe collar
    // laces: a few tiny bars across the vamp
    for (let k = 0; k < 3; k++) add(T(new THREE.BoxGeometry(0.052, 0.004, 0.006), [sg * 0.095, 0.092 - k * 0.002, 0.03 + k * 0.022], [1, 1, 1], [-0.25 - k * 0.12, 0, 0]), PART.EYEW, knee, L ? 5 : 6, hip);
    // ---- ear ----
    add(T(ball(1, 8), [sg * 0.088, 1.635, -0.004], [0.012, 0.028, 0.02]), PART.HEAD, [0, 1.45, 0], 0, [0, 1.45, 0]);
    // ---- eyes / brows (dark details) ----
    add(T(ball(1, 8), [sg * 0.033, 1.652, 0.085], [0.0135, 0.0105, 0.0065]), PART.EYEW, [0, 1.45, 0], 0, [0, 1.45, 0]);      // sclera
    add(T(ball(1, 8), [sg * 0.0335, 1.652, 0.0895], [0.0068, 0.0068, 0.0035]), PART.FACE, [0, 1.45, 0], 0, [0, 1.45, 0]);    // iris + pupil
    add(T(ball(1, 8), [sg * 0.0335, 1.652, 0.0925], [0.0028, 0.0028, 0.0012]), PART.EYEW, [0, 1.45, 0], 0, [0, 1.45, 0]);   // catch-light
    add(T(new THREE.BoxGeometry(0.034, 0.006, 0.008), [sg * 0.034, 1.674, 0.088], [1, 1, 1], [0, 0, sg * -0.12]), PART.FACE, [0, 1.45, 0], 0, [0, 1.45, 0]);
  }
  const P0 = [0, 1.0, 0], HP = [0, 1.45, 0];
  // ---- torso (elliptical loft), collar, belt + buckle ----
  add(T(lathe([[0, 0.88], [0.135, 0.885], [0.16, 0.95], [0.158, 1.03], [0.145, 1.12], [0.142, 1.16], [0.158, 1.26], [0.182, 1.35], [0.2, 1.41], [0.195, 1.455], [0.13, 1.485], [0.07, 1.5], [0, 1.505]], 20), [0, 0, 0], [1, 1, 0.62]), PART.TORSO, P0);
  for (let k = 0; k < 4; k++) add(T(ball(1, 6), [0, 1.43 - k * 0.1, 0.104 - k * 0.004], [0.008, 0.008, 0.005]), PART.BELT, P0);   // shirt buttons
  add(T(new THREE.BoxGeometry(0.03, 0.02, 0.03), [0.0, 1.37, 0.108], [1, 1, 1]), PART.TORSO, P0);
  add(T(new THREE.SphereGeometry(0.045, 10, 8), [0, 1.52, -0.075], [1.2, 1.1, 0.8]), PART.LONGHAIR, HP);   // hair tie knot / nape
  add(T(new THREE.TorusGeometry(0.066, 0.014, 6, 16), [0, 1.494, 0.004], [1, 1, 1], [Math.PI / 2 - 0.25, 0, 0]), PART.TORSO, P0);
  add(T(new THREE.CylinderGeometry(0.163, 0.163, 0.036, 20, 1, true), [0, 1.03, 0], [1, 1, 0.62]), PART.BELT, P0);
  add(T(new THREE.BoxGeometry(0.036, 0.03, 0.012), [0, 1.03, 0.1]), PART.BELT, P0);
  // ---- jacket shell (visible on some people): open coat to mid-thigh ----
  add(T(lathe([[0, 0.76], [0.172, 0.76], [0.176, 0.88], [0.172, 1.03], [0.163, 1.16], [0.176, 1.27], [0.198, 1.355], [0.214, 1.41], [0.207, 1.46], [0.135, 1.488], [0.08, 1.508], [0, 1.51]], 20), [0, 0, 0], [1, 1, 0.66]), PART.JACKET, P0);
  add(T(new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.62), [0, 1.535, -0.085], [1.1, 0.95, 0.9], [0.5, 0, 0]), PART.JACKET, P0);   // hood resting on the back
  add(T(new THREE.TorusGeometry(0.094, 0.03, 8, 18).rotateX(Math.PI / 2 - 0.15), [0, 1.52, 0.0], [1, 1, 0.92]), PART.JACKET, P0);   // high collar
  add(T(new THREE.TorusGeometry(0.17, 0.014, 6, 24).rotateX(Math.PI / 2), [0, 0.775, 0], [1, 1, 0.66]), PART.JACKET, P0);   // ribbed hem
  for (const sg of [-1, 1]) add(T(new RoundedBoxGeometry(0.1, 0.03, 0.022, 2, 0.008), [sg * 0.1, 0.935, 0.108], [1, 1, 1], [0.12, 0, sg * 0.14]), PART.JACKET, P0);   // pocket flaps
  add(T(new THREE.BoxGeometry(0.008, 0.72, 0.008), [0, 1.14, 0.122]), PART.JACKET, P0);                                    // zip track
  // ---- neck, head (egg + jaw + nose + mouth), hair, long hair, hat ----
  add(T(new THREE.CylinderGeometry(0.046, 0.054, 0.1, 12), [0, 1.525, 0]), PART.HEAD, HP);
  add(T(ball(1, 16), [0, 1.642, 0.004], [0.089, 0.113, 0.099]), PART.HEAD, HP);
  add(T(ball(1, 12), [0, 1.588, 0.014], [0.072, 0.068, 0.084]), PART.HEAD, HP);
  for (const sg of [-1, 1]) add(T(ball(1, 6), [sg * 0.011, 1.608, 0.108], [0.006, 0.004, 0.004]), PART.FACE, HP);   // nostrils
  add(T(ball(1, 8), [0, 1.566, 0.098], [0.022, 0.014, 0.014]), PART.HEAD, HP);                                   // chin

  add(T(new THREE.ConeGeometry(0.014, 0.038, 8), [0, 1.622, 0.106], [1, 1, 1], [Math.PI / 2 - 0.35, 0, 0]), PART.HEAD, HP);
  add(T(ball(1, 8), [0, 1.5935, 0.0975], [0.0205, 0.0042, 0.0062]), PART.LIPS, HP);                     // upper lip
  add(T(ball(1, 8), [0, 1.5845, 0.0965], [0.0175, 0.0055, 0.0068]), PART.LIPS, HP);                     // lower lip
  add(T(new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), [0, 1.652, -0.012], [0.945, 1.02, 1.04], [-0.32, 0, 0]), PART.HAIR, HP);
  add(T(ball(1, 10), [0, 1.615, -0.06], [0.09, 0.09, 0.06]), PART.HAIR, HP);
  add(T(ball(1, 10), [0.02, 1.728, 0.04], [0.088, 0.03, 0.07], [0.3, 0, -0.18]), PART.HAIR, HP);           // swept fringe
  add(T(ball(1, 8), [-0.05, 1.725, 0.04], [0.05, 0.028, 0.055], [0.2, 0, 0.3]), PART.HAIR, HP);
  for (const sg of [-1, 1]) add(T(ball(1, 6), [sg * 0.091, 1.642, 0.03], [0.008, 0.032, 0.014]), PART.HAIR, HP);      // sideburns
  add(T(lathe([[0, 1.36], [0.05, 1.37], [0.085, 1.45], [0.102, 1.55], [0.108, 1.63], [0.06, 1.72], [0, 1.735]], 14), [0, 0, -0.058], [1, 1, 0.8]), PART.LONGHAIR, HP);
  for (const sg of [-1, 1]) {                                                                                     // long locks framing the face
    add(T(lathe([[0, 1.43], [0.016, 1.44], [0.024, 1.52], [0.026, 1.6], [0.02, 1.68], [0, 1.69]], 8), [sg * 0.098, 0, 0.03], [1, 1, 1.2], [0, 0, sg * 0.05]), PART.LONGHAIR, HP);
    add(T(ball(1, 8), [sg * 0.052, 1.728, 0.05], [0.05, 0.028, 0.045], [0.3, 0, sg * 0.4]), PART.LONGHAIR, HP);
  }
  add(T(new THREE.SphereGeometry(0.121, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), [0, 1.672, -0.012], [0.97, 1.0, 1.07], [-0.2, 0, 0]), PART.HAT, HP);
  add(T(new THREE.TorusGeometry(0.119, 0.017, 6, 22), [0, 1.706, -0.004], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]), PART.HAT, HP);
  // ---- backpack with straps (shown on some people) ----
  add(T(new RoundedBoxGeometry(0.27, 0.34, 0.13, 3, 0.045), [0, 1.22, -0.16]), PART.BAG, P0);
  add(T(new RoundedBoxGeometry(0.2, 0.14, 0.05, 2, 0.02), [0, 1.14, -0.24]), PART.BAG, P0);
  for (const sg of [-1, 1]) {
    add(T(new THREE.BoxGeometry(0.036, 0.012, 0.22), [sg * 0.09, 1.478, -0.03]), PART.BAG, P0);
    add(T(new THREE.BoxGeometry(0.036, 0.3, 0.012), [sg * 0.09, 1.33, 0.098], [1, 1, 1], [0.05, 0, 0]), PART.BAG, P0);
  }
  return mergeGeometries(G_, false);
}

const PERSON_PROC = /* glsl */`
varying vec3 vPC; varying float vPart; varying float vSeed; varying float vJk;
vec3 skinTone(vec3 col, vec3 p, vec3 n, vec3 wp, inout float h, inout float rough){
  float pores = nz(p*vec3(650.0)).g, blot = nz(p*vec3(24.0)).r;
  h += (pores - 0.5) * 0.00022;
  rough = 0.52 + 0.14 * pores;
  col *= 0.93 + 0.14 * blot;
  float fr = pow(1.0 - abs(dot(normalize(n), normalize(cameraPosition - wp))), 3.0);       // warm scattering at grazing angles
  return col + vec3(0.22, 0.05, 0.02) * fr * 0.3 * (0.4 + col.r);
}
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float pt = vPart, sd = vSeed;
  float f = nz(wp*9.0).r, g = nz(wp*31.0).g;
  float k1 = nz(p*vec3(300.0)).g, k2 = nz(p*vec3(760.0)).b;
  vec3 col = vPC; float rough = 0.85, h = 0.0, ao = 1.0;
  if (pt < 0.5) {                                              // trousers: denim twill or chino
    float denim = step(0.5, fract(sd*5.17));
    float tw = sin((p.x + p.y) * 640.0) * 0.5 + 0.5;
    float warp = nz(vec3(p.x*420.0, p.y*40.0, p.z*420.0)).g;
    h = denim * (0.0007*tw + 0.0004*warp) + (1.0 - denim) * 0.0005 * (k1 - 0.5);
    col *= mix(0.9 + 0.2*k1, (0.86 + 0.26*tw) * (0.9 + 0.2*warp), denim);
    float fade = smoothstep(0.6, 0.95, nz(vec3(p.x*6.0, p.y*2.6, p.z*6.0)).r) * denim;
    col = mix(col, col * vec3(1.45, 1.38, 1.25), fade * 0.45);
    float seam = smoothstep(0.0045, 0.0, abs(abs(p.x) - 0.183));                          // outer side seam, contrast stitching on jeans
    col = mix(col, col * 1.25 + vec3(0.05, 0.035, 0.0), seam * denim * 0.6); h -= seam * 0.0009;
    float pocket = smoothstep(0.004, 0.0, abs(p.y - 0.86 - 0.02 * sin(p.x * 30.0))) * step(0.03, p.z) * step(0.03, abs(p.x) - 0.04);
    h -= pocket * 0.0005; col *= 1.0 - 0.15 * pocket;
    rough = mix(0.88, 0.72, denim * 0.5 * tw);
    ao = 0.72 + 0.28 * smoothstep(0.0, 0.05, abs(p.x) - 0.004 + (1.0 - step(0.8, p.y)) * 1.0);   // dark inner thighs
  } else if (pt < 4.5) {                                       // shirt / sleeves / forearm (skin unless jacketed)
    bool skinArm = pt > 3.5 && vJk < 0.5;
    if (skinArm) col = skinTone(col, p, n, wp, h, rough);
    else {
      float rib = sin(p.x * 880.0) * 0.5 + 0.5;
      h = 0.0006 * (k1 - 0.5) + 0.0003 * (rib - 0.5) * (1.0 - vJk);
      col *= 0.9 + 0.2 * k1;
      float style = fract(sd * 11.3);
      float stripes = step(0.5, fract(p.y * 8.5)) * step(style, 0.2) * (1.0 - vJk);
      col = mix(col, col * 0.55 + vec3(0.3), stripes * 0.55);
      float patch_ = smoothstep(0.03, 0.022, length(vec2(p.x - 0.075, p.y - 1.33))) * step(0.08, p.z) * step(0.2, style) * step(style, 0.32) * (1.0 - vJk) * step(pt, 2.5);
      col = mix(col, vec3(0.85, 0.75, 0.3), patch_);
      rough = 0.9 - 0.12 * vJk;
    }
    ao = 0.78 + 0.22 * smoothstep(0.0, 0.05, abs(p.x) - 0.17);                              // dark armpits
    if (pt < 2.5) ao = 1.0;
  } else if (pt < 5.5) {                                       // head / neck
    col = skinTone(col, p, n, wp, h, rough);
    float ch = smoothstep(0.045, 0.0, length(vec2(abs(p.x) - 0.057, p.y - 1.612))) * step(0.03, p.z);
    float ear = smoothstep(0.03, 0.0, length(vec2(abs(p.x) - 0.088, p.y - 1.635)));
    float nose = smoothstep(0.02, 0.0, length(vec2(p.x, p.y - 1.617))) * step(0.08, p.z);
    col = mix(col, col * vec3(1.28, 0.7, 0.66), clamp(ch * 0.5 + ear * 0.45 + nose * 0.35, 0.0, 1.0));
    ao = 0.85 + 0.15 * smoothstep(1.5, 1.56, p.y);                                              // shadowed throat
  } else if (pt < 6.5 || (pt > 10.5 && pt < 11.5)) {           // hair: strands along the fall direction
    float st = nz(vec3(p.x*230.0, p.y*26.0, p.z*230.0)).r, st2 = nz(vec3(p.x*600.0, p.y*70.0, p.z*600.0)).g;
    h = (st - 0.5) * 0.0016 + (st2 - 0.5) * 0.0008;
    col *= 0.6 + 0.78 * st + 0.15 * (st2 - 0.5);
    rough = 0.4 + 0.3 * st2;
    ao = 0.7 + 0.3 * smoothstep(1.5, 1.72, p.y);
  } else if (pt < 7.5) {                                       // shoes
    float sole = 1.0 - smoothstep(0.013, 0.022, p.y);
    float sneaker = step(0.5, fract(sd * 2.71));
    col = mix(col, vec3(0.62) * (0.8 + 0.3 * k1), sneaker * (1.0 - sole));
    col = mix(col, vec3(0.64, 0.62, 0.56), sole * 0.75);
    float crease = smoothstep(0.5, 0.9, nz(vec3(p.x*40.0, p.y*70.0, p.z*40.0)).r);
    h = -crease * 0.0006 + (k2 - 0.5) * 0.0003;
    rough = mix(0.34 + 0.2 * crease, 0.92, sole);
  } else if (pt < 8.5) {                                       // backpack: ripstop nylon + zip
    float gx = smoothstep(0.42, 0.5, abs(fract(p.x * 150.0) - 0.5)) + smoothstep(0.42, 0.5, abs(fract(p.y * 150.0) - 0.5));
    h = gx * 0.0004; col *= 0.9 + 0.2 * k1 - 0.06 * gx; rough = 0.6;
    float zip = smoothstep(0.004, 0.0, abs(p.y - 1.29)) * step(abs(p.x), 0.11);
    col = mix(col, vec3(0.05), zip * 0.7);
  } else if (pt < 9.5) { rough = 0.22; h = 0.0; }              // eyes / brows
  else if (pt < 10.5) { col *= 0.75 + 0.5 * k1; rough = 0.42; h = (k1 - 0.5) * 0.0004; }   // leather belt
  else if (pt < 12.5) {                                        // jacket: shell or puffer, zip front, side seams
    float puff = step(0.5, fract(sd * 8.91));
    float baf = abs(fract(p.y / 0.115) - 0.5);
    float seamL = smoothstep(0.42, 0.5, baf);
    float bulge = 1.0 - (baf * 2.0) * (baf * 2.0);
    h = puff * (bulge * 0.0075 - seamL * 0.001) + (1.0 - puff) * (0.0003 * (k1 - 0.5));
    col *= 1.0 - 0.3 * seamL * puff; col *= 0.93 + 0.12 * k1;
    float zip = smoothstep(0.0075, 0.0, abs(p.x)) * step(0.05, p.z) * step(0.78, p.y) * step(p.y, 1.52);
    col = mix(col, vec3(0.58, 0.58, 0.6), zip * 0.85); h -= zip * 0.0006;
    float sideS = smoothstep(0.005, 0.0, abs(abs(p.x) - 0.172)) * step(p.y, 1.3);
    col *= 1.0 - 0.25 * sideS; h -= sideS * 0.0007;
    rough = 0.4 + 0.15 * puff;
    ao = 0.85 + 0.15 * smoothstep(0.0, 0.2, abs(p.x));
  } else if (pt < 13.5) {                                      // knit beanie
    float rib = sin(atan(p.z, p.x) * 70.0) * 0.5 + 0.5;
    h = 0.0012 * rib + 0.0004 * (k1 - 0.5); col *= 0.86 + 0.22 * rib; rough = 0.96;
  } else if (pt < 14.5) { col = skinTone(col, p, n, wp, h, rough); }   // hands
  else if (pt < 15.5) { col = vec3(0.8) * (0.9 + 0.1 * k1); rough = 0.25; }   // eye whites / laces
  else { col = col * (0.85 + 0.25 * k1); rough = 0.34; h = 0.0; }          // lips
  float fd = dfade(wp, 0.003);
  s.alb *= col * (0.94 + 0.12 * f) * (0.97 + 0.06 * g);
  s.rough = rough; s.h = h * fd; s.ao = ao;
}`;
const VERT = {
  head: `attribute float aPart; attribute float aSw; attribute vec3 aPivot; attribute vec3 aPivot2; attribute vec3 aAnim; attribute vec3 aCShirt; attribute vec3 aCPants; attribute vec3 aCSkin; attribute vec3 aCHair; varying vec3 vPC; varying float vPart; varying float vSeed; varying float vJk; uniform float uWet; uniform float uTime; float gA1, gA2;
vec3 rotX(vec3 d, float a){ float c = cos(a), s = sin(a); return vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c); }
void poseAngles(){
  float sp = max(aAnim.y, 0.0);
  bool seated = aAnim.y < -0.5;
  gA1 = 0.0; gA2 = 0.0;
  if (aSw < 0.5) return;
  bool left = mod(aSw, 2.0) > 0.5;
  float ph = aAnim.x + (left ? 0.0 : 3.14159);                 // this side's leg phase
  float sw = sin(ph) * 0.72 * sp;                               // hip angle (positive = leg back)
  float idle = sin(uTime * 0.8 + aAnim.z * 6.0 + (left ? 0.0 : 1.7)) * 0.025 * (1.0 - min(sp, 1.0));
  if (aSw < 2.5) { gA1 = sw; if (seated) gA1 = -1.45; }
  else if (aSw < 4.5) { gA1 = -sw * 0.85 + idle; if (seated) gA1 = -0.5; }
  else if (aSw < 6.5) { float knee = sp * (0.1 + 1.0 * max(0.0, -cos(ph - 0.35))); gA1 = seated ? -1.45 : sw; gA2 = seated ? 1.5 : knee; }
  else { float a = -sw * 0.85; gA1 = seated ? -0.5 : a - 0.06 + idle; gA2 = seated ? -1.15 : -(0.28 + sp * (0.12 + 0.55 * max(0.0, -a / 0.6))); }
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`,
  normal: /* glsl */`
{
  poseAngles();
  if (aSw > 4.5) objectNormal = rotX(objectNormal, gA2);
  if (aSw > 0.5) objectNormal = rotX(objectNormal, gA1);
  { float wU = smoothstep(0.85, 1.25, position.y); if ((aSw > 2.5 && aSw < 4.5) || aSw > 6.5) wU = 1.0; float tw2 = sin(aAnim.x) * 0.1 * max(aAnim.y, 0.0) * wU; objectNormal.xz = rot2(tw2) * objectNormal.xz; }
}`,
  begin: /* glsl */`
{
  float sp = max(aAnim.y, 0.0), seed = aAnim.z;
  vec3 pp = transformed;
  if (aSw > 4.5) pp = aPivot + rotX(pp - aPivot, gA2);
  if (aSw > 0.5) { vec3 hp = aSw > 4.5 ? aPivot2 : aPivot; pp = hp + rotX(pp - hp, gA1); }
  transformed = pp;
  float ph0 = aAnim.x, seated0 = aAnim.y < -0.5 ? 1.0 : 0.0;
  float bob = abs(sin(ph0)) * 0.03 * sp + sin(ph0 * 0.31 + seed * 20.0) * 0.004;
  transformed.y += bob * (1.0 - seated0);
  // upper body: counter-twist to the hips, lateral sway, idle weight shift + breathing; the head stays steadier
  float wUp = smoothstep(0.85, 1.25, position.y);
  if ((aSw > 2.5 && aSw < 4.5) || aSw > 6.5) wUp = 1.0;
  float head = smoothstep(1.5, 1.62, position.y);
  float tw = sin(ph0) * 0.1 * sp * (1.0 - seated0) * wUp * (1.0 - 0.7 * head);
  transformed.xz = rot2(tw) * transformed.xz;
  transformed.x += sin(ph0) * 0.02 * sp * wUp * (1.0 - seated0) + sin(uTime * 0.5 + seed * 7.0) * 0.01 * wUp * (1.0 - min(sp, 1.0)) * (1.0 - seated0);
  transformed.xz *= 1.0 + 0.012 * sin(uTime * 1.7 + seed * 9.0) * smoothstep(1.05, 1.3, position.y) * (1.0 - smoothstep(1.45, 1.55, position.y));
  transformed.z += sin(ph0 * 2.0) * 0.012 * sp * wUp;
  transformed.x += sin(uTime * 0.35 + seed * 5.0) * 0.0 + head * sin(uTime * 0.6 + seed * 11.0) * 0.004;
  // per-person outfit variety derived from the seed
  float hairStyle = floor(fract(seed * 7.13) * 3.0);                       // 0 short, 1 long, 2 hat
  bool bag = fract(seed * 13.7) < 0.42;
  bool jk = fract(seed * 3.31) < 0.3 + 0.5 * uWet;
  vec3 jcol = aCPants * 1.3 + vec3(0.035);
  vec3 pc = aCShirt;
  bool hide = false;
  if (aPart < 0.5) pc = aCPants;
  else if (aPart < 2.5) pc = jk ? jcol * 0.5 + aCShirt * 0.5 : aCShirt;
  else if (aPart < 3.5) pc = jk ? jcol : aCShirt;
  else if (aPart < 4.5) pc = jk ? jcol : aCSkin;
  else if (aPart < 5.5) pc = aCSkin;
  else if (aPart < 6.5) { pc = aCHair; hide = hairStyle > 1.5; }
  else if (aPart < 7.5) pc = vec3(0.045);
  else if (aPart < 8.5) { pc = mix(aCShirt, aCHair, 0.6) * 0.8; hide = !bag; }
  else if (aPart < 9.5) pc = vec3(0.035, 0.028, 0.025);
  else if (aPart < 10.5) pc = vec3(0.06, 0.04, 0.03);
  else if (aPart < 11.5) { pc = aCHair; hide = !(hairStyle > 0.5 && hairStyle < 1.5); }
  else if (aPart < 12.5) { pc = jcol; hide = !jk; }
  else if (aPart < 13.5) { pc = aCShirt * 0.55 + vec3(0.02); hide = hairStyle < 1.5; }
  else if (aPart < 14.5) pc = aCSkin;
  else if (aPart < 15.5) pc = vec3(0.8);
  else pc = mix(aCSkin, vec3(0.5, 0.15, 0.16), 0.6);
  if (hide) transformed = aPivot;
  vPC = pc; vPart = aPart; vSeed = seed; vJk = jk ? 1.0 : 0.0;
}`,
};

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9b6a48, 0x6f4a33, 0x4a3122];
const HAIR = [0x141010, 0x2a1a10, 0x5a3a20, 0x8a6a3a, 0xc9b070, 0x8a8a8a, 0x8a2c1c];
const SHIRT = [0x2a3a52, 0x8a2c34, 0x2e5a48, 0xd4d0c4, 0x1c1c20, 0x4a5a78, 0xc79a34, 0x6a4a72, 0x3a6a8a, 0xb45a3a, 0xe8e6e0, 0x555a5e];
const PANTS = [0x1c2233, 0x2b2b2e, 0x3a4256, 0x5a4a3a, 0x1a1a1a, 0x4a5568, 0x6a6a68, 0x2c3a2c];

export class People {
  constructor(scene, q, ctx) {
    this.R = rng(1717);
    this.scene = scene; this.q = q;
    this.cap = 96;
    const geo = personGeometry();
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aAnim = attr(); this.aShirt = attr(); this.aPants = attr(); this.aSkin = attr(); this.aHair = attr();
    geo.setAttribute('aAnim', this.aAnim); geo.setAttribute('aCShirt', this.aShirt); geo.setAttribute('aCPants', this.aPants); geo.setAttribute('aCSkin', this.aSkin); geo.setAttribute('aCHair', this.aHair);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const uni = { uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color() }, uWetAmt: { value: 0.6 } };
    mat.customProgramCacheKey = () => 'person';
    mat.onBeforeCompile = (sh) => patchMaterial(sh, PERSON_PROC, uni, '', VERT);
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.layers.enable(1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
    // umbrellas
    const ug = mergeGeometries([
      (() => { const c = new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32); c.translate(0, -0.4, 0); return c.toNonIndexed(); })(),
      (() => { const c = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6); c.translate(0, -0.35, 0); return c.toNonIndexed(); })(),
    ].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
    this.umb = new THREE.InstancedMesh(ug, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), this.cap);
    this.umb.frustumCulled = false; this.umb.count = 0; this.umb.castShadow = true; this.umb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    { const c = new THREE.Color(); const cols = [0x1a1a1f, 0x8a1c2c, 0x2a4a7a, 0x2e6a4c, 0x111111, 0xd4a020, 0x6a3a7a]; for (let i = 0; i < this.cap; i++) this.umb.setColorAt(i, c.set(cols[i % cols.length])); }
    scene.add(this.umb);
    this.list = [];
    this.crossing = [];
    this.m = new THREE.Matrix4(); this.qq = new THREE.Quaternion(); this.e = new THREE.Euler(); this.pv = new THREE.Vector3(); this.sv = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    G.people = this;
  }

  _look(o) {
    const R = this.R, c = new THREE.Color();
    const i = this.list.length;
    const set = (a, hex, k = 1) => { c.set(hex); a.setXYZ(i, c.r * k, c.g * k, c.b * k); };
    set(this.aShirt, o.shirt ?? SHIRT[Math.floor(R() * SHIRT.length)]);
    set(this.aPants, o.pants ?? PANTS[Math.floor(R() * PANTS.length)]);
    set(this.aSkin, o.skin ?? SKIN[Math.floor(R() * SKIN.length)]);
    set(this.aHair, o.hair ?? HAIR[Math.floor(R() * HAIR.length)]);
    return i;
  }

  add(o) {
    const R = this.R;
    if (this.list.length >= this.cap) return null;
    const i = this._look(o);
    const p = {
      i, x: o.x, z: o.z, y: 0, yaw: o.yaw ?? R() * 6.28, speed: 0, v: o.v ?? 1.25 + R() * 0.4, phase: R() * 6.28, scale: 0.94 + R() * 0.13, girth: 0.93 + R() * 0.16,
      mode: o.mode ?? 'idle', umb: R() < 0.62, seed: R(), lat: (R() - 0.5) * 3, sit: !!o.sit, y0: o.sit ? ((o.seat ?? 0.45) - 0.93 * 1.0) : (o.y0 ?? null), state: 'out', wait: 0, level: o.level ?? 0, arm: 0,
      anim: o.anim ?? 0,
    };
    p.tx = p.x; p.tz = p.z;
    this.list.push(p);
    this.mesh.count = this.list.length; this.umb.count = this.list.length;
    return p;
  }

  // sidewalk walkers around the main intersection
  spawnWalkers(n) {
    const R = this.R;
    for (let k = 0; k < n; k++) {
      const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1, alongAve = R() < 0.55;
      const d = 14 + R() * 200;
      const lat = (R() - 0.5) * 2.4;
      const p = this.add({ x: alongAve ? sx * d : sx * (9.4 + lat), z: alongAve ? sz * (9.4 + lat) : sz * d, mode: 'walk' });
      if (!p) return;
      p.corner = [sx, sz]; p.alongAve = alongAve; p.lat = lat; p.state = R() < 0.5 ? 'in' : 'out';
      this._aim(p);
    }
  }

  _cornerPt(p) { const [sx, sz] = p.corner; return [sx * 9.3 + (p.alongAve ? 0 : p.lat), sz * 9.3 + (p.alongAve ? p.lat : 0)]; }
  _aim(p) {
    const [sx, sz] = p.corner;
    if (p.state === 'in') { const [cx, cz] = this._cornerPt(p); p.tx = p.alongAve ? cx : sx * (9.4 + p.lat); p.tz = p.alongAve ? sz * (9.4 + p.lat) : cz; }
    else if (p.state === 'out') { const far = 150 + this.R() * 90; if (p.alongAve) { p.tx = sx * far; p.tz = sz * (9.4 + p.lat); } else { p.tx = sx * (9.4 + p.lat); p.tz = sz * far; } }
  }

  update(dt, camPos) {
    const R = this.R;
    const rain = G.weather.rain;
    const P = G.player;
    this.crossing.length = 0;
    const pa = Signals.pedAvenue(), pc = Signals.pedCross();
    const remA = Signals.dur[3] - Signals.tin, remC = Signals.dur[0] - Signals.tin;
    for (const p of this.list) {
      if (p.mode === 'walk') {
        // ---- walking / waiting / crossing state machine ----
        if (p.state === 'wait') {
          p.speed = 0; p.wait += dt;
          const ok = p.cross.type === 'A' ? (pa === 'w' && remA > 9) : (pc === 'w' && remC > 9);
          if (ok) { p.state = 'cross'; }
        } else {
          const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
          const spd = p.state === 'cross' ? 1.6 : p.v;
          if (d < 0.35) {
            if (p.state === 'out') { p.state = 'in'; this._aim(p); }
            else if (p.state === 'in') {
              // arrived at the corner: decide to cross or turn
              const [sx, sz] = p.corner;
              const r = R();
              if (r < 0.5) {
                // cross the street we are walking along the side of
                const type = p.alongAve ? 'B' : 'A';
                p.cross = { type };
                if (type === 'A') { const [cx] = [sx * 9.1]; p.cx0 = cx; p.tx = cx; p.tz = -sz * 9.3; p.corner = [sx, -sz]; p.x = cx; p.z = sz * 9.3; p.alongAve = false; }
                else { const cz = sz * 9.1; p.tx = -sx * 9.3; p.tz = cz; p.corner = [-sx, sz]; p.x = sx * 9.3; p.z = cz; p.alongAve = true; }
                p.state = 'wait'; p.ccorner = p.corner; p.pending = true;
              } else {
                // turn onto the other street outward
                p.alongAve = !p.alongAve; p.state = 'out'; this._aim(p);
              }
            } else if (p.state === 'cross') {
              p.state = 'out'; if (R() < 0.35) p.alongAve = !p.alongAve; this._aim(p);
            }
          } else {
            const st = spd;
            p.speed += (st - p.speed) * (1 - Math.exp(-dt * 6));
            const nx = dx / d, nz = dz / d;
            p.x += nx * p.speed * dt; p.z += nz * p.speed * dt;
            const yawT = Math.atan2(nx, nz);
            let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            p.yaw += dy * (1 - Math.exp(-dt * 8));
          }
          if (p.state === 'cross') this.crossing.push(p);
        }
      } else {
        p.speed += (0 - p.speed) * (1 - Math.exp(-dt * 6));
      }
      // stopped-at-kerb pose: face the crossing
      if (p.state === 'wait') { const [tx, tz] = [p.tx - p.x, p.tz - p.z]; const yawT = Math.atan2(tx, tz); let dy = yawT - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * (1 - Math.exp(-dt * 6)); }
      p.phase += p.speed * dt * 4.6;
      const gy = p.y0 != null ? p.y0 : (isRoad(p.x, p.z) ? ROAD_Y : WALK_Y + 0.02);
      p.y += (gy - p.y) * (1 - Math.exp(-dt * 14));
    }
    // ---- write instances ----
    const aa = this.aAnim.array;
    let ui = 0;
    this.list.forEach((p, k) => {
      const idle = p.mode !== 'walk' || p.state === 'wait';
      const sp = p.speed / 1.5;
      aa[k * 3] = p.phase; aa[k * 3 + 1] = p.sit ? -1 : (idle ? 0 : Math.min(1.4, sp)); aa[k * 3 + 2] = p.seed;
      this.e.set(0, p.yaw, 0); this.qq.setFromEuler(this.e);
      const sit = p.sit ? -0.45 : 0;
      this.pv.set(p.x, p.y + sit * 0, p.z);
      this.sv.set(p.scale * p.girth, p.scale, p.scale * p.girth);
      this.m.compose(this.pv, this.qq, this.sv);
      this.mesh.setMatrixAt(k, this.m);
      // umbrella
      const showU = p.umb && rain > 0.25 && p.mode === 'walk' && p.level === 0;
      if (showU) {
        this.e.set(0.12 * Math.sin(p.phase * 0.5), p.yaw, 0.08); this.qq.setFromEuler(this.e);
        this.pv.set(p.x, p.y + 2.02 * p.scale, p.z);
        this.sv.setScalar(1);
        this.umb.setMatrixAt(k, this.m.compose(this.pv, this.qq, this.sv));
      } else this.umb.setMatrixAt(k, this.zero);
    });
    this.aAnim.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true; this.umb.instanceMatrix.needsUpdate = true;
    for (const a of [this.aShirt, this.aPants, this.aSkin, this.aHair]) a.needsUpdate = true;
  }
}
