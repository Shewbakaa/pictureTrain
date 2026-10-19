// The photo signs beside the track (Task 10): their size, the photo's crop and where they stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signDimensions, coverUv, signLookYaw, createPhotoSign, placeSign, placeCouple } from '../../site/src/world/signs.js';
import { createCouple } from '../../site/src/world/figures.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { fovForAspect } from '../../site/src/ride/look.js';
import { cabinAnchors } from '../../site/src/train/cabin.js';
import { Group, MathUtils, Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

test('sign size clamps extreme photos', () => {
  assert.deepEqual(signDimensions(1), { photoW: 1.6, photoH: 1.6 });
  assert.ok(Math.abs(signDimensions(4).photoW - 2.88) < 1e-9);
  assert.ok(Math.abs(signDimensions(0.3).photoW - 0.96) < 1e-9);
});

test('cover crop centres the photo', () => {
  const wide = coverUv(4, 1.8);
  assert.ok(Math.abs(wide.repeat[0] - 0.45) < 1e-9 && wide.repeat[1] === 1);
  assert.ok(Math.abs(wide.offset[0] - 0.275) < 1e-9 && wide.offset[1] === 0);
  const tall = coverUv(0.3, 0.6);
  assert.ok(tall.repeat[0] === 1 && Math.abs(tall.repeat[1] - 0.5) < 1e-9);
  assert.deepEqual(coverUv(1.5, 1.5), { repeat: [1, 1], offset: [0, 0] });
});

test('look toward the sign side', () => {
  assert.equal(signLookYaw('left'), Math.PI / 2);
  assert.equal(signLookYaw('right'), -Math.PI / 2);
});

// Beyond the brief.

const { content } = normalizeContent(fixture);
const layout = buildLayout(content);
const path = createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const [rightStop, leftStop] = layout.stops; // stop 0 is on the right, stop 1 on the left
const UP = new Vector3(0, 1, 0);

test('a photo without a usable size gets a square sign, and a broken crop shows the whole photo', () => {
  assert.deepEqual(signDimensions(NaN), { photoW: 1.6, photoH: 1.6 });
  assert.deepEqual(coverUv(0, 1.2), { repeat: [1, 1], offset: [0, 0] });
});

test('each sign stands right beside its stop, 3.4 m out on its side, facing the track squarely', () => {
  for (const stop of [rightStop, leftStop]) {
    const sign = new Group();
    placeSign(sign, path, stop);
    sign.updateMatrixWorld(true);
    const out = stop.side === 'right' ? 1 : -1;
    const d = stop.distance;
    assert.ok(sign.position.distanceTo(path.frameAt(d, 3.4 * out, 0)) < 1e-9, stop.side);
    const facing = sign.getWorldDirection(new Vector3());
    const towardTrack = path.sideAt(d).multiplyScalar(-out);
    assert.ok(facing.dot(towardTrack) > 1 - 1e-9, `${stop.side}: facing the track square-on`);
    assert.ok(Math.abs(new Vector3(0, 1, 0).applyQuaternion(sign.quaternion).dot(UP) - 1) < 1e-9, 'upright');
  }
});

/** Every vertex of `object` in the world, skinned meshes posed. */
function worldVertices(object) {
  object.updateMatrixWorld(true);
  const points = [];
  object.traverse((o) => {
    if (!o.isMesh) return;
    const count = o.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) points.push(o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld));
  });
  return points;
}

/** How far round from straight ahead (radians, toward the sign's side) each point is, seen from the seat at `stop`. */
function bearings(points, stop) {
  const seat = path.pointAt(stop.distance);
  const ahead = path.tangentAt(stop.distance);
  const out = path.sideAt(stop.distance).multiplyScalar(stop.side === 'right' ? 1 : -1);
  return points.map((p) => {
    const v = p.clone().sub(seat);
    return Math.atan2(v.dot(out), v.dot(ahead));
  });
}

/** Distance along the track and offset (m, + right) of a ground point near the track around `near`. */
function trackOffset(point, near) {
  let best = near, bestSq = Infinity;
  for (let d = near - 10; d <= near + 10; d += 0.01) {
    const sq = path.pointAt(d).distanceToSquared(new Vector3(point.x, 0, point.z));
    if (sq < bestSq) { best = d; bestSq = sq; }
  }
  return { d: best, offset: point.clone().sub(path.pointAt(best)).dot(path.sideAt(best)) };
}

/** Half the horizontal field of view (rad) on a screen of shape `aspect`. */
const halfHfovFor = (aspect) => Math.atan(Math.tan(MathUtils.degToRad(fovForAspect(aspect)) / 2) * aspect);
const PORTRAIT = 390 / 844, SQUARE = 1, LANDSCAPE = 16 / 9;

test('stopped, the sign is straight ahead of where her head turns, and no cabin pillar is in the way', () => {
  for (const stop of [leftStop, rightStop]) {
    const sign = createPhotoSign({ index: stop.index, aspect: 0.8, width: 0, height: 0, canvas: null, src: '', isPlaceholder: true }, { date: 'Oct 2025' });
    placeSign(sign, path, stop);
    const span = bearings(worldVertices(sign), stop);
    const middle = (Math.min(...span) + Math.max(...span)) / 2;
    assert.ok(Math.abs(middle - Math.abs(signLookYaw(stop.side))) < MathUtils.degToRad(1), `${stop.side}: centred (${MathUtils.radToDeg(middle)} deg)`);
    for (const aspect of [PORTRAIT, SQUARE, LANDSCAPE]) {
      const { pillars } = cabinAnchors(fovForAspect(aspect), aspect);
      const pillar = Math.atan2(pillars.x + pillars.radius, Math.abs(pillars.z));
      assert.ok(Math.abs(signLookYaw(stop.side)) - pillar > halfHfovFor(aspect), `${stop.side}, aspect ${aspect.toFixed(2)}: the pillar is out of view`);
    }
  }
});

test('the couple stands beside the sign, toward the front, just clear of it in her view from the stop, facing her', () => {
  for (const stop of [leftStop, rightStop]) {
    for (const aspect of [0.8, 1, 4 / 3, 3]) {
      const sign = createPhotoSign({ index: stop.index, aspect, width: 0, height: 0, canvas: null, src: '', isPlaceholder: true }, { date: 'Oct 2025' });
      placeSign(sign, path, stop);
      const couple = createCouple(content.characters);
      placeCouple(couple.group, path, stop, sign.userData.photoW);
      const label = `${stop.side}, photo aspect ${aspect}`;

      const { d, offset } = trackOffset(couple.group.position, stop.distance);
      assert.ok(Math.abs(Math.abs(offset) - 4.0) < 0.01 && Math.sign(offset) === (stop.side === 'right' ? 1 : -1), `${label}: ${offset} m out`);
      assert.ok(d > stop.distance, `${label}: ahead of the sign`);

      const signSpan = bearings(worldVertices(sign), stop);
      const coupleSpan = bearings(worldVertices(couple.group), stop);
      assert.ok(Math.max(...coupleSpan) < Math.min(...signSpan), `${label}: the sign hides none of the couple`);
      if (aspect === 0.8) {
        // The placeholder's shape: from her seat, looking where the ride turns her head, she sees all of them on a
        // wide screen and at least most of them on a tall phone.
        const look = Math.abs(signLookYaw(stop.side));
        assert.ok(Math.min(...coupleSpan) > look - halfHfovFor(LANDSCAPE), `${label}: in the landscape stop view`);
        const middle = (Math.min(...coupleSpan) + Math.max(...coupleSpan)) / 2;
        assert.ok(middle > look - halfHfovFor(PORTRAIT), `${label}: mostly in the portrait stop view`);
      }

      const toSeat = path.pointAt(stop.distance).sub(couple.group.position).setY(0).normalize();
      assert.ok(couple.group.getWorldDirection(new Vector3()).dot(toSeat) > 0.999, `${label}: they face her`);
      const feet = Math.min(...worldVertices(couple.group).map((p) => p.y));
      assert.ok(feet > -0.01 && feet < 0.02, `${label}: standing on the ground (${feet})`);
    }
  }
});
