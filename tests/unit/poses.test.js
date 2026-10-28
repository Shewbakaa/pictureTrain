// The two of them at every stop, posed for its moment (Task 10): where they stand, how they move, a tap's wave, and
// the couple built from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCH, coupleLayout, mirrorPose, posesAt, wavedAt } from '../../site/src/world/poses.js';
import { createStopCouple } from '../../site/src/world/stopCouple.js';
import { POSES } from '../../site/src/content/normalize.js';
import { createPropGeometry } from '../../site/src/world/props.js';
import { COUPLE_HALF_WIDTH } from '../../site/src/world/figures.js';
import { PET_COATS, PET_RADIUS } from '../../site/src/world/pets.js';
import { Box3, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from '../../site/src/three.js';

const STANDING = POSES.filter((pose) => pose !== 'none');
const FIELDS = ['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'bob', 'leftArmOut', 'rightArmOut', 'headTurn', 'headTilt', 'sit'];
const characters = {
  her: { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' },
  you: { skin: '#e8b48f', hair: '#2a1d14', outfit: '#5b7fc4' },
};
const times = (to = 10, step = 0.05) => Array.from({ length: Math.round(to / step) + 1 }, (_, i) => i * step);

test('every pose gives finite numbers for every field over 10 s', () => {
  for (const pose of STANDING) {
    for (const t of times()) {
      const p = posesAt(pose, t);
      for (const who of ['her', 'him']) {
        for (const field of FIELDS) assert.ok(Number.isFinite(p[who][field]), `${pose} ${who}.${field} at ${t} s: ${p[who][field]}`);
      }
      assert.ok(Number.isFinite(p.spin), `${pose} spin at ${t} s`);
    }
  }
});

test('waving raises an arm out and waves it', () => {
  const most = (pick) => Math.max(...times().map((t) => pick(posesAt('waving', t))));
  const least = (pick) => Math.min(...times().map((t) => pick(posesAt('waving', t))));
  assert.ok(most((p) => p.him.rightArmOut) > 2.2, 'his right arm');
  assert.ok(most((p) => p.her.leftArmOut) > 2.2, 'her left arm');
  assert.ok(most((p) => p.him.rightArmOut) - least((p) => p.him.rightArmOut) > 0.6, 'waving ±0.35 rad');
});

test('sitting sits', () => {
  for (const t of [0, 1.3, 4.7]) {
    const p = posesAt('sitting', t);
    assert.equal(p.her.sit, 1);
    assert.equal(p.him.sit, 1);
  }
});

test('a hug faces them to each other', () => {
  const { her, him } = coupleLayout('hug');
  assert.equal(her.turn, -Math.PI / 2);
  assert.equal(him.turn, Math.PI / 2);
});

test('sitting is on the bench, and reaches as wide as the bench does', () => {
  const layout = coupleLayout('sitting');
  assert.equal(layout.bench, true);
  const box = new Box3().setFromBufferAttribute(createPropGeometry('bench').body.attributes.position);
  assert.ok(layout.halfWidth >= Math.max(box.max.x, -box.min.x), `${layout.halfWidth} m`);
  for (const pose of STANDING.filter((p) => p !== 'sitting')) assert.equal(coupleLayout(pose).bench, false, pose);
});

// Beyond the brief.

test('the layouts: today\'s for holding hands, side by side for waving and pointing, facing for a hug and a dance', () => {
  const at = (pose) => coupleLayout(pose);
  assert.deepEqual(at('holding-hands').her, { x: 0.26, z: 0, turn: 0 });
  assert.deepEqual(at('holding-hands').him, { x: -0.26, z: 0, turn: 0 });
  assert.equal(at('holding-hands').halfWidth, COUPLE_HALF_WIDTH);
  assert.equal(at('hug').her.x - at('hug').him.x, 0.32, 'a hug is 0.16 either side of their middle');
  assert.equal(at('dancing').her.x - at('dancing').him.x, 0.6, 'a dance is 0.3 either side');
  assert.equal(at('dancing').her.turn, -Math.PI / 2);
  assert.equal(at('dancing').him.turn, Math.PI / 2);
  assert.equal(at('pointing').her.turn, 0.6, 'she turns toward the sign, on their left');
  assert.equal(at('pointing').him.turn, 0);
  for (const pose of ['waving', 'pointing']) assert.ok(at(pose).her.x > 0 && at(pose).him.x < 0 && at(pose).her.z === at(pose).him.z, pose);
  assert.ok(at('sitting').her.z < -BENCH.BACK + 0.2 && at('sitting').her.z > -BENCH.BACK - 0.2, 'on the bench, 0.3 m behind');
  assert.deepEqual(coupleLayout('anything else'), at('holding-hands'));
  for (const pose of STANDING) assert.ok(Object.isFrozen(at(pose)) && Object.isFrozen(at(pose).her), pose);
});

test('the bench numbers are the bench prop\'s', () => {
  const geometry = createPropGeometry('bench').body;
  const box = new Box3().setFromBufferAttribute(geometry.attributes.position);
  assert.ok(Math.abs(BENCH.HALF_LENGTH - box.max.x) < 0.005);
  const ray = new Raycaster(new Vector3(0.26, 2, 0), new Vector3(0, -1, 0));
  const seat = ray.intersectObject(new Mesh(geometry, new MeshBasicMaterial()))[0].point.y;
  assert.ok(Math.abs(BENCH.SEAT - seat) < 0.005, `the seat is ${seat} m high`);
});

test('everyone breathes, 0.012 m every 1.8 s, and only a dance spins', () => {
  for (const pose of STANDING) {
    const bobs = times(3.6, 0.01).map((t) => posesAt(pose, t).her.bob);
    assert.ok(Math.abs(Math.max(...bobs) - Math.min(...bobs) - 0.012) < 0.0005, `${pose}: ${Math.max(...bobs) - Math.min(...bobs)}`);
    assert.ok(Math.abs(posesAt(pose, 1.234).her.bob - posesAt(pose, 1.234 + 1.8).her.bob) < 1e-9, `${pose}: every 1.8 s`);
    if (pose !== 'dancing') for (const t of [0, 2, 7]) assert.equal(posesAt(pose, t).spin, 0, pose);
  }
  const turned = (t) => posesAt('dancing', t).spin;
  const step = ((turned(2.1) - turned(2) + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  assert.ok(Math.abs(step - 0.05) < 1e-9, 'a dance turns 0.5 rad/s');
});

test('they are never frozen statues: every pose moves', () => {
  for (const pose of STANDING) {
    const a = posesAt(pose, 0.3), b = posesAt(pose, 1.1);
    const moved = FIELDS.some((f) => a.her[f] !== b.her[f]) && FIELDS.some((f) => a.him[f] !== b.him[f]);
    assert.ok(moved, pose);
  }
});

test('the poses: a wave at 1.4 Hz, a hug\'s arms, her point, his look', () => {
  const wave = (t) => posesAt('waving', t).her.leftArmOut;
  assert.ok(Math.abs(wave(0.2) - wave(0.2 + 1 / 1.4)) < 1e-9, 'waves 1.4 times a second');
  const mean = times(5, 0.01).reduce((sum, t) => sum + wave(t), 0) / times(5, 0.01).length;
  assert.ok(Math.abs(mean - 2.5) < 0.02, `about 2.5 rad out (${mean})`);
  for (const t of [0, 1.7]) {
    // Her arms up round his neck, his lower, round her waist, so their arms pass above and below each other.
    const hug = posesAt('hug', t);
    for (const arm of ['leftArm', 'rightArm']) {
      assert.ok(hug.her[arm] > 1.6 && hug.her[arm] < 1.9, `her ${arm}: ${hug.her[arm]}`);
      assert.ok(hug.him[arm] > 0.8 && hug.him[arm] < 1.1, `his ${arm}: ${hug.him[arm]}`);
    }
    const point = posesAt('pointing', t);
    assert.ok(Math.abs(point.her.leftArm - 1.3) < 0.05, 'her near arm points');
    assert.ok(point.him.headTurn > 0.4, 'he looks toward the sign, on their left');
  }
});

test('a tap: they wave for 2 s, rising and falling smoothly', () => {
  for (const before of [-1, -0.001, NaN, Infinity, 2, 5]) assert.equal(wavedAt(before), 0, String(before));
  assert.equal(wavedAt(1), 1);
  let last = 0, rising = true;
  for (const t of times(2, 0.01)) {
    const w = wavedAt(t);
    assert.ok(w >= 0 && w <= 1, `${t}: ${w}`);
    assert.ok(Math.abs(w - last) < 0.1, `${t}: smooth`);
    if (w < last) rising = false;
    else assert.ok(rising || w === last, `${t}: up once, then down once`);
    last = w;
  }
});

test('a tap makes a couple wave, and a waving couple twirl: he spins her once', () => {
  for (const pose of STANDING.filter((p) => p !== 'waving')) {
    const still = posesAt(pose, 7);
    const waving = posesAt(pose, 7, 1);
    const raised = (p) => Math.max(p.her.leftArmOut, p.her.rightArmOut, p.him.leftArmOut, p.him.rightArmOut);
    assert.ok(raised(still) < 1.5 && raised(waving) > 2.1, `${pose} waves (${raised(still)} → ${raised(waving)})`);
    assert.deepEqual(posesAt(pose, 7, 3), still, `${pose}: and is back as it was after 2 s`);
    assert.equal(waving.twirl, 0);
  }
  assert.equal(posesAt('waving', 4).twirl, 0);
  const twirls = times(1.99, 0.01).map((t) => posesAt('waving', 4, t).twirl);
  for (let i = 1; i < twirls.length; i++) assert.ok(twirls[i] >= twirls[i - 1], 'she turns one way round');
  assert.ok(twirls[0] === 0 && Math.abs(twirls[twirls.length - 1] - 2 * Math.PI) < 1e-3, 'once round');
  assert.equal(posesAt('waving', 4, 2).twirl, 0, 'and lands facing the way she was');
});

test('mirrorPose swaps left and right and turns the head the other way', () => {
  const p = { leftLeg: 0.1, rightLeg: 0.2, leftArm: 0.3, rightArm: 0.4, bob: 0.01, leftArmOut: 0.5, rightArmOut: 0.6, headTurn: 0.7, headTilt: 0.8, sit: 1 };
  assert.deepEqual(mirrorPose(p), { leftLeg: 0.2, rightLeg: 0.1, leftArm: 0.4, rightArm: 0.3, bob: 0.01, leftArmOut: 0.6, rightArmOut: 0.5, headTurn: -0.7, headTilt: -0.8, sit: 1 });
});

// The couple built from the poses.

/** Every vertex of `object` in its parent's frame, skinned meshes posed. */
function vertices(object) {
  object.updateMatrixWorld(true);
  const inverse = object.parent ? object.parent.matrixWorld.clone().invert() : null;
  const points = [];
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      const p = o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld);
      points.push(inverse ? p.applyMatrix4(inverse) : p);
    }
  });
  return points;
}

const figureOf = (couple, who) => couple.group.getObjectByName(`figure-${who}`);
const boneOf = (couple, who, bone) => figureOf(couple, who).getObjectByName(bone);
const meshesOf = (couple) => { const m = []; couple.group.traverse((o) => { if (o.isMesh) m.push(o); }); return m; };

test('a stop couple is the two of them, one draw call each, and a bench to sit on', () => {
  for (const pose of STANDING) {
    const couple = createStopCouple(characters, pose);
    assert.equal(couple.halfWidth, coupleLayout(pose).halfWidth, pose);
    assert.equal(typeof couple.update, 'function');
    assert.equal(typeof couple.react, 'function');
    assert.ok(figureOf(couple, 'her') && figureOf(couple, 'him'), pose);
    assert.equal(meshesOf(couple).length, pose === 'sitting' ? 3 : 2, `${pose}: draw calls`);
  }
  assert.equal(createStopCouple(characters, 'hug').pet, null, 'no pet unless given one');
  const withPet = createStopCouple(characters, 'hug', { kind: 'dog', coat: ['#c8924f', '#f3e3c8'] });
  assert.equal(meshesOf(withPet).length, 4, 'and two for their pet');
});

/** Every corner of `object`, posed, in the frame of the couple `root` (which stands at the origin, unturned). */
function inCouple(root, object) {
  root.updateMatrixWorld(true);
  const points = [];
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) points.push(o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld));
  });
  return points;
}

test('their pet sits at their feet: between them, 0.45 m in front, facing the train like them, and clear of them', () => {
  for (const pose of STANDING) {
    for (const side of ['right', 'left']) {
      for (const kind of ['dog', 'cat']) {
        const label = `${pose} (${side}), a ${kind}`;
        const couple = createStopCouple(characters, pose, { kind, coat: PET_COATS[kind][1] }, side);
        const pet = couple.group.getObjectByName(`pet-${kind}`);
        assert.ok(pet && couple.pet.group === pet, label);
        assert.equal(typeof couple.pet.react, 'function', 'for a tap on it (Task 14)');
        const layout = coupleLayout(pose);
        const middle = (layout.her.z + layout.him.z) / 2;
        assert.equal(pet.position.x, 0, `${label}: between them`);
        if (pose === 'dancing') {
          // Further out for a dance, clear of the circle they turn in.
          assert.ok(pet.position.z >= layout.halfWidth + PET_RADIUS - 1e-9, `${label}: ${pet.position.z} m out`);
        } else {
          assert.ok(Math.abs(pet.position.z - middle - 0.45) < 1e-9, `${label}: ${pet.position.z} m in front`);
        }
        assert.equal(pet.rotation.y, 0, `${label}: facing +Z like them`);
        assert.ok(couple.halfWidth >= coupleLayout(pose).halfWidth, label);
        for (const t of [0, 0.9, 2.6, 4.4, 7.3, 11.8]) {
          couple.update(t);
          const petPoints = inCouple(couple.group, pet);
          for (const p of petPoints) assert.ok(Math.abs(p.x) <= couple.halfWidth, `${label}: inside halfWidth`);
          const low = Math.min(...petPoints.map((p) => p.y));
          assert.ok(Math.abs(low) < 0.012, `${label} at ${t} s: sitting on the ground (${low.toFixed(3)} m)`);
          // Nothing of them (or the bench) inside the box round its body, nor within 4 cm of any corner of its slim
          // tail (which takes in all of it: no part of the tail is further than that from one of its corners).
          const own = (mesh) => Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
          const box = new Box3().setFromPoints(own(pet.getObjectByName(`${kind}-body`))).expandByScalar(0.02);
          const tail = own(pet.getObjectByName(`${kind}-tail`));
          const reach = new Box3().setFromPoints(tail).expandByScalar(0.04);
          const nearTail = (p) => reach.containsPoint(p) && tail.some((q) => q.distanceTo(p) < 0.04);
          for (const other of couple.group.children.filter((o) => o !== pet)) {
            const inside = inCouple(couple.group, other).find((p) => box.containsPoint(p) || nearTail(p));
            assert.equal(inside, undefined, `${label} at ${t} s: ${other.name} reaches into the pet at ${inside && inside.toArray().map((v) => v.toFixed(2))}`);
          }
        }
      }
    }
  }
});

test('halfWidth reaches past every part of them, however they idle, and not much further', () => {
  for (const pose of STANDING) {
    for (const side of ['right', 'left']) {
      const couple = createStopCouple(characters, pose, null, side);
      let widest = 0;
      for (let t = 0; t < 13; t += 0.13) {
        couple.update(t);
        for (const p of vertices(couple.group)) widest = Math.max(widest, pose === 'dancing' ? Math.hypot(p.x, p.z) : Math.abs(p.x));
      }
      assert.ok(widest <= couple.halfWidth, `${pose} (${side}): ${widest.toFixed(3)} m wide of ${couple.halfWidth} m`);
      assert.ok(widest > couple.halfWidth - 0.05, `${pose} (${side}): ${widest.toFixed(3)} m, not much short of ${couple.halfWidth} m`);
    }
  }
});

test('standing, their feet are on the ground; sitting, they sit on the bench', () => {
  for (const pose of STANDING) {
    const couple = createStopCouple(characters, pose);
    for (const t of [0, 0.7, 2.2, 5.1]) {
      couple.update(t);
      for (const who of ['her', 'him']) {
        const figure = figureOf(couple, who);
        const low = Math.min(...vertices(figure).map((p) => p.y));
        if (pose === 'sitting') {
          const hips = boneOf(couple, who, 'hips').getWorldPosition(new Vector3()).y;
          assert.ok(Math.abs(hips - BENCH.SEAT - 0.06) < 0.02, `${who} sits on the seat (hips ${hips.toFixed(3)} m)`);
          assert.ok(low > BENCH.SEAT - 0.12, `${who}: nothing sinks far into the seat (${low.toFixed(3)} m)`);
        } else {
          assert.ok(low > -0.01 && low < 0.03, `${pose}, ${who} at ${t} s: feet at ${low.toFixed(3)} m`);
        }
      }
    }
  }
});

test('hands held stay held: holding hands, waving, sitting and dancing', () => {
  const held = { 'holding-hands': [['rightHand', 'leftHand']], waving: [['rightHand', 'leftHand']], sitting: [['rightHand', 'leftHand']], dancing: [['leftHand', 'rightHand'], ['rightHand', 'leftHand']] };
  for (const [pose, pairs] of Object.entries(held)) {
    for (const side of ['right', 'left']) {
      const couple = createStopCouple(characters, pose, null, side);
      for (const t of [0, 0.4, 1.3, 2.9, 6.2]) {
        couple.update(t);
        couple.group.updateMatrixWorld(true);
        for (const [hers, his] of pairs) {
          // Mirrored, her right hand is the one by him, and his left.
          const [h, m] = side === 'left' ? [hers === 'rightHand' ? 'leftHand' : 'rightHand', his === 'leftHand' ? 'rightHand' : 'leftHand'] : [hers, his];
          const gap = boneOf(couple, 'her', h).getWorldPosition(new Vector3()).distanceTo(boneOf(couple, 'him', m).getWorldPosition(new Vector3()));
          assert.ok(gap < 0.08, `${pose} (${side}) at ${t} s: her ${h} and his ${m} are ${gap.toFixed(3)} m apart`);
        }
      }
    }
  }
});

test('at a stop on the left the couple is mirrored, so she still stands on the sign\'s side and points at it', () => {
  for (const pose of STANDING) {
    const right = createStopCouple(characters, pose, null, 'right');
    const left = createStopCouple(characters, pose, null, 'left');
    for (const t of [0, 1.9]) {
      right.update(t);
      left.update(t);
      const her = (c) => figureOf(c, 'her').getWorldPosition(new Vector3());
      if (!['hug', 'dancing'].includes(pose) || t === 0) assert.ok(Math.abs(her(right).x + her(left).x) < 1e-9 && her(right).x > 0, `${pose}: her place`);
      const a = vertices(right.group), b = vertices(left.group);
      const span = (points) => [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
      const [ra, rb] = span(a), [la, lb] = span(b);
      assert.ok(Math.abs(ra + lb) < 0.02 && Math.abs(rb + la) < 0.02, `${pose} at ${t} s: a mirror image`);
    }
  }
  const pointing = createStopCouple(characters, 'pointing', null, 'left');
  pointing.update(0);
  const shoulder = boneOf(pointing, 'her', 'rightArm').getWorldPosition(new Vector3());
  const hand = boneOf(pointing, 'her', 'rightHand').getWorldPosition(new Vector3());
  assert.ok(hand.x < shoulder.x - 0.15 && hand.z > shoulder.z + 0.15, 'on the left she points with her right hand, forward and out toward the sign on their right');
});

test('react makes them wave a moment later, for 2 s', () => {
  const couple = createStopCouple(characters, 'sitting');
  const raised = () => Math.abs(boneOf(couple, 'her', 'leftArm').rotation.z);
  couple.update(10);
  const before = raised();
  couple.react(10);
  couple.update(11);
  assert.ok(raised() > before + 2, `her arm goes up (${before} → ${raised()})`);
  couple.update(12.5);
  assert.ok(Math.abs(raised() - before) < 0.2, 'and comes down');
});
