// Where is the player? Used by audio (indoor muffling), rain (sheltering) and HUD context.
import { APT_Y } from '../world/consts.js';

export function zoneAt(x, y, z, level, shops) {
  if (level === 1 || y > 100) {
    if (x > -38.2 && x < -30.8 && z < 20.5 && z > 15) return { name: 'balcony', indoor: false };
    if (x > -49.3 && x < -30.7 && z > 20.4 && z < 32.6) return { name: 'apartment', indoor: true };
    if (x > -34.2 && x < -20.3 && z > 32.5 && z < 36.5) return { name: 'hall', indoor: true };
    if (x > -27.3 && x < -24.7 && z > 36.4) return { name: 'elevator', indoor: true };
    return { name: 'hall', indoor: true };
  }
  if (x > -27.3 && x < -24.7 && z > 36.4 && z < 39) return { name: 'elevator', indoor: true };
  if (x > -52 && x < -22 && z > 20.4 && z < 36.4) return { name: 'lobby', indoor: true };
  if (shops?.burger?.inside(x, z)) return { name: 'burger', indoor: true };
  if (shops?.grocery?.inside(x, z)) return { name: 'grocery', indoor: true };
  if (x > -108 && x < -12 && z > -108 && z < -12) return { name: 'park', indoor: false };
  return { name: 'street', indoor: false };
}
