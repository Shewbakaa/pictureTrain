import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE_TIMES, finaleTracks } from '../../site/src/finale/finale.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { STATION } from '../../site/src/world/stations.js';
import { DOVES, dovesAt } from '../../site/src/world/birds.js';
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

// Their pet (Task 11): it trots out of the station house with him, and sits at their feet.

import { HER, HIM } from '../../site/src/finale/finaleTimes.js';

/** Where `p` (a world point) is in the frame of the finale station: [along, right, up]. */
function inStation(p) {
  const rel = p.clone().sub(path.pointAt(960));
  return [rel.dot(path.tangentAt(960)), rel.dot(path.sideAt(960)), p.y];
}

test('their pet trots out of the station house with him, 0.5 m to his right and 0.3 m behind, and sits at their feet', () => {
  const { scene, camera, finale } = finaleOnStage();
  const pet = scene.children.find((o) => o.name.startsWith('pet-'));
  assert.ok(pet, 'a dog or a cat, as content.js pets says (random by default)');
  assert.equal(pet.visible, false);
  assert.equal(finale.pets, 0);
  const her = scene.getObjectByName('finale-her'), him = scene.getObjectByName('finale-him');
  const body = pet.getObjectByName('body');
  const show = (t) => { finale.skipTo(t); finale.update(0); };
  finale.begin();
  show(T.himWalkStart - 0.1);
  assert.equal(pet.visible, false, 'not before he sets off');
  assert.equal(finale.pets, 0);

  // As the door opens it comes out of the doorway (the house's front is 7.0 m out, the door 7.1 to 7.9 m along).
  show(T.himWalkStart);
  assert.ok(pet.visible);
  assert.equal(finale.pets, 1);
  const [along, right] = inStation(pet.position);
  assert.ok(right > 6.95 && along > 7.1 && along < 7.9, `in the doorway at ${along.toFixed(2)} along, ${right.toFixed(2)} right`);

  // Over with him: 0.5 m to his right and 0.3 m behind as he walks, on the platform, trotting.
  const ahead = path.frameAt(960 + HIM.end[0], HIM.end[1], 0).sub(path.frameAt(960 + HIM.door[0], HIM.door[1], 0)).normalize();
  const hisRight = ahead.clone().cross(new THREE.Vector3(0, 1, 0));
  const legs = new Set();
  for (let t = T.himWalkStart + 0.6; t <= T.himWalkEnd + 1e-9; t += 0.1) {
    show(t);
    const rel = pet.position.clone().sub(him.position);
    assert.ok(Math.abs(rel.dot(hisRight) - 0.5) < 0.01, `at ${t.toFixed(1)} s, ${rel.dot(hisRight).toFixed(3)} m to his right`);
    assert.ok(Math.abs(rel.dot(ahead) + 0.3) < 0.01, `at ${t.toFixed(1)} s, ${(-rel.dot(ahead)).toFixed(3)} m behind him`);
    assert.ok(Math.abs(pet.position.y - 0.6) < 1e-6, 'on the platform');
    legs.add(pet.getObjectByName('frontLeft').rotation.x.toFixed(2));
    if (t > T.himWalkStart + 1 && t < T.himWalkEnd - 1) {
      const facing = pet.getWorldDirection(new THREE.Vector3());
      assert.ok(facing.dot(ahead) > 0.99, `at ${t.toFixed(1)} s it trots the way he walks`);
    }
  }
  assert.ok(legs.size > 5, 'its legs go');

  // Never through either of them, nor through the house once it is out.
  for (let t = T.himWalkStart; t <= T.end; t += 0.05) {
    show(t);
    for (const [who, figure] of [['her', her], ['him', him]]) {
      const apart = Math.hypot(pet.position.x - figure.position.x, pet.position.z - figure.position.z);
      assert.ok(apart > 0.35, `at ${t.toFixed(2)} s it is ${apart.toFixed(2)} m from ${who}`);
    }
  }

  // Then it sits at their feet: between them, in front, on the camera's side, facing it.
  for (const t of [9, T.card, T.end]) {
    show(t);
    assert.ok(body.rotation.x < -0.5, `sitting at ${t} s`);
    const toHer = pet.position.distanceTo(her.position), toHim = pet.position.distanceTo(him.position);
    assert.ok(toHer < 0.9 && toHim < 0.9 && Math.abs(toHer - toHim) < 0.25, `between them: ${toHer.toFixed(2)} m from her, ${toHim.toFixed(2)} m from him`);
    const flat = (p) => new THREE.Vector2(p.x - camera.position.x, p.z - camera.position.z).length();
    assert.ok(flat(pet.position) < Math.min(flat(her.position), flat(him.position)), 'nearer the camera than they are');
    const toCamera = camera.position.clone().sub(pet.position).setY(0).normalize();
    assert.ok(pet.getWorldDirection(new THREE.Vector3()).dot(toCamera) > 0.9, 'facing the camera');
  }
  const [a, r] = inStation(pet.position);
  assert.ok(Math.hypot(a - (HER.end[0] + HIM.end[0]) / 2, r - (HER.end[1] + HIM.end[1]) / 2) < 0.6, 'at their feet');

  finale.reset();
  assert.equal(pet.visible, false, 'gone again when she rides again');
  assert.equal(finale.pets, 0);
});

test('their pet turns before it runs on round him, and to the camera only as it sits: it never slides backwards or sideways', () => {
  const { scene, finale } = finaleOnStage();
  const pet = scene.children.find((o) => o.name.startsWith('pet-'));
  finale.begin();
  const at = (t) => {
    finale.skipTo(t);
    finale.update(0);
    return { x: pet.position.x, z: pet.position.z, heading: pet.rotation.y };
  };
  const SPAN = 0.01; // its motion at t, from where it is this long either side
  let moving = 0;
  for (let t = 6.9; t <= 9.0 + 1e-9; t += 0.02) {
    const before = at(t - SPAN), after = at(t + SPAN);
    const { heading } = at(t);
    const dx = after.x - before.x, dz = after.z - before.z;
    const speed = Math.hypot(dx, dz) / (2 * SPAN);
    if (!(speed > 0.3)) continue;
    moving++;
    const cos = (Math.sin(heading) * dx + Math.cos(heading) * dz) / Math.hypot(dx, dz);
    const angle = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    assert.ok(angle < 60, `at ${t.toFixed(2)} s, going ${speed.toFixed(2)} m/s, it faces ${angle.toFixed(0)}° from the way it goes`);
  }
  assert.ok(moving > 20, `it runs round him in that time (${moving} moving samples)`);
});

test('a pet in the finale is drawn in two calls, and with pets: \'none\' there is none', () => {
  const { scene, finale } = finaleOnStage(FINALE_PATH, { pets: 'cat' });
  const pet = scene.getObjectByName('pet-cat');
  let meshes = 0;
  pet.traverse((o) => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 2);
  const none = finaleOnStage(FINALE_PATH, { pets: 'none' });
  assert.equal(none.scene.children.find((o) => o.name.startsWith('pet-')), undefined);
  none.finale.begin();
  none.finale.skipTo(9);
  none.finale.update(0);
  assert.equal(none.finale.pets, 0);
  finale.begin();
  finale.skipTo(9);
  finale.update(0);
  assert.equal(finale.pets, 1);
});

test('doves sit on the station house roof from the start and fly off as the fireworks start, only while the finale plays', () => {
  const { scene, finale } = finaleOnStage();
  const mesh = scene.getObjectByName('birds-dove');
  assert.ok(mesh && mesh.isInstancedMesh, 'one instanced mesh of doves, in the scene');
  assert.equal(finale.doves, 0);
  assert.equal(mesh.visible, false, 'hidden until the finale begins');
  const show = (t) => { finale.skipTo(t); finale.update(0); scene.updateMatrixWorld(true); };
  const worldPosition = (i) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, i * 16).premultiply(mesh.matrixWorld));
  finale.begin();
  assert.equal(finale.doves, DOVES.COUNT, 'sitting on the roof as it begins');
  // The mesh is in the station's frame: each dove is where dovesAt puts it, in the world, on the roof of the station house.
  const want = new THREE.Vector3(), put = new THREE.Vector3();
  for (const t of [0, T.fireworks - 0.1, T.fireworks + 0.5, T.fireworks + 2, T.fireworks + 4.5]) {
    show(t);
    assert.equal(finale.doves, DOVES.COUNT, `${DOVES.COUNT} at ${t}`);
    for (let i = 0; i < DOVES.COUNT; i++) {
      dovesAt(t, i, want);
      path.frameAt(960 + want.x, want.y, want.z, put);
      assert.ok(worldPosition(i).distanceTo(put) < 1e-3, `dove ${i} at ${t}: ${worldPosition(i).toArray()} for ${put.toArray()}`);
    }
  }
  show(T.fireworks + DOVES.TIME);
  assert.equal(finale.doves, 0, 'gone');
  assert.equal(mesh.visible, false);
  show(T.fireworks + 1);
  assert.equal(finale.doves, DOVES.COUNT, 'skipping back brings them back');
  finale.reset();
  assert.equal(finale.doves, 0);
  assert.equal(mesh.visible, false, 'and not after the ride starts again');
});

test('on the lower tiers fewer doves go (the particles share of five)', () => {
  const { finale } = finaleOnStage();
  finale.begin();
  finale.skipTo(9);
  finale.setQuality('low');
  finale.update(0);
  assert.equal(finale.doves, 2);
  finale.setQuality('medium');
  finale.update(0);
  assert.equal(finale.doves, 4);
  finale.setQuality('high');
  finale.update(0);
  assert.equal(finale.doves, 5);
});
