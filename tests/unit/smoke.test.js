// The chimney smoke (Task 5): puffs that rise from the chimneys near the train, drift and fade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmoke, SMOKE } from '../../site/src/world/smoke.js';
import { AdditiveBlending, Vector3 } from '../../site/src/three.js';

/** Runs `smoke` for `seconds` in frames of `dt`, with the camera at `camera`. */
function run(smoke, seconds, camera, dt = 1 / 30) {
  for (let t = 0; t < seconds - 1e-9; t += dt) smoke.update(dt, camera);
}

/** The puffs showing now: [x, y, z, size, alpha] of every one with any alpha. */
function puffs(smoke) {
  const g = smoke.points.geometry.attributes;
  const out = [];
  for (let i = 0; i < g.position.count; i++) {
    if (g.aAlpha.getX(i) > 0) out.push([g.position.getX(i), g.position.getY(i), g.position.getZ(i), g.aSize.getX(i), g.aAlpha.getX(i)]);
  }
  return out;
}

test('the numbers the smoke is made of', () => {
  assert.ok(Object.isFrozen(SMOKE));
  assert.equal(SMOKE.RANGE, 120);
  assert.equal(SMOKE.EVERY, 0.8);
  assert.equal(SMOKE.RISE, 0.6);
  assert.equal(SMOKE.DRIFT, 0.3);
  assert.deepEqual([...SMOKE.SIZE], [0.4, 1.6]);
  assert.equal(SMOKE.LIFE, 6);
});

test('a chimney near the train sends puffs up, none more than 0.6 m a second in all their life', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0)]);
  run(smoke, 3, new Vector3(0, 0, 0));
  const shown = puffs(smoke);
  assert.ok(shown.length >= 3 && shown.length <= 5, `${shown.length} puffs in 3 s, one every 0.8 s`);
  assert.ok(shown.some(([, y]) => y > 5), 'some have risen above the chimney');
  for (const [, y] of shown) assert.ok(y >= 5 - 1e-6 && y <= 5 + 0.6 * 6 + 0.1, `y ${y}`);
  run(smoke, 10, new Vector3(0, 0, 0));
  for (const [, y] of puffs(smoke)) assert.ok(y <= 5 + 0.6 * 6 + 0.1, `y ${y} after a long time`);
});

test('a puff rises 0.6 m/s, drifts 0.3 m/s towards +X, grows from 0.4 to 1.6 m and fades out over 6 s', () => {
  const smoke = createSmoke([new Vector3(10, 4, -20)]);
  const camera = new Vector3(0, 2, 0);
  // Follow the oldest puff showing: the highest.
  const oldest = () => puffs(smoke).reduce((a, b) => (b[1] > a[1] ? b : a));
  run(smoke, 2, camera);
  const young = oldest();
  run(smoke, 3, camera);
  const older = oldest();
  const dt = 3; // s between looking at the same puff
  assert.ok(Math.abs(older[1] - young[1] - SMOKE.RISE * dt) < 0.05, `rose ${older[1] - young[1]} m in ${dt} s`);
  assert.ok(Math.abs(older[0] - young[0] - SMOKE.DRIFT * dt) < 0.5, `drifted ${older[0] - young[0]} m in ${dt} s (give or take its curl)`);
  assert.ok(older[3] > young[3], 'it grows');
  assert.ok(older[3] <= SMOKE.SIZE[1] + 1e-6 && young[3] >= SMOKE.SIZE[0] - 1e-6);
  assert.ok(older[4] < young[4], 'and thins as it goes');
  run(smoke, 2, camera);
  assert.ok(puffs(smoke).every(([, y]) => y < 4 + 0.6 * 6 + 0.1), 'none outlives its 6 s');
});

test('puffs come in softly: one that has only just left the chimney is faint and small', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0)]);
  let fresh = 0, strongest = 0;
  for (let t = 0; t < 10; t += 1 / 30) {
    smoke.update(1 / 30, new Vector3());
    for (const [, y, , size, alpha] of puffs(smoke)) {
      strongest = Math.max(strongest, alpha);
      if (y - 5 > 0.05) continue; // under a tenth of a second old
      fresh += 1;
      assert.ok(alpha < 0.1, `alpha ${alpha} as it starts`);
      assert.ok(size < 0.45, `${size} m wide as it starts`);
    }
  }
  assert.ok(fresh >= 3, 'a good few seen as they started');
  assert.ok(strongest > 0.3, 'but it is a clear puff once it has come in');
});

test('a chimney further than 120 m from the camera sends out nothing, and one that comes within range does', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0)]);
  run(smoke, 5, new Vector3(200, 2, 0));
  assert.equal(puffs(smoke).length, 0);
  assert.equal(smoke.points.visible, false, 'nothing to draw, so no draw call');
  run(smoke, 5, new Vector3(110, 2, 0));
  assert.ok(puffs(smoke).length >= 4);
  assert.equal(smoke.points.visible, true);
  // Out of range again, the puffs that are up there live out their lives and fade away.
  run(smoke, 7, new Vector3(250, 2, 0));
  assert.equal(puffs(smoke).length, 0);
  assert.equal(smoke.points.visible, false);
});

test('every chimney keeps to its own rhythm, one puff every 0.8 s each', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0), new Vector3(30, 5, 0), new Vector3(0, 5, 30)]);
  run(smoke, 6, new Vector3(0, 0, 0));
  // Six seconds at one puff per 0.8 s is seven or eight alive from each chimney (not yet 6 s old).
  const near = (x, z) => puffs(smoke).filter(([px, , pz]) => Math.hypot(px - x, pz - z) < 3).length;
  for (const [x, z] of [[0, 0], [30, 0], [0, 30]]) {
    assert.ok(near(x, z) >= 6 && near(x, z) <= 8, `${near(x, z)} puffs at (${x}, ${z})`);
  }
});

test('the puffs are soft round sprites, not light added together, and the fog fades them with the rest', () => {
  const { material } = createSmoke([new Vector3(0, 5, 0)]).points;
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.notEqual(material.blending, AdditiveBlending);
  assert.equal(material.fog, true);
});

test('the quality share draws that share of the puffs and sends out only as many as fit', () => {
  const chimneys = Array.from({ length: 40 }, (_, i) => new Vector3(i * 2, 5, 0));
  const camera = new Vector3(40, 2, 0);
  const full = createSmoke(chimneys, { maxPuffs: 160 });
  full.setQuality(1);
  run(full, 8, camera);
  assert.equal(full.points.geometry.drawRange.count, 160);
  assert.ok(puffs(full).length <= 160 && puffs(full).length > 100, `${puffs(full).length} puffs`);

  const thin = createSmoke(chimneys, { maxPuffs: 160 });
  thin.setQuality(0.35);
  assert.equal(thin.points.geometry.drawRange.count, Math.ceil(160 * 0.35));
  run(thin, 8, camera);
  assert.ok(puffs(thin).length <= Math.ceil(160 * 0.35), `${puffs(thin).length} puffs at 35 %`);
  assert.ok(puffs(thin).length > 30, 'but still a good few');
  // The ones that are sent out are from the chimneys nearest the camera.
  for (const [x] of puffs(thin)) assert.ok(Math.abs(x - 40) < 20, `a puff at ${x} m, from a chimney far from the camera`);
});

test('chimneys whose house the quality tier has thinned away send out nothing', () => {
  const near = new Vector3(0, 5, 0);
  const thinned = Object.assign(new Vector3(30, 5, 0), { rank: 0.6 });
  const smoke = createSmoke([near, thinned]);
  const camera = new Vector3(0, 0, 0);
  const sourcesAt = (x) => puffs(smoke).filter(([px]) => Math.abs(px - x) < 3).length;
  run(smoke, 4, camera);
  assert.ok(sourcesAt(30) > 0, 'standing at full density');
  smoke.setDensity(0.45);
  run(smoke, 7, camera);
  assert.equal(sourcesAt(30), 0, 'its house is no longer drawn');
  assert.ok(sourcesAt(0) > 0, 'the nearer house still is');
  smoke.setDensity(1);
  run(smoke, 2, camera);
  assert.ok(sourcesAt(30) > 0);
});

test('a long stall makes no burst: the first frame back is as quiet as one second\'s worth', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0)]);
  smoke.update(0, new Vector3());
  smoke.update(30, new Vector3());
  assert.ok(puffs(smoke).length <= 8, `${puffs(smoke).length} puffs after a 30 s frame`);
});

test('it draws a Points of its own and never allocates a position outside its buffer', () => {
  const smoke = createSmoke([new Vector3(0, 5, 0)], { maxPuffs: 12 });
  assert.equal(smoke.points.isPoints, true);
  assert.equal(smoke.points.frustumCulled, false);
  assert.equal(smoke.points.geometry.attributes.position.count, 12);
  run(smoke, 20, new Vector3());
  assert.ok(puffs(smoke).length <= 12);
});

test('with no chimneys there is nothing to draw', () => {
  const smoke = createSmoke([]);
  run(smoke, 2, new Vector3());
  assert.equal(smoke.points.visible, false);
});
