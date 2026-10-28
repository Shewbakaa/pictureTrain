// The butterflies (Task 9): white, lemon and pale blue, low over the spring meadow beside the track.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTERFLIES, butterflyGeometry, createButterflies } from '../../site/src/world/butterflies.js';
import { BIRD_MATERIAL } from '../../site/src/world/birds.js';
import { avoidSpots } from '../../site/src/world/dressing.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, EYE_HEIGHT } from '../../site/src/world/layout.js';
import { envAt } from '../../site/src/world/environment.js';
import { tunnelSpan } from '../../site/src/world/tunnel.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { Color, Matrix4, Vector3 } from '../../site/src/three.js';

/** The ride through `zones`, two moments in each, as the default ride has. */
const layoutOf = (zones) => buildLayout(normalizeContent({ zones, moments: zones.flatMap((zone) => [{ zone }, { zone }]) }).content);
const pathOf = (layout) => createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const L = layoutOf(['spring', 'summer', 'autumn', 'winter', 'evening']); // spring is 0 to 210 m, its photo signs at 85 and 155
const PATH = pathOf(L);

/** The butterflies of a ride, and a way to run them with the train standing at `d`, or moving on from it at `speed`. */
function world({ layout = L, path = PATH, maxCount } = {}) {
  const butterflies = createButterflies({ path, layout, ...(maxCount ? { maxCount } : {}) });
  const env = envAt(layout, 0);
  const camera = new Vector3();
  return {
    butterflies, camera, mesh: butterflies.mesh,
    run(seconds, d, { dt = 1 / 30, speed = 0, each = () => {}, where = (at) => envAt(layout, at, env) } = {}) {
      const frames = Math.round(seconds / dt);
      for (let i = 0; i < frames; i++) {
        const at = d + speed * dt * i;
        path.frameAt(at, 0, EYE_HEIGHT, camera);
        butterflies.update(dt, where(at), camera, at);
        each(at, i);
      }
    },
  };
}

/** Each butterfly drawn now: its world position and how big it is drawn (1 is the size it flies at). */
function drawn(mesh) {
  const matrix = new Matrix4();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    out.push({
      position: new Vector3().setFromMatrixPosition(matrix),
      scale: new Vector3().setFromMatrixScale(matrix).x / BUTTERFLIES.SIZE,
    });
  }
  return out;
}
/** Those you can see: a butterfly shrunk to a speck is not one. */
const seen = (mesh) => (mesh.visible ? drawn(mesh).filter((b) => b.scale > 1e-3) : []);

/** The spots of the photo signs, in the world, on the ground. */
const signSpots = (layout, path) => avoidSpots(layout).slice(0, layout.stops.length).map((s) => path.frameAt(s.distance, s.right, 0, new Vector3()));
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Where a world point is along the track (m): slide along it to the point beside it. */
function alongOf(path, p) {
  let along = 0;
  const v = new Vector3();
  for (let k = 0; k < 12; k++) along += v.subVectors(p, path.pointAt(along)).dot(path.tangentAt(along));
  return along;
}

test('the numbers the butterflies are made of', () => {
  assert.ok(Object.isFrozen(BUTTERFLIES));
  assert.equal(BUTTERFLIES.COUNT, 14);
  assert.deepEqual([...BUTTERFLIES.COLOURS], ['#fdfdf7', '#f9e27a', '#a9c8f0']);
  assert.deepEqual([...BUTTERFLIES.FLAP], [6, 9]);
  assert.deepEqual([...BUTTERFLIES.HEIGHT], [0.3, 1.6]);
  assert.equal(BUTTERFLIES.EYE_CLEAR, 2.5);
  assert.equal(BUTTERFLIES.SIGN_CLEAR, 2);
});

test('a butterfly is a body and two pairs of wings that grow in flap towards their tips', () => {
  const g = butterflyGeometry();
  const { position: p, wing, normal, color } = g.attributes;
  assert.ok(wing && wing.itemSize === 1 && normal && color);
  assert.equal(wing.count, p.count);
  let left = 0, right = 0, zeros = 0, tip = 0, frontMost = -Infinity, backMost = Infinity;
  for (let i = 0; i < p.count; i++) {
    const w = wing.getX(i), x = p.getX(i);
    assert.ok(w >= -1 && w <= 1);
    if (w === 0) zeros++;
    else assert.equal(Math.sign(w), Math.sign(x), "a wing's sign is its side");
    if (w > 0) right++;
    if (w < 0) left++;
    if (Math.abs(x) > Math.abs(p.getX(tip))) tip = i;
    if (w > 0) { frontMost = Math.max(frontMost, p.getZ(i)); backMost = Math.min(backMost, p.getZ(i)); }
  }
  assert.ok(left > 0 && left === right, 'two wings, alike');
  assert.ok(zeros > 0.3 * p.count, 'the body does not flap');
  assert.ok(Math.abs(wing.getX(tip)) > 0.95, 'the tips flap the most');
  // The forewing reaches forward of the thorax and the hindwing back behind it.
  assert.ok(frontMost > 0.01 && backMost < -0.02, `wings from ${backMost} to ${frontMost} m`);
  // Wings spread out flat along X, about 6 to 9 cm tip to tip (it is drawn larger than life).
  g.computeBoundingBox();
  const span = g.boundingBox.max.x - g.boundingBox.min.x;
  assert.ok(span > 0.05 && span < 0.1, `${span} m across`);
  assert.equal(g.boundingBox.min.x, -g.boundingBox.max.x, 'the left wing mirrors the right');
});

test('the butterflies are one instanced mesh of the birds\' flapping material, in white, lemon and pale blue, each with its own flap', () => {
  const { mesh } = world();
  assert.ok(mesh.isInstancedMesh);
  assert.equal(mesh.material, BIRD_MATERIAL);
  assert.equal(mesh.instanceMatrix.count, BUTTERFLIES.COUNT);
  const colour = new Color();
  const used = new Set();
  for (let i = 0; i < BUTTERFLIES.COUNT; i++) {
    mesh.getColorAt(i, colour);
    used.add(colour.getHexString());
  }
  assert.deepEqual([...used].sort(), BUTTERFLIES.COLOURS.map((c) => new Color(c).getHexString()).sort(), 'all three, and nothing else');
  const flap = mesh.geometry.getAttribute('aFlap');
  assert.equal(flap.count, BUTTERFLIES.COUNT);
  for (let i = 0; i < flap.count; i++) {
    assert.ok(flap.getY(i) >= 6 && flap.getY(i) <= 9, `flaps ${flap.getY(i)} times a second`);
    assert.ok(flap.getZ(i) > 0.5 && flap.getZ(i) <= 1);
  }
  assert.ok(new Set(Array.from({ length: flap.count }, (_, i) => flap.getX(i))).size > 8, 'each at its own phase');
  assert.equal(world({ maxCount: 5 }).mesh.instanceMatrix.count, 5);
});

test('in spring they fly 0.3 to 1.6 m above the ground, no nearer than 2.5 m to her eye or 2 m to a photo sign', () => {
  const spots = signSpots(L, PATH);
  assert.equal(spots.length, 10);
  // Standing beside the first sign, then rolling on through both of them (all in full spring), 10 s each: through the
  // seam where they wrap, too.
  for (const [d, speed] of [[85, 0], [95, 6.5]]) {
    const w = world();
    let frames = 0, shown = 0;
    w.run(10, d, {
      speed,
      each: () => {
        frames++;
        assert.equal(w.mesh.count, BUTTERFLIES.COUNT);
        assert.ok(w.mesh.visible);
        for (const b of drawn(w.mesh)) {
          assert.ok(b.position.y >= 0.3 && b.position.y <= 1.6, `${b.position.y} m up`);
        }
        for (const b of seen(w.mesh)) {
          shown++;
          assert.ok(b.position.distanceTo(w.camera) >= 2.5, `${b.position.distanceTo(w.camera)} m from her eye`);
          for (const spot of spots) assert.ok(flat(b.position, spot) >= 2, `${flat(b.position, spot)} m from a sign`);
        }
      },
    });
    assert.ok(frames >= 300);
    assert.ok(shown > frames, `a few of them in sight at a time (${shown} sightings in ${frames} frames)`);
  }
});

test('the ones that would fly within 2.5 m of her eye, or 2 m of a sign, are not drawn there', () => {
  // So many butterflies that some are everywhere, to see that the spots are cleared by something.
  const w = world({ maxCount: 400 });
  const spot = signSpots(L, PATH)[0]; // beside her, 3.4 m out
  w.run(2, 85);
  const all = drawn(w.mesh);
  const nearSign = all.filter((b) => flat(b.position, spot) < 2);
  const nearEye = all.filter((b) => b.position.distanceTo(w.camera) < 2.5);
  assert.ok(nearSign.length > 5 && nearEye.length > 5, `${nearSign.length} would be by the sign, ${nearEye.length} by her eye`);
  for (const b of [...nearSign, ...nearEye]) assert.ok(b.scale <= 1e-3, `${b.scale}`);
  // And they come in smoothly, not at a step: just past the line they are small, and well clear of it full size.
  const ring = all.filter((b) => flat(b.position, spot) >= 2 && flat(b.position, spot) < 2.3 && b.position.distanceTo(w.camera) > 3.5);
  const clear = all.filter((b) => flat(b.position, spot) >= 3.5 && flat(b.position, spot) < 4.5 && b.position.distanceTo(w.camera) > 3.5 && Math.abs(alongOf(PATH, b.position) - 85) < 8);
  assert.ok(ring.length > 0 && clear.length > 0);
  assert.ok(Math.max(...ring.map((b) => b.scale)) < 0.5 * Math.min(...clear.map((b) => b.scale)));
});

test('they go with the spring, and fly off and shrink away as it gives way', () => {
  // Winter: none at all.
  const winter = world();
  winter.run(1, 600);
  assert.equal(winter.mesh.count, 0);
  assert.equal(winter.mesh.visible, false);
  // Across the spring's blend into summer (195 to 225 m), the weight falls and they thin out and shrink, and none is left.
  const sizeAt = (t) => {
    const w = world();
    w.run(1, 100, { where: () => ({ zoneA: 'spring', zoneB: 'summer', t }) });
    return { count: w.mesh.count, total: drawn(w.mesh).reduce((sum, b) => sum + b.scale, 0), visible: w.mesh.visible, y: Math.max(...drawn(w.mesh).map((b) => b.position.y)) };
  };
  let last = Infinity;
  for (let t = 0; t < 1; t += 0.1) {
    const now = sizeAt(t);
    assert.ok(now.visible, `at ${t.toFixed(1)}`);
    assert.ok(now.total <= last + 1e-9, `${t.toFixed(1)}: ${now.total} after ${last}`);
    last = now.total;
  }
  const half = sizeAt(0.5), full = sizeAt(0);
  assert.ok(half.total > 0 && half.total < 0.8 * full.total, `half way across: ${half.total} of ${full.total}`);
  assert.ok(half.y > 1.6, 'they rise as they go');
  const gone = sizeAt(1);
  assert.equal(gone.count, 0);
  assert.equal(gone.visible, false);
  assert.equal(sizeAt(0).y <= 1.6, true);
});

test('the quality share thins them', () => {
  const w = world();
  w.run(0.5, 100);
  assert.equal(w.mesh.count, 14);
  w.butterflies.setQuality(0.5);
  w.run(0.1, 100);
  assert.equal(w.mesh.count, 7);
  w.butterflies.setQuality(0.05);
  w.run(0.1, 100);
  assert.equal(w.mesh.count, 1);
  w.butterflies.setQuality(0);
  w.run(0.1, 100);
  assert.equal(w.mesh.count, 0);
  assert.equal(w.mesh.visible, false);
  w.butterflies.setQuality(1);
  w.run(0.1, 100);
  assert.equal(w.mesh.count, 14);
  assert.ok(w.mesh.visible);
});

test('nothing pops: each butterfly moves smoothly, and wraps from one end of its stretch to the other only while it is a speck', () => {
  // Rolling on through the whole spring and out of it, 25 s at 6.5 m/s.
  const w = world();
  let previous = null, jumps = 0, wrapped = 0;
  w.run(25, 80, {
    speed: 6.5,
    each: () => {
      const now = drawn(w.mesh);
      if (previous && previous.length === now.length) {
        for (let i = 0; i < now.length; i++) {
          if (now[i].position.distanceTo(previous[i].position) > 1) {
            if (Math.min(now[i].scale, previous[i].scale) > 0.05) jumps++;
            else wrapped++;
          }
        }
      }
      previous = now;
    },
  });
  assert.equal(jumps, 0, `${jumps} visible jumps`);
  assert.ok(wrapped > 5, `they do come round again, out of sight (${wrapped})`);
});

test('none flutters in the tunnel\'s portals or hill', () => {
  // With no winter the tunnel hides the boundary into summer: it runs from 180 to 240 m, with spring up to 210.
  const layout = layoutOf(['spring', 'summer', 'evening']);
  const path = pathOf(layout);
  const span = tunnelSpan(layout);
  assert.ok(span && span.from < layout.zones[0].end && span.to > layout.zones[0].end);
  const w = world({ layout, path, maxCount: 200 });
  const insideBand = (b) => { const a = alongOf(path, b.position); return a > span.from - BUTTERFLIES.TUNNEL_CLEAR && a < span.to + BUTTERFLIES.TUNNEL_CLEAR; };
  let hidden = 0, shown = 0;
  for (const d of [150, 165, 172]) {
    w.run(1, d);
    for (const b of drawn(w.mesh)) {
      if (!insideBand(b)) { shown += b.scale > 1e-3 ? 1 : 0; continue; }
      hidden++;
      assert.ok(b.scale <= 1e-3, `a butterfly ${alongOf(path, b.position).toFixed(1)} m along, by the tunnel at ${span.from}`);
    }
  }
  assert.ok(hidden > 20 && shown > 100, `${hidden} would be in the way, ${shown} sightings elsewhere`);
});

test('without a track position nothing is drawn, rather than a guess', () => {
  const w = world();
  w.butterflies.update(0.1, envAt(L, 100), w.camera, NaN);
  assert.equal(w.mesh.count, 0);
  assert.equal(w.mesh.visible, false);
});
