import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbientParticles, particleStyleAt } from '../../site/src/world/particles.js';
import { ZONES } from '../../site/src/world/zones.js';
import { AdditiveBlending, NormalBlending, Vector3 } from '../../site/src/three.js';

const env = (a, b, t) => ({ particlesA: ZONES[a].particles, particlesB: ZONES[b].particles, particlesT: t });

test('inside a zone uses its style at full density', () => {
  const r = particleStyleAt(env('winter', 'winter', 0));
  assert.equal(r.style.kind, 'snow');
  assert.equal(r.opacity, ZONES.winter.particles.density);
});

test('crossfades through zero between styles', () => {
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.25)).style.kind, 'petals');
  assert.ok(Math.abs(particleStyleAt(env('spring', 'autumn', 0.25)).opacity - 0.5 * ZONES.spring.particles.density) < 1e-9);
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.5)).opacity, 0);
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.75)).style.kind, 'leaves');
});

test('kind none is invisible', () => {
  assert.equal(particleStyleAt(env('summer', 'summer', 0)).opacity, 0);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief's three: the particle system itself, in Node (no renderer needed).
// ---------------------------------------------------------------------------------------------
const inside = (zone) => env(zone, zone, 0);

test('every particle drawn stays in the 40 x 18 x 40 m box round the camera', () => {
  const p = createAmbientParticles({ maxCount: 200 });
  const camera = new Vector3(37.5, 2.05, -812.25);
  for (let frame = 0; frame < 120; frame++) p.update(0.25, inside('autumn'), camera.set(37.5, 2.05, -812.25 - frame * 1.6));
  const positions = p.points.geometry.attributes.position;
  for (let i = 0; i < 200; i++) {
    assert.ok(Math.abs(positions.getX(i) - camera.x) <= 20 && Math.abs(positions.getZ(i) - camera.z) <= 20, `particle ${i} across`);
    const up = positions.getY(i) - camera.y;
    assert.ok(up >= -3 && up <= 15, `particle ${i} is ${up.toFixed(1)} m up`);
  }
});

test('snow falls about a metre a second, and fireflies hover low and glow', () => {
  const p = createAmbientParticles({ maxCount: 50 });
  const camera = new Vector3(0, 2.05, 0);
  p.update(0, inside('winter'), camera);
  const y0 = Array.from(p.points.geometry.attributes.position.array.filter((_, k) => k % 3 === 1));
  p.update(0.5, inside('winter'), camera);
  const fell = Array.from(p.points.geometry.attributes.position.array.filter((_, k) => k % 3 === 1)).map((y, i) => y0[i] - y);
  const typical = fell.filter((dy) => dy > 0 && dy < 2).sort((a, b) => a - b);
  const median = typical[Math.floor(typical.length / 2)];
  assert.ok(median > 0.3 && median < 0.7, `snow fell ${median.toFixed(2)} m in half a second`);
  assert.equal(p.points.material.blending, NormalBlending);

  p.update(0.5, inside('evening'), camera);
  assert.equal(p.points.material.blending, AdditiveBlending);
  const ys = Array.from(p.points.geometry.attributes.position.array.filter((_, k) => k % 3 === 1));
  for (const y of ys) assert.ok(y - camera.y >= -2.5 && y - camera.y <= 4, 'fireflies keep low');
});

test('nothing is drawn where the zone has no particles, and the quality share thins them', () => {
  const p = createAmbientParticles();
  p.update(0.1, inside('summer'), new Vector3());
  assert.equal(p.points.visible, false);
  p.update(0.1, inside('spring'), new Vector3());
  assert.equal(p.points.visible, true);
  assert.equal(p.points.geometry.drawRange.count, 260);
  p.setQuality(0.35);
  assert.equal(p.points.geometry.drawRange.count, Math.ceil(260 * 0.35));
  p.update(0.1, env('spring', 'autumn', 0.5), new Vector3());
  assert.equal(p.points.visible, false, 'nothing shows at the middle of a crossfade');
});

test('nothing pops: no particle that shows jumps up or down from one frame to the next', () => {
  // Thirty seconds at 30 frames a second, the train still and then rolling on. Any particle that is showing at
  // all (alpha above 0.05) on either side of a frame moves less than a metre up or down across it, so none
  // wraps from the bottom of the box to the top, or round the fireflies' band, while it can be seen.
  const dt = 1 / 30;
  for (const zone of ['spring', 'autumn', 'winter', 'evening']) {
    const p = createAmbientParticles({ maxCount: 600 });
    const camera = new Vector3(4, 2.05, -800);
    const ys = p.points.geometry.attributes.position.array;
    const alphas = p.points.geometry.attributes.aAlpha.array;
    p.update(0, inside(zone), camera);
    let previousY = Float32Array.from({ length: 600 }, (_, i) => ys[i * 3 + 1]);
    let previousAlpha = Float32Array.from(alphas);
    let jumps = 0, hidden = 0;
    for (let frame = 1; frame <= 900; frame++) {
      if (frame > 450) camera.z -= 6.5 * dt;
      p.update(dt, inside(zone), camera);
      for (let i = 0; i < 600; i++) {
        const y = ys[i * 3 + 1];
        const moved = Math.abs(y - previousY[i]);
        if (moved > 1) {
          if (Math.max(alphas[i], previousAlpha[i]) > 0.05) jumps++;
          else hidden++;
        }
        previousY[i] = y;
        previousAlpha[i] = alphas[i];
      }
    }
    assert.equal(jumps, 0, `${zone}: ${jumps} visible jumps`);
    if (zone === 'evening') assert.equal(hidden, 0, 'fireflies never wrap at all');
    else assert.ok(hidden > 0, `${zone}: particles do fall out of the box and come back, unseen`);
  }
});

test('in the tunnel nothing falls: the particles fade out with how far inside she is, and back as she comes out', () => {
  const camera = new Vector3(0, 2.05, -570);
  const opacityAt = (shelter) => {
    const p = createAmbientParticles({ maxCount: 50 });
    p.update(1 / 30, inside('winter'), camera, shelter);
    return p.points.visible ? p.points.material.uniforms.uOpacity.value : 0;
  };
  const open = opacityAt(0);
  assert.equal(open, ZONES.winter.particles.density, 'out in the open, as ever');
  assert.equal(opacityAt(undefined), open, 'no tunnel, no change');
  assert.equal(opacityAt(1), 0, 'none deep inside');
  assert.ok(Math.abs(opacityAt(0.5) - open / 2) < 1e-9, 'half way in, half as strong');
  // Smoothly in and out, as `inside` eases: no step.
  let last = open;
  for (let shelter = 0; shelter <= 1.0001; shelter += 0.05) {
    const now = opacityAt(Math.min(shelter, 1));
    assert.ok(Math.abs(now - last) <= 0.05 * open + 1e-9, `${shelter.toFixed(2)}`);
    last = now;
  }
  // The same particles fade back in where they were: the motion went on while they were hidden.
  const p = createAmbientParticles({ maxCount: 50 });
  const q = createAmbientParticles({ maxCount: 50 });
  for (let frame = 0; frame < 60; frame++) {
    p.update(1 / 30, inside('winter'), camera, frame < 30 ? 1 : 0);
    q.update(1 / 30, inside('winter'), camera, 0);
  }
  assert.deepEqual([...p.points.geometry.attributes.position.array], [...q.points.geometry.attributes.position.array]);
});

// Fireflies scatter from her tap (Task 14): the app calls scatterFrom with a point 6 m along a tap that hit nothing.

/** Two identical particle systems run side by side in the evening for a second, one to scatter and one to compare. */
function twins() {
  const dt = 1 / 30;
  const camera = new Vector3(4, 2.05, -800);
  const tapped = createAmbientParticles({ maxCount: 200 });
  const still = createAmbientParticles({ maxCount: 200 });
  let time = 0;
  const run = (seconds, zone = 'evening') => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      time += dt;
      tapped.update(dt, inside(zone), camera);
      still.update(dt, inside(zone), camera);
    }
  };
  const at = (p, i) => new Vector3().fromBufferAttribute(p.points.geometry.attributes.position, i);
  run(1);
  return { tapped, still, run, at, camera, now: () => time };
}

test('a firefly 2 m from the tap is pushed further away within 0.5 s, and back within 0.3 m of its path after 4.5 s', () => {
  const { tapped, still, run, at, camera, now } = twins();
  // A firefly a few metres in front of her, and a point 2 m from it.
  let i = 0;
  while (at(tapped, i).distanceTo(camera) > 10 || at(tapped, i).distanceTo(camera) < 4) i++;
  const point = at(tapped, i).add(new Vector3(2, 0, 0));
  tapped.scatterFrom(point, now());
  run(0.5);
  const pushed = at(tapped, i).distanceTo(point), path = at(still, i).distanceTo(point);
  assert.ok(pushed > path + 0.5, `pushed out to ${pushed.toFixed(2)} m from the tap, against ${path.toFixed(2)} m`);
  run(4);
  const back = at(tapped, i).distanceTo(at(still, i));
  assert.ok(back < 0.3, `back to within ${back.toFixed(3)} m of its path`);
});

test('only the fireflies within 6 m of the tap scatter, none more than 3 m, and none at all outside the evening', () => {
  const { tapped, still, run, at, camera, now } = twins();
  const point = camera.clone().add(new Vector3(0, 0, -6));
  const near = [];
  for (let i = 0; i < 200; i++) if (at(tapped, i).distanceTo(point) < 6) near.push(i);
  assert.ok(near.length > 0, 'some fireflies are near the tap');
  tapped.scatterFrom(point, now());
  let most = 0;
  for (let frame = 0; frame < 60; frame++) {
    run(1 / 30);
    for (let i = 0; i < 200; i++) {
      const moved = at(tapped, i).distanceTo(at(still, i));
      if (near.includes(i)) most = Math.max(most, moved);
      else assert.ok(moved < 1e-4, `firefly ${i}, beyond 6 m, stays on its path`);
    }
  }
  assert.ok(most > 1 && most <= 3.0001, `the nearest are pushed out up to 3 m (${most.toFixed(2)} m)`);

  // Snow does not scatter.
  const snow = twins();
  snow.run(0.1, 'winter');
  snow.tapped.scatterFrom(snow.camera.clone().add(new Vector3(0, 0, -6)), snow.now());
  snow.run(0.5, 'winter');
  for (let i = 0; i < 200; i++) assert.ok(snow.at(snow.tapped, i).distanceTo(snow.at(snow.still, i)) < 1e-6);
});

test('a tap while the fireflies are still scattered starts from where they are: none jumps (fix round 1)', () => {
  const { tapped, still, run, at, camera, now } = twins();
  const point = camera.clone().add(new Vector3(0, 0, -6));
  const where = () => Array.from({ length: 200 }, (_, i) => at(tapped, i));
  tapped.scatterFrom(point, now());
  for (const wait of [0.2, 1, 3]) {
    // Pushed out, easing back, nearly home: tapped again, every firefly is where it was, and moves on smoothly.
    run(wait);
    const before = where();
    tapped.scatterFrom(point.clone().add(new Vector3(1, 0, 0)), now());
    tapped.update(0, inside('evening'), camera);
    const moved = Math.max(...where().map((p, i) => p.distanceTo(before[i])));
    assert.ok(moved < 1e-4, `after ${wait} s: one moves ${moved.toFixed(4)} m as she taps`);
  }
  // Out again from the last tap, and all back on their paths once it has eased off.
  run(0.5);
  assert.ok(Math.max(...where().map((p, i) => p.distanceTo(at(still, i)))) > 1, 'scattered again');
  run(4.5);
  const off = Math.max(...where().map((p, i) => p.distanceTo(at(still, i))));
  assert.ok(off < 1e-4, `back on their paths (${off.toFixed(4)} m)`);
});
