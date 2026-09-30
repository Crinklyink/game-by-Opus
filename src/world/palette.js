// Shared material palette for the interior spaces (apartment, hall, lobby, shops).
import * as THREE from 'three';
import { pm, glowMat } from '../gfx/materials.js';

const I = { interior: true, env: 0.6 };
let cached = null;

export function palette() {
  if (cached) return cached;
  const M = {
    wall: pm('plaster', { color: 0xe6e0d4, ...I }),
    wallWarm: pm('plaster', { color: 0xd9cbb4, ...I }),
    wallSage: pm('plaster', { color: 0x59695c, ...I }),
    wallDark: pm('plaster', { color: 0x2b2e33, ...I }),
    wallBlue: pm('plaster', { color: 0x2f3f52, ...I }),
    ceiling: pm('plaster', { color: 0xf1eee7, ...I }),
    trim: pm('paint', { color: 0xf3f0e9, rough: 0.45, ...I }),
    floor: pm('woodfloor', { color: 0xc9a373, col2: 0x7c5430, p: [0.19, 1.7, 0, 0], physical: true, clearcoat: 0.3, ccRough: 0.22, ...I }),
    floorDark: pm('woodfloor', { color: 0x6a4a30, col2: 0x2e1c0f, p: [0.14, 1.2, 0, 0], physical: true, clearcoat: 0.3, ccRough: 0.25, ...I }),
    oak: pm('woodfurn', { color: 0xcfa872, col2: 0x84592e, ...I }),
    walnut: pm('woodfurn', { color: 0x6b4229, col2: 0x2c170b, physical: true, clearcoat: 0.2, ccRough: 0.3, ...I }),
    walnutV: pm('woodfurn', { color: 0x6b4229, col2: 0x2c170b, p: [1, 0, 0, 0], physical: true, clearcoat: 0.2, ccRough: 0.3, ...I }),
    oakV: pm('woodfurn', { color: 0xcfa872, col2: 0x84592e, p: [1, 0, 0, 0], ...I }),
    ash: pm('woodfurn', { color: 0xdcc9a6, col2: 0xa88d5e, ...I }),
    blackMetal: pm('metal', { color: 0x18191b, p: [0, 70, 0, 0], rough: 0.55, ...I }),
    brass: pm('metal', { color: 0xd8ac5c, p: [0, 90, 0, 0], ...I }),
    steel: pm('metal', { color: 0xcdd0d4, p: [1, 130, 0, 0], ...I }),
    chrome: pm('plain', { color: 0xffffff, metal: 1, rough: 0.06, ...I }),
    marbleW: pm('marble', { color: 0xf6f4f0, col2: 0x62666d, physical: true, clearcoat: 0.6, ccRough: 0.06, ...I }),
    marbleD: pm('marble', { color: 0x1c1d20, col2: 0xb89e66, physical: true, clearcoat: 0.6, ccRough: 0.06, ...I }),
    quartz: pm('plain', { color: 0xe9e6e0, rough: 0.22, physical: true, clearcoat: 0.3, ...I }),
    boucle: pm('fabric', { color: 0xe9e0d0, physical: true, sheen: 1, sheenColor: 0xfff4e0, sheenRough: 0.5, ...I }),
    linen: pm('fabric', { color: 0xcfc4ae, physical: true, sheen: 0.7, sheenColor: 0xffffff, ...I }),
    charcoal: pm('fabric', { color: 0x3a3d43, physical: true, sheen: 0.8, sheenColor: 0x9aa0b0, ...I }),
    rust: pm('fabric', { color: 0x9c4a28, physical: true, sheen: 1, sheenColor: 0xffb080, ...I }),
    sage: pm('fabric', { color: 0x7d8d78, physical: true, sheen: 0.8, sheenColor: 0xe0f0d8, ...I }),
    navy: pm('fabric', { color: 0x202b46, physical: true, sheen: 0.9, sheenColor: 0x8090c0, ...I }),
    mustard: pm('fabric', { color: 0xc59a2c, physical: true, sheen: 0.8, sheenColor: 0xffe080, ...I }),
    white: pm('fabric', { color: 0xf1efe9, physical: true, sheen: 0.6, sheenColor: 0xffffff, ...I }),
    leather: pm('leather', { color: 0x8a4a25, physical: true, clearcoat: 0.18, ccRough: 0.35, ...I }),
    leatherBlack: pm('leather', { color: 0x1d1c1d, physical: true, clearcoat: 0.2, ccRough: 0.3, ...I }),
    rug: pm('rug', { color: 0xd8cdb8, col2: 0x8a7860, p: [1.5, 0, 0, 0], ...I }),
    rugBed: pm('rug', { color: 0x9aa39a, col2: 0x5c665e, p: [2.2, 0, 0, 0], ...I }),
    carpet: pm('carpet', { color: 0x5b2d34, col2: 0x2f2027, ...I }),
    ceramic: pm('plain', { color: 0xf1efe9, rough: 0.2, physical: true, clearcoat: 0.6, ccRough: 0.05, ...I }),
    terracotta: pm('plain', { color: 0xb45f3b, rough: 0.8, ...I }),
    blackCeramic: pm('plain', { color: 0x171719, rough: 0.28, physical: true, clearcoat: 0.6, ...I }),
    soil: pm('plain', { color: 0x2a1d14, rough: 1, ...I }),
    leaf: pm('foliage', { color: 0x2d6a38, col2: 0x1b4a27, side: THREE.DoubleSide, ...I }),
    leafLight: pm('foliage', { color: 0x4a8a3c, col2: 0x2f6a2a, side: THREE.DoubleSide, ...I }),
    leafDark: pm('foliage', { color: 0x1e4d2c, col2: 0x133a20, side: THREE.DoubleSide, ...I }),
    rubber: pm('rubber', { color: 0x101011, ...I }),
    plasticW: pm('plain', { color: 0xf2f2f0, rough: 0.35, ...I }),
    plasticB: pm('plain', { color: 0x151517, rough: 0.35, ...I }),
    glass: pm('plain', { color: 0x0a1518, rough: 0.02, glass: true, opacity: 0.09, side: THREE.DoubleSide, ...I }),
    glassBlack: pm('plain', { color: 0x050506, rough: 0.05, physical: true, clearcoat: 1, ccRough: 0.02, ...I }),
    tileSubway: pm('tile', { color: 0xf3f2ee, col2: 0x9b9a95, p: [0.30, 0.10, 0.004, 1], ...I }),
    tileBath: pm('tile', { color: 0xdad8d2, col2: 0x86847e, p: [0.6, 0.3, 0.005, 0], ...I }),
    tileDark: pm('tile', { color: 0x2e3238, col2: 0x15171a, p: [0.6, 0.3, 0.005, 0], ...I }),
    concrete: pm('concrete', { color: 0xa9a7a2, p: [1, 0, 0, 0], ...I }),
    paper: pm('plain', { color: 0xf3efe4, rough: 0.9, ...I }),
    // emissive fixtures
    bulb: glowMat(0xffc884, 7, { interior: true }),
    bulbCool: glowMat(0xdde8ff, 6, { interior: true }),
    led: glowMat(0xffd9a8, 4.5, { interior: true }),
    ledCool: glowMat(0xc8d8ff, 4, { interior: true }),
    shade: pm('fabric', { color: 0xf1e4c8, emissive: 0xffc57a, emissiveI: 1.6, ...I }),
    flame: glowMat(0xffa23a, 9, { interior: true }),
  };
  cached = M;
  return M;
}
