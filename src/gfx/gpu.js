// GPU detection + quality presets.
// The game always asks the browser for the high-performance (discrete) GPU via
// powerPreference, then picks a preset from the real renderer string. A dynamic
// resolution scaler (see main.js) keeps the frame rate up on top of that.

export function detectGPU() {
  const info = { ok: false, renderer: 'unknown', vendor: 'unknown', software: false, tier: 'low', maxSamples: 0, floatRT: false, maxTex: 4096, maxAniso: 1 };
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    if (!gl) return info;
    info.ok = true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    info.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    info.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    info.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
    info.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    info.floatRT = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    info.maxAniso = an ? gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    const s = String(info.renderer).toLowerCase();
    info.software = /swiftshader|llvmpipe|softpipe|software|microsoft basic|mesa offscreen/.test(s);
    if (info.software) info.tier = 'low';
    else if (/rtx\s?(30|40|50)\d\d|rtx\s?a\d|rtx\s?ada|rx\s?(6[7-9]|7|9)\d\d|radeon\s?rx\s?(6[7-9]|7|9)|m[2-9]\s?(pro|max|ultra)|geforce\s?(gtx\s?)?(1080|1660)|arc\s?a[57]|rtx\s?20(7|8)0|titan|quadro\s?rtx/.test(s)) info.tier = 'ultra';
    else if (/nvidia|geforce|rtx|gtx|radeon\s?(rx|pro)|apple\s?m|apple\s?gpu|arc\s/.test(s)) info.tier = 'high';
    else if (/intel|uhd|iris|radeon|vega|adreno|mali|graphics/.test(s)) info.tier = 'medium';
    else info.tier = 'medium';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch (e) { /* ignore */ }
  return info;
}

// Human-friendly GPU name for menus/overlays ("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x...) Direct3D11 ...)" -> "NVIDIA GeForce RTX 4070").
export function prettyGPU(r) {
  let s = String(r || 'Unknown GPU');
  if (/swiftshader|llvmpipe|softpipe|mesa offscreen|microsoft basic/i.test(s)) return 'Software renderer (no GPU acceleration)';
  const m = s.match(/^ANGLE \((.*)\)$/);
  if (m) { const parts = m[1].split(/,\s*/); s = parts.length >= 2 ? parts[1] : parts[0]; }
  s = s.replace(/\(0x[0-9a-f]+\)/gi, '').replace(/Direct3D\d+.*$/i, '').replace(/vs_\d_\d.*$/i, '').replace(/OpenGL.*$/i, '').replace(/^ANGLE Metal Renderer:\s*/i, '').replace(/\s{2,}/g, ' ').trim();
  return s.length > 48 ? s.slice(0, 47) + '…' : s;
}

// Every knob the renderer honours. `res` is the starting internal resolution scale.
export const PRESETS = {
  low: {
    id: 'low', name: 'Low', maxPixels: 1.3e6, res: 0.72, dprCap: 1, msaa: 0, ao: 0, aoTaps: 0, dof: 0, bloom: 1, bloomLevels: 4, shadow: 1024, shadowExtent: 45,
    mirrors: 0, lights: 6, spots: 0, sdf: 1, sdfVoxel: 0.2, sdfTaps: 3, sdfSteps: 10, sdfLights: 0, sdfSpots: 0, sdfAO: 0.85, planar: 0, probe: 0, interiorMap: 0, glass: 0, godrays: 0, traffic: 0.55, peds: 0.5, rain: 900, aniso: 2, fxaa: 1, streetDetail: 0.6, cloudQuality: 0, foliage: 0.3,
  },
  medium: {
    id: 'medium', name: 'Medium', maxPixels: 2.4e6, res: 0.9, dprCap: 1.25, msaa: 2, ao: 1, aoTaps: 8, dof: 0, bloom: 1, bloomLevels: 5, shadow: 2048, shadowExtent: 55,
    mirrors: 0.5, lights: 8, spots: 3, sdf: 1, sdfVoxel: 0.16, sdfTaps: 4, sdfSteps: 12, sdfLights: 1, sdfSpots: 0, sdfAO: 0.9, planar: 0.4, probe: 1, interiorMap: 0, glass: 1, godrays: 0, traffic: 0.8, peds: 0.75, rain: 2200, aniso: 4, fxaa: 0, streetDetail: 0.8, cloudQuality: 1, foliage: 0.6,
  },
  high: {
    id: 'high', name: 'High', maxPixels: 3.8e6, res: 1, dprCap: 1.5, msaa: 4, ao: 1, aoTaps: 12, dof: 1, bloom: 1, bloomLevels: 6, shadow: 4096, shadowExtent: 60,
    mirrors: 0.8, lights: 12, spots: 6, sdf: 1, sdfVoxel: 0.15, sdfTaps: 5, sdfSteps: 16, sdfLights: 2, sdfSpots: 1, sdfAO: 1, planar: 0.5, probe: 1, interiorMap: 1, glass: 1, godrays: 1, traffic: 1, peds: 1, rain: 4500, aniso: 8, fxaa: 0, streetDetail: 1, cloudQuality: 2, foliage: 1,
  },
  ultra: {
    id: 'ultra', name: 'Ultra', maxPixels: 5.2e6, res: 1, dprCap: 2, msaa: 4, ao: 1, aoTaps: 16, dof: 1, bloom: 1, bloomLevels: 6, shadow: 4096, shadowExtent: 70,
    mirrors: 1, lights: 16, spots: 10, sdf: 1, sdfVoxel: 0.15, sdfTaps: 6, sdfSteps: 20, sdfLights: 3, sdfSpots: 2, sdfAO: 1, planar: 0.75, probe: 1, interiorMap: 1, glass: 1, godrays: 1, traffic: 1, peds: 1, rain: 7000, aniso: 16, fxaa: 0, streetDetail: 1, cloudQuality: 2, foliage: 1.3,
  },
};

export function pickPreset(gpu, override) {
  // 'auto' never picks Ultra: it costs ~30% more than High for little visible gain; it stays an explicit choice in Settings
  gpu.auto = gpu.tier === 'ultra' ? 'high' : gpu.tier;
  const key = override && override !== 'auto' ? override : gpu.auto;
  const p = { ...(PRESETS[key] || PRESETS.medium) };
  p.msaa = Math.min(p.msaa, gpu.maxSamples || 0);
  if (!gpu.floatRT) { p.msaa = 0; p.ao = 0; p.dof = 0; }
  p.aniso = Math.min(p.aniso, gpu.maxAniso || 1);
  p.shadow = Math.min(p.shadow, gpu.maxTex || 4096);
  return p;
}
