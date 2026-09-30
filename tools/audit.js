(() => {
  const { THREE, scene } = window.__game;
  window.__game.step(2);
  const rows = [];
  const box = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3();
  const skip = new Set([scene.children[1]]);
  scene.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    if (o.geometry.isInstancedBufferGeometry && !o.isInstancedMesh) return;
    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox);
    if (o.isInstancedMesh) { if (o.count > 1) return; }
    box.applyMatrix4(o.matrixWorld);
    box.getSize(sz); box.getCenter(ctr);
    const m = o.material;
    const chain = []; let p = o.parent; while (p && p !== scene) { chain.push(p.name || p.type); p = p.parent; }
    rows.push({ sz: sz.toArray(), ctr: ctr.toArray(), min: box.min.toArray(), max: box.max.toArray(), n: o.geometry.attributes.position.count, mat: (m && m.type || '') + '/' + (m && m.color ? m.color.getHexString() : ''), chain: chain.join('<') });
  });
  const f = (a) => a.map((v) => v.toFixed(1)).join(',');
  const big = rows.filter((r) => Math.max(...r.sz) > +('__MIN__') && Math.max(...r.sz) < 2000);
  big.sort((a, b) => Math.max(...b.sz) - Math.max(...a.sz));
  return big.map((r) => `${f(r.sz)} @ ${f(r.ctr)} n=${r.n} ${r.mat} ${r.chain}`).join('\n');
})()
