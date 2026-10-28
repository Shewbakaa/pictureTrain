// The little dogs and cats (Task 11): which one sits at each stop, and the pet itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPet, PET_COATS, PET_RADIUS, petFor, petPose } from '../../site/src/world/pets.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { Box3, Color, Vector3 } from '../../site/src/three.js';

const HEX = /^#[0-9a-f]{6}$/;
const KINDS = ['dog', 'cat'];
const meshesOf = (pet) => { const m = []; pet.group.traverse((o) => { if (o.isMesh) m.push(o); }); return m; };

/** Every corner of every mesh of `object`, posed, in the frame of its parent (or the world, if it has none). */
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

test('the same index always gives the same pet', () => {
  assert.deepEqual(petFor(3, 'random'), petFor(3, 'random'));
});

test('random mixes the kinds', () => {
  const kinds = Array.from({ length: 10 }, (_, i) => petFor(i, 'random').kind);
  assert.ok(kinds.filter((k) => k === 'dog').length >= 2, kinds.join());
  assert.ok(kinds.filter((k) => k === 'cat').length >= 2, kinds.join());
});

test('none is no pet, and a kind asked for is that kind', () => {
  assert.equal(petFor(0, 'none'), null);
  assert.equal(petFor(5, 'cat').kind, 'cat');
});

test('every coat is a pair of #rrggbb', () => {
  for (const kind of KINDS) {
    for (const coat of PET_COATS[kind]) {
      assert.equal(coat.length, 2);
      for (const hex of coat) assert.match(hex, HEX);
    }
  }
});

test('a pet is about 0.35 m tall and at most two meshes', () => {
  for (const kind of KINDS) {
    const pet = createPet({ kind, coat: PET_COATS[kind][0] });
    const box = new Box3().setFromObject(pet.group, true);
    const tall = box.max.y - box.min.y;
    assert.ok(tall >= 0.3 && tall <= 0.45, `${kind}: ${tall.toFixed(3)} m tall`);
    assert.ok(meshesOf(pet).length <= 2, `${kind}: ${meshesOf(pet).length} meshes`);
    assert.equal(typeof pet.update, 'function');
    assert.equal(typeof pet.react, 'function');
  }
});

// Beyond the brief.

test('the coats', () => {
  assert.ok(Object.isFrozen(PET_COATS) && Object.isFrozen(PET_COATS.dog) && Object.isFrozen(PET_COATS.cat));
  assert.ok(PET_COATS.dog.every(Object.isFrozen) && PET_COATS.cat.every(Object.isFrozen));
  assert.deepEqual(PET_COATS.dog.map((c) => [...c]), [['#c8924f', '#f3e3c8'], ['#3a302b', '#f1ece4'], ['#f2e6d0', '#d9b88f'], ['#8a5a3b', '#e8cfa8']]);
  assert.deepEqual(PET_COATS.cat.map((c) => [...c]), [['#f0a35e', '#fff3e2'], ['#2f2c33', '#ffffff'], ['#9a9aa3', '#e9e9ee'], ['#efe7da', '#c9a27e']]);
});

test('each pet wears one of its kind\'s coats, and the coats vary from stop to stop', () => {
  for (const setting of ['random', 'dog', 'cat']) {
    const pets = [-1, ...Array.from({ length: 10 }, (_, i) => i)].map((i) => petFor(i, setting));
    for (const pet of pets) {
      assert.ok(KINDS.includes(pet.kind));
      if (setting !== 'random') assert.equal(pet.kind, setting);
      assert.ok(PET_COATS[pet.kind].some((coat) => coat[0] === pet.coat[0] && coat[1] === pet.coat[1]), `${setting}: ${pet.coat}`);
    }
    assert.ok(new Set(pets.map((p) => `${p.kind}${p.coat}`)).size >= 3, `${setting}: more than one or two looks`);
  }
  // Dealt round the stops: every look comes up, and no two stops in a row are alike.
  const looks = (setting, count) => Array.from({ length: count }, (_, i) => JSON.stringify(petFor(i, setting)));
  assert.equal(new Set(looks('random', 8)).size, 8, 'all eight looks in eight stops');
  assert.equal(new Set(looks('dog', 4)).size, 4, 'all four dogs in four stops');
  for (const setting of ['random', 'dog', 'cat']) {
    const row = looks(setting, 12);
    for (let i = 1; i < row.length; i++) assert.notEqual(row[i], row[i - 1], `${setting}: stops ${i - 1} and ${i}`);
  }
  assert.equal(petFor(-1, 'none'), null, 'none in the finale either');
  assert.deepEqual(petFor(-1, 'random'), petFor(-1, 'random'), 'the finale\'s is the same every time');
  const seeded = (seed) => Array.from({ length: 10 }, (_, i) => JSON.stringify(petFor(i, 'random', seed))).join();
  assert.notEqual(seeded(365), seeded(366), 'another seed picks others');
  assert.equal(seeded(365), Array.from({ length: 10 }, (_, i) => JSON.stringify(petFor(i, 'random'))).join(), 'seed 365 by default');
});

test('a pet is a skinned body and a tail, drawn with the shared solid material, in its coat and markings', () => {
  for (const kind of KINDS) {
    for (const coat of PET_COATS[kind]) {
      const pet = createPet({ kind, coat });
      assert.equal(pet.group.name, `pet-${kind}`);
      const meshes = meshesOf(pet);
      assert.deepEqual(meshes.map((m) => m.name).sort(), [`${kind}-body`, `${kind}-tail`]);
      const body = meshes.find((m) => m.name === `${kind}-body`);
      assert.ok(body.isSkinnedMesh, 'its head and legs move on bones');
      for (const mesh of meshes) {
        assert.equal(mesh.material, MATERIALS.solid);
        assert.ok(mesh.castShadow);
      }
      let found = { coat: false, markings: false };
      for (const [key, hex] of [['coat', coat[0]], ['markings', coat[1]]]) {
        const c = new Color(hex);
        for (const mesh of meshes) {
          const colours = mesh.geometry.attributes.color;
          for (let i = 0; i < colours.count && !found[key]; i++) {
            if (Math.abs(colours.getX(i) - c.r) < 1e-6 && Math.abs(colours.getY(i) - c.g) < 1e-6 && Math.abs(colours.getZ(i) - c.b) < 1e-6) found[key] = true;
          }
        }
      }
      assert.deepEqual(found, { coat: true, markings: true }, `${kind} ${coat}`);
      const triangles = meshes.reduce((sum, m) => sum + triangleCount(m.geometry), 0);
      assert.ok(triangles <= 2000, `${kind}: ${triangles} triangles`);
    }
  }
});

test('a cat\'s ears stand up above its head, and a dog\'s hang down beside it', () => {
  // The highest point of each, sitting: a cat's ears (and the curl of its tail) top its head; a dog's head is its top.
  const top = (kind) => Math.max(...vertices(createPet({ kind, coat: PET_COATS[kind][0] }).group).map((p) => p.y));
  assert.ok(top('cat') > top('dog') + 0.02, `cat ${top('cat').toFixed(3)} m, dog ${top('dog').toFixed(3)} m`);
});

test('sitting, standing, trotting and hopping, its paws (or its rump) are on the ground, and it reaches no further than PET_RADIUS round', () => {
  for (const kind of KINDS) {
    const pet = createPet({ kind, coat: PET_COATS[kind][1] });
    const moves = [undefined, { sit: 0, stride: 0, trot: 0 }, { sit: 0, stride: 1.3, trot: 1 }, { sit: 0.5, stride: 0, trot: 0 }];
    for (const move of moves) {
      for (const t of [0, 1.7, 4.2, 9.9]) {
        pet.update(t, move);
        const points = vertices(pet.group);
        const low = Math.min(...points.map((p) => p.y));
        // (Trotting, the paws swinging through are a little off the ground.)
        const lifted = move && move.trot ? 0.03 : 0.012;
        assert.ok(low > -0.015 && low < lifted, `${kind} ${JSON.stringify(move)} at ${t} s: lowest ${low.toFixed(3)} m`);
        const reach = Math.max(...points.map((p) => Math.hypot(p.x, p.z)));
        assert.ok(reach <= PET_RADIUS, `${kind}: ${reach.toFixed(3)} m round`);
      }
    }
    // Hopping (and a dog spinning) it stays within PET_RADIUS, and comes down again.
    pet.react(10);
    let high = 0;
    for (let t = 10; t < 11; t += 0.02) {
      pet.update(t);
      const points = vertices(pet.group);
      high = Math.max(high, Math.min(...points.map((p) => p.y)));
      assert.ok(Math.max(...points.map((p) => Math.hypot(p.x, p.z))) <= PET_RADIUS, `${kind} hopping at ${t.toFixed(2)} s`);
    }
    assert.ok(high > 0.08, `${kind} hops ${high.toFixed(3)} m clear of the ground`);
    pet.update(11.5);
    assert.ok(Math.abs(Math.min(...vertices(pet.group).map((p) => p.y))) < 0.012, `${kind} lands`);
  }
});

test('sitting, its body tips up and its rump goes down; standing it is level on four legs', () => {
  for (const kind of KINDS) {
    const pet = createPet({ kind, coat: PET_COATS[kind][0] });
    const body = pet.group.getObjectByName('body');
    pet.update(0, { sit: 0, stride: 0, trot: 0 });
    const standing = body.position.y;
    assert.ok(Math.abs(body.rotation.x) < 1e-12, 'level');
    pet.update(0);
    assert.ok(body.rotation.x < -0.5, `${kind} sits up (${body.rotation.x.toFixed(2)} rad)`);
    assert.ok(body.position.y < standing - 0.04, 'on its haunches');
  }
});

test('it looks round every 3 to 6 s, to either side', () => {
  for (const kind of KINDS) {
    const starts = [];
    const sides = new Set();
    let before = 0;
    for (let t = 0; t <= 120; t += 0.01) {
      const turn = petPose(kind, t).headTurn;
      if (before === 0 && turn !== 0) starts.push(t);
      if (Math.abs(turn) > 0.3) sides.add(Math.sign(turn));
      assert.ok(Math.abs(turn) <= 0.8, `${kind} at ${t.toFixed(2)} s: ${turn}`);
      before = turn;
    }
    assert.ok(starts.length >= 20, `${kind}: ${starts.length} looks in 2 minutes`);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      assert.ok(gap >= 3 - 0.02 && gap <= 6 + 0.02, `${kind}: ${gap.toFixed(2)} s between looks`);
    }
    assert.deepEqual([...sides].sort(), [-1, 1], 'left and right');
  }
});

test('a dog wags its tail fast; a cat swishes its slowly', () => {
  /** How many times a second the tail crosses the middle, over 20 s, and how far it goes. */
  const wagging = (kind) => {
    let crossings = 0, most = 0, before = petPose(kind, 0).wag;
    for (let t = 0.005; t <= 20; t += 0.005) {
      const wag = petPose(kind, t).wag;
      if (Math.sign(wag) !== Math.sign(before)) crossings++;
      most = Math.max(most, Math.abs(wag));
      before = wag;
    }
    return { rate: crossings / 2 / 20, most };
  };
  const dog = wagging('dog'), cat = wagging('cat');
  assert.ok(dog.rate >= 2, `a dog wags ${dog.rate} times a second`);
  assert.ok(cat.rate <= 0.7 && cat.rate > 0.2, `a cat swishes ${cat.rate} times a second`);
  assert.ok(dog.most > 0.3 && cat.most > 0.3, 'both well either way');
});

test('a tap makes it hop for joy, and a dog spins round once as it does', () => {
  for (const kind of KINDS) {
    const hops = [], spins = [];
    for (let since = -0.5; since <= 2; since += 0.01) {
      const p = petPose(kind, 5, undefined, since);
      hops.push(p.hop);
      spins.push(p.spin);
    }
    assert.ok(Math.max(...hops) > 0.1, `${kind} hops ${Math.max(...hops)} m`);
    assert.equal(hops[0], 0, 'not before the tap');
    assert.equal(hops[hops.length - 1], 0, 'and down again after');
    if (kind === 'dog') {
      assert.ok(Math.max(...spins) > 2 * Math.PI - 0.1, 'all the way round');
    } else {
      assert.ok(spins.every((s) => s === 0), 'a cat just hops');
    }
    assert.equal(petPose(kind, 5, undefined, NaN).hop, 0, 'no tap, no hop');
    // Its tail goes all the more for a moment.
    const wag = (since) => Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(petPose(kind, 5 + i * 0.02, undefined, since + i * 0.02).wag)));
    assert.ok(wag(0.2) > wag(NaN) * 1.3, `${kind}: an excited tail`);
  }
  // The pet itself: react starts the hop at `now` on the clock update is given.
  const pet = createPet({ kind: 'cat', coat: PET_COATS.cat[0] });
  pet.update(3);
  const resting = pet.group.getObjectByName('cat-body').position.y;
  pet.react(3);
  pet.update(3 + 0.3);
  assert.ok(pet.group.getObjectByName('cat-body').position.y > resting + 0.1, 'up it goes');
});

test('trotting, its legs swing in diagonal pairs and it bobs; it looks ahead as it goes', () => {
  for (const kind of KINDS) {
    const p = petPose(kind, 2, { sit: 0, stride: Math.PI / 2, trot: 1 });
    const [frontLeft, frontRight, backLeft, backRight] = p.legs;
    assert.ok(frontLeft > 0.4 && backRight > 0.4, 'one pair forward');
    assert.ok(frontRight < -0.4 && backLeft < -0.4, 'the other back');
    const bobs = Array.from({ length: 64 }, (_, i) => petPose(kind, 2, { sit: 0, stride: (i / 64) * 2 * Math.PI, trot: 1 }).bob);
    assert.ok(Math.max(...bobs) - Math.min(...bobs) > 0.015, 'a bounce in its step');
    for (let t = 0; t < 60; t += 0.1) assert.ok(Math.abs(petPose(kind, t, { sit: 0, stride: t * 9, trot: 1 }).headTurn) < 1e-12, 'eyes front');
    const still = petPose(kind, 2, { sit: 1, stride: 1, trot: 0 });
    assert.ok(still.legs.every((leg) => leg === 0), 'still when it is not trotting');
  }
});
