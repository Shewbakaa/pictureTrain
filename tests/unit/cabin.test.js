// The first-person cabin (Task 10): it frames the view at any screen shape without hogging it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { cabinAnchors, createCabin } from '../../site/src/train/cabin.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { fovForAspect } from '../../site/src/ride/look.js';
import { RIDE } from '../../site/src/ride/rideController.js';
import { pickTarget } from '../../site/src/ride/taps.js';

for (const [fov, aspect] of [[80, 390 / 844], [50, 16 / 9], [78, 1]]) {
  test(`cabin decorations stay on screen at aspect ${aspect.toFixed(2)}`, () => {
    const a = cabinAnchors(fov, aspect);
    const halfW = (z) => Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect * Math.abs(z);
    assert.ok(a.flowers.x < 0 && -a.flowers.x <= halfW(a.flowers.z) * 0.9 && -a.flowers.x >= halfW(a.flowers.z) * 0.5);
    assert.ok(a.lantern.x > 0 && a.lantern.x <= halfW(a.lantern.z) * 0.9 && a.lantern.x >= halfW(a.lantern.z) * 0.5);
    const bottom = -Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.abs(a.dashboard.z);
    assert.ok(a.dashboard.topY < 0 && a.dashboard.topY > bottom, 'dashboard top is on screen');
    // The whistle cord hangs at the top left, from above the top of the view to its handle in the upper half.
    const top = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.abs(a.cord.z);
    assert.ok(a.cord.x < 0 && -a.cord.x <= halfW(a.cord.z) * 0.9 && -a.cord.x >= halfW(a.cord.z) * 0.5, 'cord at the left');
    assert.ok(a.cord.top > top, 'the cord comes down from above the view');
    assert.ok(a.cord.bottom > 0.35 * top && a.cord.bottom < 0.75 * top, `cord's foot at ${(a.cord.bottom / top).toFixed(2)} of the way up`);
    assert.ok(a.cord.top >= a.roof.y, 'it hangs from the roof');
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

// --- taps: the whistle cord and the lantern (Task 13) ---

/** Records what a reaction asks for. */
function fakeFx() {
  const played = [];
  return { played, play: (name) => played.push(name), burst() {} };
}

/** The cabin on a rig that has moved and turned, as it does along the track, fitted to a w × h screen. */
function cabinOnRig(w = 390, h = 844) {
  const rig = new THREE.Object3D();
  rig.position.set(40, 1.7, -120);
  rig.rotation.y = 0.7;
  const camera = new THREE.PerspectiveCamera(fovForAspect(w / h), w / h, 0.1, 400);
  rig.add(camera);
  const cabin = createCabin();
  rig.add(cabin.group);
  cabin.fit(camera);
  rig.updateMatrixWorld(true);
  return { rig, camera, cabin };
}

test('the cabin has two targets, the whistle cord and the lantern, with generous hit shapes', () => {
  const cabin = createCabin();
  assert.deepEqual(cabin.targets.map((t) => t.name), ['whistle-cord', 'lantern']);
  for (const t of cabin.targets) {
    assert.ok(t.radius >= 0.08 && t.radius <= 0.15, `${t.name} radius ${t.radius}`);
    assert.equal(typeof t.react, 'function');
  }
});

for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
  test(`at ${w}x${h} the targets sit on the cord's handle and the lantern, in world space, where a tap finds them`, () => {
    const { camera, cabin } = cabinOnRig(w, h);
    const [cord, lantern] = cabin.targets;
    const handle = cabin.group.getObjectByName('cabin-cord-handle').getWorldPosition(new THREE.Vector3());
    assert.ok(cord.position(new THREE.Vector3()).distanceTo(handle) < 1e-9);
    const halo = cabin.group.getObjectByName('cabin-lantern-halo').getWorldPosition(new THREE.Vector3());
    assert.ok(lantern.position(new THREE.Vector3()).distanceTo(halo) < 1e-9);
    // On screen: the cord's handle up at the left, the lantern down at the right.
    const c = cord.position(new THREE.Vector3()).project(camera);
    assert.ok(c.x > -0.95 && c.x < -0.4 && c.y > 0.3 && c.y < 0.9, `cord at ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`);
    const l = lantern.position(new THREE.Vector3()).project(camera);
    assert.ok(l.x > 0.4 && l.x < 0.95 && l.y < -0.4 && l.y > -0.95, `lantern at ${l.x.toFixed(2)}, ${l.y.toFixed(2)}`);
    // A tap a fingertip off the handle still finds the cord.
    const ray = new THREE.Raycaster();
    const eye = camera.getWorldPosition(new THREE.Vector3());
    ray.setFromCamera(new THREE.Vector2(c.x + 0.04, c.y - 0.02), camera);
    assert.equal(pickTarget(eye, ray.ray.direction, cabin.targets), cord);
    ray.setFromCamera(new THREE.Vector2(l.x, l.y + 0.03), camera);
    assert.equal(pickTarget(eye, ray.ray.direction, cabin.targets), lantern);
  });
}

test('the targets are not showing while the cabin is hidden (the finale)', () => {
  const { cabin } = cabinOnRig();
  cabin.setVisible(false);
  for (const t of cabin.targets) assert.equal(t.position(new THREE.Vector3()), null, t.name);
  cabin.setVisible(true);
  for (const t of cabin.targets) assert.ok(t.position(new THREE.Vector3()) !== null, t.name);
});

test('the cord tugs down 4 cm and back over half a second, and the train whistles', () => {
  const { cabin } = cabinOnRig();
  const pivot = cabin.group.getObjectByName('cabin-cord');
  cabin.update(1 / 60, 0, 9.9);
  const rest = pivot.position.y;
  const fx = fakeFx();
  cabin.targets[0].react(10, fx);
  assert.deepEqual(fx.played, ['whistle']);
  let lowest = rest;
  for (let t = 10; t <= 10.5; t += 0.005) {
    cabin.update(0.005, 0, t);
    lowest = Math.min(lowest, pivot.position.y);
    assert.ok(pivot.position.y <= rest + 1e-12, 'it only ever moves down');
  }
  assert.ok(Math.abs(rest - lowest - 0.04) < 0.001, `tugged ${(rest - lowest).toFixed(4)} m`);
  cabin.update(0.01, 0, 10.51);
  assert.equal(pivot.position.y, rest);
});

test('the lantern flares to 1.8 times its glow for 1.2 s, then settles', () => {
  const { cabin } = cabinOnRig();
  const halo = cabin.group.getObjectByName('cabin-lantern-halo');
  cabin.update(1 / 60, 0, 4.9);
  const rest = halo.scale.x;
  const fx = fakeFx();
  cabin.targets[1].react(5, fx);
  assert.deepEqual(fx.played, ['lantern']);
  let most = 0;
  for (let t = 5; t <= 6.2; t += 0.005) {
    cabin.update(0.005, 0, t);
    most = Math.max(most, halo.scale.x / rest);
    assert.ok(halo.material.opacity > 0 && halo.material.opacity <= 1);
  }
  assert.ok(Math.abs(most - 1.8) < 0.01, `flared to ${most.toFixed(3)}x`);
  cabin.update(0.01, 0, 6.21);
  assert.equal(halo.scale.x, rest);
});

test('the cord and the lantern keep to their places when the screen changes shape mid-tug', () => {
  const { camera, cabin } = cabinOnRig();
  cabin.targets[0].react(1, fakeFx());
  cabin.update(0.1, 0, 1.1);
  camera.aspect = 844 / 390;
  camera.fov = fovForAspect(camera.aspect);
  cabin.fit(camera);
  cabin.update(0.5, 0, 1.6);
  const pivot = cabin.group.getObjectByName('cabin-cord');
  const a = cabinAnchors(camera.fov, camera.aspect);
  assert.ok(Math.abs(pivot.position.x - a.cord.x) < 1e-9 && Math.abs(pivot.position.y - a.cord.top) < 1e-9);
});

// The cabin hides the world (Task 14): its body is what a tap meets before anything out beyond it.

test('the cabin\'s body hides the world from her taps, but never its own cord and lantern', async () => {
  const { createTapRouter } = await import('../../site/src/ride/taps.js');
  const { camera, cabin } = cabinOnRig(390, 844);
  assert.deepEqual(cabin.blockers.map((m) => m.name), ['cabin-body', 'cabin-glow', 'cabin-bunting']);
  for (const t of cabin.targets) assert.equal(t.aboard, true, `${t.name} is part of the cabin`);
  // A balloon far out, straight down the view through the dashboard, and the same balloon up in the open sky.
  const eye = camera.getWorldPosition(new THREE.Vector3());
  const along = (x, y) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    return eye.clone().addScaledVector(ray.ray.direction, 15);
  };
  const reactions = [];
  const balloon = (at) => ({ name: 'balloons', radius: 1, position: (out) => out.copy(at), react: () => reactions.push(at) });
  const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) };
  const behindDash = balloon(along(0, -0.9));
  const inTheSky = balloon(along(0, 0.2));
  const router = createTapRouter({ camera, element, sources: [() => [behindDash, inTheSky], () => cabin.targets], blockers: cabin.blockers, fx: { play() {}, burst() {} } });
  assert.equal(router.tap(195, 844 * 0.95, 0), null, 'a tap on the dashboard');
  assert.equal(router.tap(195, 844 * 0.4, 0), 'balloons', 'a tap on the sky');
  const [, lantern] = cabin.targets;
  const l = lantern.position(new THREE.Vector3()).project(camera);
  assert.equal(router.tap(((l.x + 1) / 2) * 390, ((1 - l.y) / 2) * 844, 1), 'lantern', 'the lantern on the dashboard');
});
