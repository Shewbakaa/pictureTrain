import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, TERRAIN, createTerrain } from '../../site/src/world/terrain.js';
import { PORTAL, portalTop, tunnelSpan, TUNNEL } from '../../site/src/world/tunnel.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, EYE_HEIGHT } from '../../site/src/world/layout.js';
import { SCATTER } from '../../site/src/world/scatter.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { SEA_MATERIAL } from '../../site/src/world/seaWaves.js';
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
const tunnel = tunnelSpan(layout);

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

test('the ground and the sea are faceted triangle soup, the ground in the shared material and the sea in its own', () => {
  for (const mesh of [terrain.mesh, terrain.water]) {
    const { position, normal, color } = mesh.geometry.attributes;
    assert.equal(mesh.geometry.index, null);
    assert.equal(normal.count, position.count);
    assert.equal(color.count, position.count);
    for (let i = 0; i < normal.count; i++) {
      // Only the tunnel's hill stands up more steeply, beside the portals and at its ends.
      const byTunnel = path.pointAt(tunnel.boundary).distanceTo(new Vector3().fromBufferAttribute(position, i).setY(0)) < 60;
      assert.ok(normal.getY(i) > (byTunnel ? 0.45 : 0.5), 'faces up, gently sloped');
    }
  }
  assert.equal(terrain.mesh.material, MATERIALS.solid);
  assert.equal(terrain.water.material, SEA_MATERIAL); // the waves move it in its shader
  for (let i = 0; i < terrain.water.geometry.attributes.position.count; i++) {
    assert.ok(Math.abs(terrain.water.geometry.attributes.position.getY(i) - TERRAIN.WATER_LEVEL) < 1e-6);
  }
});

test('each corner of the sea knows where it is and how deep the still water there is', () => {
  // On the straight start the track runs down -Z with +X on its right, so a corner's distance is -z and how far
  // out it is, -x. The beach is in the middle of the summer zone, where there is all sea.
  const summer = layout.zones.find((z) => z.id === 'summer');
  const { position: p, seaPlace } = terrain.water.geometry.attributes;
  assert.equal(seaPlace.count, p.count);
  const mid = (summer.start + summer.end) / 2;
  let checked = 0;
  for (let i = 0; i < p.count; i++) {
    const d = seaPlace.getX(i), out = seaPlace.getY(i), depth = seaPlace.getZ(i);
    assert.ok(out >= 6 - 1e-4, 'out to sea, on the left');
    if (Math.abs(d - mid) > 30) continue;
    assert.ok(Math.abs(path.frameAt(d, -out, TERRAIN.WATER_LEVEL).distanceTo(new Vector3().fromBufferAttribute(p, i))) < 1e-3);
    // Exactly the ground's height at its cuts; straight between them, like the ground's triangles.
    if ([6, 15, 19.5, 25, 39].includes(out)) assert.ok(Math.abs(depth - (TERRAIN.WATER_LEVEL - terrainHeight(d, -out, { water: 1 }))) < 1e-4);
    if (out <= 11.5) assert.ok(depth < -0.25, 'dry sand by the track');
    if (out >= 19.5) assert.ok(depth > 0.3, 'water past the waterline');
    checked++;
  }
  assert.ok(checked > 100, `${checked} corners checked`);
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

// ---------------------------------------------------------------------------------------------
// The hill the tunnel runs through (Task 6).
// ---------------------------------------------------------------------------------------------

test('over the tunnel the ground rises into a hill, but the track bed stays level', () => {
  assert.deepEqual(tunnel, { from: 540, to: 600, boundary: 570 });
  assert.equal(terrainHeight(570, 0, { tunnel }), 0);
  assert.ok(terrainHeight(570, 10, { tunnel }) >= 6);
  assert.ok(terrainHeight(570, -10, { tunnel }) >= 6);
  for (let d = tunnel.from - 20; d <= tunnel.to + 20; d += 0.5) {
    for (let o = -TERRAIN.FLAT; o <= TERRAIN.FLAT; o += 0.5) assert.equal(terrainHeight(d, o, { tunnel }), 0);
  }
});

test('away from the tunnel the hill is not there', () => {
  assert.equal(terrainHeight(400, 10, { tunnel }), terrainHeight(400, 10));
  assert.equal(terrainHeight(tunnel.from - 12, 30, { tunnel }), terrainHeight(tunnel.from - 12, 30));
  assert.equal(terrainHeight(tunnel.to + 12, -30, { tunnel }), terrainHeight(tunnel.to + 12, -30));
  assert.equal(terrainHeight(570, 10, { tunnel: null }), terrainHeight(570, 10));
});

test('the hill is full height at the portals and eases down over 12 m beyond them', () => {
  for (const o of [-40, -12, 12, 40]) {
    for (const d of [tunnel.from, tunnel.boundary, tunnel.to]) {
      assert.ok(Math.abs(terrainHeight(d, o, { tunnel }) - terrainHeight(d, o) - TUNNEL.MOUND) < 1e-9, `${d} ${o}`);
    }
    const before = terrainHeight(tunnel.from - 6, o, { tunnel }) - terrainHeight(tunnel.from - 6, o);
    const after = terrainHeight(tunnel.to + 6, o, { tunnel }) - terrainHeight(tunnel.to + 6, o);
    assert.ok(before > 1 && before < TUNNEL.MOUND - 1 && Math.abs(before - after) < 1e-9, `eased: ${before} ${after}`);
  }
  // No step anywhere: rows of the ground 4 m apart see a slope, not a cliff.
  for (let d = tunnel.from - 20; d < tunnel.to + 20; d += 0.25) {
    for (const o of [-60, -9, 9, 60]) {
      assert.ok(Math.abs(terrainHeight(d + 0.25, o, { tunnel }) - terrainHeight(d, o, { tunnel })) < 0.3, `${d} ${o}`);
    }
  }
});

test('the ground mesh carries the hill', () => {
  const p = terrain.mesh.geometry.attributes.position;
  const corner = new Vector3();
  let checked = 0;
  for (const d of [tunnel.from - 3.5, tunnel.boundary + 2.5, tunnel.to + 4.5]) { // rows of the mesh
    for (const o of [-11.5, 11.5, -39, 39]) {
      const want = path.frameAt(d, o, terrainHeight(d, o, { tunnel }));
      let found = false;
      for (let i = 0; i < p.count && !found; i++) found = corner.fromBufferAttribute(p, i).distanceTo(want) < 1e-3;
      assert.ok(found, `a ground corner on the hill at ${d} m, ${o} m out`);
      checked++;
    }
  }
  assert.equal(checked, 12);
});

test('between the portals the hill closes over the tunnel, its ends tucked behind the portals\' tops', () => {
  // Where a corner is along the track and out from it, near the tunnel (the track curves there).
  const samples = [];
  for (let d = tunnel.from - 20; d <= tunnel.to + 20; d += 0.5) samples.push({ d, point: path.pointAt(d) });
  const frameOf = (v) => {
    let best = samples[0], bestSq = Infinity;
    for (const s of samples) {
      const sq = (s.point.x - v.x) ** 2 + (s.point.z - v.z) ** 2;
      if (sq < bestSq) { best = s; bestSq = sq; }
    }
    const tangent = path.tangentAt(best.d);
    const d = best.d + (v.x - best.point.x) * tangent.x + (v.z - best.point.z) * tangent.z;
    const point = path.pointAt(d), side = path.sideAt(d);
    return { d, offset: (v.x - point.x) * side.x + (v.z - point.z) * side.z };
  };
  const p = terrain.mesh.geometry.attributes.position;
  const corner = new Vector3();
  let roof = 0, ends = 0;
  for (let i = 0; i < p.count; i++) {
    corner.fromBufferAttribute(p, i);
    if (corner.y < 0.5 || corner.distanceTo(path.pointAt(tunnel.boundary)) > 60) continue;
    const { d, offset } = frameOf(corner);
    if (Math.abs(offset) >= TERRAIN.FLAT) continue; // only the roof stands up over the level verge
    roof++;
    assert.ok(d > tunnel.from && d < tunnel.to, `the roof stays between the portals: ${d.toFixed(2)}`);
    if (Math.abs(offset) <= TUNNEL.HALF_WIDTH + TUNNEL.WALL) assert.ok(corner.y >= TUNNEL.HEIGHT + TUNNEL.WALL, 'clear of the lining');
    if (d < tunnel.from + PORTAL.IN || d > tunnel.to - PORTAL.IN) {
      ends++;
      assert.ok(corner.y < portalTop(offset), `hidden behind the portal's top at ${offset.toFixed(1)} m out`);
    }
  }
  assert.ok(roof > 50 && ends > 10, `${roof} corners of roof, ${ends} at its ends`);
});
