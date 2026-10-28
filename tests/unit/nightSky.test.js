// The night sky's moon and shooting stars (Task 5): when the star is due, and where the moon and the streak appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNightSky, NIGHT_SKY, shootingStarDue } from '../../site/src/world/nightSky.js';
import { Vector3 } from '../../site/src/three.js';

const camera = new Vector3(37.5, 2.05, -812.25);

/** The bearing (rad from -Z, + towards +X) and elevation (rad) of `point` seen from `from`. */
function seen(point, from = camera) {
  const d = point.clone().sub(from);
  return { bearing: Math.atan2(d.x, -d.z), elevation: Math.asin(d.y / d.length()), distance: d.length() };
}

test('the numbers the night sky is built on', () => {
  assert.ok(Object.isFrozen(NIGHT_SKY) && Object.isFrozen(NIGHT_SKY.MOON));
  assert.equal(NIGHT_SKY.MOON.BEARING, -0.45);
  assert.ok(Math.abs(NIGHT_SKY.MOON.ELEVATION - (14 * Math.PI) / 180) < 1e-12);
  assert.equal(NIGHT_SKY.MOON.DISTANCE, 300);
  assert.equal(NIGHT_SKY.MOON.RADIUS, 7);
  assert.equal(NIGHT_SKY.MOON.PHASE, 0.28);
  assert.equal(NIGHT_SKY.STAR_BEFORE_FINALE, 40);
  assert.equal(NIGHT_SKY.STREAK_SECONDS, 0.9);
});

test('the shooting star is due once, as the train first crosses 40 m before the finale going forwards', () => {
  assert.equal(shootingStarDue(900, 921, 960), true);
  assert.equal(shootingStarDue(921, 925, 960), false, 'already past it');
  assert.equal(shootingStarDue(400, 921, 960), false, 'a jump along the timeline');
  assert.equal(shootingStarDue(921, 900, 960), false, 'backwards');
  assert.equal(shootingStarDue(919.9, 920, 960), true, 'reaching it exactly counts');
  assert.equal(shootingStarDue(920, 920.5, 960), false, 'standing on it already');
  assert.equal(shootingStarDue(900, 900, 960), false, 'standing still');
  assert.equal(shootingStarDue(900, 924, 960), true, 'a step of 24 m is still driving');
  assert.equal(shootingStarDue(890, 924.5, 960), false, 'more than 24 m is a jump');
  // Driving the whole way, in frames of a metre a time, it comes once.
  let due = 0;
  for (let d = 800; d < 960; d += 1) if (shootingStarDue(d, d + 1, 960)) due += 1;
  assert.equal(due, 1);
});

test('the moon hangs 300 m out, 26 degrees to the left of straight ahead and 14 degrees up, and shows by how much it is evening', () => {
  const sky = createNightSky();
  const moon = sky.group.getObjectByName('night-moon');
  sky.update(1 / 60, camera, 1);
  const { bearing, elevation, distance } = seen(moon.position);
  assert.ok(Math.abs(bearing - NIGHT_SKY.MOON.BEARING) < 1e-6, `bearing ${bearing}`);
  assert.ok(Math.abs(elevation - NIGHT_SKY.MOON.ELEVATION) < 1e-6, `elevation ${elevation}`);
  assert.ok(Math.abs(distance - 300) < 1e-6, `${distance} m`);
  assert.equal(moon.visible, true);
  assert.equal(moon.material.uniforms.uOpacity.value, 1);

  // It goes where the camera goes, so it never comes closer.
  const far = camera.clone().add(new Vector3(40, 0, -500));
  sky.update(1 / 60, far, 0.5);
  assert.ok(Math.abs(moon.position.distanceTo(far) - 300) < 1e-6);
  assert.equal(moon.material.uniforms.uOpacity.value, 0.5);

  // Not at all in the daytime: and then it is not even drawn.
  sky.update(1 / 60, far, 0);
  assert.equal(moon.visible, false);
});

test('the moon is a crescent that no fog touches, drawn after the sky', () => {
  const moon = createNightSky().group.getObjectByName('night-moon');
  assert.equal(moon.material.fog, false);
  assert.equal(moon.material.transparent, true);
  assert.equal(moon.material.depthWrite, false);
  assert.equal(moon.frustumCulled, false);
  assert.equal(moon.material.uniforms.uPhase.value, NIGHT_SKY.MOON.PHASE);
  assert.match(moon.material.fragmentShader, /uPhase/);
});

test('a shooting star crosses the upper half of the view ahead of her in 0.9 s, and is then gone', () => {
  const sky = createNightSky();
  const streak = sky.group.getObjectByName('night-streak');
  sky.update(1 / 60, camera, 1);
  assert.equal(streak.visible, false, 'none until one is shot');

  sky.shoot();
  const bearings = [], elevations = [];
  let frames = 0;
  for (let t = 0; t < NIGHT_SKY.STREAK_SECONDS - 0.05; t += 1 / 60, frames++) {
    sky.update(1 / 60, camera, 1);
    assert.equal(streak.visible, true, `still going at ${t.toFixed(2)} s`);
    const { bearing, elevation, distance } = seen(streak.position);
    assert.ok(distance < 350, 'inside the sky, in front of the far edge');
    bearings.push(bearing);
    elevations.push(elevation);
  }
  const deg = (r) => (r * 180) / Math.PI;
  for (const e of elevations) assert.ok(deg(e) >= 12 && deg(e) <= 42, `${deg(e).toFixed(1)} degrees up`);
  for (const b of bearings) assert.ok(Math.abs(b) < 0.8, `bearing ${b.toFixed(2)}: ahead of her`);
  // It travels a good way across the sky and comes down as it goes.
  assert.ok(Math.abs(bearings[bearings.length - 1] - bearings[0]) > 0.2, 'it crosses');
  assert.ok(elevations[elevations.length - 1] < elevations[0], 'and falls');
  assert.ok(frames >= 50);

  sky.update(0.2, camera, 1);
  assert.equal(streak.visible, false, 'gone after 0.9 s');
});

test('a shooting star is shot where she is looking, and keeps its place in the sky as the camera moves', () => {
  const sky = createNightSky();
  const streak = sky.group.getObjectByName('night-streak');
  sky.update(0, camera, 1);
  sky.shoot({ bearing: -Math.PI / 2 }); // looking out over the left of the track
  sky.update(0.4, camera, 1);
  const first = seen(streak.position);
  assert.ok(Math.abs(first.bearing - -Math.PI / 2) < 0.8, `bearing ${first.bearing.toFixed(2)}`);
  const moved = camera.clone().add(new Vector3(0, 0, -30));
  sky.update(0, moved, 1);
  const again = seen(streak.position, moved);
  assert.ok(Math.abs(again.bearing - first.bearing) < 1e-6 && Math.abs(again.elevation - first.elevation) < 1e-6, 'it is out at the sky, not in the world');
});

test('a shooting star fades with the evening, and a second one starts the streak over', () => {
  const sky = createNightSky();
  const streak = sky.group.getObjectByName('night-streak');
  sky.update(0, camera, 0);
  sky.shoot();
  sky.update(0.3, camera, 0);
  assert.equal(streak.visible, false, 'no shooting star by day');
  sky.update(0.3, camera, 1);
  assert.equal(streak.visible, true);
  assert.ok(streak.material.uniforms.uAlpha.value > 0);

  sky.update(0.2, camera, 1);
  const head = streak.position.clone();
  sky.shoot();
  sky.update(0.05, camera, 1);
  assert.ok(streak.position.distanceTo(head) > 5, 'a new streak starts from its beginning');
  sky.update(NIGHT_SKY.STREAK_SECONDS + 0.1, camera, 1);
  assert.equal(streak.visible, false);
});

test('a shooting star keeps to the upper half of whatever view it is shot into, a close one with a strip of sky included', () => {
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const views = [
    { bearing: 0, elevation: 0, up: rad(40), across: 0.37 },                          // her seat, portrait
    { bearing: rad(30), elevation: rad(10), up: rad(40), across: 0.37 },             // her head turned and up
    { bearing: -Math.PI / 2, elevation: rad(-6), up: rad(22), across: 0.2 },         // the finale: a long lens, tipped down
  ];
  for (const view of views) {
    const sky = createNightSky();
    const streak = sky.group.getObjectByName('night-streak');
    for (let go = 0; go < 4; go++) {
      sky.update(0, camera, 1);
      sky.shoot(view);
      for (let t = 0; t < NIGHT_SKY.STREAK_SECONDS - 0.05; t += 1 / 30) {
        sky.update(1 / 30, camera, 1);
        const { bearing, elevation } = seen(streak.position);
        const top = Math.max(view.elevation + view.up, rad(4));
        assert.ok(elevation <= top + 1e-6, `${deg(elevation).toFixed(1)} degrees: over the top of the view (${deg(top).toFixed(1)})`);
        assert.ok(elevation >= Math.min(view.elevation, top) - 1e-6 && elevation >= rad(4) - 1e-6, `${deg(elevation).toFixed(1)} degrees: under the middle of the view, or in the haze`);
        const off = Math.atan2(Math.sin(bearing - view.bearing), Math.cos(bearing - view.bearing));
        assert.ok(Math.abs(off) <= view.across + 1e-6, `${off.toFixed(2)} rad off the middle of a view ${view.across} wide`);
      }
    }
  }
});
