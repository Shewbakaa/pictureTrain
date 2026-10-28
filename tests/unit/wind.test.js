// The wind in the foliage (site/src/world/wind.js): the JS mirror of the vertex shader's sway, the strength each
// season blows with, the gusts that roll along the track, and the material's patch of three.js's own Lambert shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gustAt, LOW_PLANTS, SWAY, SWAY_LOW_MATERIAL, SWAY_MATERIAL, SWAYING_TYPES, swayAt, swayMaterialFor, updateWind, WIND,
  windStrength,
} from '../../site/src/world/wind.js';
import { PROP_TYPES } from '../../site/src/world/props.js';
import { ZONE_IDS } from '../../site/src/content/normalize.js';
import { ShaderLib, UniformsUtils } from '../../site/src/three.js';

const TIMES = [0.3, 1.1, 2.7, 5.2, 8.9, 13.4, 21.6, 34.5];
const env = (zoneA, zoneB, t) => ({ zoneA, zoneB, t });
const reach = ({ x, z }) => Math.hypot(x, z);
const still = ({ x, z }) => x === 0 && z === 0; // (deepEqual would tell -0 from 0)

test('the base of a plant never moves, whatever the time', () => {
  for (const t of TIMES) {
    assert.ok(still(swayAt(0, t, 12, -300, 1)), `at ${t} s`);
    assert.ok(still(swayAt(-0.08, t, 12, -300, 1)), 'below the base is no further than the base');
  }
});

test('the canopy moves most: higher up, a plant sways further', () => {
  for (const t of TIMES) {
    assert.ok(reach(swayAt(4, t, 12, -300, 1)) > reach(swayAt(1, t, 12, -300, 1)), `at ${t} s`);
    assert.ok(reach(swayAt(2, t, 12, -300, 1)) > reach(swayAt(1, t, 12, -300, 1)), `at ${t} s`);
  }
});

test('a tall plant sways no further than the cap, 1.6 times what REF_HEIGHT sways', () => {
  for (const t of TIMES) {
    const top = swayAt(200, t, 12, -300, 1);
    const ref = swayAt(WIND.REF_HEIGHT, t, 12, -300, 1);
    assert.ok(Math.abs(top.x - 1.6 * ref.x) < 1e-12 && Math.abs(top.z - 1.6 * ref.z) < 1e-12, `at ${t} s`);
    assert.deepEqual(swayAt(30, t, 12, -300, 1), top, 'capped, not growing');
  }
});

test('BEND is how far (m) a plant sways at REF_HEIGHT in a steady breeze of strength 1, and gusts widen it', () => {
  // The most it can be pushed at one moment: BEND, as much as the lull or the gust at that place allows.
  const { BEND, REF_HEIGHT } = WIND;
  let most = 0;
  let widest = 0;
  for (let t = 0; t < 600; t += 0.05) {
    const now = swayAt(REF_HEIGHT, t, 40, -300, 1);
    const room = BEND * (SWAY.CALM + SWAY.GUSTED * gustAt(-300, t));
    assert.ok(Math.abs(now.x) <= room + 1e-12 && Math.abs(now.z) <= SWAY.SIDE * room + 1e-12, `at ${t} s`);
    most = Math.max(most, Math.abs(now.x) / room);
    widest = Math.max(widest, Math.abs(now.x));
  }
  assert.ok(most > 0.99, `it does reach as far as the wind allows: ${most}`);
  assert.ok(widest > 1.3 * BEND, `a gust sways it well past BEND: ${widest}`);
});

test('neighbouring plants sway out of step: the same moment, three metres apart, they are not alike', () => {
  for (const t of TIMES) {
    const here = swayAt(4, t, 40, -300, 1);
    const there = swayAt(4, t, 43, -300, 1);
    assert.ok(Math.abs(here.x - there.x) > 1e-4, `at ${t} s`);
  }
});

test('the wind sets how far a plant sways, in proportion, and no wind is no sway', () => {
  assert.ok(still(swayAt(4, 3, 40, -300, 0)));
  const calm = swayAt(4, 3, 40, -300, 0.2);
  const strong = swayAt(4, 3, 40, -300, 1.2);
  assert.ok(Math.abs(strong.x / calm.x - 6) < 1e-9 && Math.abs(strong.z / calm.z - 6) < 1e-9);
});

test('the wind blows each season with its own strength, and blends from one to the next', () => {
  assert.deepEqual(WIND.STRENGTH, { spring: 0.6, summer: 1, autumn: 1.2, winter: 0.2, evening: 0.3 });
  for (const zone of ZONE_IDS) assert.equal(windStrength(env(zone, zone, 0)), WIND.STRENGTH[zone], zone);
  assert.equal(windStrength(env('winter', 'winter', 0)), 0.2, 'winter is barely moving');
  assert.ok(Math.abs(windStrength(env('summer', 'winter', 0.5)) - 0.6) < 1e-12, 'halfway between summer and winter');
  assert.ok(Math.abs(windStrength(env('summer', 'autumn', 0.25)) - 1.05) < 1e-12);
  assert.equal(windStrength(env('spring', 'autumn', 0)), WIND.STRENGTH.spring, 'the start of a blend is the zone before');
  assert.equal(windStrength(env('spring', 'autumn', 1)), WIND.STRENGTH.autumn, 'the end of it is the zone after');
});

test('gusts come and go, between 0 and 1, and roll along -Z at SPEED metres a second', () => {
  const { SPEED, EVERY, LENGTH } = WIND.GUST;
  let most = 0;
  let calm = 0;
  for (let z = -3000; z < 0; z += 0.5) {
    const g = gustAt(z, 7);
    assert.ok(g >= 0 && g <= 1, `${g} at ${z}`);
    most = Math.max(most, g);
    if (g === 0) calm++;
    // The same gust, a moment later, a little further down the track (towards -Z).
    assert.ok(Math.abs(gustAt(z - SPEED * 2.5, 7 + 2.5) - g) < 1e-9, `a gust at ${z} rolls on`);
  }
  assert.ok(most > 0.5, `there are real gusts: ${most}`);
  assert.ok(calm > 0, 'with lulls between them');
  assert.ok(LENGTH < 2 * EVERY, 'a gust reaches no further than the cell next door, which the shader looks at');
});

test('on average there is a gust every EVERY metres, and the wind is hardly ever dead still', () => {
  // The gusts are the peaks along the track (a lull between two is only a dip).
  const { EVERY } = WIND.GUST;
  const along = Array.from({ length: 80_000 }, (_, i) => gustAt(i * 0.25, 0));
  let peaks = 0;
  for (let i = 1; i < along.length - 1; i++) if (along[i] > along[i - 1] && along[i] >= along[i + 1] && along[i] > 0.15) peaks++;
  const spacing = (along.length * 0.25) / peaks;
  assert.ok(spacing > EVERY * 0.8 && spacing < EVERY * 1.25, `a gust every ${spacing.toFixed(1)} m`);
  assert.ok(along.filter((g) => g > 0.2).length > along.length / 2, 'the wind is up more often than not');
});

test('the low plants have a sway of their own: a tuft\'s top moves by centimetres, its base not at all', () => {
  // A tuft or flower head, half a metre up, in a breeze of strength 1, over twenty seconds.
  let top = 0;
  let bush = 0;
  let tree = 0;
  for (let t = 0; t < 20; t += 0.05) {
    assert.ok(still(swayAt(0, t, 40, -300, 1, LOW_PLANTS)), `the base at ${t} s`);
    top = Math.max(top, reach(swayAt(0.5, t, 40, -300, 1, LOW_PLANTS)));
    bush = Math.max(bush, reach(swayAt(1, t, 40, -300, 1, LOW_PLANTS)));
    tree = Math.max(tree, reach(swayAt(0.5, t, 40, -300, 1)));
  }
  assert.ok(top >= 0.015, `a tuft's top sways ${(top * 100).toFixed(1)} cm`);
  assert.ok(top < 0.06, `and not so far that it smears: ${(top * 100).toFixed(1)} cm`);
  assert.ok(bush > top && bush < 0.15, `a bush a metre high sways a little more: ${(bush * 100).toFixed(1)} cm`);
  assert.ok(top > 10 * tree, `where the trees' own sway would barely show it: ${(tree * 1000).toFixed(2)} mm`);
  assert.deepEqual(swayAt(0.5, 3, 40, -300, 1, WIND), swayAt(0.5, 3, 40, -300, 1), 'the trees\' sway is the default');
});

test('low plants sway in step with the wind, as the trees do: strength, gusts and the cap', () => {
  const calm = swayAt(0.5, 3, 40, -300, 0.2, LOW_PLANTS);
  const strong = swayAt(0.5, 3, 40, -300, 1.2, LOW_PLANTS);
  assert.ok(Math.abs(strong.x / calm.x - 6) < 1e-9);
  assert.ok(still(swayAt(0.5, 3, 40, -300, 0, LOW_PLANTS)));
  const top = swayAt(50, 3, 40, -300, 1, LOW_PLANTS);
  const ref = swayAt(LOW_PLANTS.REF_HEIGHT, 3, 40, -300, 1, LOW_PLANTS);
  assert.ok(Math.abs(top.x - SWAY.CAP * ref.x) < 1e-12, 'capped at 1.6 times the sway at REF_HEIGHT');
});

test('each swaying prop type has its material: the trees\' and palms\', the low plants\', and none for the rest', () => {
  for (const type of ['tree_round', 'tree_autumn', 'pine', 'pine_snowy', 'palm']) assert.equal(swayMaterialFor(type), SWAY_MATERIAL, type);
  for (const type of ['bush', 'bush_autumn', 'flower_patch', 'grass_tuft']) assert.equal(swayMaterialFor(type), SWAY_LOW_MATERIAL, type);
  for (const type of PROP_TYPES) assert.equal(swayMaterialFor(type) !== null, SWAYING_TYPES.has(type), type);
  assert.notEqual(SWAY_MATERIAL, SWAY_LOW_MATERIAL);
});

test('only the foliage sways: trees, bushes, flowers and grass; not rocks, houses or balloons', () => {
  assert.deepEqual([...SWAYING_TYPES].sort(), [
    'bush', 'bush_autumn', 'flower_patch', 'grass_tuft', 'palm', 'pine', 'pine_snowy', 'tree_autumn', 'tree_round',
  ]);
  for (const type of SWAYING_TYPES) assert.ok(PROP_TYPES.includes(type), `${type} is a prop`);
  for (const type of ['house', 'rock', 'balloon_cluster', 'lamp_post', 'snowman']) assert.ok(!SWAYING_TYPES.has(type), type);
});

test('the sway material moves three.js\'s own Lambert vertex shader, compiled once for every swaying prop', () => {
  const shader = {
    uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms),
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  SWAY_MATERIAL.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /uniform float uWindTime;/);
  assert.match(shader.vertexShader, /uniform float uWindStrength;/);
  assert.match(shader.vertexShader, /#include <begin_vertex>\s+transformed\.xz \+= windSway\(position\.y, instanceMatrix\[3\]\.xyz\);/);
  assert.equal(shader.fragmentShader, ShaderLib.lambert.fragmentShader, 'the colour is left as it is');
  assert.equal(SWAY_MATERIAL.name, 'sway');
  assert.equal(SWAY_MATERIAL.vertexColors, true);
  assert.equal(SWAY_MATERIAL.customProgramCacheKey(), 'sway');
  // The shader's numbers are the ones above, not copies of them.
  assert.match(shader.vertexShader, new RegExp(String(WIND.BEND).replace('.', '\\.')));
  assert.match(shader.vertexShader, new RegExp(`${WIND.GUST.SPEED}\\.0 \\* uWindTime`));
  updateWind(12.5, 0.6);
  assert.equal(shader.uniforms.uWindTime.value, 12.5);
  assert.equal(shader.uniforms.uWindStrength.value, 0.6);
});

test('the low plants\' material is the same shader made for their own BEND and REF_HEIGHT, in a program of its own', () => {
  const patched = (material) => {
    const shader = {
      uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms),
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    };
    material.onBeforeCompile(shader);
    return shader;
  };
  const low = patched(SWAY_LOW_MATERIAL);
  const tall = patched(SWAY_MATERIAL);
  assert.match(low.vertexShader, /#include <begin_vertex>\s+transformed\.xz \+= windSway\(position\.y, instanceMatrix\[3\]\.xyz\);/);
  assert.match(low.vertexShader, /uniform float uWindTime;/);
  assert.match(low.vertexShader, new RegExp(`max\\(height, 0\\.0\\) / ${String(LOW_PLANTS.REF_HEIGHT).replace('.', '\\.')};`));
  assert.match(low.vertexShader, new RegExp(`float reach = ${String(LOW_PLANTS.BEND).replace('.', '\\.')} \\* uWindStrength`));
  assert.match(tall.vertexShader, new RegExp(`float reach = ${String(WIND.BEND).replace('.', '\\.')} \\* uWindStrength`));
  assert.notEqual(low.vertexShader, tall.vertexShader);
  assert.equal(SWAY_LOW_MATERIAL.name, 'sway-low');
  assert.equal(SWAY_LOW_MATERIAL.vertexColors, true);
  assert.equal(SWAY_LOW_MATERIAL.customProgramCacheKey(), 'sway-low');
  assert.notEqual(SWAY_LOW_MATERIAL.customProgramCacheKey(), SWAY_MATERIAL.customProgramCacheKey(), 'compiled apart');
  // The same wind drives both.
  updateWind(7.5, 1.2);
  for (const shader of [low, tall]) {
    assert.equal(shader.uniforms.uWindTime.value, 7.5);
    assert.equal(shader.uniforms.uWindStrength.value, 1.2);
  }
});
