// The sky decorations (Task 9): clouds and hot-air balloons on a ring round the camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkyDecor, SKY_DECOR } from '../../site/src/world/skyDecor.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Matrix4, Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

const layout = buildLayout(normalizeContent(fixture).content);

function cloudPositions(decor) {
  const clouds = decor.group.getObjectByName('sky-clouds');
  const matrix = new Matrix4();
  return Array.from({ length: clouds.count }, (_, i) => {
    clouds.getMatrixAt(i, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  });
}

test('8 clouds and 2 hot-air balloons on a ring 160 to 220 m round the camera, above it', () => {
  const decor = createSkyDecor();
  const camera = new Vector3(120, 2.05, -640);
  decor.update(1 / 60, camera);
  const balloons = decor.group.children.filter((o) => o.name.startsWith('sky-balloon'));
  assert.equal(cloudPositions(decor).length, SKY_DECOR.CLOUDS);
  assert.equal(SKY_DECOR.CLOUDS, 8);
  assert.equal(balloons.length, 2);
  for (const p of [...cloudPositions(decor), ...balloons.map((b) => b.position)]) {
    const out = Math.hypot(p.x - camera.x, p.z - camera.z);
    assert.ok(out >= 160 && out <= 220, `${out.toFixed(1)} m out`);
    assert.ok(p.y > camera.y + 25, 'up in the sky');
  }
});

test('they follow the camera and drift slowly', () => {
  const decor = createSkyDecor();
  decor.update(0, new Vector3(0, 2, 0));
  const first = cloudPositions(decor);
  decor.update(0, new Vector3(30, 2, -400));
  cloudPositions(decor).forEach((p, i) => assert.ok(p.clone().sub(new Vector3(30, 0, -400)).distanceTo(first[i]) < 1e-3, 'moved with the camera'));
  decor.update(10, new Vector3(30, 2, -400));
  const drift = cloudPositions(decor).map((p, i) => p.clone().sub(new Vector3(30, 0, -400)).distanceTo(first[i]));
  for (const metres of drift) assert.ok(metres < 15, `${metres.toFixed(1)} m in 10 s is slow`);
  assert.ok(drift.some((metres) => metres > 1), 'but they do drift');
});

test('the clouds take on the colour of the horizon: pale by day, peach at dusk', () => {
  const decor = createSkyDecor();
  const material = decor.group.getObjectByName('sky-clouds').material;
  assert.equal(material.fog, false, 'never lost in the fog');
  const at = (zone) => layout.stops.find((s) => s.zone === zone).distance;
  decor.update(0, new Vector3(), envAt(layout, at('spring')));
  const day = material.color.clone();
  decor.update(0, new Vector3(), envAt(layout, at('evening')));
  const dusk = material.color.clone();
  assert.ok(day.r > 0.75 && day.g > 0.75 && day.b > 0.75, 'nearly white by day');
  assert.ok(dusk.r > dusk.b + 0.1, 'warmer at dusk');
});

// Taps (Task 14): a hot-air balloon she taps roars, glows and rises.

test('each hot-air balloon is a tap target round its envelope, far out in the sky', () => {
  const decor = createSkyDecor();
  decor.update(1 / 60, new Vector3(0, 2, 0));
  const balloons = decor.group.children.filter((o) => o.name.startsWith('sky-balloon'));
  assert.equal(decor.targets.length, 2);
  decor.targets.forEach((target, i) => {
    assert.equal(target.name, 'sky-balloon');
    const at = target.position(new Vector3());
    const up = at.y - balloons[i].position.y;
    assert.ok(Math.hypot(at.x - balloons[i].position.x, at.z - balloons[i].position.z) < 1e-6, 'over its basket');
    assert.ok(up > 8 && up < 15, `round its envelope, ${up.toFixed(1)} m up`);
    assert.ok(target.radius >= 5 && target.radius <= 9, `${target.radius} m round`);
  });
});

test('tapped, a balloon\'s burner roars, its flame glows for 1.2 s, and it bobs up 3 m and back', () => {
  const camera = new Vector3(0, 2, 0);
  const tapped = createSkyDecor(), still = createSkyDecor();
  tapped.update(1, camera);
  still.update(1, camera);
  const flame = tapped.group.getObjectByName('sky-balloon-0-flame');
  assert.ok(flame, 'a flame at its burner');
  assert.equal(flame.visible, false, 'unlit at rest, so it costs no draw call');
  assert.equal(flame.material.fog, false, 'never lost in the fog, like the balloon');
  const halo = tapped.group.getObjectByName('sky-balloon-0-halo');
  assert.ok(halo && !halo.visible, 'nor its halo');
  const fx = { played: [], play: (name) => fx.played.push(name), burst() {} };
  tapped.targets[0].react(1, fx);
  assert.deepEqual(fx.played, ['burner']);
  const balloon = (decor) => decor.group.getObjectByName('sky-balloon-0').position.y;
  let lit = 0, highest = 0;
  for (let t = 0.05; t <= 10; t += 0.05) {
    tapped.update(0.05, camera);
    still.update(0.05, camera);
    if (flame.visible) lit = t;
    assert.equal(halo.visible, flame.visible, 'the halo glows with the flame');
    highest = Math.max(highest, balloon(tapped) - balloon(still));
  }
  assert.ok(lit > 1.1 && lit < 1.3, `the flame glows for ${lit.toFixed(2)} s`);
  assert.ok(highest > 2.9 && highest <= 3.0001, `it rises ${highest.toFixed(2)} m`);
  assert.ok(Math.abs(balloon(tapped) - balloon(still)) < 1e-6, 'and sinks back to where it was');
  assert.equal(tapped.group.getObjectByName('sky-balloon-1').position.y, still.group.getObjectByName('sky-balloon-1').position.y, 'the other is untouched');
});
