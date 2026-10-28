// The sky sphere (Task 5 adds its stars): the shader the stars live in, and how strongly they show by zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSky, STARS } from '../../site/src/world/sky.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

const layout = buildLayout(normalizeContent(fixture).content);
const at = (zone) => layout.zones.find((z) => z.id === zone);
/** The middle of `zone`, where its look is its own. */
const inside = (zone) => envAt(layout, (at(zone).start + at(zone).end) / 2);

test('the stars are drawn in the sky\'s own shader: no mesh of their own', () => {
  const sky = createSky();
  assert.match(sky.mesh.material.fragmentShader, /uniform float stars;/);
  assert.match(sky.mesh.material.fragmentShader, /uniform float starTime;/);
  assert.equal(sky.mesh.children.length, 0);
});

test('the stars show in the evening and not at all in the other zones', () => {
  const sky = createSky();
  const camera = new Vector3(0, 2, -900);
  sky.update(inside('evening'), camera);
  assert.equal(sky.mesh.material.uniforms.stars.value, 1);
  for (const zone of ['spring', 'summer', 'autumn', 'winter']) {
    sky.update(inside(zone), camera);
    assert.equal(sky.mesh.material.uniforms.stars.value, 0, zone);
  }
});

test('the stars fade in across the way into the evening, as the sky darkens', () => {
  const sky = createSky();
  const camera = new Vector3(0, 2, -740);
  const boundary = at('evening').start;
  const shown = [];
  for (const d of [boundary - 20, boundary - 10, boundary, boundary + 10, boundary + 20]) {
    sky.update(envAt(layout, d), camera);
    shown.push(sky.mesh.material.uniforms.stars.value);
  }
  assert.equal(shown[0], 0);
  assert.equal(shown[4], 1);
  assert.ok(Math.abs(shown[2] - 0.5) < 1e-9, `half way across at the boundary: ${shown[2]}`);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] >= shown[i - 1], 'they only come in');
});

test('the twinkle is the time it is given', () => {
  const sky = createSky();
  sky.update(inside('evening'), new Vector3(), 12.5);
  assert.equal(sky.mesh.material.uniforms.starTime.value, 12.5);
  sky.update(inside('evening'), new Vector3());
  assert.equal(sky.mesh.material.uniforms.starTime.value, 0, 'time is optional');
});

test('it still follows the camera and paints from the zone\'s own colours', () => {
  const sky = createSky();
  const camera = new Vector3(5, 2, -300);
  const env = inside('evening');
  sky.update(env, camera, 1);
  assert.ok(sky.mesh.position.equals(camera));
  assert.ok(sky.mesh.material.uniforms.topColor.value.equals(env.skyTop));
  assert.ok(sky.mesh.material.uniforms.horizonColor.value.equals(env.skyHorizon));
  assert.equal(sky.mesh.material.fog, false);
  assert.equal(sky.mesh.renderOrder, -1);
});

test('no star is below 0.12 up the sky, and they are denser towards the zenith, and twinkle slowly', () => {
  // The star field is GLSL, so Node cannot run it: what it checks is that the shader is built from these numbers.
  assert.equal(STARS.MIN_UP, 0.12);
  assert.ok(STARS.HORIZON_SHARE < 1 && STARS.FULL_UP > STARS.MIN_UP, 'thinner at the horizon than overhead');
  assert.ok(STARS.TWINKLE.FASTEST <= 2.5 && STARS.TWINKLE.SLOWEST > 0, 'a twinkle takes seconds');
  const { fragmentShader } = createSky().mesh.material;
  assert.match(fragmentShader, /const float STAR_MIN_UP = 0\.12;/);
  assert.match(fragmentShader, /up > STAR_MIN_UP/, 'none below it');
  assert.match(fragmentShader, /const float STAR_CELL = 0\.04;/);
  assert.match(fragmentShader, /starTime \* rate/, 'they twinkle with the time they are given');
});
