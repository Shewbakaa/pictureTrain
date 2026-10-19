import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackMesh, TRACK_BED_HALF_WIDTH } from '../../site/src/world/trackMesh.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, EYE_HEIGHT } from '../../site/src/world/layout.js';
import { envAt } from '../../site/src/world/environment.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Matrix4, Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

const layout = buildLayout(normalizeContent(fixture).content);
const path = createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const track = createTrackMesh(path, layout);
const bed = track.getObjectByName('track-bed');
const rails = track.getObjectByName('track-rails');
const sleepers = track.getObjectByName('track-sleepers');

/** Every corner of a mesh, in world space (instances included). */
function corners(mesh) {
  const p = mesh.geometry.attributes.position;
  const out = [];
  const matrix = new Matrix4();
  for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
    if (mesh.isInstancedMesh) mesh.getMatrixAt(n, matrix);
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i);
      out.push(mesh.isInstancedMesh ? v.applyMatrix4(matrix) : v);
    }
  }
  return out;
}

/** The corners on the straight start, where the track runs down -Z with +X on its right: distance -z, offset x. */
const onStraight = (mesh) => corners(mesh).filter((v) => -v.z > 10 && -v.z < 110);

test('the bed, rails and sleepers are drawn with the shared solid material', () => {
  assert.deepEqual(track.children.map((m) => m.name), ['track-bed', 'track-rails', 'track-sleepers']);
  for (const mesh of track.children) assert.equal(mesh.material, MATERIALS.solid);
  assert.ok(sleepers.isInstancedMesh);
});

test('the bed, rails and sleepers all catch the shadows of the props (R24)', () => {
  for (const mesh of track.children) assert.equal(mesh.receiveShadow, true, mesh.name);
});

test('the bed is 4.4 m wide, raised in the middle and sunk at its edges', () => {
  const bedCorners = onStraight(bed);
  const widest = Math.max(...bedCorners.map((v) => Math.abs(v.x)));
  assert.ok(Math.abs(TRACK_BED_HALF_WIDTH - 2.2) < 1e-12);
  assert.ok(Math.abs(widest - TRACK_BED_HALF_WIDTH) < 1e-4);
  for (const v of bedCorners) assert.ok(Math.abs(v.x) > TRACK_BED_HALF_WIDTH - 1e-4 ? v.y < 0 : v.y > 0);
});

test('two rails 1.5 m apart sit on the sleepers, which sit on the bed', () => {
  const railCorners = onStraight(rails);
  for (const v of railCorners) assert.ok(Math.abs(Math.abs(v.x) - 0.75) <= 0.05, `rail corner at ${v.x}`);
  assert.ok(railCorners.some((v) => v.x < 0) && railCorners.some((v) => v.x > 0));
  const railBottom = Math.min(...railCorners.map((v) => v.y));
  const sleeperCorners = onStraight(sleepers);
  const sleeperTop = Math.max(...sleeperCorners.map((v) => v.y));
  const sleeperBottom = Math.min(...sleeperCorners.map((v) => v.y));
  const bedTop = Math.max(...onStraight(bed).map((v) => v.y));
  assert.ok(Math.abs(railBottom - sleeperTop) < 1e-4);
  assert.ok(Math.abs(sleeperBottom - bedTop) < 1e-4);
  assert.ok(Math.max(...railCorners.map((v) => v.y)) < EYE_HEIGHT);
});

test('a sleeper every 0.9 m, across the track, all the way past both ends of the ride', () => {
  const matrix = new Matrix4();
  const at = (n) => {
    sleepers.getMatrixAt(n, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  };
  for (let n = 1; n < sleepers.count; n++) assert.ok(Math.abs(at(n).distanceTo(at(n - 1)) - 0.9) < 0.01, `gap before sleeper ${n}`);
  assert.ok(at(0).distanceTo(path.pointAt(-80)) < 1);
  assert.ok(at(sleepers.count - 1).distanceTo(path.pointAt(layout.total + 80)) < 1);
  assert.ok(sleepers.instanceColor, 'each sleeper has its own shade of wood');
});

test('the bed takes the path colour of the zone it runs through', () => {
  const c = bed.geometry.attributes.color;
  const p = bed.geometry.attributes.position;
  for (const id of ['spring', 'summer', 'autumn', 'winter', 'evening']) {
    const zone = layout.zones.find((z) => z.id === id);
    const middle = (zone.start + zone.end) / 2;
    const want = envAt(layout, middle).path;
    const here = path.pointAt(middle);
    let nearest = 0;
    for (let i = 1; i < p.count; i++) {
      if (here.distanceToSquared(new Vector3().fromBufferAttribute(p, i)) < here.distanceToSquared(new Vector3().fromBufferAttribute(p, nearest))) nearest = i;
    }
    assert.ok(Math.abs(c.getX(nearest) - want.r) + Math.abs(c.getY(nearest) - want.g) + Math.abs(c.getZ(nearest) - want.b) < 1e-6, id);
  }
});

test('standing at any whole metre, no track corner near her lies in the camera\'s plane', () => {
  // See terrain.test.js: the software renderer of the tests and screenshots smears such a triangle over the screen.
  const all = track.children.map(corners);
  const stands = [0, 12, ...layout.stops.map((s) => s.distance), 300, 400, 480, 660, 840, layout.finaleDistance];
  for (const d of stands) {
    const eye = path.frameAt(d, 0, EYE_HEIGHT), ahead = path.tangentAt(d);
    for (const list of all) {
      for (const v of list) {
        const rel = v.clone().sub(eye);
        if (rel.lengthSq() < 30 * 30) assert.ok(Math.abs(rel.dot(ahead)) > 0.02, `corner in the camera plane at ${d}`);
      }
    }
  }
});
