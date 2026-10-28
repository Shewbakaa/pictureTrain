// The tunnel into winter (Task 6): where it goes, how far inside she is, and the tunnel itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTunnel, tunnelInside, tunnelSpan, TUNNEL } from '../../site/src/world/tunnel.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, LAYOUT } from '../../site/src/world/layout.js';
import { MATERIALS } from '../../site/src/render/materials.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { AdditiveBlending, Color, Vector3 } from '../../site/src/three.js';

const layoutOf = (zones, perZone = 2) => buildLayout(normalizeContent({ zones, moments: zones.flatMap((z) =>
  Array.from({ length: z === 'evening' ? 2 : perZone }, () => ({ zone: z }))) }).content);

const DEFAULT_ZONES = ['spring', 'summer', 'autumn', 'winter', 'evening'];

test('the numbers the tunnel is made of', () => {
  assert.ok(Object.isFrozen(TUNNEL));
  assert.equal(TUNNEL.MAX_LENGTH, 60);
  assert.equal(TUNNEL.STOP_CLEAR, 25);
  assert.equal(TUNNEL.HALF_WIDTH, 3.2);
  assert.equal(TUNNEL.HEIGHT, 4.6);
  assert.equal(TUNNEL.WALL, 1.2);
  assert.equal(TUNNEL.EASE, 8);
  assert.equal(TUNNEL.LAMP_EVERY, 7);
  assert.equal(TUNNEL.MOUND, 7.5);
});

test('default ride: into winter at 570 m, 540–600', () => {
  assert.deepEqual(tunnelSpan(layoutOf(DEFAULT_ZONES)), { from: 540, to: 600, boundary: 570 });
});

test('winter anywhere but first: the boundary into it', () => {
  const layout = layoutOf(['spring', 'winter', 'summer', 'autumn', 'evening']);
  assert.equal(tunnelSpan(layout).boundary, layout.zones.find((z) => z.id === 'winter').start);
});

test('winter first: the boundary nearest the middle, never into evening', () => {
  const layout = layoutOf(['winter', 'spring', 'summer', 'autumn', 'evening']);
  const span = tunnelSpan(layout);
  const ends = layout.zones.slice(0, -2).map((z) => z.end);
  assert.ok(ends.includes(span.boundary));
  assert.notEqual(span.boundary, layout.zones.at(-2).end);
  const off = (b) => Math.abs(b - layout.total / 2);
  for (const end of ends) assert.ok(off(span.boundary) <= off(end), `${span.boundary} is nearer the middle than ${end}`);
});

test('no winter: still a tunnel; only spring and evening: none', () => {
  assert.ok(tunnelSpan(layoutOf(['spring', 'summer', 'evening'])));
  assert.equal(tunnelSpan(layoutOf(['spring', 'evening'])), null);
  assert.equal(tunnelSpan(layoutOf(['evening'])), null);
});

test('the span stays clear of every stop and covers the blend window', () => {
  const orders = [
    DEFAULT_ZONES,
    ['winter', 'spring', 'summer', 'autumn', 'evening'],
    ['autumn', 'winter', 'evening'],
    ['summer', 'spring', 'winter', 'evening'],
    ['spring', 'summer', 'evening'],
    ['winter', 'autumn', 'evening'],
  ];
  let checked = 0;
  for (const zones of orders) {
    for (const perZone of [0, 1, 2, 3]) {
      const layout = layoutOf(zones, perZone);
      const span = tunnelSpan(layout);
      assert.ok(span, `${zones} with ${perZone} a zone has a tunnel`);
      const { from, to, boundary } = span;
      assert.ok(layout.zones.slice(0, -2).some((z) => z.end === boundary), 'on a boundary, not the one into evening');
      assert.ok(Math.abs((from + to) / 2 - boundary) < 1e-9, 'centred on it');
      assert.ok(to - from <= TUNNEL.MAX_LENGTH + 1e-9);
      assert.ok(from <= boundary - LAYOUT.BLEND / 2 && to >= boundary + LAYOUT.BLEND / 2, 'covers the blend window');
      for (const stop of layout.stops) {
        assert.ok(stop.distance <= from - TUNNEL.STOP_CLEAR || stop.distance >= to + TUNNEL.STOP_CLEAR, `stop at ${stop.distance} m`);
      }
      checked++;
    }
  }
  assert.equal(checked, orders.length * 4);
});

test('as long as fits: shorter when a stop is near, none when even the blend window will not fit', () => {
  // Layouts made by hand, closer than the content can make them, to see the sizing work.
  const zones = [
    { id: 'autumn', start: 0, end: 100, momentIndices: [0] },
    { id: 'winter', start: 100, end: 200, momentIndices: [] },
    { id: 'evening', start: 200, end: 300, momentIndices: [] },
  ];
  const at = (distance) => ({ zones, stops: [{ index: 0, distance, zone: 'autumn', side: 'right' }], finaleDistance: 270, total: 340 });
  assert.deepEqual(tunnelSpan(at(40)), { from: 70, to: 130, boundary: 100 }, 'far enough: the whole 60 m');
  assert.deepEqual(tunnelSpan(at(60)), { from: 85, to: 115, boundary: 100 }, '25 m clear: just the blend window');
  assert.deepEqual(tunnelSpan(at(148)), { from: 77, to: 123, boundary: 100 }, 'a stop beyond it counts too');
  assert.equal(tunnelSpan(at(61)), null, 'a metre too close');
  assert.equal(tunnelSpan(at(100)), null);
});

test('inside: 0 outside, 1 in the middle, eased at the portals', () => {
  const span = { from: 540, to: 600, boundary: 570 };
  assert.equal(tunnelInside(span, 539), 0);
  assert.equal(tunnelInside(span, 540), 0);
  assert.equal(tunnelInside(span, 570), 1);
  assert.equal(tunnelInside(span, 548), 1);
  assert.equal(tunnelInside(span, 592), 1);
  assert.equal(tunnelInside(span, 600), 0);
  assert.equal(tunnelInside(span, 601), 0);
  const entering = tunnelInside(span, 544);
  assert.ok(entering > 0 && entering < 1, `${entering}`);
  assert.ok(tunnelInside(span, 542) < entering, 'rises on the way in');
  assert.ok(tunnelInside(span, 596) > tunnelInside(span, 598), 'falls on the way out');
  assert.equal(tunnelInside(null, 570), 0);
});

// ---------------------------------------------------------------------------------------------
// The tunnel itself, built along the default ride's curving track.
// ---------------------------------------------------------------------------------------------

const layout = layoutOf(DEFAULT_ZONES);
const path = createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const span = tunnelSpan(layout);
const tunnel = createTunnel(path, span);
const part = (name) => tunnel.group.getObjectByName(name);

/** Where a world point is, as metres along the track (`d`) and right of it (`offset`), near the tunnel. */
const samples = [];
for (let d = span.from - 20; d <= span.to + 20; d += 0.5) samples.push({ d, point: path.pointAt(d) });
function trackFrameOf(position) {
  let best = samples[0], bestSq = Infinity;
  for (const s of samples) {
    const sq = (s.point.x - position.x) ** 2 + (s.point.z - position.z) ** 2;
    if (sq < bestSq) { best = s; bestSq = sq; }
  }
  const tangent = path.tangentAt(best.d);
  const d = best.d + (position.x - best.point.x) * tangent.x + (position.z - best.point.z) * tangent.z;
  const point = path.pointAt(d), side = path.sideAt(d);
  return { d, offset: (position.x - point.x) * side.x + (position.z - point.z) * side.z };
}
function* corners(mesh) {
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) yield new Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
}

test('a null span builds nothing', () => {
  const none = createTunnel(path, null);
  assert.equal(none.group.children.length, 0);
  none.update(570); // and updating it is harmless
});

test('the shell follows the curving track, inside the tunnel and dark, drawn whatever the light', () => {
  const shell = part('tunnel-shell');
  assert.ok(shell.isMesh);
  assert.ok(shell.material.isMeshBasicMaterial, 'unlit: the dark is baked in');
  assert.ok(shell.material.vertexColors);
  let checked = 0;
  for (const p of corners(shell)) {
    const { d, offset } = trackFrameOf(p);
    assert.ok(d >= span.from - 1e-3 && d <= span.to + 1e-3, `${d} within the span`);
    assert.ok(Math.abs(offset) <= TUNNEL.HALF_WIDTH + 1e-3, `${offset.toFixed(3)} m out at ${d.toFixed(1)}`);
    assert.ok(p.y <= TUNNEL.HEIGHT + 1e-3, `${p.y} under the roof`);
    if (p.y > TUNNEL.HEIGHT - 1e-3) assert.ok(Math.abs(offset) < 1e-3, 'the crown is over the centre line');
    checked++;
  }
  assert.ok(checked > 1000);
  // Every face looks in, towards the centre line.
  const { position, normal } = shell.geometry.attributes;
  for (let i = 0; i < position.count; i += 3) {
    const p = new Vector3().fromBufferAttribute(position, i);
    const n = new Vector3().fromBufferAttribute(normal, i);
    const { d } = trackFrameOf(p);
    const centre = path.frameAt(d, 0, TUNNEL.HEIGHT / 2);
    assert.ok(n.dot(centre.sub(p)) > 0, `face ${i / 3} faces in`);
  }
  // The floor either side of the track bed is lined too, facing up.
  let floor = 0;
  for (let i = 0; i < position.count; i += 3) {
    if (normal.getY(i) > 0.99 && position.getY(i) < 0.1) floor++;
  }
  assert.ok(floor > 100, `${floor} floor triangles`);
  // Dark stone deep inside.
  const color = shell.geometry.attributes.color;
  let dark = 0;
  for (let i = 0; i < color.count; i++) {
    if (new Color().fromBufferAttribute(color, i).getHSL({}).l < 0.25) dark++;
  }
  assert.ok(dark > color.count / 2, `${dark} of ${color.count} corners dark`);
});

test('a stone portal stands at each end, lit like the rest of the world', () => {
  const portals = part('tunnel-portals');
  assert.ok(portals.isMesh);
  assert.equal(portals.material, MATERIALS.solid);
  const ends = [0, 0];
  for (const p of corners(portals)) {
    const { d, offset } = trackFrameOf(p);
    const near = Math.min(Math.abs(d - span.from), Math.abs(d - span.to));
    assert.ok(near < 2.5, `stone ${near.toFixed(2)} m from a portal`);
    // The opening is clear: the walls' line below the arch, and the crown over the middle. (A portal is square to the
    // track where the tunnel ends, and the track curves away from it a few millimetres over its depth.)
    if (p.y > 0.5 && p.y < 2) assert.ok(Math.abs(offset) >= TUNNEL.HALF_WIDTH - 0.01, 'the opening is clear');
    if (Math.abs(offset) < 0.9) assert.ok(p.y <= 0 || p.y >= TUNNEL.HEIGHT - 0.1, 'the opening is clear');
    ends[Math.abs(d - span.from) < Math.abs(d - span.to) ? 0 : 1]++;
  }
  assert.ok(ends[0] > 0 && ends[0] === ends[1], 'one at each end, alike');
});

test('warm lamps line the walls every LAMP_EVERY metres, each with a halo', () => {
  const lamps = part('tunnel-lamps');
  const halos = part('tunnel-lamp-halos');
  assert.equal(lamps.material, MATERIALS.glow);
  assert.ok(halos.isPoints);
  assert.equal(halos.material, MATERIALS.halo);
  const spots = [...corners(halos)].map(trackFrameOf);
  const perSide = Math.floor((span.to - span.from) / TUNNEL.LAMP_EVERY);
  assert.equal(spots.length, perSide * 2, 'both walls');
  for (const side of [-1, 1]) {
    const along = spots.filter((s) => Math.sign(s.offset) === side).map((s) => s.d).sort((a, b) => a - b);
    assert.equal(along.length, perSide);
    for (let k = 1; k < along.length; k++) assert.ok(Math.abs(along[k] - along[k - 1] - TUNNEL.LAMP_EVERY) < 0.05, 'a steady rhythm');
    assert.ok(along[0] > span.from && along.at(-1) < span.to, 'all inside');
  }
  for (const p of corners(lamps)) {
    const { d, offset } = trackFrameOf(p);
    assert.ok(d > span.from && d < span.to && Math.abs(offset) <= TUNNEL.HALF_WIDTH + 1e-3, 'on the walls, inside');
  }
});

test('the light at the end: a white glow over the far opening fades in over the last 25 m inside', () => {
  const glow = part('tunnel-exit-glow');
  assert.ok(glow.isMesh);
  assert.equal(glow.material.blending, AdditiveBlending);
  assert.equal(glow.material.depthWrite, false);
  for (const p of corners(glow)) {
    const { d, offset } = trackFrameOf(p);
    assert.ok(Math.abs(d - span.to) < 0.5, 'at the far portal');
    assert.ok(Math.abs(offset) <= TUNNEL.HALF_WIDTH + 1e-3 && p.y <= TUNNEL.HEIGHT + 1e-3, 'over the opening');
  }
  const shown = (d) => {
    tunnel.update(d);
    return glow.visible ? glow.material.opacity : 0;
  };
  assert.equal(shown(span.from - 10), 0);
  assert.equal(shown(span.to - 30), 0);
  assert.equal(shown(span.to - 25), 0);
  assert.ok(shown(span.to - 15) > 0 && shown(span.to - 15) < shown(span.to - 5), 'fades in');
  assert.ok(shown(span.to - 2) > 0.9, 'bright at the end');
  assert.equal(shown(span.to + 1), 0, 'gone once she is out');
});

test('far from the tunnel it is not drawn at all', () => {
  tunnel.update(span.from - 400);
  assert.equal(tunnel.group.visible, false);
  tunnel.update(span.from - 60);
  assert.equal(tunnel.group.visible, true);
  tunnel.update(span.to + 400);
  assert.equal(tunnel.group.visible, false);
});

test('a handful of draw calls and few triangles', () => {
  let triangles = 0;
  let calls = 0;
  tunnel.group.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    calls++;
    if (o.isMesh) triangles += o.geometry.attributes.position.count / 3;
  });
  assert.ok(calls <= 6, `${calls} draw calls`);
  assert.ok(triangles < 12_000, `${triangles} triangles`);
});
