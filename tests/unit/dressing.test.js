// The zone dressing (Task 9): instanced props on the ground, out of the sea, thinned by priority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDressing, avoidSpots, DRESSING } from '../../site/src/world/dressing.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { envAt } from '../../site/src/world/environment.js';
import { terrainHeight, TERRAIN } from '../../site/src/world/terrain.js';
import { tunnelSpan } from '../../site/src/world/tunnel.js';
import { ZONES } from '../../site/src/world/zones.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { swayMaterialFor } from '../../site/src/world/wind.js';
import { chimneyTop, createPropGeometry, perchTops } from '../../site/src/world/props.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Matrix4, Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

const layout = buildLayout(normalizeContent(fixture).content);
const path = createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const dressing = createDressing({ path, layout });
const tunnel = tunnelSpan(layout);
const meshes = dressing.group.children.filter((o) => o.isInstancedMesh);
const bodies = meshes.filter((m) => !/-(glow|arm|hat)$/.test(m.name));
/** The snowmen's arms and hats, instanced meshes of their own so that a tap can move them (Task 14). */
const snowmanParts = meshes.filter((m) => /-(arm|hat)$/.test(m.name));

/** Track points every metre, to find where along the track and how far out an instance stands. */
const samples = [];
for (let d = -60; d <= layout.total + 60; d += 1) samples.push({ d, point: path.pointAt(d) });
function trackFrameOf(position) {
  let best = samples[0], bestSq = Infinity;
  for (const s of samples) {
    const sq = (s.point.x - position.x) ** 2 + (s.point.z - position.z) ** 2;
    if (sq < bestSq) { best = s; bestSq = sq; }
  }
  // From the nearest sample, along the track to right beside the point, then out to it.
  const tangent = path.tangentAt(best.d);
  const d = best.d + (position.x - best.point.x) * tangent.x + (position.z - best.point.z) * tangent.z;
  const point = path.pointAt(d), side = path.sideAt(d);
  return { d, offset: (position.x - point.x) * side.x + (position.z - point.z) * side.z };
}
function* instances(mesh) {
  const matrix = new Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    yield new Vector3().setFromMatrixPosition(matrix);
  }
}

test('one instanced mesh per zone, type and variant, plus one for each glow', () => {
  const names = meshes.map((m) => m.name);
  assert.equal(new Set(names).size, names.length, 'no two meshes for the same thing');
  for (const mesh of meshes) {
    const [, zone, type] = mesh.name.split('-');
    assert.ok(ZONES[zone].props.some((r) => r.type === type), `${mesh.name} comes from a rule of its zone`);
    assert.equal(mesh.material, mesh.name.endsWith('-glow') ? MATERIALS.glow : (swayMaterialFor(type) ?? MATERIALS.solid));
    assert.ok(mesh.boundingSphere && mesh.boundingSphere.radius > 0, `${mesh.name} has a bounding sphere`);
  }
  for (const glow of meshes.filter((m) => m.name.endsWith('-glow'))) {
    const body = dressing.group.getObjectByName(glow.name.replace(/-glow$/, ''));
    assert.equal(glow.count, body.count, `${glow.name} has an instance for every body`);
  }
  for (const id of ['spring', 'summer', 'autumn', 'winter', 'evening']) assert.ok(bodies.some((m) => m.name.startsWith(`props-${id}-`)), id);
});

test('every prop stands on the ground and none of them floats', () => {
  const env = envAt(layout, 0);
  for (const mesh of bodies) {
    for (const p of instances(mesh)) {
      const { d, offset } = trackFrameOf(p);
      const ground = terrainHeight(d, offset, { water: envAt(layout, d, env).water, tunnel });
      assert.ok(p.y <= ground - DRESSING.SINK + 0.05, `${mesh.name} at ${d} m floats: ${p.y.toFixed(2)} over ground ${ground.toFixed(2)}`);
      assert.ok(p.y >= ground - DRESSING.SINK - 1.5, `${mesh.name} at ${d} m is buried: ${p.y.toFixed(2)} under ground ${ground.toFixed(2)}`);
    }
  }
});

test('no prop stands in the tunnel\'s stretch, nor within 10 m of its portals', () => {
  let near = 0;
  for (const mesh of bodies) {
    for (const p of instances(mesh)) {
      const { d } = trackFrameOf(p);
      assert.ok(d < tunnel.from - 10 || d > tunnel.to + 10, `${mesh.name} at ${d.toFixed(1)} m`);
      if (d > tunnel.from - 40 && d < tunnel.to + 40) near++;
    }
  }
  assert.ok(near > 10, `${near} props either side of the hill: only its own stretch is bare`);
});

test('nothing stands in the sea (R20)', () => {
  const env = envAt(layout, 0);
  let beside = 0;
  for (const mesh of bodies) {
    for (const p of instances(mesh)) {
      const { d, offset } = trackFrameOf(p);
      const water = envAt(layout, d, env).water;
      if (water > 0 && offset < 0) beside++;
      assert.ok(terrainHeight(d, offset, { water }) >= TERRAIN.WATER_LEVEL + 0.1, `${mesh.name} at ${d} m, ${offset.toFixed(1)} m out`);
    }
  }
  assert.ok(beside > 10, 'the beach side is still dressed');
});

test('the stations and the photo signs keep their spots clear', () => {
  const spots = avoidSpots(layout).map((a) => ({ centre: path.frameAt(a.distance, a.right, 0), radius: a.radius }));
  assert.equal(spots.length, layout.stops.length + 2);
  for (const mesh of bodies) {
    for (const p of instances(mesh)) {
      for (const { centre, radius } of spots) assert.ok(Math.hypot(p.x - centre.x, p.z - centre.z) >= radius - 1e-6, mesh.name);
    }
  }
});

test('setDensity draws the first share of every mesh and its halos', () => {
  const totals = new Map(meshes.map((m) => [m, m.count]));
  const halos = dressing.group.children.filter((o) => o.isPoints);
  assert.ok(halos.length > 0 && halos.every((h) => h.material === MATERIALS.halo), 'the street lamps have halos');
  const haloTotals = new Map(halos.map((h) => [h, h.geometry.attributes.position.count]));
  for (const f of [0.45, 0.75, 1]) {
    dressing.setDensity(f);
    for (const [mesh, total] of totals) assert.equal(mesh.count, Math.ceil(total * f), `${mesh.name} at ${f}`);
    for (const [halo, total] of haloTotals) assert.equal(halo.geometry.drawRange.count, Math.ceil(total * f));
  }
});

test('the balloon clusters sway on their pegs', () => {
  const balloons = bodies.filter((m) => m.name.includes('balloon_cluster'));
  assert.ok(balloons.length > 0);
  const before = balloons.map((m) => [...instances(m)]);
  const matrixBefore = new Matrix4();
  balloons[0].getMatrixAt(0, matrixBefore);
  dressing.update(1 / 60, 3.7);
  const matrixAfter = new Matrix4();
  balloons[0].getMatrixAt(0, matrixAfter);
  assert.ok(!matrixAfter.equals(matrixBefore), 'they move');
  balloons.forEach((m, k) => [...instances(m)].forEach((p, i) => assert.ok(p.distanceTo(before[k][i]) < 1e-6, 'the peg stays put')));
});

// ---------------------------------------------------------------------------------------------
// Chimneys (Task 5): where the smoke leaves, and which of them go with their house when the props are thinned.
// ---------------------------------------------------------------------------------------------

/** The instance matrices are 32-bit, so a chimney read back from one is the same point to about a hundredth of a millimetre. */
const SAME = 1e-3;
const houses = bodies.filter((m) => /-(house|cottage_snowy)-\d$/.test(m.name));
/** The chimney top of the `i`-th instance of a house mesh, in the world. */
function chimneyOfInstance(mesh, i) {
  const [, , type, variant] = mesh.name.split('-');
  const matrix = new Matrix4();
  mesh.getMatrixAt(i, matrix);
  return new Vector3(...chimneyTop(type, Number(variant))).applyMatrix4(matrix);
}

test('winter has a few snowy cottages, set back at least 25 m, most of them past where the tunnel goes, and the evening has houses', () => {
  // The default ride: its winter runs from 570 to 750 m, and a tunnel will take 530 to 610 m of the way into it.
  const cottages = bodies.filter((m) => m.name.startsWith('props-winter-cottage_snowy-'));
  const at = cottages.flatMap((mesh) => [...instances(mesh)].map((p) => trackFrameOf(p)));
  assert.ok(at.length >= 3, `${at.length} cottages in the winter hills`);
  assert.ok(at.filter(({ d }) => d < 530 || d > 610).length >= 2, `outside the tunnel's way: ${at.map(({ d }) => d.toFixed(0))}`);
  for (const { d, offset } of at) assert.ok(Math.abs(offset) >= 24.9, `the cottage at ${d.toFixed(0)} m stands ${offset.toFixed(1)} m out`);
  assert.ok(bodies.some((m) => m.name.startsWith('props-evening-house-')));
});

test('every house and cottage has a chimney top over its roof, in the world', () => {
  const { chimneys } = dressing.spots;
  const total = houses.reduce((sum, m) => sum + m.instanceMatrix.count, 0);
  assert.ok(total >= 10);
  assert.equal(chimneys.length, total, 'one for each house');
  for (const mesh of houses) {
    for (let i = 0; i < mesh.instanceMatrix.count; i++) {
      const top = chimneyOfInstance(mesh, i);
      assert.ok(chimneys.some((c) => c.distanceTo(top) < SAME), `${mesh.name} #${i} has its chimney`);
    }
  }
  for (const c of chimneys) assert.ok(c.toArray().every(Number.isFinite));
});

test('a chimney top is carried with its house: turned and scaled where the house is', () => {
  const { chimneys } = dressing.spots;
  const mesh = houses.find((m) => m.name.includes('-house-'));
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  const position = new Vector3().setFromMatrixPosition(matrix);
  const scale = new Vector3().setFromMatrixScale(matrix).x;
  const mine = chimneys.find((c) => c.distanceTo(chimneyOfInstance(mesh, 0)) < SAME);
  const [, , type, variant] = mesh.name.split('-');
  const [, up] = chimneyTop(type, Number(variant));
  assert.ok(Math.abs(mine.y - (position.y + up * scale)) < SAME, 'its height is the house\'s, scaled, over the house\'s own ground');
  assert.ok(mine.distanceTo(position) > 0.5 * scale && mine.distanceTo(position) < 3 * scale + up, 'and it is over the house');
});

test('the chimneys follow the density: a chimney is up while its house is drawn', () => {
  const { chimneys } = dressing.spots;
  for (const f of [0.45, 0.75, 1]) {
    dressing.setDensity(f);
    for (const mesh of houses) {
      for (let i = 0; i < mesh.instanceMatrix.count; i++) {
        const top = chimneyOfInstance(mesh, i);
        const chimney = chimneys.find((c) => c.distanceTo(top) < SAME);
        assert.equal(chimney.rank < f, i < mesh.count, `${mesh.name} #${i} at ${f}: rank ${chimney.rank}`);
      }
    }
  }
  assert.ok(chimneys.every((c) => c.rank >= 0 && c.rank < 1));
});

// ---------------------------------------------------------------------------------------------
// Perches (Task 8): where the robins sit, and which of them go with their prop when the props are thinned.
// ---------------------------------------------------------------------------------------------

test('every fence post and snowman has a perch on its top, in the world, with its zone and its rank', () => {
  const { perches } = dressing.spots;
  const perched = bodies.filter((m) => /-(fence|snowman)-\d$/.test(m.name));
  const total = perched.reduce((sum, m) => sum + perchTops(m.name.split('-')[2]).length * m.instanceMatrix.count, 0);
  assert.ok(perched.some((m) => m.name.startsWith('props-winter-fence-')) && perched.some((m) => m.name.startsWith('props-winter-snowman-')));
  assert.equal(perches.length, total, 'one for each post and each snowman');
  const matrix = new Matrix4();
  for (const mesh of perched) {
    const [, zone, type] = mesh.name.split('-');
    for (let i = 0; i < mesh.instanceMatrix.count; i++) {
      mesh.getMatrixAt(i, matrix);
      for (const top of perchTops(type)) {
        const at = new Vector3(...top).applyMatrix4(matrix);
        const mine = perches.find((p) => p.distanceTo(at) < SAME);
        assert.ok(mine, `${mesh.name} #${i} has its perch`);
        assert.equal(mine.zone, zone);
        assert.equal(mine.rank, i / mesh.instanceMatrix.count, 'its prop is drawn while the density is above this');
        const base = new Vector3().setFromMatrixPosition(matrix);
        assert.ok(mine.y - base.y > 0.9 && mine.y - base.y < 2.4, `${mesh.name} #${i}: ${(mine.y - base.y).toFixed(2)} m over its own ground`);
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Taps (Task 14): the balloon clusters and the snowmen answer her.
// ---------------------------------------------------------------------------------------------

/** The `i`-th instance matrix of `mesh`, a fresh one. */
const matrixOf = (mesh, i) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return m;
};

/** TapEffects that note what a reaction asks for. */
function effects() {
  const fx = { played: [], bursts: [], play: (name) => fx.played.push(name), burst: (at) => fx.bursts.push(at.clone()) };
  return fx;
}

const TAPPABLE = { balloon_cluster: 'balloons', snowman: 'snowman' };
/** Every balloon cluster and snowman: its mesh, its instance, its tap name, where its base is and how far along it stands. */
const tappableProps = bodies.filter((m) => /-(balloon_cluster|snowman)-\d$/.test(m.name)).flatMap((mesh) => [...instances(mesh)].map((p, i) => ({
  mesh, i, name: TAPPABLE[mesh.name.split('-')[2]], base: p, d: trackFrameOf(p).d,
})));
/** The prop a target stands for: the one whose base is under it. */
const propOf = (target) => {
  const at = target.position(new Vector3());
  return tappableProps.find((p) => p.name === target.name && Math.hypot(p.base.x - at.x, p.base.z - at.z) < 1.2);
};

test('every balloon cluster and snowman within TAP_RANGE of the train along the track is a tap target, and nothing else', () => {
  dressing.setDensity(1);
  assert.ok(DRESSING.TAP_RANGE >= 80 && DRESSING.TAP_RANGE <= 130, 'about as far as the fog lets her see a prop');
  assert.ok(tappableProps.some((p) => p.name === 'balloons') && tappableProps.some((p) => p.name === 'snowman'));
  for (let d = 0; d <= layout.total; d += 20) {
    const targets = dressing.targetsNear(d);
    for (const target of targets) {
      const prop = propOf(target);
      assert.ok(prop, `${target.name} at ${d} m stands for a prop`);
      assert.ok(Math.abs(prop.d - d) < DRESSING.TAP_RANGE + 1, `${target.name}, ${prop.d.toFixed(0)} m along, is near ${d} m`);
      const up = target.position(new Vector3()).y - prop.base.y;
      assert.ok(up > 0.5 && up < 4.5, `${target.name}: its hit sphere is round the prop, ${up.toFixed(2)} m up`);
      assert.ok(target.radius > 0.5 && target.radius < 1.6, `${target.name}: ${target.radius} m round`);
    }
    const near = tappableProps.filter((p) => Math.abs(p.d - d) < DRESSING.TAP_RANGE - 1);
    for (const prop of near) assert.ok(targets.some((t) => propOf(t) === prop), `${prop.mesh.name} #${prop.i} is a target at ${d} m`);
  }
});

test('a prop thinned away by the quality tier is no target', () => {
  dressing.setDensity(0.4);
  let thinned = 0;
  for (let d = 0; d <= layout.total; d += 20) {
    for (const target of dressing.targetsNear(d)) assert.ok(propOf(target).i < propOf(target).mesh.count, 'only drawn props');
    thinned += tappableProps.filter((p) => Math.abs(p.d - d) < DRESSING.TAP_RANGE - 1 && p.i >= p.mesh.count).length;
  }
  assert.ok(thinned > 0, 'some were thinned away');
  dressing.setDensity(1);
});

test('a tapped balloon cluster hops 0.3 m over 0.6 s, and pops a burst of hearts out of its top', () => {
  const prop = tappableProps.find((p) => p.name === 'balloons');
  const target = dressing.targetsNear(prop.d).find((t) => propOf(t) === prop);
  const fx = effects();
  const peg = (time) => {
    dressing.update(1 / 60, time);
    return new Vector3().setFromMatrixPosition(matrixOf(prop.mesh, prop.i)).y - prop.base.y;
  };
  assert.ok(Math.abs(peg(10)) < 1e-6);
  const middle = target.position(new Vector3());
  target.react(10, fx);
  assert.deepEqual(fx.played, ['pop']);
  assert.equal(fx.bursts.length, 1);
  assert.ok(fx.bursts[0].y > middle.y + 0.3, 'the hearts come out of its top');
  assert.ok(Math.hypot(fx.bursts[0].x - middle.x, fx.bursts[0].z - middle.z) < 0.6, 'over its middle');
  let highest = 0;
  for (let t = 10; t <= 10.6; t += 0.02) highest = Math.max(highest, peg(t));
  assert.ok(Math.abs(highest - 0.3) < 0.02, `it hops ${highest.toFixed(3)} m`);
  assert.ok(Math.abs(peg(10.65)) < 1e-6, 'and is back on its peg');
});

test('a tapped snowman waves its arm 3 times over 1.5 s and hops its hat 10 cm, with a jingle', () => {
  const prop = tappableProps.find((p) => p.name === 'snowman');
  const target = dressing.targetsNear(prop.d).find((t) => propOf(t) === prop);
  const arm = dressing.group.getObjectByName(`${prop.mesh.name}-arm`);
  const hat = dressing.group.getObjectByName(`${prop.mesh.name}-hat`);
  assert.ok(arm && hat && snowmanParts.includes(arm) && snowmanParts.includes(hat));
  assert.equal(arm.material, MATERIALS.solid);
  const at = (mesh, time) => {
    dressing.update(1 / 60, time);
    return matrixOf(mesh, prop.i);
  };
  // At rest each sits on the snowman: its instance matrix is the snowman's, moved by the part's offset.
  const restArm = at(arm, 20), restHat = at(hat, 20);
  const body = matrixOf(prop.mesh, prop.i);
  const scale = new Vector3().setFromMatrixScale(body).x;
  const { parts } = createPropGeometry('snowman');
  for (const [rest, offset] of [[restArm, parts.arm.offset], [restHat, parts.hat.offset]]) {
    const placed = new Vector3(...offset).applyMatrix4(body);
    assert.ok(new Vector3().setFromMatrixPosition(rest).distanceTo(placed) < 1e-3, 'on the snowman, where the part goes');
  }
  const hand = arm.geometry.boundingBox.max.clone();
  const handAt = (m) => hand.clone().applyMatrix4(m);
  const fx = effects();
  target.react(20, fx);
  assert.deepEqual(fx.played, ['jingle']);
  let waves = 0, rising = false, last = handAt(restArm).y, hop = 0;
  for (let t = 20; t <= 21.5; t += 1 / 60) {
    const y = handAt(at(arm, t)).y;
    if (y < last - 1e-4) {
      if (rising) waves++;
      rising = false;
    } else if (y > last + 1e-4) {
      rising = true;
    }
    last = y;
    hop = Math.max(hop, new Vector3().setFromMatrixPosition(at(hat, t)).y - new Vector3().setFromMatrixPosition(restHat).y);
  }
  assert.equal(waves, 3, 'three waves of the arm');
  assert.ok(Math.abs(hop - 0.1 * scale) < 0.01, `the hat hops ${hop.toFixed(3)} m`);
  assert.ok(at(arm, 21.6).equals(restArm) && at(hat, 21.6).equals(restHat), 'and both are back at rest');
});

test('the snowmen\'s arms and hats are thinned with them', () => {
  assert.ok(snowmanParts.length >= 2);
  for (const f of [0.4, 1]) {
    dressing.setDensity(f);
    for (const part of snowmanParts) {
      const body = dressing.group.getObjectByName(part.name.replace(/-(arm|hat)$/, ''));
      assert.equal(part.count, body.count, `${part.name} at ${f}`);
    }
  }
});
