import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, TERRAIN, createTerrain } from '../../site/src/world/terrain.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, EYE_HEIGHT } from '../../site/src/world/layout.js';
import { SCATTER } from '../../site/src/world/scatter.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Vector3 } from '../../site/src/three.js';
import fixture from '../fixtures/content.fixture.js';

test('flat track bed', () => {
  for (let o = -5.9; o <= 5.9; o += 0.5) assert.equal(terrainHeight(300, o, { water: 0 }), 0);
});

test('rises into hills away from the track', () => {
  assert.ok(terrainHeight(300, 60, { water: 0 }) > 1);
  assert.ok(terrainHeight(300, -60, { water: 0 }) > 1);
});

test('water zones dip below the water on the left only', () => {
  assert.ok(terrainHeight(300, -30, { water: 1 }) < TERRAIN.WATER_LEVEL);
  assert.ok(terrainHeight(300, 30, { water: 1 }) >= 0);
});

test('continuous', () => {
  for (let o = -90; o < 90; o += 0.1) assert.ok(Math.abs(terrainHeight(500, o, { water: 0.5 }) - terrainHeight(500, o + 0.1, { water: 0.5 })) < 0.5);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief: the shape promises the rest of the world relies on (the ground never visibly
// ends, the sea hides under land, beach props stay dry), and the meshes built from it.
// ---------------------------------------------------------------------------------------------

const layout = buildLayout(normalizeContent(fixture).content);
const path = createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const terrain = createTerrain(path, layout, { seed: TRACK.SEED });

test('the ground ends in hill tops above her eye, so from her seat it never visibly ends', () => {
  for (let d = -80; d <= layout.total + 80; d += 1) {
    for (const side of [-1, 1]) assert.ok(terrainHeight(d, side * TERRAIN.HALF_WIDTH, { water: 0 }) > EYE_HEIGHT + 1, `${d} ${side}`);
  }
});

test('without sea the ground never dips below level, so the sea (which runs on past its zone) stays hidden', () => {
  for (let d = -80; d <= layout.total + 80; d += 3) {
    for (let o = -TERRAIN.HALF_WIDTH; o <= TERRAIN.HALF_WIDTH; o += 1.5) assert.ok(terrainHeight(d, o, { water: 0 }) >= 0);
  }
});

test('beach props stand on dry sand, and the sea begins just beyond them', () => {
  // scatter.js keeps a water zone's props within WATER_EDGE on the left; the dressing drops any prop less than
  // 10 cm above the sea (R20), so the sand must reach that far with room to spare.
  for (let d = 0; d < layout.total; d += 7) {
    for (let o = 0; o <= SCATTER.WATER_EDGE; o += 0.5) assert.ok(terrainHeight(d, -o, { water: 1 }) >= TERRAIN.WATER_LEVEL + 0.1, `${d} ${o}`);
    assert.ok(terrainHeight(d, -(SCATTER.WATER_EDGE + 4), { water: 1 }) < TERRAIN.WATER_LEVEL);
  }
});

test('the ground and the sea are faceted triangle soup in the shared material', () => {
  for (const mesh of [terrain.mesh, terrain.water]) {
    const { position, normal, color } = mesh.geometry.attributes;
    assert.equal(mesh.geometry.index, null);
    assert.equal(mesh.material, MATERIALS.solid);
    assert.equal(normal.count, position.count);
    assert.equal(color.count, position.count);
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.5, 'faces up, gently sloped');
  }
  for (let i = 0; i < terrain.water.geometry.attributes.position.count; i++) {
    assert.ok(Math.abs(terrain.water.geometry.attributes.position.getY(i) - TERRAIN.WATER_LEVEL) < 1e-6);
  }
});

test('the ground follows terrainHeight, with nothing under the track bed', () => {
  // On the straight start the track runs down -Z from the origin with +X on its right, so a point's
  // distance is -z and its offset is x.
  const p = terrain.mesh.geometry.attributes.position;
  let checked = 0;
  for (let i = 0; i < p.count; i++) {
    const d = -p.getZ(i), offset = p.getX(i);
    if (d < 10 || d > 110) continue;
    assert.ok(Math.abs(p.getY(i) - terrainHeight(d, offset, { water: 0 })) < 1e-4, `${d} ${offset}`);
    assert.ok(Math.abs(offset) >= 2.8 - 1e-4, 'no ground point inside the bed');
    checked++;
  }
  assert.ok(checked > 1000);
});

test('ground colours blend smoothly between zones, with no row-wide steps', () => {
  // Every corner takes the colour where it stands, so across the winter/evening blend window a triangle's corners
  // on different rows differ. (Colouring whole triangles by their row would change the ground in 4 m stripes.)
  const boundary = layout.zones.find((z) => z.id === 'winter').end;
  const { position: p, color: c } = terrain.mesh.geometry.attributes;
  const centre = new Vector3();
  let checked = 0;
  for (let i = 0; i < p.count; i += 3) {
    centre.set((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, 0, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    const along = path.tangentAt(boundary).dot(centre.clone().sub(path.pointAt(boundary)));
    if (Math.abs(along) > 10 || Math.abs(path.sideAt(boundary).dot(centre.sub(path.pointAt(boundary)))) > 6) continue;
    const spread = Math.max(...[0, 1, 2].map((k) => Math.abs(c.getX(i + k) - c.getX(i)) + Math.abs(c.getY(i + k) - c.getY(i))));
    assert.ok(spread > 1e-3, `triangle ${i / 3} is one flat colour in the middle of the blend`);
    checked++;
  }
  assert.ok(checked >= 20, `${checked} triangles checked`);
});

test('standing at any whole metre, no ground or sea corner near her lies in the camera\'s plane', () => {
  // The software renderer the tests and screenshots use (SwiftShader) smears a triangle with a corner exactly
  // in the camera's plane across the bottom of the screen, so the rows lie half a metre off the whole metres.
  const corner = new Vector3();
  const stands = [0, 12, ...layout.stops.map((s) => s.distance), 300, 400, 480, 660, 840, layout.finaleDistance];
  for (const mesh of [terrain.mesh, terrain.water]) {
    const p = mesh.geometry.attributes.position;
    for (const d of stands) {
      const eye = path.frameAt(d, 0, EYE_HEIGHT), ahead = path.tangentAt(d);
      for (let i = 0; i < p.count; i++) {
        corner.fromBufferAttribute(p, i).sub(eye);
        if (corner.lengthSq() < 30 * 30) assert.ok(Math.abs(corner.dot(ahead)) > 0.1, `${mesh.name} at ${d}`);
      }
    }
  }
});

test('a ride without a water zone has no sea', () => {
  const dry = buildLayout(normalizeContent({ ...fixture, zones: ['spring', 'autumn', 'evening'], moments: [] }).content);
  const dryPath = createTrackPath(dry.total, TRACK.SEED, { straightRanges: [[0, 120], [dry.finaleDistance - 90, dry.total + 60]] });
  assert.equal(createTerrain(dryPath, dry).water, null);
});
