import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE_TIMES, finaleTracks } from '../../site/src/finale/finale.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { STATION } from '../../site/src/world/stations.js';
import * as THREE from '../../site/src/three.js';
import { FINALE_PATH, finaleOnStage } from './finaleStage.js';

const T = FINALE_TIMES;
const path = FINALE_PATH;
const tl = createTimeline(finaleTracks(path, 960));
const v = (a) => new THREE.Vector3(...a);

test('choreography order', () => {
  assert.ok(T.cameraDone <= T.herStepStart && T.herStepEnd <= T.himWalkEnd && T.himWalkEnd <= T.handoffStart);
  assert.ok(T.handoffStart < T.handoffEnd && T.handoffEnd <= T.card && T.card < T.end);
});

test('she ends up standing on the platform', () => {
  const her = v(tl.sample(T.end).her);
  const right = her.clone().sub(path.pointAt(960.4)).dot(path.sideAt(960.4));
  assert.ok(right >= STATION.PLATFORM_NEAR && right <= STATION.PLATFORM_FAR);
  assert.ok(Math.abs(her.y - STATION.PLATFORM_TOP) < 0.05);
});

test('he walks up close to her', () => {
  assert.ok(v(tl.sample(T.end).him).distanceTo(v(tl.sample(T.end).her)) <= 1.0);
  assert.ok(v(tl.sample(0).him).distanceTo(v(tl.sample(0).her)) > 5);
});

test('the bouquet travels from him to her', () => {
  const s0 = tl.sample(T.handoffStart), s1 = tl.sample(T.handoffEnd);
  assert.ok(v(s1.bouquet).distanceTo(v(s1.her)) < 1.0);
  assert.ok(v(s0.bouquet).distanceTo(v(s0.him)) < 1.0);
});

test('camera starts at the seat and pulls out to see both', () => {
  assert.ok(v(tl.sample(0).camera).distanceTo(path.frameAt(960, 0, 2.05)) < 1e-6);
  const cam = v(tl.sample(T.card).camera);
  assert.ok(cam.distanceTo(v(tl.sample(T.card).her)) > 5);
});

// Beyond the brief.

import { createTrainExterior, EXTERIOR } from '../../site/src/train/exterior.js';
import { triangleCount } from '../../site/src/util/geo.js';


test('the finale swaps her seat for the scene outside, reports each event once, and swaps back', () => {
  const { scene, camera, rig, cabin, exterior, finale } = finaleOnStage();
  assert.equal(finale.active, false);
  assert.equal(exterior.visible, false);
  assert.deepEqual(finale.update(0.1), [], 'nothing happens before it begins');
  finale.begin();
  assert.ok(finale.active && !cabin.shown && exterior.visible);
  assert.equal(camera.parent, scene, 'the camera has left her seat');
  const fired = [];
  for (let i = 0; i < 140; i++) fired.push(...finale.update(0.1));
  assert.deepEqual(fired, ['hearts', 'fireworks', 'card']);
  assert.ok(Math.abs(finale.time - 14) < 1e-6);
  finale.reset();
  assert.ok(!finale.active && cabin.shown && !exterior.visible);
  assert.equal(camera.parent, rig, 'back in her seat');
  assert.ok(camera.position.length() < 1e-9);
});

test('skipTo and freeze hold one instant and report what was skipped over', () => {
  const { finale } = finaleOnStage();
  finale.begin();
  finale.skipTo(10);
  finale.freeze(true);
  assert.deepEqual(finale.update(1 / 60), ['hearts', 'fireworks', 'card']);
  assert.deepEqual(finale.update(0.5), []);
  assert.equal(finale.time, 10);
});

test('a long frame moves the finale on by a tenth of a second at most', () => {
  const { finale } = finaleOnStage();
  finale.begin();
  finale.update(5);
  assert.ok(Math.abs(finale.time - 0.1) < 1e-9);
});

test('the camera glides out of the carriage under its roof and well clear of the platform lamp', () => {
  const { camera, finale } = finaleOnStage();
  const centre = path.pointAt(960), along = path.tangentAt(960), right = path.sideAt(960);
  finale.begin();
  for (let t = 0; t <= T.cameraDone + 1e-9; t += 0.02) {
    finale.skipTo(t);
    finale.update(0);
    const rel = camera.position.clone().sub(centre);
    const a = rel.dot(along), r = rel.dot(right), up = camera.position.y;
    // Inside the carriage's roof line (out to its eaves and their bunting) it stays below them.
    if (Math.abs(r) < EXTERIOR.HALF_WIDTH + 0.2 && a > -EXTERIOR.CARRIAGE[1] - 0.2 && a < -EXTERIOR.CARRIAGE[0] + 0.2) {
      assert.ok(up < 2.45, `at ${t.toFixed(2)} s the camera is ${up.toFixed(2)} m up under the roof`);
    }
    // The lamp at 3 m back, 5.55 m out (world/stations.js), and its string lights, are passed at a distance.
    assert.ok(Math.hypot(a + 3, r - 5.55) > 1.2, `at ${t.toFixed(2)} s the camera brushes the lamp`);
  }
});

test('the train outside: locomotive ahead, carriage round her seat, an open door on the right, three draw calls', () => {
  const train = createTrainExterior();
  train.updateMatrixWorld(true);
  const body = train.getObjectByName('train-body');
  const box = new THREE.Box3().setFromObject(body);
  // (the carriage roof overhangs its end a little)
  assert.ok(box.min.z >= EXTERIOR.LOCO[0] - 0.05 && box.max.z <= EXTERIOR.CARRIAGE[1] + 0.25, `${box.min.z} to ${box.max.z}`);
  const ray = new THREE.Raycaster();
  const hit = (from, dir, far = 5) => {
    ray.set(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
    ray.far = far;
    const h = ray.intersectObject(body)[0];
    return h ? h.distance : null;
  };
  // She stands on the floor beside her seat, 0.4 m ahead of it and 1 m right, and the doorway beside her is open.
  assert.ok(Math.abs(2 - hit([1.0, 2, -0.4], [0, -1, 0]) - EXTERIOR.FLOOR) < 0.01, 'the floor is under her');
  for (const y of [1.1, 1.4, 1.9]) assert.equal(hit([1.0, y, -0.4], [1, 0, 0]), null, `the doorway at ${y} m`);
  assert.ok(hit([-1.0, 1.3, -0.4], [-1, 0, 0]) < 0.3, 'the left side is closed');
  let drawn = 0, triangles = 0;
  train.traverse((o) => {
    if (o.isMesh || o.isPoints) drawn++;
    if (o.isMesh) triangles += triangleCount(o.geometry);
  });
  assert.equal(drawn, 3);
  assert.ok(triangles <= 6000, `${triangles} triangles`);
});

// The fireworks' sound keeps time with their blooms (audio/cueSounds.js plays a pop for each).

import { FIREWORK_TIMING as FIREWORKS, fireworkBlooms } from '../../site/src/finale/fireworkTiming.js';

/**
 * Runs the finale for `seconds` of 60 fps frames, and for each frame lists the bursts whose sparks came out in it,
 * read from what the finale draws (each burst's age in its shader passing the shell's rise), and those
 * fireworkBlooms reports for the same stretch of the finale's clock.
 */
function bloomsSeen(tier, seconds) {
  const { scene, finale } = finaleOnStage();
  finale.setQuality(tier);
  finale.begin();
  const ages = scene.getObjectByName('finale-fireworks').material.uniforms.uAge.value;
  const before = ages.slice();
  const drawn = [];
  const reported = [];
  for (let i = 0; i < seconds * 60; i++) {
    const from = finale.time;
    finale.update(1 / 60);
    for (let b = 0; b < FIREWORKS.MAX; b++) {
      const bloomed = ages[b] >= FIREWORKS.RISE && (before[b] < FIREWORKS.RISE || ages[b] < before[b]);
      if (bloomed) drawn.push(`${i}:${b}`);
      before[b] = ages[b];
    }
    fireworkBlooms(from, finale.time, finale.bursts, (b) => reported.push(`${i}:${b}`));
  }
  return { drawn, reported, finale };
}

test('fireworkBlooms reports each burst\'s bloom in the frame its sparks come out, round after round', () => {
  const { drawn, reported, finale } = bloomsSeen('high', 30);
  assert.equal(finale.bursts, FIREWORKS.MAX);
  assert.ok(drawn.length >= 20, `${drawn.length} blooms in 30 s`);
  assert.deepEqual(reported, drawn);
});

test('on the low tier there are fewer bursts, and fewer blooms reported with them', () => {
  const { drawn, reported, finale } = bloomsSeen('low', 30);
  assert.equal(finale.bursts, FIREWORKS.LOW);
  assert.ok(drawn.every((d) => Number(d.split(':')[1]) < FIREWORKS.LOW));
  assert.deepEqual(reported, drawn);
});

test('the first bloom comes one shell\'s rise after the fireworks event', () => {
  const times = [];
  fireworkBlooms(0, 30, 4, (b, t) => times.push([b, t]));
  assert.deepEqual(times[0], [0, FINALE_TIMES.fireworks + FIREWORKS.RISE]);
  fireworkBlooms(0, FINALE_TIMES.fireworks + FIREWORKS.RISE - 1e-6, 4, () => assert.fail('none before it'));
  // Back-to-back stretches report each bloom exactly once.
  const pieces = [];
  let t = 0;
  for (; t < 30; t += 0.37) fireworkBlooms(t, t + 0.37, 4, (b, at) => pieces.push([b, at]));
  const whole = [];
  fireworkBlooms(0, t, 4, (b, at) => whole.push([b, at]));
  assert.equal(pieces.length, whole.length);
  assert.ok(whole.length > 20);
});
