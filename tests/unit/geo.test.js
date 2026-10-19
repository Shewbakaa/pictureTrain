import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { part, mergeParts, triangleCount, moveParts, jitterColor } from '../../site/src/util/geo.js';
import { createRng } from '../../site/src/util/rng.js';

test('mergeParts merges positions, flat normals and colours', () => {
  const coneCount = new THREE.ConeGeometry(0.5, 1, 5).toNonIndexed().attributes.position.count;
  const g = mergeParts([
    part(new THREE.BoxGeometry(1, 1, 1), '#ff0000'),
    part(new THREE.ConeGeometry(0.5, 1, 5), '#00ff00', { position: [0, 2, 0] }),
  ]);
  assert.equal(g.index, null);
  assert.equal(g.attributes.position.count, 36 + coneCount);
  assert.ok(Math.abs(g.attributes.color.getX(0) - new THREE.Color('#ff0000').r) < 1e-6);
  assert.ok(Math.abs(g.attributes.color.getY(36) - new THREE.Color('#00ff00').g) < 1e-6);
  assert.ok(Math.abs(g.boundingBox.max.y - 2.5) < 1e-6);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4);
});

test('triangleCount', () => {
  assert.equal(triangleCount(new THREE.BoxGeometry().toNonIndexed()), 12);
  assert.equal(triangleCount(new THREE.BoxGeometry()), 12);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief's two: how parts are placed, that the faces really are flat and face outwards
// (also when a part is mirrored), that merging never changes its inputs, moveParts, and jitterColor.
// ---------------------------------------------------------------------------------------------

const box = () => new THREE.BoxGeometry(1, 1, 1);
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

/** Every triangle of a merged geometry: its corners, the normals stored on them, and the index of its first vertex. */
function triangles(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const list = [];
  for (let i = 0; i < p.count; i += 3) {
    list.push({
      first: i,
      corners: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k)),
      normals: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(n, i + k)),
    });
  }
  return list;
}

test('part places, turns and scales, scale first and position last', () => {
  const g = mergeParts([part(box(), '#ffffff', { position: [1, 2, 3], rotation: [0, Math.PI / 2, 0], scale: [2, 1, 0.5] })]);
  // Scaled to 2 x 1 x 0.5, then a quarter turn about Y swaps the X and Z extents, then it is moved.
  assert.ok(g.boundingBox.min.distanceTo(vec(0.75, 1.5, 2)) < 1e-6);
  assert.ok(g.boundingBox.max.distanceTo(vec(1.25, 2.5, 4)) < 1e-6);
  assert.ok(g.boundingSphere.center.distanceTo(vec(1, 2, 3)) < 1e-6);

  const uniform = mergeParts([part(box(), '#ffffff', { scale: 3 })]);
  assert.ok(uniform.boundingBox.max.distanceTo(vec(1.5, 1.5, 1.5)) < 1e-6);

  // The same two quarter turns end up differently in Three's default XYZ order and in the order a fourth item names.
  const rod = () => new THREE.CylinderGeometry(0.01, 0.01, 2, 3);
  const xyz = mergeParts([part(rod(), '#ffffff', { rotation: [Math.PI / 2, Math.PI / 2, 0] })]).boundingBox;
  assert.ok(xyz.max.z > 0.99 && xyz.max.x < 0.02, 'XYZ: the rod lies along Z');
  const yxz = mergeParts([part(rod(), '#ffffff', { rotation: [Math.PI / 2, Math.PI / 2, 0, 'YXZ'] })]).boundingBox;
  assert.ok(yxz.max.x > 0.99 && yxz.max.z < 0.02, 'YXZ: the rod lies along X');
});

test('every triangle carries its own outward face normal', () => {
  const centres = [vec(0, 3, 0), vec(4, 0, 0)];
  const g = mergeParts([
    part(box(), '#ffffff', { position: centres[0].toArray(), rotation: [0.3, 0.2, 0.1] }),
    part(new THREE.IcosahedronGeometry(1, 1), '#ffffff', { position: centres[1].toArray(), scale: [1, 0.5, 2] }),
  ]);
  for (const { first, corners: [a, b, c], normals } of triangles(g)) {
    const [n] = normals;
    assert.ok(normals.every((m) => m.distanceTo(n) < 1e-6), 'the three corners share one normal');
    assert.ok(Math.abs(n.dot(b.clone().sub(a))) < 1e-4 && Math.abs(n.dot(c.clone().sub(a))) < 1e-4, 'perpendicular to the face');
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    const centre = centres[first < 36 ? 0 : 1];
    assert.ok(n.dot(centroid.sub(centre)) > 0, 'points out of the solid');
  }
});

test('a mirrored part still faces outwards', () => {
  const g = mergeParts([part(new THREE.ConeGeometry(1, 2, 6), '#ffffff', { scale: [-1, 1, 1] })]);
  for (const { corners: [a, b, c], normals: [n] } of triangles(g)) {
    assert.ok(n.dot(a.clone().add(b).add(c)) > 0); // the cone is convex around the origin
  }
});

test('mergeParts reads its parts without changing them, so one geometry can serve many parts', () => {
  const shared = box();
  const before = Array.from(shared.attributes.position.array);
  const g = mergeParts([part(shared, '#ff0000'), part(shared, '#0000ff', { position: [0, 5, 0], scale: 2 })]);
  assert.deepEqual(Array.from(shared.attributes.position.array), before);
  assert.notEqual(shared.index, null);
  assert.equal(triangleCount(g), 24);
  assert.ok(Math.abs(g.boundingBox.max.y - 6) < 1e-6);
  assert.ok(Math.abs(g.attributes.color.getZ(36) - 1) < 1e-6, 'the second copy is blue');
  assert.ok(Math.abs(g.attributes.color.getZ(35)) < 1e-6, 'the first copy is red');
});

test('a part takes a THREE.Color as well as hex, and keeps it linear', () => {
  const colour = new THREE.Color('#e07b39');
  const g = mergeParts([part(box(), colour)]);
  assert.ok(Math.abs(g.attributes.color.getX(0) - colour.r) < 1e-6);
  assert.ok(colour.r < 0.75, 'linear, not the sRGB 0.88');
});

test('moveParts moves a group of parts as one piece, after their own placement', () => {
  const group = [part(box(), '#ffffff', { position: [1, 0, 0] }), part(box(), '#ffffff', { position: [-1, 0, 0] })];
  const moved = mergeParts(moveParts(group, { position: [0, 10, 0], rotation: [0, Math.PI / 2, 0] }));
  // A quarter turn about Y takes the pair from the X axis to the Z axis, then it is lifted.
  assert.ok(moved.boundingBox.min.distanceTo(vec(-0.5, 9.5, -1.5)) < 1e-6);
  assert.ok(moved.boundingBox.max.distanceTo(vec(0.5, 10.5, 1.5)) < 1e-6);
  const still = mergeParts(group);
  assert.ok(still.boundingBox.max.distanceTo(vec(1.5, 0.5, 0.5)) < 1e-6, 'the original parts are unchanged');
});

test('jitterColor nudges a colour a little, the same way for the same seed', () => {
  const hsl = (c) => c.getHSL({}, THREE.SRGBColorSpace);
  const base = hsl(new THREE.Color('#6cc04a'));
  const a = createRng(5), b = createRng(5);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = jitterColor('#6cc04a', a);
    assert.ok(c instanceof THREE.Color);
    assert.equal(c.getHex(), jitterColor('#6cc04a', b).getHex());
    const h = hsl(c);
    assert.ok(Math.abs(h.l - base.l) <= 0.06 + 1e-6, 'lightness');
    assert.ok(Math.abs(h.s - base.s) <= 0.06 + 1e-6, 'saturation');
    assert.ok(Math.abs(((h.h - base.h + 1.5) % 1) - 0.5) <= 0.02 + 1e-6, 'hue moves a third as far');
    seen.add(c.getHex());
  }
  assert.ok(seen.size > 100, 'it does vary');
  assert.equal(jitterColor('#6cc04a', createRng(1), 0).getHexString(), '6cc04a');
  const wide = hsl(jitterColor('#808080', createRng(2), 0.3));
  assert.ok(wide.l >= 0 && wide.l <= 1 && wide.s >= 0 && wide.s <= 1);
});
