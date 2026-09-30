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

// Every knob the renderer honours. `res` is the starting internal resolution scale.
export const PRESETS = {
  low: {
    id: 'low', name: 'Low', res: 0.72, dprCap: 1, msaa: 0, ao: 0, aoTaps: 0, dof: 0, bloom: 1, bloomLevels: 4, shadow: 1024, shadowExtent: 45,
    lights: 6, planar: 0, probe: 0, interiorMap: 0, glass: 0, godrays: 0, traffic: 0.55, peds: 0.5, rain: 900, aniso: 2, fxaa: 1, streetDetail: 0.6, cloudQuality: 0,
  },
  medium: {
    id: 'medium', name: 'Medium', res: 0.9, dprCap: 1.25, msaa: 2, ao: 1, aoTaps: 8, dof: 0, bloom: 1, bloomLevels: 5, shadow: 2048, shadowExtent: 55,
    lights: 8, planar: 0.4, probe: 1, interiorMap: 0, glass: 1, godrays: 0, traffic: 0.8, peds: 0.75, rain: 2200, aniso: 4, fxaa: 0, streetDetail: 0.8, cloudQuality: 1,
  },
  high: {
    id: 'high', name: 'High', res: 1, dprCap: 1.5, msaa: 4, ao: 1, aoTaps: 12, dof: 1, bloom: 1, bloomLevels: 6, shadow: 4096, shadowExtent: 60,
    lights: 12, planar: 0.5, probe: 1, interiorMap: 1, glass: 1, godrays: 1, traffic: 1, peds: 1, rain: 4500, aniso: 8, fxaa: 0, streetDetail: 1, cloudQuality: 2,
  },
  ultra: {
    id: 'ultra', name: 'Ultra', res: 1, dprCap: 2, msaa: 4, ao: 1, aoTaps: 16, dof: 1, bloom: 1, bloomLevels: 6, shadow: 4096, shadowExtent: 70,
    lights: 16, planar: 0.75, probe: 1, interiorMap: 1, glass: 1, godrays: 1, traffic: 1, peds: 1, rain: 7000, aniso: 16, fxaa: 0, streetDetail: 1, cloudQuality: 2,
  },
};

export function pickPreset(gpu, override) {
  const key = override && override !== 'auto' ? override : gpu.tier;
  const p = { ...(PRESETS[key] || PRESETS.medium) };
  p.msaa = Math.min(p.msaa, gpu.maxSamples || 0);
  if (!gpu.floatRT) { p.msaa = 0; p.ao = 0; p.dof = 0; }
  p.aniso = Math.min(p.aniso, gpu.maxAniso || 1);
  p.shadow = Math.min(p.shadow, gpu.maxTex || 4096);
  return p;
}
