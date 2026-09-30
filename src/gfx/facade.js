// Building facade material: procedural windows with per-room lighting, interior mapping
// (fake parallax rooms behind the glass), blinds/curtains, glass reflectivity, spandrels,
// concrete/brick walls with weathering and rain wetness. One shader for the whole skyline.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { patchMaterial } from './materials.js';

const FACADE_PROC = /* glsl */`
uniform float uLit; uniform float uInterior;
varying vec4 vInfo;

vec3 roomPalette(float r){
  if (r < 0.2) return vec3(0.95, 0.72, 0.42);     // warm tungsten
  if (r < 0.45) return vec3(1.0, 0.85, 0.62);
  if (r < 0.62) return vec3(0.92, 0.94, 1.0);     // cool led
  if (r < 0.72) return vec3(0.75, 0.86, 1.0);
  if (r < 0.80) return vec3(1.0, 0.55, 0.9);      // pink/purple accent
  if (r < 0.88) return vec3(0.6, 1.0, 0.7);       // grow-light green
  return vec3(0.35, 0.55, 1.0);                   // tv blue
}

void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float seed = vInfo.x, style = vInfo.y, bay = vInfo.z, fh = vInfo.w;
  vec3 tint = s.alb;                                 // instance colour: glass tint / wall colour
  float dist = distance(wp, cameraPosition);
  // ----- roofs (top faces) -----
  if (n.y > 0.5) {
    float g = nz(wp*2.1).r, g2 = nz(wp*13.0).a;
    s.alb = vec3(0.09,0.09,0.095) * (0.7 + 0.6*g) * (0.85+0.3*g2);
    s.rough = 0.92; s.h = (g2-0.5)*0.004*dfade(wp, 0.02);
    return;
  }
  if (n.y < -0.5) { s.alb = vec3(0.05); s.rough = 0.9; return; }

  vec3 T = normalize(vec3(n.z, 0.0, -n.x));
  float hc = dot(wp, T);
  float cx = hc / bay, cy = wp.y / fh;
  vec2 cell = vec2(floor(cx), floor(cy));
  vec2 f = vec2(fract(cx), fract(cy));
  float faceId = dot(n.xz, vec2(3.1, 7.7));
  float rnd = hash21(cell + seed*97.0 + faceId);
  float rnd2 = hash21(cell*1.7 + seed*31.0 + faceId + 5.0);
  float rnd3 = hash21(cell*2.3 + seed*13.0 + faceId + 11.0);

  // ----- window layout per style -----
  vec2 lo, hi;                                         // window rect in cell space
  float wallMix = 0.0;
  if (style < 0.5)      { lo = vec2(0.035, 0.24); hi = vec2(0.965, 0.985); }   // curtain wall
  else if (style < 1.5) { lo = vec2(0.20, 0.20);  hi = vec2(0.80, 0.86); }     // punched
  else if (style < 2.5) { lo = vec2(0.02, 0.30);  hi = vec2(0.98, 0.84); }     // ribbon
  else if (style < 3.5) { lo = vec2(0.24, 0.16);  hi = vec2(0.76, 0.92); }     // tall industrial
  else { lo = vec2(2.0); hi = vec2(3.0); }                                      // solid
  vec2 fw = fwidth(vec2(cx, cy)) * 1.5;
  float inx = smoothstep(lo.x, lo.x + fw.x, f.x) * smoothstep(hi.x, hi.x - fw.x, f.x);
  float iny = smoothstep(lo.y, lo.y + fw.y, f.y) * smoothstep(hi.y, hi.y - fw.y, f.y);
  float win = inx * iny;
  // mullion in the middle of wide bays
  float mull = smoothstep(0.012 + fw.x, 0.012, abs(f.x - 0.5)) * (style < 0.5 ? 1.0 : 0.0);
  win *= 1.0 - mull;
  float frameEdge = 1.0 - smoothstep(0.0, 0.05, min(min(f.x - lo.x, hi.x - f.x), min(f.y - lo.y, hi.y - f.y)) * 4.0);

  // ----- wall (spandrel / solid) -----
  vec3 wall;
  float wn = nz(wp*0.7).r, wg = nz(wp*11.0).g;
  if (style > 2.5 && style < 3.5) {                     // brick
    vec2 uv = vec2(hc, wp.y);
    float row = floor(uv.y/0.075);
    float cxb = (uv.x + mod(row,2.0)*0.11)/0.22;
    float br = hash21(vec2(floor(cxb), row) + seed*17.0);
    vec2 bf = vec2(fract(cxb), fract(uv.y/0.075));
    float mortar = 1.0 - smoothstep(0.0, 0.06, min(min(bf.x,1.0-bf.x)*0.22, bf.y*0.075) * 8.0);
    wall = mix(tint*(0.7+0.5*br), vec3(0.4,0.38,0.35), mortar*0.8);
  } else {
    wall = tint * (0.55 + 0.6*wn) * (0.9 + 0.2*wg);
    if (style < 0.5) wall = tint * 0.35 * (0.8 + 0.4*wn);      // dark glass spandrel panel
  }
  // grime streaks below windows and towards the ground
  float streak = nz(vec3(hc*2.7, wp.y*0.07, seed*9.0)).b;
  wall *= 1.0 - 0.28*smoothstep(0.45, 0.9, streak) * (1.0 - smoothstep(0.0, 90.0, wp.y));

  // ----- glass + room -----
  vec3 glassCol = mix(vec3(0.02,0.03,0.04), tint*0.22, 0.6);
  vec3 emis = vec3(0.0);
  float lit = step(rnd, uLit * (0.55 + 1.1*rnd3*rnd3) * 1.15);       // room lamp on?
  float occupied = step(0.08, rnd2);                                   // some rooms vacant/dark

  if (win > 0.01 && dist < 900.0) {
    float a = (f.x - lo.x) / (hi.x - lo.x) * (bay * (hi.x - lo.x));   // metres across the window
    float b = (f.y - lo.y) / (hi.y - lo.y) * (fh * (hi.y - lo.y));
    float ww = bay * (hi.x - lo.x), wh = fh * (hi.y - lo.y);
    vec3 col = vec3(0.0);
    vec3 lamp = roomPalette(hash21(cell + seed*5.0 + 3.0 + faceId));
    float roomI = mix(0.9, 2.6, rnd2);
    if (uInterior > 0.5 && dist < 260.0) {
      // ---- interior mapping ----
      vec3 rd = normalize(wp - cameraPosition);
      float depth = 5.0 + rnd*3.0;
      vec3 d = vec3(dot(rd, T), rd.y, -dot(rd, n));
      d.z = max(d.z, 1e-3);
      vec3 o = vec3(a, b, 0.0);
      float tx = d.x > 0.0 ? (ww - o.x) / d.x : -o.x / d.x;
      float ty = d.y > 0.0 ? (wh - o.y) / d.y : -o.y / d.y;
      float tz = depth / d.z;
      float t = min(min(tx, ty), tz);
      vec3 hit = o + d * t;
      vec3 wc = mix(vec3(0.8,0.78,0.72), roomPalette(hash21(cell*3.1+seed)), 0.28) * (0.55 + 0.45*hash21(cell+seed*7.0));
      vec3 surfc;
      if (t == tz) {                       // back wall
        surfc = wc;
        // furniture silhouettes: sofa / bed block + shelf
        float fx = smoothstep(0.0, 0.2, hit.x - ww*0.2) * smoothstep(0.0, 0.2, ww*0.8 - hit.x);
        float fy = smoothstep(0.75, 0.6, hit.y);
        surfc = mix(surfc, wc*0.35, fx*fy*step(0.4, rnd3));
        // tv glow / picture
        float tv = step(0.6, rnd3) * smoothstep(0.03,0.0, abs(hit.x - ww*(0.3+0.4*rnd2)) - ww*0.16) * smoothstep(0.03,0.0, abs(hit.y - 1.35) - 0.35);
        surfc = mix(surfc, vec3(0.3,0.5,1.0) * (0.9+0.5*sin(uTime*2.0 + rnd*30.0)), tv);
      } else if (t == ty) {                // floor or ceiling
        surfc = d.y < 0.0 ? vec3(0.22,0.15,0.1) : vec3(0.85);
      } else {
        surfc = wc * 0.9;
      }
      float dl = length(hit - vec3(ww*0.5, wh + 0.35, depth*0.45));
      float lamplight = 1.0 / (1.0 + dl*dl*0.11);
      float daylight = 0.05 + 0.10 * (1.0 - uNight);
      col = surfc * (daylight + lamplight * lit * occupied * roomI) * (lit*occupied > 0.5 ? mix(vec3(1.0), lamp, 0.65) : vec3(1.0));
      // curtains / blinds
      float blind = step(0.62, rnd2 * 0.7 + rnd3 * 0.5);
      float cover = mix(0.25, 1.0, hash21(cell + 9.0 + seed));
      float bl = blind * step(1.0 - cover, f.y > lo.y ? (f.y - lo.y)/(hi.y - lo.y) : 0.0);
      float slat = 0.75 + 0.25 * sin((f.y - lo.y) / (hi.y - lo.y) * 60.0);
      vec3 blindCol = mix(vec3(0.82,0.8,0.75), lamp, 0.4) * slat;
      col = mix(col, blindCol * (daylight*1.4 + lit*occupied*roomI*0.35), bl);
    } else {
      // far / low-quality: flat lit rooms
      float v = 0.6 + 0.4 * nz(vec3(a*0.6, b*0.6, rnd*20.0)).r;
      col = lamp * roomI * lit * occupied * v * 0.55 + vec3(0.03 + 0.05*(1.0-uNight));
    }
    emis = col * win;
    // glass properties
    s.alb = mix(wall, glassCol, win);
    s.metal = mix(0.0, 0.58, win);
    s.rough = mix(0.72, 0.05, win);
    s.h = -(1.0 - win) * 0.0 + (1.0 - win) * 0.012 * dfade(wp, 0.03);
    s.emis = emis * mix(1.0, 0.0, 0.0);
    s.ao = mix(1.0, 0.75, frameEdge*(1.0-win));
    // dark frame line around the glass
    s.alb = mix(s.alb, vec3(0.02), frameEdge * win * 0.6);
  } else if (win > 0.01) {
    s.alb = mix(wall, glassCol, win); s.metal = 0.5*win; s.rough = mix(0.7, 0.08, win);
  } else {
    s.alb = wall; s.rough = 0.75 + 0.15*wg; s.metal = 0.0;
    s.h = 0.006 * dfade(wp, 0.03) * (nz(wp*7.0).r - 0.5);
  }
}
`;

const facadeMats = {};
export function facadeMaterial(interior = true, vertexColors = false) {
  const key = vertexColors ? 'v' : 'i';
  if (facadeMats[key]) return facadeMats[key];
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, vertexColors });
  const uni = {
    uScale: { value: 1 }, uP: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Color(0) }, uWetAmt: { value: 1 },
    extra: { uLit: G.u.uLit, uInterior: { value: interior ? 1 : 0 } },
  };
  m.userData.uni = uni;
  m.customProgramCacheKey = () => 'facade' + key;
  m.onBeforeCompile = (shader) => {
    patchMaterial(shader, FACADE_PROC, uni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo; varying vec4 vInfo;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvInfo = aInfo;');
  };
  facadeMats[key] = m;
  return m;
}

// unit box with base at y=0 and an aInfo attribute slot (filled per instance by the caller)
export function facadeBoxGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}
