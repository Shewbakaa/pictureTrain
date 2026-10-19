import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackPath, minCurvatureRadius } from '../../site/src/world/trackPath.js';
import { Vector3 } from '../../site/src/three.js';

const path = createTrackPath(1030, 7, { straightRanges: [[0, 120], [870, 1100]] });
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('starts at the origin heading -Z with +X on the right', () => {
  assert.ok(path.pointAt(0).length() < 1e-6);
  assert.ok(near(path.tangentAt(0).z, -1));
  assert.ok(near(path.sideAt(0).x, 1));
  assert.ok(near(path.tangentAt(60).z, -1), 'straight start');
});

test('distance is arc length', () => {
  for (const d of [10, 300, 700, 1000]) {
    assert.ok(near(path.pointAt(d).distanceTo(path.pointAt(d + 1)), 1, 0.02));
  }
});

test('tangent and side are unit and horizontal', () => {
  for (const d of [0, 250, 640, 1029]) {
    const t = path.tangentAt(d), s = path.sideAt(d);
    assert.ok(near(t.length(), 1) && near(s.length(), 1) && near(t.y, 0) && near(s.y, 0));
    assert.ok(near(t.dot(s), 0));
  }
});

test('gentle curves: minimum radius at least 150 m', () => {
  assert.ok(minCurvatureRadius(path) >= 150);
});

test('it does curve', () => {
  let maxDev = 0;
  for (let d = 0; d <= 1030; d += 5) maxDev = Math.max(maxDev, Math.abs(Math.atan2(-path.tangentAt(d).x, -path.tangentAt(d).z)));
  assert.ok(maxDev >= 0.15);
});

test('never comes back near itself', () => {
  const pts = [];
  for (let d = 0; d <= 1030; d += 5) pts.push(path.pointAt(d));
  for (let i = 0; i < pts.length; i++) for (let j = i + 40; j < pts.length; j++) {
    assert.ok(pts[i].distanceTo(pts[j]) >= 185);
  }
});

test('straight ranges are straight', () => {
  const t0 = path.tangentAt(880);
  for (let d = 880; d <= 1030; d += 10) assert.ok(path.tangentAt(d).dot(t0) > 0.9999);
});

test('extrapolates past both ends', () => {
  assert.ok(path.pointAt(-10).distanceTo({ x: 0, y: 0, z: 10 }) < 1e-3);
  const end = path.pointAt(1030), t = path.tangentAt(1030);
  assert.ok(path.pointAt(1040).distanceTo(end.clone().addScaledVector(t, 10)) < 1e-3);
});

test('frameAt offsets', () => {
  const f = path.frameAt(100, 2, 1);
  const e = path.pointAt(100).addScaledVector(path.sideAt(100), 2);
  e.y += 1;
  assert.ok(f.distanceTo(e) < 1e-6);
});

test('deterministic per seed', () => {
  assert.ok(createTrackPath(1030, 7).pointAt(500).distanceTo(createTrackPath(1030, 7).pointAt(500)) < 1e-9);
  assert.ok(createTrackPath(1030, 8).pointAt(500).distanceTo(createTrackPath(1030, 7).pointAt(500)) > 0.5);
});

test('defaults: seed 7 and a straight start', () => {
  const byDefault = createTrackPath(1030), seven = createTrackPath(1030, 7);
  assert.equal(byDefault.length, 1030);
  for (const d of [0, 200, 640, 1030]) assert.ok(byDefault.pointAt(d).distanceTo(seven.pointAt(d)) < 1e-9);
  assert.ok(near(byDefault.tangentAt(120).z, -1), 'straight start');
  assert.ok(near(byDefault.pointAt(150).x, 0, 1e-9), 'dead straight along -Z for the first 180 m');
});

test('results can be written into a vector you own, which is returned', () => {
  const same = (a, b) => a.distanceTo(b) < 1e-12;
  for (const d of [-20, 0, 333, 1030, 1100]) {
    const out = new Vector3(9, 9, 9);
    assert.equal(path.pointAt(d, out), out);
    assert.ok(same(out, path.pointAt(d)));
    assert.equal(path.tangentAt(d, out), out);
    assert.ok(same(out, path.tangentAt(d)));
    assert.equal(path.sideAt(d, out), out);
    assert.ok(same(out, path.sideAt(d)));
    assert.equal(path.frameAt(d, 2, 1, out), out);
    assert.ok(same(out, path.frameAt(d, 2, 1)));
  }
});

test('past the ends the tangent and side stay those of the end', () => {
  const same = (a, b) => a.distanceTo(b) < 1e-12;
  assert.ok(same(path.tangentAt(-50), path.tangentAt(0)));
  assert.ok(same(path.sideAt(-50), path.sideAt(0)));
  assert.ok(same(path.tangentAt(2000), path.tangentAt(1030)));
  assert.ok(same(path.sideAt(2000), path.sideAt(1030)));
});
