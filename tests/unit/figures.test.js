// The little figures of her and him (Task 10): chunky, cheap, posable, and a couple holding hands.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { createFigure, walkPose, createCouple, IDLE_POSE } from '../../site/src/world/figures.js';
import { triangleCount } from '../../site/src/util/geo.js';

const look = { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' };

for (const style of ['her', 'him']) test(`${style} figure is chunky, small and cheap`, () => {
  const f = createFigure({ ...look, style });
  const box = new THREE.Box3().setFromObject(f.group);
  const h = box.max.y - box.min.y;
  assert.ok(h >= 1.0 && h <= 1.3, `height ${h}`);
  let tris = 0;
  f.group.traverse((o) => { if (o.isMesh) tris += triangleCount(o.geometry); });
  assert.ok(tris <= 1500);
  for (const k of ['hips', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'rightHand']) assert.ok(f.parts[k], k);
});

test('walk pose swings legs opposite and stays gentle', () => {
  for (const ph of [0, 0.7, Math.PI / 2, 2.5]) {
    const p = walkPose(ph);
    assert.ok(Math.abs(p.leftLeg + p.rightLeg) < 1e-9);
    assert.ok(Math.abs(p.leftLeg) <= 0.6 && Math.abs(p.leftArm) <= 0.6);
    assert.ok(p.bob >= 0);
  }
});

test('couple has two figures', () => {
  const c = createCouple({ her: look, you: { ...look, outfit: '#5b7fc4' } });
  let figures = 0;
  c.group.traverse((o) => { if (o.userData.figure) figures++; });
  assert.equal(figures, 2);
});

// Beyond the brief.

/** The posed figure's lowest and highest points (m). */
function heights(object) {
  object.updateMatrixWorld(true);
  let low = Infinity, high = -Infinity;
  const v = new THREE.Vector3();
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      const y = o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).y;
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  });
  return { low, high };
}

test('a figure stands on its origin, is one draw call, and its colours come from the look', () => {
  for (const style of ['her', 'him']) {
    const f = createFigure({ ...look, style });
    assert.ok(Math.abs(heights(f.group).low) < 0.005, `${style} stands on the ground`);
    const meshes = [];
    f.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 1, `${style} is drawn in one call`);
    assert.equal(f.group.userData.figure, true);
    const colours = meshes[0].geometry.attributes.color;
    const has = (hex) => {
      const c = new THREE.Color(hex);
      for (let i = 0; i < colours.count; i++) {
        if (Math.abs(colours.getX(i) - c.r) < 1e-6 && Math.abs(colours.getY(i) - c.g) < 1e-6 && Math.abs(colours.getZ(i) - c.b) < 1e-6) return true;
      }
      return false;
    };
    for (const key of ['skin', 'hair', 'outfit']) assert.ok(has(look[key]), `${style} wears its ${key} colour`);
  }
});

test('setPose swings the limbs and bobs the body; walkPose is gentle at any amount', () => {
  const f = createFigure({ ...look, style: 'him' });
  const rest = heights(f.group);
  const pose = walkPose(0.7);
  f.setPose(pose);
  assert.ok(pose.bob > 0 && Math.abs(heights(f.group).high - rest.high - pose.bob) < 1e-6, 'the whole body rises by the bob');
  assert.notEqual(f.parts.leftLeg.rotation.x, 0);
  assert.equal(f.parts.leftLeg.rotation.x, -f.parts.rightLeg.rotation.x);
  f.setPose(IDLE_POSE);
  assert.ok(Math.abs(heights(f.group).high - rest.high) < 1e-6, 'back to rest');
  assert.deepEqual(walkPose(1.1, 7), walkPose(1.1, 1), 'amount is at most 1');
  const still = walkPose(1.1, 0);
  for (const k of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'bob']) assert.equal(Math.abs(still[k]), 0, k);
});

test('the couple hold hands, and bob gently without leaving the ground', () => {
  const c = createCouple({ her: look, you: { ...look, outfit: '#5b7fc4' } });
  for (const t of [0, 0.4, 1.3, 2.9]) {
    c.update(t);
    c.group.updateMatrixWorld(true);
    const hers = c.her.parts.rightHand.getWorldPosition(new THREE.Vector3());
    const his = c.him.parts.leftHand.getWorldPosition(new THREE.Vector3());
    assert.ok(hers.distanceTo(his) < 0.08, `hands ${hers.distanceTo(his).toFixed(3)} m apart at ${t} s`);
    const { low } = heights(c.group);
    assert.ok(low > -0.005 && low < 0.03, `feet at ${low} m at ${t} s`);
  }
});
