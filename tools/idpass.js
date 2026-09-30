(() => {
  window.__game.step(2); const { THREE, scene, renderer, camera } = window.__game;
  const pts = __PTS__;
  const objs = [null];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o === scene.children[1]) return;
    if (o.material && o.material.transparent) { o.visible = false; return; }
    if (o.geometry.isInstancedBufferGeometry && !o.isInstancedMesh) { o.visible = false; return; }
    if (o.isInstancedMesh && o.instanceColor) o.instanceColor = null;
    const id = objs.length; objs.push(o); o.userData.om = o.material;
    o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.SRGBColorSpace), side: THREE.DoubleSide, toneMapped: false });
  });
  scene.children[1].visible = false;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  scene.background = null;
  renderer.render(scene, camera);
  const cv = document.createElement('canvas'); cv.width = renderer.domElement.width; cv.height = renderer.domElement.height;
  const ctx = cv.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0);
  const desc = (o) => {
    const chain = []; let p = o; while (p && p !== scene) { chain.push(p.type + (p.name ? ':' + p.name : '')); p = p.parent; }
    const bs = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; const om = o.userData.om;
    return `#${objs.indexOf(o)} mat=${om && om.type}/${om && om.color ? om.color.getHexString() : ''}/${om && om.name} bb=[${bb.min.toArray().map((v) => v.toFixed(1))}]..[${bb.max.toArray().map((v) => v.toFixed(1))}] ${o.geometry.type}:${o.geometry.attributes.position.count}${o.isInstancedMesh ? 'x' + o.count : ''} pos=${o.position.toArray().map((v) => v.toFixed(1))} r=${bs.radius.toFixed(1)} layers=${o.layers.mask} chain=${chain.join('<')}`;
  };
  const res = {};
  for (const [x, y] of pts) {
    const d = ctx.getImageData(x, y, 1, 1).data; const id = d[0] | (d[1] << 8) | (d[2] << 16);
    res[`${x},${y}`] = id === 0 ? 'clear' : (objs[id] ? desc(objs[id]) : 'unknown ' + id);
  }
  return JSON.stringify({ w: cv.width, h: cv.height, res }, null, 1);
})()
