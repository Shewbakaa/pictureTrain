// The two stations (Task 9): where their platforms are, the finale's door, and room for the finale to play out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStation, STATION, START_STATION_DISTANCE } from '../../site/src/world/stations.js';
import { createTrackPath } from '../../site/src/world/trackPath.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { Raycaster, Vector3 } from '../../site/src/three.js';

const FINALE = 960;
const path = createTrackPath(1030, 7, { straightRanges: [[0, 120], [FINALE - 90, 1090]] });
const start = createStation({ path, distance: START_STATION_DISTANCE, kind: 'start' });
const finale = createStation({ path, distance: FINALE, kind: 'finale' });
for (const station of [start, finale]) station.updateMatrixWorld(true);

const DOWN = new Vector3(0, -1, 0);
const ray = new Raycaster();
/** The height of the first thing under (d, right), looking down from `from` metres up; null when there is nothing. */
function surfaceUnder(station, d, right, from = 2.2) {
  ray.set(path.frameAt(d, right, from), DOWN);
  ray.far = from + 1;
  const hit = ray.intersectObject(station, true).find((h) => h.object.isMesh);
  return hit ? hit.point.y : null;
}

test('the platform numbers the finale relies on', () => {
  assert.deepEqual({ ...STATION }, { PLATFORM_TOP: 0.6, PLATFORM_NEAR: 2.4, PLATFORM_FAR: 6.0 });
  assert.equal(START_STATION_DISTANCE, 8);
});

test('each platform is 16 m long on the right, its top at PLATFORM_TOP from PLATFORM_NEAR to PLATFORM_FAR', () => {
  for (const [station, centre] of [[start, START_STATION_DISTANCE], [finale, FINALE]]) {
    // The lamps, the bench, the planters and the canopy posts stand along the back, from 5.3 m out.
    const spots = [[5.5, STATION.PLATFORM_FAR - 0.05]];
    for (const along of [-7.8, -2, 0, 4, 7.8]) for (const right of [STATION.PLATFORM_NEAR + 0.05, 3.4, 4.6]) spots.push([along, right]);
    for (const [along, right] of spots) {
      const y = surfaceUnder(station, centre + along, right);
      assert.ok(y !== null && Math.abs(y - STATION.PLATFORM_TOP) < 0.01, `${station.name} at ${along} along, ${right} right: ${y}`);
    }
    assert.equal(surfaceUnder(station, centre - 8.3, 4.2), null, 'it ends 8 m before the middle');
    assert.equal(surfaceUnder(station, centre, -2.5), null, 'nothing on the left of the track');
    assert.equal(surfaceUnder(station, centre, 1.5), null, 'nothing over the track');
  }
  assert.ok(surfaceUnder(start, 0.2, 4.2) !== null && surfaceUnder(start, 15.8, 4.2) !== null, 'the start platform runs from 0 to 16');
});

test('the finale house door faces the track at frameAt(finale + 7.5, 7.0, 0.6), with level ground out to the platform', () => {
  ray.set(path.frameAt(FINALE + 7.5, 3, 1.2), path.sideAt(FINALE + 7.5));
  ray.far = Infinity;
  const door = ray.intersectObject(finale, true).find((h) => h.object.isMesh);
  assert.ok(door && Math.abs(door.distance - 3.9) < 0.15, `the door is ${door && door.distance.toFixed(2)} m out from 3 m right`);
  for (const right of [6.2, 6.6]) {
    assert.ok(Math.abs(surfaceUnder(finale, FINALE + 7.5, right) - STATION.PLATFORM_TOP) < 0.01, `the step at ${right} m`);
  }
});

test('the finale platform is clear where she steps off and he walks from the door to her', () => {
  // He starts in the doorway (7.0 m out); from just outside it (the door and its knob are at 6.86 to 7.0 m).
  const spots = [[0.4, 3.4], [1.2, 3.6]];
  for (let t = 0; t <= 1; t += 0.05) spots.push([7.5 + (1.2 - 7.5) * t, 6.7 + (3.6 - 6.7) * t]);
  for (const [along, right] of spots) {
    for (const [da, dr] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const y = surfaceUnder(finale, FINALE + along + da, right + dr);
      assert.ok(Math.abs(y - STATION.PLATFORM_TOP) < 0.01, `something stands at ${along + da} along, ${right + dr} right (${y})`);
    }
  }
});

test('each station is a few draw calls and a few thousand triangles', () => {
  for (const station of [start, finale]) {
    let triangles = 0;
    const drawn = [];
    station.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      drawn.push(o.name);
      if (o.isMesh) triangles += triangleCount(o.geometry) * (o.isInstancedMesh ? o.count : 1);
    });
    assert.ok(drawn.length <= 5, `${station.name}: ${drawn}`);
    assert.ok(triangles <= 6000, `${station.name}: ${triangles} triangles`);
    assert.equal(station.getObjectByName('station-body').material, MATERIALS.solid);
    assert.equal(station.getObjectByName('station-body').receiveShadow, true);
  }
  assert.ok(finale.getObjectByName('station-string-lights').count >= 20, 'string lights between the lamps');
  assert.equal(start.getObjectByName('station-string-lights'), undefined);
});

test('the name board faces the arriving train and reads from both sides', () => {
  for (const [station, centre] of [[start, START_STATION_DISTANCE], [finale, FINALE]]) {
    const board = station.getObjectByName('station-board');
    const normals = board.geometry.attributes.normal;
    const back = path.tangentAt(centre).negate();
    const faces = [0, 4].map((i) => new Vector3().fromBufferAttribute(normals, i).transformDirection(board.matrixWorld).dot(back));
    assert.ok(faces[0] > 0.99 && faces[1] < -0.99, `${station.name}: ${faces}`);
    assert.equal(board.material.map, null, 'no canvas in Node, so a plain board');
  }
});
