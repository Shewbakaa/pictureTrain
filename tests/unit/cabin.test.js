// The first-person cabin (Task 10): it frames the view at any screen shape without hogging it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { cabinAnchors, createCabin } from '../../site/src/train/cabin.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { fovForAspect } from '../../site/src/ride/look.js';
import { RIDE } from '../../site/src/ride/rideController.js';

for (const [fov, aspect] of [[80, 390 / 844], [50, 16 / 9], [78, 1]]) {
  test(`cabin decorations stay on screen at aspect ${aspect.toFixed(2)}`, () => {
    const a = cabinAnchors(fov, aspect);
    const halfW = (z) => Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect * Math.abs(z);
    assert.ok(a.flowers.x < 0 && -a.flowers.x <= halfW(a.flowers.z) * 0.9 && -a.flowers.x >= halfW(a.flowers.z) * 0.5);
    assert.ok(a.lantern.x > 0 && a.lantern.x <= halfW(a.lantern.z) * 0.9 && a.lantern.x >= halfW(a.lantern.z) * 0.5);
    const bottom = -Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.abs(a.dashboard.z);
    assert.ok(a.dashboard.topY < 0 && a.dashboard.topY > bottom, 'dashboard top is on screen');
  });
}

test('cabin triangle budget', () => {
  const c = createCabin();
  let tris = 0;
  c.group.traverse((o) => { if (o.isMesh) tris += triangleCount(o.geometry) * (o.isInstancedMesh ? o.count : 1); });
  assert.ok(tris <= 6000, `${tris} triangles`);
});

// Beyond the brief.

/** The share of the screen the cabin covers, sampled on a grid of rays through the camera at the rig's origin. */
function screenShare(cabin, camera, inRegion = () => true) {
  const meshes = [];
  cabin.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  cabin.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const cols = Math.round(32 * Math.sqrt(camera.aspect));
  const rows = Math.round(32 / Math.sqrt(camera.aspect));
  let rays = 0;
  let hits = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const ndc = new THREE.Vector2(((i + 0.5) / cols) * 2 - 1, ((j + 0.5) / rows) * 2 - 1);
      if (!inRegion(ndc)) continue;
      ray.setFromCamera(ndc, camera);
      rays++;
      if (ray.intersectObjects(meshes, false).length > 0) hits++;
    }
  }
  return hits / rays;
}

for (const [w, h] of [[390, 844], [375, 667], [844, 390], [1280, 720]]) {
  test(`at ${w}x${h} the cabin frames the view without hogging it, and the middle stays clear`, () => {
    const camera = new THREE.PerspectiveCamera(fovForAspect(w / h), w / h, 0.1, 400);
    const cabin = createCabin();
    cabin.fit(camera);
    const share = screenShare(cabin, camera);
    assert.ok(share >= 0.2 && share <= 0.35, `the cabin covers ${(share * 100).toFixed(1)}% of the screen`);
    // The track runs up the middle of the view: from just above the dashboard to well up the sky.
    const middle = screenShare(cabin, camera, (p) => Math.abs(p.x) < 0.35 && p.y > -0.55 && p.y < 0.6);
    assert.equal(middle, 0, 'nothing of the cabin in the middle of the view');
  });
}

test('the cabin bobs gently, and only while the train moves', () => {
  const cabin = createCabin();
  for (let t = 0; t < 3; t += 0.05) {
    cabin.update(0.05, 0, t);
    assert.equal(Math.abs(cabin.group.position.y), 0);
  }
  let most = 0;
  for (let t = 0; t < 3; t += 0.01) {
    cabin.update(0.01, RIDE.CRUISE, t);
    most = Math.max(most, Math.abs(cabin.group.position.y));
  }
  assert.ok(most > 0.01 && most <= 0.015 + 1e-9, `bob ${most}`);
  cabin.setVisible(false);
  assert.equal(cabin.group.visible, false);
});
