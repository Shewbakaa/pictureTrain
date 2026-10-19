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
