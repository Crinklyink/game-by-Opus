// Throwaway scene used to validate materials/sky/post before the real world exists.
import * as THREE from 'three';
import { pm, glowMat } from '../gfx/materials.js';

export function buildTestScene(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), pm('woodfloor', { color: 0xb98a5a, col2: 0x5a3a1e, p: [0.16, 1.5, 0, 0], wet: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const defs = [
    ['concrete', { color: 0xbdbdbd, p: [1, 0, 0, 0] }],
    ['marble', { color: 0xf0eeea, col2: 0x555a60 }],
    ['fabric', { color: 0x8a7f74 }],
    ['leather', { color: 0x6b3a22 }],
    ['metal', { color: 0xd9b26a, p: [0, 90, 0, 0] }],
    ['brick', { color: 0x9a4a35, col2: 0x6a2f22 }],
    ['tile', { color: 0xf2f2ee, col2: 0x8a8a86, p: [0.3, 0.1, 0.004, 1] }],
    ['woodfurn', { color: 0xa5703f, col2: 0x4b2a12 }],
    ['plaster', { color: 0xe9e3d8 }],
    ['terrazzo', { color: 0xd8d2c6, col2: 0x8a6a4a }],
  ];
  defs.forEach(([k, o], i) => {
    const m = pm(k, { rough: 0.5, physical: k === 'fabric', sheen: k === 'fabric' ? 1 : 0, sheenColor: 0xffffff, ...o });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), m);
    mesh.position.set(-5.5 + i * 1.2, 0.7, -2);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), pm('metal', { color: 0xffffff, p: [1, 40, 0, 0], rough: 0.2 }));
  s.position.set(-1, 0.6, 1); s.castShadow = true; scene.add(s);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), glowMat(0xffc880, 40));
  lamp.position.set(1.5, 1.2, 0.5); scene.add(lamp);
  const pl = new THREE.PointLight(0xffc880, 40, 12, 2); pl.position.copy(lamp.position); scene.add(pl);
}
