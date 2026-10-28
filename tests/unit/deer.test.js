// The deer (Task 9): two of them at the forest edge in autumn, each lifting its head as the train comes near.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeer, DEER, deerHeadLift } from '../../site/src/world/deer.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { envAt } from '../../site/src/world/environment.js';
import { terrainHeight } from '../../site/src/world/terrain.js';
import { tunnelSpan } from '../../site/src/world/tunnel.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Vector3 } from '../../site/src/three.js';

/** The ride through `zones`; every zone has two moments unless `quiet` names it, which has none. */
const layoutOf = (zones, quiet = []) => buildLayout(normalizeContent({
  zones,
  moments: zones.flatMap((zone) => (quiet.includes(zone) ? [] : [{ zone }, { zone }])),
}).content);
const pathOf = (layout) => createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const DEFAULT_ZONES = ['spring', 'summer', 'autumn', 'winter', 'evening'];
const L = layoutOf(DEFAULT_ZONES);
const PATH = pathOf(L);
const autumnOf = (layout) => layout.zones.find((z) => z.id === 'autumn');

/** A deer's meshes, by name. */
const partsOf = (deer) => ({ body: deer.getObjectByName('deer-body'), head: deer.getObjectByName('deer-head'), ears: deer.getObjectByName('deer-ears') });

test('the numbers the deer are made of', () => {
  assert.ok(Object.isFrozen(DEER) && Object.isFrozen(DEER.SPOTS) && Object.isFrozen(DEER.OFFSET));
  assert.deepEqual([...DEER.SPOTS], [0.3, 0.7]);
  assert.deepEqual([...DEER.OFFSET], [14, 18]);
  assert.equal(DEER.HEAD_UP, 0.55);
});

test('the head is down far off, comes up from 35 m and is fully up by 12 m', () => {
  assert.equal(deerHeadLift(80), 0);
  assert.equal(deerHeadLift(35), 0);
  assert.equal(deerHeadLift(12), 1);
  assert.equal(deerHeadLift(0), 1, 'it stays up as the train passes it');
  assert.equal(deerHeadLift(-40), 1, 'and as the train leaves it behind');
  assert.equal(deerHeadLift(NaN), 0);
  assert.ok(deerHeadLift(24) > 0 && deerHeadLift(24) < 1, 'part-way in between');
  let last = 0;
  for (let along = 80; along >= -20; along -= 0.5) {
    const lift = deerHeadLift(along);
    assert.ok(lift >= 0 && lift <= 1, `${along}: ${lift}`);
    assert.ok(lift >= last, `${along}: the head only comes up as the train comes on (${lift} after ${last})`);
    last = lift;
  }
});

test('the default ride has a deer 30% and 70% of the way through the autumn, on alternate sides, out in the trees', () => {
  const { group, targets } = createDeer({ layout: L, path: PATH });
  assert.ok(group.isGroup);
  assert.equal(group.children.length, 2);
  assert.equal(targets.length, 2, 'one to tap for each');
  const autumn = autumnOf(L);
  group.children.forEach((deer, k) => {
    const { distance, offset } = deer.userData;
    assert.ok(Math.abs(distance - (autumn.start + DEER.SPOTS[k] * (autumn.end - autumn.start))) < 1e-9, `deer ${k} is ${distance} m along`);
    assert.ok(distance > autumn.start && distance < autumn.end, 'inside the autumn');
    assert.equal(Math.sign(offset), k % 2 === 0 ? 1 : -1, 'the first is on the right, the next on the left');
    assert.ok(Math.abs(offset) >= DEER.OFFSET[0] && Math.abs(offset) <= DEER.OFFSET[1], `${Math.abs(offset)} m out`);
    // And that is where it stands in the world.
    const spot = PATH.frameAt(distance, offset, 0, new Vector3());
    assert.ok(Math.hypot(deer.position.x - spot.x, deer.position.z - spot.z) < 1e-6, `deer ${k} stands on its spot`);
  });
  assert.notEqual(group.children[0].userData.offset, group.children[1].userData.offset, 'each at its own distance from the track');
});

test('each deer is three meshes, the body, the head with its neck and its ears, drawn with the shared solid material', () => {
  const { group } = createDeer({ layout: L, path: PATH });
  for (const deer of group.children) {
    const meshes = [];
    deer.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 3);
    const { body, head, ears } = partsOf(deer);
    assert.deepEqual(meshes.sort((a, b) => a.name.localeCompare(b.name)), [body, head, ears].sort((a, b) => a.name.localeCompare(b.name)));
    assert.equal(ears.parent, head, 'the ears go where the head goes, and flick on their own');
    for (const mesh of meshes) {
      assert.equal(mesh.material, MATERIALS.solid);
      assert.ok(mesh.geometry.attributes.color && mesh.geometry.attributes.normal, 'coloured like every model built in code');
    }
    // The body stands to about shoulder height, and the head's pivot is up at the withers, in front of the body's middle.
    body.geometry.computeBoundingBox();
    assert.ok(body.geometry.boundingBox.max.y > 0.9 && body.geometry.boundingBox.max.y < 1.4, `${body.geometry.boundingBox.max.y}`);
    assert.ok(head.position.y > 0.8 && head.position.y < 1.4 && head.position.z > 0.2, `${head.position.toArray()}`);
  }
});

test('each deer stands on the ground where it is', () => {
  const { group } = createDeer({ layout: L, path: PATH });
  const env = envAt(L, 0);
  for (const deer of group.children) {
    const { distance, offset } = deer.userData;
    const ground = terrainHeight(distance, offset, { water: envAt(L, distance, env).water, tunnel: tunnelSpan(L) });
    assert.ok(Math.abs(deer.position.y - ground) <= 0.05, `${deer.position.y} on ground ${ground}`);
  }
});

test('a deer by the tunnel stands on its hill', () => {
  // An autumn with no moments is 40 m long, so its second deer is 12 m short of the winter's tunnel, whose hill rises there.
  const layout = layoutOf(['spring', 'autumn', 'winter', 'evening'], ['autumn']);
  const path = pathOf(layout);
  const span = tunnelSpan(layout);
  const { group } = createDeer({ layout, path });
  assert.equal(group.children.length, 2);
  const high = group.children.find((deer) => deer.userData.distance > span.from);
  const ground = terrainHeight(high.userData.distance, high.userData.offset, { water: 0, tunnel: span });
  assert.ok(ground > 3, `the hill is ${ground} m up there`);
  assert.ok(Math.abs(high.position.y - ground) <= 0.05, `${high.position.y} on ground ${ground}`);
});

test('a ride with no autumn has no deer', () => {
  const layout = layoutOf(['spring', 'summer', 'winter', 'evening']);
  const { group, targets } = createDeer({ layout, path: pathOf(layout) });
  assert.equal(group.children.length, 0);
  assert.deepEqual(targets, []);
  // And updating them is harmless.
  assert.doesNotThrow(() => createDeer({ layout, path: pathOf(layout) }).update(0.016, 100, 3));
});

test('a deer lifts its head by HEAD_UP as the train comes near, and not before', () => {
  const { group, update } = createDeer({ layout: L, path: PATH });
  const [deer] = group.children;
  const { head } = partsOf(deer);
  const at = deer.userData.distance;
  update(1 / 30, at - 80, 5);
  assert.ok(Math.abs(head.rotation.x) < 0.1, 'grazing, give or take a nod');
  update(1 / 30, at - 12, 5);
  assert.ok(Math.abs(head.rotation.x + DEER.HEAD_UP) < 1e-9, 'up by HEAD_UP (the nose swings up, which is a turn the other way about X)');
  // On the way in, the head comes up steadily.
  let last = Infinity;
  for (let along = 35; along >= 12; along -= 1) {
    update(1 / 30, at - along, 5);
    assert.ok(head.rotation.x <= last + 1e-9, `${along} m: ${head.rotation.x}`);
    last = head.rotation.x;
  }
  // Jumping back (the timeline) puts the head down again.
  update(1 / 30, at - 120, 5);
  assert.ok(Math.abs(head.rotation.x) < 0.1);
});

test('a deer far from the train is not drawn, and is drawn again as it comes near', () => {
  const { group, update } = createDeer({ layout: L, path: PATH });
  const [deer, other] = group.children;
  update(1 / 30, 0, 0);
  assert.ok(!deer.visible && !other.visible);
  update(1 / 30, deer.userData.distance - 100, 0);
  assert.ok(deer.visible);
  assert.ok(!other.visible, 'the other is still far off');
  update(1 / 30, deer.userData.distance + 20, 0);
  assert.ok(deer.visible && other.visible, 'both are near as the train goes on past the first');
});

// ---------------------------------------------------------------------------------------------
// Taps (Task 14): a deer she taps looks up at her, flicks its ears and bounds off into the trees.
// ---------------------------------------------------------------------------------------------

/** TapEffects that note the sounds a reaction asks for. */
function effects() {
  const fx = { played: [], play: (name) => fx.played.push(name), burst() {} };
  return fx;
}

test('each deer drawn is a tap target round its body', () => {
  const herd = createDeer({ layout: L, path: PATH });
  assert.equal(herd.targets.length, herd.group.children.length);
  const [deer] = herd.group.children;
  herd.update(1 / 30, deer.userData.distance - 200, 0);
  assert.equal(herd.targets[0].position(new Vector3()), null, 'not while it is not drawn');
  herd.update(1 / 30, deer.userData.distance - 40, 0);
  const target = herd.targets[0];
  assert.equal(target.name, 'deer');
  const at = target.position(new Vector3());
  assert.ok(Math.hypot(at.x - deer.position.x, at.z - deer.position.z) < 0.6, 'over the deer');
  assert.ok(at.y - deer.position.y > 0.6 && at.y - deer.position.y < 1.6, `round its body, ${(at.y - deer.position.y).toFixed(2)} m up`);
  assert.ok(target.radius >= 1 && target.radius <= 1.6, `${target.radius} m round`);
});

test('a deer she taps looks up, flicks its ears, bounds off 20 m in 1.5 s and hides until the train is 200 m past', () => {
  const herd = createDeer({ layout: L, path: PATH });
  const [deer] = herd.group.children;
  const { head, ears } = partsOf(deer);
  const at = deer.userData.distance;
  const d = at - 60; // far enough that its head is down, grazing
  herd.update(1 / 30, d, 3);
  const home = deer.position.clone();
  const fx = effects();
  herd.targets[0].react(3, fx);
  assert.deepEqual(fx.played, ['rustle']);
  // It looks up at once, and flicks its ears.
  let lookedUp = false, flicks = 0, last = ears.rotation.x;
  for (let t = 3; t < 3.5; t += 1 / 60) {
    herd.update(1 / 60, d, t);
    if (Math.abs(head.rotation.x + DEER.HEAD_UP) < 0.05) lookedUp = true;
    if (Math.sign(ears.rotation.x) !== Math.sign(last) && Math.abs(ears.rotation.x - last) > 1e-6) flicks++;
    last = ears.rotation.x;
  }
  assert.ok(lookedUp, 'it looks up');
  assert.ok(flicks >= 2, `its ears flick (${flicks} times past rest)`);
  // Then it bounds off, out from the track, and is gone 1.5 s later, 20 m off.
  const sideways = PATH.sideAt(at, new Vector3()).multiplyScalar(Math.sign(deer.userData.offset));
  let furthest = 0, highest = 0;
  for (let t = 3.5; t < 5.0; t += 1 / 60) {
    herd.update(1 / 60, d, t);
    if (!deer.visible) break;
    const away = deer.position.clone().sub(home);
    furthest = Math.max(furthest, away.dot(sideways));
    highest = Math.max(highest, away.y);
  }
  assert.ok(furthest > 17 && furthest <= 20.01, `it bounds ${furthest.toFixed(1)} m out into the trees`);
  assert.ok(highest > 0.3, 'in leaps');
  herd.update(1 / 60, d, 5.1);
  assert.equal(deer.visible, false, 'and is gone');
  assert.equal(herd.targets[0].position(new Vector3()), null, 'and cannot be tapped');
  // Hidden while the train comes by and goes on, until it is 200 m past; then it is back where it stood.
  herd.update(1 / 30, at + 150, 20);
  assert.equal(deer.visible, false);
  herd.update(1 / 30, at + 201, 40);
  herd.update(1 / 30, at - 60, 41); // the timeline takes her back to before it
  assert.equal(deer.visible, true);
  assert.ok(deer.position.distanceTo(home) < 1e-9, 'standing on its spot again');
});
