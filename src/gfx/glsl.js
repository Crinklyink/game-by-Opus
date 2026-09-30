// Shared GLSL chunks. All shaders (sky, patched PBR materials, glass, ground...)
// are assembled from these so lighting/fog/noise stay consistent everywhere.

export const COMMON = /* glsl */`
uniform sampler3D uNoise3;
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash31(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
vec4 nz(vec3 p){ return texture(uNoise3, p); }
float sat1(float x){ return clamp(x, 0.0, 1.0); }
float dfade(vec3 wp, float feat){ float fp = length(fwidth(wp)); return 1.0 - smoothstep(feat*0.7, feat*4.0, fp); }
`;

// Sky colour + atmospheric fog. Uniforms come from G.u (see G.js).
export const SKY = /* glsl */`
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunCol, uGlowCol, uCityGlow;
uniform float uNight, uCloudCov, uCloudDark, uDisk, uTime, uFogDen, uFogH, uFlash;

vec3 horizonCol(vec3 rd){
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 c = uHorizon;
  c += uGlowCol * (pow(sd, 5.0)*0.22 + pow(sd, 28.0)*0.55) * (1.0 - uNight);
  c += uCityGlow;
  c += vec3(0.6,0.65,0.9) * uFlash * 0.25;
  return c;
}

vec3 skyColor(vec3 rd){
  float y = rd.y;
  float h = clamp(y, 0.0, 1.0);
  vec3 hz = horizonCol(rd);
  vec3 col = mix(uZenith, hz, pow(1.0 - h, 3.2));
  if (y < 0.0) col = hz * (1.0 + y*0.25);

  // stars
  if (uNight > 0.02 && y > -0.05) {
    vec3 sp = rd * 170.0;
    vec3 id = floor(sp);
    vec3 fr = fract(sp) - 0.5;
    float rr = hash31(id);
    vec3 off = (hash33(id) - 0.5) * 0.7;
    float d = length(fr - off);
    float star = smoothstep(0.14, 0.0, d) * step(0.955, rr);
    float tw = 0.7 + 0.3*sin(uTime*(1.5+rr*5.0)+rr*80.0);
    col += vec3(0.85,0.92,1.1) * star * tw * (1.2 + rr*5.0) * uNight * smoothstep(-0.02,0.2,y) * (1.0 - uCloudCov*0.95);
    // faint milky band
    float band = abs(dot(rd, normalize(vec3(0.35,0.55,-0.75))));
    float mw = smoothstep(0.28, 0.0, band) * (0.3 + 0.7*nz(vec3(rd.xz*3.0, rd.y*2.0)).r);
    col += vec3(0.18,0.2,0.3) * mw * mw * 0.35 * uNight * (1.0 - uCloudCov);
  }

  // moon
  float md = dot(rd, uMoonDir);
  float moonR = 0.03;
  if (md > 0.99) {
    vec3 mt = normalize(cross(uMoonDir, vec3(0.0,1.0,0.0)));
    vec3 mb = cross(mt, uMoonDir);
    vec2 mu = vec2(dot(rd, mt), dot(rd, mb)) / moonR;
    float r2 = dot(mu, mu);
    float disk = smoothstep(1.0, 0.94, r2);
    if (disk > 0.0) {
      float mz = sqrt(max(0.0, 1.0 - r2));
      vec3 mn = normalize(vec3(mu, mz));
      float lit = clamp(dot(mn, normalize(vec3(0.42, 0.22, 0.88))) * 1.15, 0.0, 1.0);
      float mare = smoothstep(0.42, 0.62, nz(vec3(mu*0.6 + 0.5, 0.3)).r);
      float crat = nz(vec3(mu*2.4, 0.7)).b;
      float alb = 0.95 - mare*0.42 - crat*0.12 + 0.08*nz(vec3(mu*9.0, 0.2)).r;
      col = mix(col, vec3(1.0,0.97,0.9) * alb * lit * 3.2, disk * (0.25 + 0.75*uNight));
    }
  }
  float moonGlow = pow(max(md, 0.0), 160.0) * 0.5 + pow(max(md, 0.0), 24.0) * 0.06;
  col += vec3(0.55,0.65,1.0) * moonGlow * uNight;

  // sun disk
  float sd = dot(rd, uSunDir);
  float sunMask = smoothstep(cos(0.0125), cos(0.0095), sd);
  col += uSunCol * 55.0 * sunMask * uDisk * (1.0 - uCloudCov*0.85);

  // clouds (two noise scales projected on a plane)
  if (y > -0.02) {
    float t = 1.0 / max(y + 0.07, 0.07);
    vec2 cuv = rd.xz * t * 0.30 + vec2(uTime*0.0065, uTime*0.0021);
    float d1 = nz(vec3(cuv*0.55, uTime*0.0008)).r;
    float d2 = nz(vec3(cuv*1.9 + 3.1, uTime*0.0014)).b;
    float d3 = nz(vec3(cuv*5.7 - 1.7, 0.31)).r;
    float dens = d1*0.52 + d2*0.32 + d3*0.16;
    float thr = mix(0.60, 0.26, uCloudCov);
    float c = smoothstep(thr, thr + 0.2, dens);
    vec2 so = normalize(uSunDir.xz + vec2(1e-4)) * 0.07;
    float dens2 = nz(vec3((cuv+so)*0.55, uTime*0.0008)).r*0.52 + nz(vec3((cuv+so)*1.9 + 3.1, uTime*0.0014)).b*0.32 + nz(vec3((cuv+so)*5.7 - 1.7, 0.31)).r*0.16;
    float lit = clamp(0.62 + (dens - dens2)*5.0, 0.0, 1.0);
    vec3 shade = mix(uZenith, hz, 0.55) * 0.85 + uCityGlow*3.0;
    vec3 bright = uSunCol * (0.8 + pow(max(sd,0.0), 6.0)*1.6) + shade*0.35;
    vec3 ccol = mix(shade, bright, lit * (1.0 - uNight));
    ccol += vec3(0.3,0.36,0.5) * lit * uNight * 0.12;
    ccol += uCityGlow * 5.0 * (1.0 - h*0.5);
    ccol *= 1.0 - uCloudDark * 0.62;
    ccol += vec3(0.7,0.75,1.0) * uFlash * 0.6;
    col = mix(col, ccol, c * smoothstep(-0.02, 0.10, y) * (0.92));
  }
  return col;
}

float fogFactor(vec3 wp){
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  float a = uFogH;
  float dy = v.y;
  float t = abs(dy*a) < 1e-3 ? 1.0 : (1.0 - exp(-dy*a)) / (dy*a);
  float od = uFogDen * exp(-a*cameraPosition.y) * dist * t;
  return 1.0 - exp(-od);
}

vec3 applyFog(vec3 col, vec3 wp){
  vec3 rd = normalize(wp - cameraPosition);
  return mix(col, horizonCol(rd) * 0.94, fogFactor(wp));
}
`;

// Light-weight fog transmittance (for additive sprites) - no sky dependency.
export const FOG_T = /* glsl */`
uniform float uFogDen, uFogH;
float fogTrans(vec3 wp){
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  float a = uFogH;
  float dy = v.y;
  float t = abs(dy*a) < 1e-3 ? 1.0 : (1.0 - exp(-dy*a)) / (dy*a);
  return exp(-uFogDen * exp(-a*cameraPosition.y) * dist * t);
}
`;

// ---------------- procedural surface library ----------------
// Each entry defines: void surf(vec3 p, vec3 n, vec3 wp, inout S s)
//  p  = local position * uScale     n = world normal     wp = world position
//  S  = { alb, rough, metal, h (height in metres, drives bump), emis, ao }
export const PROC = {
  plain: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  s.h = 0.0;
}`,

  plaster: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec4 a = nz(p*0.31); vec4 b = nz(p*2.3+0.2); vec4 c = nz(p*19.0);
  s.alb *= 0.9 + 0.16*a.r + 0.05*b.b;
  s.rough = 0.8 + 0.12*b.r;
  s.h = ((c.b-0.5)*0.0006 + (b.r-0.5)*0.0012) * dfade(wp, 0.01);
}`,

  woodfloor: /* glsl */`
uniform vec3 uCol2; uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float pw = uP.x; float pl = uP.y;
  vec2 q = p.xz;
  float row = floor(q.y / pw);
  float off = hash11(row * 7.13) * pl;
  float xx = q.x + off;
  float col = floor(xx / pl);
  float rnd = hash21(vec2(col, row));
  vec2 f = vec2(xx - col*pl, q.y - row*pw);
  float edge = min(min(f.x, pl - f.x), min(f.y, pw - f.y));
  float gv = smoothstep(0.0, 0.0024, edge);
  float g1 = nz(vec3(xx*0.22 + rnd*13.0, q.y*6.5, rnd*7.0)).r;
  float g2 = nz(vec3(xx*0.9 + rnd*3.0, q.y*26.0, rnd*2.0+0.5)).b;
  float ring = fract(g1*7.5 + g2*1.3);
  ring = smoothstep(0.0, 0.5, ring)*smoothstep(1.0, 0.55, ring);
  float tone = mix(0.78, 1.14, hash21(vec2(col+0.3, row)*1.7));
  vec3 wood = mix(s.alb, uCol2, ring*0.55 + g2*0.2) * tone;
  float kn = nz(vec3(xx*1.5+rnd*30.0, q.y*11.0, rnd)).g;
  wood *= 1.0 - smoothstep(0.88, 0.96, kn)*0.4;
  s.alb = wood * (0.3 + 0.7*gv);
  s.rough = mix(0.3, 0.46, g2) + (1.0-gv)*0.45;
  s.h = (-(1.0-gv)*0.0016 + (ring-0.5)*0.00025 + (g2-0.5)*0.0002) * dfade(wp, 0.01);
}`,

  woodfurn: /* glsl */`
uniform vec3 uCol2; uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec3 q = uP.x > 1.5 ? p.zyx : (uP.x > 0.5 ? p.yxz : p);       // grain runs along q.x
  vec3 warp = nz(q*vec3(0.35,2.2,2.2)).rgb - 0.5;
  float r = length(q.yz + warp.yz*0.022) * 26.0 + warp.x*0.7;
  float ring = fract(r);
  ring = smoothstep(0.0,0.6,ring)*smoothstep(1.0,0.55,ring);
  float fine = nz(q*vec3(1.2, 34.0, 34.0)).b;
  float streak = nz(q*vec3(0.9, 90.0, 90.0)).a;
  s.alb = mix(s.alb, uCol2, ring*0.5 + fine*0.14) * (0.94 + 0.1*streak);
  s.rough = 0.36 + 0.12*fine;
  s.h = ((ring-0.5)*0.00018 + (fine-0.5)*0.00014) * dfade(wp, 0.005);
}`,

  concrete: /* glsl */`
uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float t = nz(p*0.6).r, m = nz(p*3.7).b, g = nz(p*31.0).r;
  float pores = smoothstep(0.83, 0.93, nz(p*17.0+0.37).g);
  s.alb *= (0.78 + 0.32*t) * (0.92 + 0.12*m) * (1.0 - pores*0.5) * (0.94 + 0.1*g);
  s.rough = 0.86 - pores*0.1 + 0.08*m;
  float hh = (g-0.5)*0.0006 - pores*0.0008;
  if (uP.x > 0.5) {
    float u = abs(n.x) > abs(n.z) ? p.z : p.x;
    float v = p.y;
    float sx = abs(fract(u/1.2+0.5)-0.5)*1.2;
    float sy = abs(fract(v/2.4+0.5)-0.5)*2.4;
    float groove = smoothstep(0.005, 0.0, min(sx, sy)) * step(abs(n.y), 0.5);
    vec2 gq = vec2(fract(u/0.6)-0.5, fract((v+0.3)/0.6)-0.5)*0.6;
    float hole = smoothstep(0.022, 0.014, length(gq)) * step(abs(n.y), 0.5);
    s.alb *= 1.0 - groove*0.35 - hole*0.55;
    hh += -groove*0.002 - hole*0.004;
  }
  s.h = hh * dfade(wp, 0.008);
}`,

  marble: /* glsl */`
uniform vec3 uCol2;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec3 w = nz(p*0.33 + 0.11).rgb - 0.5;
  float n1 = nz(p*0.45 + w*1.1).r;
  float v1 = smoothstep(0.035, 0.0, abs(n1 - 0.5));
  float n2 = nz(p*1.15 + w*0.7 + 3.0).b;
  float v2 = smoothstep(0.02, 0.0, abs(n2 - 0.5)) * 0.65;
  float cloud = nz(p*2.6).r;
  vec3 base = s.alb * (0.9 + 0.14*cloud);
  s.alb = mix(base, uCol2, clamp(v1*0.85 + v2*0.5, 0.0, 1.0));
  s.rough = mix(0.06, 0.16, nz(p*7.0).b) + v1*0.04;
  s.h = 0.0;
}`,

  fabric: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec3 an = abs(n);
  vec2 uv = (an.y > an.x && an.y > an.z) ? p.xz : (an.x > an.z ? p.zy : p.xy);
  float low = nz(p*4.5).r;
  float nub = nz(p*70.0).g;
  float weave = sin(uv.x*900.0)*sin(uv.y*900.0);
  float fd = dfade(wp, 0.004);
  s.alb *= (0.88 + 0.2*low) * (0.94 + 0.1*nub);
  s.rough = 0.93;
  s.h = (nub*0.0011 + weave*0.00012) * fd;
  s.ao = 0.85 + 0.15*nub;
}`,

  leather: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float c = nz(p*95.0).g, c2 = nz(p*40.0+0.1).g;
  s.h = (smoothstep(0.2,0.9,c)*0.0008 + smoothstep(0.2,0.9,c2)*0.0006) * dfade(wp, 0.004);
  s.alb *= 0.85 + 0.2*nz(p*3.0).r - (1.0-c)*0.08;
  s.rough = 0.4 + 0.16*(1.0-c);
}`,

  metal: /* glsl */`
uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float ax = uP.x;
  vec3 st = ax < 0.5 ? vec3(0.08,1.0,1.0) : (ax < 1.5 ? vec3(1.0,0.08,1.0) : vec3(1.0,1.0,0.08));
  float sc = max(uP.y, 1.0);
  float streak = nz(p*st*sc).b*0.6 + nz(p*st*sc*3.1).r*0.4;
  s.rough = mix(0.16, 0.42, streak);
  s.alb *= 0.9 + 0.15*streak;
  s.h = (streak-0.5)*0.00014*dfade(wp, 0.004);
  s.metal = 1.0;
}`,

  tile: /* glsl */`
uniform vec3 uCol2; uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec3 an = abs(n);
  vec2 uv = an.y > 0.7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  vec2 sz = uP.xy;
  float row = floor(uv.y/sz.y);
  float off = mod(row, 2.0)*0.5*sz.x*uP.w;
  float cx = (uv.x+off)/sz.x;
  vec2 cell = vec2(floor(cx), row);
  vec2 f = vec2(fract(cx)*sz.x, fract(uv.y/sz.y)*sz.y);
  float e = min(min(f.x, sz.x-f.x), min(f.y, sz.y-f.y));
  float g = smoothstep(uP.z*0.5, uP.z*0.5+0.0007, e);
  float bev = smoothstep(uP.z*0.5, uP.z*0.5+0.004, e);
  float r = hash21(cell);
  vec3 tc = s.alb * (0.93 + 0.1*r);
  s.alb = mix(uCol2, tc, g);
  s.rough = mix(0.9, 0.1 + 0.07*r, g);
  s.h = (-(1.0-bev)*0.0012 + (r-0.5)*0.0002) * dfade(wp, 0.01);
}`,

  brick: /* glsl */`
uniform vec3 uCol2;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 uv = abs(n.x) > abs(n.z) ? p.zy : p.xy;
  float bw = 0.215, bh = 0.065, mj = 0.0105;
  float row = floor(uv.y/(bh+mj));
  float off = mod(row, 2.0)*0.5*(bw+mj);
  float cx = (uv.x+off)/(bw+mj);
  vec2 cell = vec2(floor(cx), row);
  vec2 f = vec2(fract(cx)*(bw+mj), fract(uv.y/(bh+mj))*(bh+mj));
  float mx = smoothstep(0.0, 0.0018, f.x)*smoothstep(0.0, 0.0018, bw-f.x);
  float my = smoothstep(0.0, 0.0018, f.y)*smoothstep(0.0, 0.0018, bh-f.y);
  float b = mx*my;
  float r = hash21(cell);
  vec3 bc = mix(s.alb, uCol2, r) * (0.82 + 0.3*nz(p*9.0).r) * (0.9 + 0.2*nz(p*44.0).g);
  s.alb = mix(vec3(0.42,0.4,0.37)*(0.8+0.3*nz(p*20.0).r), bc, b);
  s.rough = 0.88;
  s.h = (-(1.0-b)*0.003 + nz(p*38.0).r*0.0007) * dfade(wp, 0.01);
}`,

  paint: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  s.alb *= 0.98 + 0.05*nz(p*7.0).r;
  s.h = (nz(p*45.0).b - 0.5)*0.00008*dfade(wp,0.003);
}`,

  rubber: /* glsl */`
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float g = nz(p*24.0).r;
  s.alb *= 0.85 + 0.3*g;
  s.rough = 0.8 + 0.15*g;
  s.h = (g-0.5)*0.0006*dfade(wp,0.006);
}`,

  carpet: /* glsl */`
uniform vec3 uCol2;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  float loop = nz(p*52.0).g;
  float stripe = smoothstep(0.02,0.03,abs(fract(p.x*0.35 + 0.5)-0.5)) ;
  vec3 c = mix(uCol2, s.alb, stripe);
  s.alb = c * (0.78 + 0.32*loop) * (0.9 + 0.15*nz(p*2.0).r);
  s.rough = 0.95;
  s.h = loop*0.0014*dfade(wp, 0.004);
  s.ao = 0.75 + 0.25*loop;
}`,

  foliage: /* glsl */`
uniform vec3 uCol2;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 uv = vUvP;
  float mid = smoothstep(0.03, 0.0, abs(uv.x - 0.5));
  float side = smoothstep(0.1, 0.0, abs(fract(uv.y*7.0 + abs(uv.x-0.5)*3.2) - 0.5) - 0.42);
  float v = clamp(mid*0.8 + side*0.45, 0.0, 1.0);
  vec3 c = mix(s.alb, uCol2, uv.y*0.5 + nz(p*2.3).r*0.3);
  s.alb = mix(c, c*1.5+0.02, v*0.5) * (0.85 + 0.25*nz(p*14.0).r);
  s.rough = 0.55;
  s.h = (v*0.0009 + (nz(p*30.0).b-0.5)*0.0003) * dfade(wp, 0.004);
  float fd = gl_FrontFacing ? 1.0 : -1.0;
  float back = clamp(-dot(n*fd, uSunDir), 0.0, 1.0);
  s.emis += s.alb * uSunCol * back * 0.28 * (1.0 - uNight);
}`,

  terrazzo: /* glsl */`
uniform vec3 uCol2;
vec2 vor2(vec2 x, out vec2 id){
  vec2 n = floor(x), f = fract(x); float md = 8.0; vec2 mg = vec2(0.0);
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec2 g = vec2(float(i),float(j)); vec2 o = hash22(n+g);
    vec2 r = g + o - f; float d = dot(r,r);
    if (d < md){ md = d; mg = n+g; }
  }
  id = mg; return vec2(sqrt(md), 0.0);
}
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 id; vec2 d = vor2(p.xz*24.0, id);
  float chip = smoothstep(0.48, 0.40, d.x);
  float rc = hash21(id);
  vec3 cc = rc < 0.33 ? vec3(0.62,0.6,0.56) : (rc < 0.66 ? vec3(0.2,0.2,0.22) : uCol2);
  float lg = smoothstep(0.30, 0.58, nz(p*0.9).r);
  s.alb = mix(s.alb*(0.94+0.08*nz(p*6.0).r), mix(s.alb, cc, 0.6), chip*0.8);
  s.rough = 0.18 + 0.08*nz(p*12.0).b;
  s.h = 0.0;
}`,

  rug: /* glsl */`
uniform vec3 uCol2; uniform vec4 uP;
void surf(vec3 p, vec3 n, vec3 wp, inout S s){
  vec2 q = p.xz;
  float e = min(uP.y - abs(q.x), uP.z - abs(q.y));
  float band1 = step(0.06, e) * step(e, 0.16);
  float band2 = step(0.22, e) * step(e, 0.245);
  vec2 g = fract(q*uP.x) - 0.5;
  float dia = abs(g.x) + abs(g.y);
  float field = smoothstep(0.34, 0.3, dia) * 0.16 * step(0.3, e);
  vec3 c = mix(s.alb, uCol2, clamp(band1*0.9 + band2*0.7, 0.0, 1.0));
  c *= 1.0 - field;
  float pile = nz(p*60.0).g;
  s.alb = c * (0.84 + 0.26*pile) * (0.93 + 0.12*nz(p*1.7).r);
  s.rough = 0.96;
  s.h = pile*0.0016*dfade(wp,0.004);
  s.ao = 0.72 + 0.28*pile;
}`,
};
