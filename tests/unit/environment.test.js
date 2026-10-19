import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../../site/src/world/zones.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout, zoneAt, LAYOUT } from '../../site/src/world/layout.js';
import { normalizeContent, ZONE_IDS } from '../../site/src/content/normalize.js';
import fixture from '../fixtures/content.fixture.js';
import * as THREE from '../../site/src/three.js';

const L = buildLayout(normalizeContent(fixture).content);
const HEX = /^#[0-9a-f]{6}$/i;

test('every zone has a complete definition', () => {
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    for (const hex of [z.sky.top, z.sky.horizon, z.fog.color, z.sun.color, z.hemi.sky, z.hemi.ground, z.ground.near, z.ground.far, z.ground.path, z.particles.color]) assert.match(hex, HEX);
    assert.equal(z.sun.dir.length, 3);
    assert.equal(typeof z.water, 'boolean');
    assert.ok(z.props.length > 0);
    assert.ok(z.fog.far > z.fog.near);
  }
});

test('zones look distinct', () => {
  for (const a of ZONE_IDS) for (const b of ZONE_IDS) if (a < b) {
    const ca = new THREE.Color(ZONES[a].ground.near), cb = new THREE.Color(ZONES[b].ground.near);
    assert.ok(Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b) > 0.1, `${a} vs ${b}`);
  }
});

test('inside a zone the env equals that zone', () => {
  const e = envAt(L, 100);
  assert.equal(e.skyTop.getHexString(), ZONES.spring.sky.top.slice(1));
  assert.equal(e.zoneA, 'spring');
  assert.equal(e.t, 0);
  assert.equal(e.water, 0);
});

test('at a boundary the env is halfway', () => {
  const e = envAt(L, 210);
  const a = new THREE.Color(ZONES.spring.sky.top), b = new THREE.Color(ZONES.summer.sky.top);
  assert.ok(Math.abs(e.skyTop.r - (a.r + b.r) / 2) < 1e-6);
  assert.ok(Math.abs(e.fogNear - (ZONES.spring.fog.near + ZONES.summer.fog.near) / 2) < 1e-6);
  assert.ok(Math.abs(e.water - 0.5) < 1e-6);
});

test('reordered zones blend in config order', () => {
  const L2 = buildLayout(normalizeContent({ zones: ['autumn', 'spring', 'evening'], moments: [{ zone: 'autumn' }, { zone: 'spring' }] }).content);
  const e = envAt(L2, L2.zones[0].end);
  assert.equal(e.zoneA, 'autumn');
  assert.equal(e.zoneB, 'spring');
});

test('reuses the out object', () => {
  const out = envAt(L, 100);
  assert.equal(envAt(L, 300, out), out);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief's six. At a boundary a blend running backwards looks exactly like one running
// forwards (t is 0.5 either way), and the six only read two of the env's fields, so these cover the rest.
// ---------------------------------------------------------------------------------------------

// Where each number in an Env comes from in a ZoneDef.
const COLOURS = {
  skyTop: (z) => z.sky.top,
  skyHorizon: (z) => z.sky.horizon,
  fogColor: (z) => z.fog.color,
  sunColor: (z) => z.sun.color,
  hemiSky: (z) => z.hemi.sky,
  hemiGround: (z) => z.hemi.ground,
  groundNear: (z) => z.ground.near,
  groundFar: (z) => z.ground.far,
  path: (z) => z.ground.path,
};
const SCALARS = {
  fogNear: (z) => z.fog.near,
  fogFar: (z) => z.fog.far,
  sunIntensity: (z) => z.sun.intensity,
  hemiIntensity: (z) => z.hemi.intensity,
  water: (z) => (z.water ? 1 : 0),
};
const sunOf = (z) => new THREE.Vector3(...z.sun.dir).normalize();
const lerp = (a, b, t) => a + (b - a) * t;

// The prop library's names (PROP_TYPES in props.js, Task 7). A typo in a rule would otherwise only
// show up when the scenery is built.
const PROP_TYPES = [
  'tree_round', 'tree_autumn', 'pine', 'pine_snowy', 'palm', 'bush', 'bush_autumn', 'rock', 'rock_snowy',
  'flower_patch', 'grass_tuft', 'balloon_cluster', 'beach_ball', 'umbrella', 'pumpkin', 'hay_bale',
  'snowman', 'house', 'lamp_post', 'bench', 'fence',
];

// Two zones back to back, so the boundary between them is at 100 m. Any pair, in either order.
const pairLayout = (a, b) => ({
  zones: [{ id: a, start: 0, end: 100, momentIndices: [] }, { id: b, start: 100, end: 200, momentIndices: [] }],
  stops: [],
  finaleDistance: 170,
  total: 240,
});

test('ZONES holds exactly the known zones, each filed under its own id', () => {
  assert.deepEqual(Object.keys(ZONES).sort(), [...ZONE_IDS].sort());
  for (const id of ZONE_IDS) assert.equal(ZONES[id].id, id);
});

test('the numbers in every zone make sense', () => {
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    assert.ok(z.fog.near >= 0, `${id} fog near`);
    assert.ok(z.sun.intensity > 0 && z.hemi.intensity > 0, `${id} light`);
    assert.ok(z.sun.dir.every(Number.isFinite) && z.sun.dir[1] > 0, `${id} sun is above the horizon`);

    const p = z.particles;
    assert.ok(['petals', 'leaves', 'snow', 'fireflies', 'none'].includes(p.kind), `${id} particle kind`);
    assert.equal(typeof p.additive, 'boolean');
    for (const n of [p.size, p.fall, p.sway, p.density]) assert.ok(Number.isFinite(n) && n >= 0, `${id} particle numbers`);
    assert.ok(p.density <= 1, `${id} density is an opacity`);
    if (p.kind === 'none') assert.equal(p.density, 0, `${id} has no particles`);
    else assert.ok(p.size > 0 && p.density > 0, `${id} particles are visible`);

    for (const r of z.props) {
      assert.ok(PROP_TYPES.includes(r.type), `${id}: ${r.type} is not a prop`);
      assert.ok(r.perMeter > 0, `${id} ${r.type} perMeter`);
      assert.ok(r.minOffset > 0 && r.maxOffset > r.minOffset, `${id} ${r.type} offsets`);
      assert.ok(r.scale.length === 2 && r.scale[0] > 0 && r.scale[1] >= r.scale[0], `${id} ${r.type} scale`);
    }
  }
});

test('each zone has what makes it recognisable', () => {
  const identity = {
    spring: { kind: 'petals', water: false, props: ['flower_patch', 'balloon_cluster'] },
    summer: { kind: 'none', water: true, props: ['palm', 'umbrella', 'beach_ball'] },
    autumn: { kind: 'leaves', water: false, props: ['tree_autumn', 'pumpkin'] },
    winter: { kind: 'snow', water: false, props: ['pine_snowy', 'snowman'] },
    evening: { kind: 'fireflies', water: false, props: ['house', 'lamp_post'] },
  };
  for (const id of ZONE_IDS) {
    const z = ZONES[id], want = identity[id];
    assert.equal(z.particles.kind, want.kind, `${id} particles`);
    assert.equal(z.water, want.water, `${id} water`);
    for (const type of want.props) assert.ok(z.props.some((r) => r.type === type), `${id} has ${type}`);
    assert.equal(z.particles.additive, id === 'evening', `${id} additive`); // glowing fireflies only
  }
});

test('the fog is the colour of the horizon, so distant ground melts into the sky', () => {
  for (const id of ZONE_IDS) {
    const fog = new THREE.Color(ZONES[id].fog.color), horizon = new THREE.Color(ZONES[id].sky.horizon);
    assert.ok(Math.hypot(fog.r - horizon.r, fog.g - horizon.g, fog.b - horizon.b) < 0.03, id);
  }
});

test('the zone table cannot be changed by accident', () => {
  assert.throws(() => { ZONES.spring.sky.top = '#000000'; }, TypeError);
  assert.throws(() => { ZONES.spring.sun.dir[0] = 0; }, TypeError);
  assert.throws(() => ZONES.spring.props.push({}), TypeError);
  assert.throws(() => { ZONES.spring.props[0].scale[0] = 0; }, TypeError);
  assert.throws(() => { ZONES.spring.particles.density = 0; }, TypeError);
});

test('inside every zone the env is exactly that zone, field by field', () => {
  for (const seg of L.zones) {
    const z = ZONES[seg.id];
    const e = envAt(L, (seg.start + seg.end) / 2);
    for (const [key, hexOf] of Object.entries(COLOURS)) assert.equal(e[key].getHexString(), hexOf(z).slice(1).toLowerCase(), `${seg.id} ${key}`);
    for (const [key, valueOf] of Object.entries(SCALARS)) assert.equal(e[key], valueOf(z), `${seg.id} ${key}`);
    assert.ok(e.sunDir.distanceTo(sunOf(z)) < 1e-9, `${seg.id} sunDir`);
    assert.equal(e.particlesA, z.particles);
    assert.equal(e.particlesB, z.particles);
    assert.deepEqual([e.zoneA, e.zoneB, e.t, e.particlesT], [seg.id, seg.id, 0, 0]);
  }
});

test('before the start and past the end it is the first and last zone', () => {
  const start = envAt(L, -40), end = envAt(L, L.total + 500);
  assert.deepEqual([start.zoneA, start.zoneB, start.t], ['spring', 'spring', 0]);
  assert.deepEqual([end.zoneA, end.zoneB, end.t], ['evening', 'evening', 0]);
});

test('any pair of zones blends field by field, from the first towards the second', () => {
  for (const a of ZONE_IDS) for (const b of ZONE_IDS) if (a !== b) {
    const A = ZONES[a], B = ZONES[b], layout = pairLayout(a, b);
    for (const d of [90, 100, 104]) {
      const { t } = zoneAt(layout, d).blend;
      assert.ok(t > 0 && t < 1, 'the sample is inside the blend');
      const e = envAt(layout, d);
      const at = `${a} to ${b} at ${d} m`;
      for (const [key, hexOf] of Object.entries(COLOURS)) {
        const ca = new THREE.Color(hexOf(A)), cb = new THREE.Color(hexOf(B));
        for (const channel of ['r', 'g', 'b']) assert.ok(Math.abs(e[key][channel] - lerp(ca[channel], cb[channel], t)) < 1e-9, `${at}: ${key}.${channel}`);
      }
      for (const [key, valueOf] of Object.entries(SCALARS)) assert.ok(Math.abs(e[key] - lerp(valueOf(A), valueOf(B), t)) < 1e-9, `${at}: ${key}`);
      const sun = sunOf(A).lerp(sunOf(B), t).normalize();
      assert.ok(e.sunDir.distanceTo(sun) < 1e-9, `${at}: sunDir`);
      assert.equal(e.particlesA, A.particles);
      assert.equal(e.particlesB, B.particles);
      assert.deepEqual([e.zoneA, e.zoneB, e.t, e.particlesT], [a, b, t, t]);
    }
  }
});

test('the env never jumps: it holds still inside a zone and eases across each boundary', () => {
  const STEP = 0.25, half = LAYOUT.BLEND / 2;
  const boundaries = L.zones.slice(0, -1).map((z) => z.end);
  const numbersOf = (e) => [
    ...Object.keys(COLOURS).flatMap((key) => [e[key].r, e[key].g, e[key].b]),
    ...Object.keys(SCALARS).map((key) => e[key]),
    e.sunDir.x, e.sunDir.y, e.sunDir.z,
  ];
  // A smoothstep moves at most 1.5 times its total change per window width, so that is the most any value may
  // move in one step, plus 10% because the sun's direction is renormalised after the mix, which makes its
  // components move up to 5% faster.
  const steepest = (1.5 / LAYOUT.BLEND) * STEP * 1.1;
  let before = numbersOf(envAt(L, 0));
  for (let d = STEP; d <= L.total; d += STEP) {
    const e = envAt(L, d);
    assert.ok(Math.abs(e.sunDir.length() - 1) < 1e-9, `sunDir is a unit vector at ${d} m`);
    const now = numbersOf(e);
    const edge = boundaries.find((b) => Math.abs(d - b) <= half + STEP);
    if (edge === undefined) {
      assert.deepEqual(now, before, `holds still at ${d} m`);
    } else {
      const from = numbersOf(envAt(L, edge - half)), to = numbersOf(envAt(L, edge + half));
      now.forEach((value, i) => assert.ok(Math.abs(value - before[i]) <= steepest * Math.abs(to[i] - from[i]) + 1e-9, `value ${i} jumps at ${d} m`));
    }
    before = now;
  }
});

test('reuses the out object and every colour and vector inside it', () => {
  const out = envAt(L, 100);
  const before = { ...out };
  assert.equal(envAt(L, 300, out), out);
  const objects = Object.keys(before).filter((key) => before[key] instanceof THREE.Color || before[key] instanceof THREE.Vector3);
  assert.equal(objects.length, Object.keys(COLOURS).length + 1);
  for (const key of objects) assert.equal(out[key], before[key], `${key} was replaced`);
  assert.equal(out.zoneA, 'summer');
  assert.equal(out.skyTop.getHexString(), ZONES.summer.sky.top.slice(1));
});

test('without an out object every call returns a fresh env', () => {
  const a = envAt(L, 100), b = envAt(L, 100);
  assert.notEqual(a, b);
  assert.notEqual(a.skyTop, b.skyTop);
  assert.notEqual(a.sunDir, b.sunDir);
});
