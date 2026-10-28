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
