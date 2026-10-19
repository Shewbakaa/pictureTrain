import test from 'node:test';
import assert from 'node:assert/strict';
import { PROP_TYPES, PROP_VARIANTS, createPropGeometry } from '../../site/src/world/props.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { ZONES } from '../../site/src/world/zones.js';
import { ZONE_IDS } from '../../site/src/content/normalize.js';
import { TRACK_BED_HALF_WIDTH } from '../../site/src/world/trackMesh.js';
import * as THREE from '../../site/src/three.js';

const HEIGHT = {
  tree_round: [3, 7], tree_autumn: [3, 7], pine: [4, 9], pine_snowy: [4, 9], palm: [4, 8],
  bush: [0.5, 1.6], bush_autumn: [0.5, 1.6], rock: [0.3, 1.5], rock_snowy: [0.3, 1.5],
  flower_patch: [0.1, 0.6], grass_tuft: [0.15, 0.8], balloon_cluster: [2, 5], beach_ball: [0.3, 0.8],
  umbrella: [1.8, 3], pumpkin: [0.3, 0.9], hay_bale: [0.6, 1.4], snowman: [1.2, 2.2], house: [3, 7],
  lamp_post: [2.5, 4.5], bench: [0.6, 1.2], fence: [0.6, 1.4],
};

test('all 21 prop types are listed', () => assert.equal(PROP_TYPES.length, 21));

for (const type of PROP_TYPES) for (let v = 0; v < (PROP_VARIANTS[type] ?? 1); v++) {
  test(`${type}#${v} is a grounded, coloured, low-poly prop`, () => {
    const { body, glow } = createPropGeometry(type, v);
    assert.ok(body.attributes.color);
    body.computeBoundingBox();
    assert.ok(Math.abs(body.boundingBox.min.y) <= 0.05, 'sits on the ground');
    const h = body.boundingBox.max.y;
    assert.ok(h >= HEIGHT[type][0] && h <= HEIGHT[type][1], `height ${h}`);
    assert.ok(triangleCount(body) <= (type === 'house' ? 900 : 600));
    if (glow) assert.ok(glow.attributes.color);
  });
}

test('lamps and houses have glow parts', () => {
  assert.ok(createPropGeometry('lamp_post').glow);
  assert.ok(createPropGeometry('house').glow);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief's: the lists themselves, what glows, that every prop is well-formed triangle soup
// standing on its origin, determinism, distinct variants, bad arguments, the fence's direction (which
// scatter.js relies on), and that nothing reaches over the track from where its zone puts it.
// ---------------------------------------------------------------------------------------------

const variantsOf = (type) => Array.from({ length: PROP_VARIANTS[type] ?? 1 }, (_, v) => v);
const EVERY_PROP = PROP_TYPES.flatMap((type) => variantsOf(type).map((v) => [type, v]));
const BUILT = new Map(EVERY_PROP.map(([type, v]) => [`${type}#${v}`, createPropGeometry(type, v)]));
const built = (type, v = 0) => BUILT.get(`${type}#${v}`);

test('the type list is unique and fixed, and only real types have variants', () => {
  assert.equal(new Set(PROP_TYPES).size, PROP_TYPES.length);
  assert.ok(Object.isFrozen(PROP_TYPES) && Object.isFrozen(PROP_VARIANTS));
  assert.deepEqual({ ...PROP_VARIANTS }, { tree_autumn: 3, house: 3, flower_patch: 2, balloon_cluster: 2 });
  for (const type of Object.keys(PROP_VARIANTS)) assert.ok(PROP_TYPES.includes(type), type);
});

test('only lamps and houses glow, in every variant, on their own body', () => {
  for (const [type, v] of EVERY_PROP) {
    const { body, glow } = built(type, v);
    if (type !== 'lamp_post' && type !== 'house') {
      assert.equal(glow, null, `${type}#${v}`);
      continue;
    }
    assert.ok(glow, `${type}#${v} glows`);
    assert.ok(body.boundingBox.clone().expandByScalar(0.1).containsBox(glow.boundingBox), `${type}#${v}: the glow sits on the body`);
    assert.ok(glow.boundingBox.min.y > 0.5, `${type}#${v}: the glow is up off the ground`);
  }
});

test('every prop is flat-shaded triangle soup with linear colours', () => {
  for (const [type, v] of EVERY_PROP) {
    const { body, glow } = built(type, v);
    for (const g of [body, glow].filter(Boolean)) {
      const { position: p, normal: n, color: c } = g.attributes;
      assert.equal(g.index, null, `${type}#${v} is not indexed`);
      assert.ok(g.boundingBox && g.boundingSphere, `${type}#${v} has its bounds`);
      assert.equal(n.count, p.count);
      assert.equal(c.count, p.count);
      for (let i = 0; i < p.count; i++) {
        assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4, `${type}#${v}: vertex ${i} has a unit normal (no sliver triangles)`);
        assert.ok([c.getX(i), c.getY(i), c.getZ(i)].every((x) => x >= 0 && x <= 1), `${type}#${v}: colour ${i}`);
        assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite), `${type}#${v}: position ${i}`);
      }
    }
  }
});

test('every prop stands exactly on the ground, over its origin', () => {
  for (const [type, v] of EVERY_PROP) {
    const { min, max } = built(type, v).body.boundingBox;
    assert.ok(Math.abs(min.y) < 1e-6, `${type}#${v} lowest point ${min.y}`);
    assert.ok(min.x < 0 && max.x > 0 && min.z < 0 && max.z > 0, `${type}#${v}: the origin is under it`);
  }
});

test('the same prop comes out the same every time, as a fresh geometry', () => {
  for (const [type, v] of EVERY_PROP) {
    const again = createPropGeometry(type, v), first = built(type, v);
    assert.notEqual(again.body, first.body, `${type}#${v} is not shared, so it can be disposed`);
    assert.deepEqual(again.body.attributes.position.array, first.body.attributes.position.array, `${type}#${v} shape`);
    assert.deepEqual(again.body.attributes.color.array, first.body.attributes.color.array, `${type}#${v} colours`);
  }
});

test('the variants of a type look different', () => {
  const meanColour = (g) => {
    const c = g.attributes.color, sum = new THREE.Color(0, 0, 0);
    for (let i = 0; i < c.count; i++) sum.r += c.getX(i), sum.g += c.getY(i), sum.b += c.getZ(i);
    return sum.multiplyScalar(1 / c.count);
  };
  for (const type of Object.keys(PROP_VARIANTS)) {
    const means = variantsOf(type).map((v) => meanColour(built(type, v).body));
    for (let i = 0; i < means.length; i++) for (let j = i + 1; j < means.length; j++) {
      const [a, b] = [means[i], means[j]];
      assert.ok(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.02, `${type}#${i} vs #${j}`);
    }
  }
});

test('unknown types and variants are refused', () => {
  assert.throws(() => createPropGeometry('unicorn'), /unicorn/);
  assert.throws(() => createPropGeometry('constructor'), /constructor/);
  assert.throws(() => createPropGeometry('house', 3), /variant/);
  for (const v of [1, -1, 0.5, '0']) assert.throws(() => createPropGeometry('rock', v), /variant/);
});

test('a fence runs along X, so turning its front (+Z) to the track lines it up with the rails', () => {
  const { min, max } = built('fence').body.boundingBox;
  assert.ok(max.x - min.x > 4 * (max.z - min.z));
});

test('nothing reaches over the track bed from the nearest offset its zone allows', () => {
  const reach = (g) => {
    const p = g.attributes.position;
    let most = 0;
    for (let i = 0; i < p.count; i++) most = Math.max(most, Math.hypot(p.getX(i), p.getZ(i)));
    return most;
  };
  for (const id of ZONE_IDS) for (const rule of ZONES[id].props) for (const v of variantsOf(rule.type)) {
    const { body, glow } = built(rule.type, v);
    const gap = rule.minOffset - Math.max(reach(body), glow ? reach(glow) : 0) * rule.scale[1];
    assert.ok(gap >= TRACK_BED_HALF_WIDTH, `${id} ${rule.type}#${v} reaches to ${gap.toFixed(2)} m from the centre line`);
  }
});
