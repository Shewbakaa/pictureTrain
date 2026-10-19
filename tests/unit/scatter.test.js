import test from 'node:test';
import assert from 'node:assert/strict';
import { scatterZone, SCATTER } from '../../site/src/world/scatter.js';
import { createTrackPath } from '../../site/src/world/trackPath.js';
import { buildLayout, LAYOUT } from '../../site/src/world/layout.js';
import { ZONES } from '../../site/src/world/zones.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import fixture from '../fixtures/content.fixture.js';
import { PROP_VARIANTS, createPropGeometry } from '../../site/src/world/props.js';
import { triangleCount } from '../../site/src/util/geo.js';
import { Vector3 } from '../../site/src/three.js';

const L = buildLayout(normalizeContent(fixture).content);
const path = createTrackPath(L.total, 7, { straightRanges: [[0, 120], [L.finaleDistance - 90, L.total + 60]] });
const avoid = L.stops.map((s) => ({ distance: s.distance + 3.5, right: s.side === 'right' ? 3.4 : -3.4, radius: 5 }));
const scatter = (i) => scatterZone({ path, zone: L.zones[i], rules: ZONES[L.zones[i].id].props, seed: i + 1, avoid, water: ZONES[L.zones[i].id].water });

test('deterministic', () => assert.deepEqual(scatter(0), scatter(0)));

test('keeps the track corridor clear', () => {
  const samples = [];
  for (let d = -20; d <= L.total + 20; d += 1) samples.push(path.pointAt(d));
  for (const p of scatter(0)) {
    const min = Math.min(...samples.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
    assert.ok(min >= SCATTER.CORRIDOR - 0.05, `too close: ${min}`);
  }
});

test('keeps sign spots clear', () => {
  for (const p of scatter(0)) for (const a of avoid) {
    const s = path.frameAt(a.distance, a.right, 0);
    assert.ok(Math.hypot(s.x - p.x, s.z - p.z) >= a.radius);
  }
});

test('stays within the zone plus half the blend window', () => {
  const z = L.zones[1];
  for (const p of scatter(1)) assert.ok(p.d >= z.start - LAYOUT.BLEND / 2 && p.d <= z.end + LAYOUT.BLEND / 2);
});

test('density roughly matches the rules', () => {
  const z = L.zones[0];
  const expected = ZONES.spring.props.reduce((n, r) => n + 2 * Math.round(r.perMeter * (z.end - z.start)), 0);
  assert.ok(scatter(0).length >= expected * 0.6);
});

test('priorities are in [0,1)', () => {
  for (const p of scatter(2)) assert.ok(p.priority >= 0 && p.priority < 1);
});

test('the water side stays clear in water zones', () => {
  for (const p of scatter(1)) assert.ok(p.offset >= -SCATTER.WATER_EDGE);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief's seven: the Placement contract in full, seeds, both sides and the water rule,
// the taper across the blend windows, which way props face, the corridor rule where a rule would
// allow closer, a large avoid spot (which removes only what stands on it), what priority favours,
// and what the default ride's scenery costs in triangles.
// ---------------------------------------------------------------------------------------------

const TAU = 2 * Math.PI;
const ALL = L.zones.map((_, i) => scatter(i));
const ruleFor = (zone, type) => ZONES[zone.id].props.find((r) => r.type === type);
/** How far out a placement is within its rule's band of offsets: 0 at minOffset, 1 at maxOffset. */
const reachOf = (zone, p) => {
  const rule = ruleFor(zone, p.type);
  return (Math.abs(p.offset) - rule.minOffset) / (rule.maxOffset - rule.minOffset);
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('every placement is a well-formed Placement on its own spot beside the track', () => {
  L.zones.forEach((zone, i) => {
    assert.ok(ALL[i].length > 0, zone.id);
    for (const p of ALL[i]) {
      const at = `${zone.id} ${p.type} at ${p.d.toFixed(1)} m`;
      assert.deepEqual(Object.keys(p).sort(), ['d', 'offset', 'priority', 'rotY', 'scale', 'type', 'variant', 'x', 'y', 'z'], at);
      const rule = ruleFor(zone, p.type);
      assert.ok(rule, `${at}: the zone has a rule for it`);
      assert.ok(Number.isInteger(p.variant) && p.variant >= 0 && p.variant < (PROP_VARIANTS[p.type] ?? 1), `${at}: variant ${p.variant}`);
      assert.ok(Math.abs(p.offset) >= rule.minOffset && Math.abs(p.offset) < rule.maxOffset, `${at}: offset ${p.offset}`);
      assert.ok(p.scale >= rule.scale[0] && p.scale <= rule.scale[1], `${at}: scale ${p.scale}`);
      assert.ok(p.rotY >= 0 && p.rotY < TAU, `${at}: rotY ${p.rotY}`);
      assert.equal(p.y, 0);
      const spot = path.frameAt(p.d, p.offset, 0);
      assert.ok(Math.hypot(spot.x - p.x, spot.z - p.z) < 1e-9, `${at}: stands at frameAt(d, offset, 0)`);
    }
  });
});

test('every variant turns up', () => {
  const seen = new Set(ALL.flat().map((p) => `${p.type}#${p.variant}`));
  for (const type of ['tree_autumn', 'flower_patch', 'house']) {
    for (let v = 0; v < PROP_VARIANTS[type]; v++) assert.ok(seen.has(`${type}#${v}`), `${type}#${v}`);
  }
});

test('another seed gives other scenery', () => {
  const zone = L.zones[0];
  const other = scatterZone({ path, zone, rules: ZONES.spring.props, seed: 99, avoid, water: false });
  assert.notDeepEqual(other, ALL[0]);
  assert.ok(Math.abs(other.length - ALL[0].length) < 0.2 * ALL[0].length, 'about as many');
});

test('both sides are dressed, and only a water zone keeps its left side near the track', () => {
  L.zones.forEach((zone, i) => {
    assert.ok(ALL[i].some((p) => p.offset > 0) && ALL[i].some((p) => p.offset < 0), `${zone.id}: both sides`);
    const farLeft = ALL[i].some((p) => p.offset < -SCATTER.WATER_EDGE);
    assert.equal(farLeft, !ZONES[zone.id].water, `${zone.id}: props far out on the left`);
  });
  assert.ok(ALL[1].some((p) => p.offset > SCATTER.WATER_EDGE), 'the beach still reaches far out on the right');
});

test('props thin out across the half-blend windows outside their zone', () => {
  const half = LAYOUT.BLEND / 2;
  let inWindows = 0, atFullDensity = 0;
  L.zones.forEach((zone, i) => {
    const inside = ALL[i].filter((p) => p.d >= zone.start && p.d <= zone.end).length;
    inWindows += ALL[i].length - inside;
    atFullDensity += (inside / (zone.end - zone.start)) * 2 * half; // what the zone's own density would put there
  });
  const share = inWindows / atFullDensity;
  assert.ok(share > 0.3 && share < 0.7, `the windows hold ${share.toFixed(2)} of full density; a smoothstep taper averages 0.5`);
});

test('built things turn their fronts (+Z) to the track, and wild things face anywhere', () => {
  // The most a front may turn away from the track, in radians.
  const LIMIT = { house: 0.15, bench: 0.15, fence: 0.06, lamp_post: 0.15, snowman: 0.5, balloon_cluster: 0.7 };
  const rules = Object.keys(LIMIT).map((type) => ({ type, perMeter: 0.05, minOffset: 5, maxOffset: 30, scale: [1, 1] }));
  const placements = scatterZone({ path, zone: L.zones[2], rules, seed: 3 });
  assert.ok(placements.length > 50);
  for (const p of placements) {
    const toTrack = path.pointAt(p.d).sub(new Vector3(p.x, 0, p.z)).normalize();
    const facing = Math.sin(p.rotY) * toTrack.x + Math.cos(p.rotY) * toTrack.z; // a rotY turns +Z to (sin, cos)
    assert.ok(facing >= Math.cos(LIMIT[p.type]), `${p.type} at ${p.d.toFixed(1)} m faces ${Math.acos(Math.min(1, facing)).toFixed(2)} rad off the track`);
  }
  const trees = ALL[0].filter((p) => p.type === 'tree_round');
  assert.equal(new Set(trees.map((p) => Math.floor(p.rotY / (Math.PI / 2)))).size, 4, 'trees turn every way');
});

test('the corridor stays clear even where a rule would allow props closer', () => {
  const zone = L.zones[2];
  const rules = [{ type: 'rock', perMeter: 0.5, minOffset: 0.2, maxOffset: 8, scale: [1, 1] }];
  const placements = scatterZone({ path, zone, rules, seed: 4 });
  const drawn = 2 * Math.round(0.5 * (zone.end - zone.start));
  assert.ok(placements.length > 0.4 * drawn && placements.length < 0.7 * drawn, `${placements.length} of ${drawn} kept`);
  const samples = [];
  for (let d = zone.start - 60; d <= zone.end + 60; d += 0.25) samples.push(path.pointAt(d));
  for (const p of placements) {
    const min = Math.min(...samples.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
    assert.ok(min >= SCATTER.CORRIDOR - 0.01, `too close: ${min}`);
  }
});

test('an avoid spot of any size stays clear, and only the props on it go', () => {
  const zone = L.zones[0];
  const spot = { distance: 100, right: -10, radius: 25 };
  const without = scatterZone({ path, zone, rules: ZONES.spring.props, seed: 1 });
  const withSpot = scatterZone({ path, zone, rules: ZONES.spring.props, seed: 1, avoid: [spot] });
  const centre = path.frameAt(spot.distance, spot.right, 0);
  const onSpot = (p) => Math.hypot(p.x - centre.x, p.z - centre.z) < spot.radius;
  assert.ok(without.some(onSpot), 'there was something to clear');
  assert.deepEqual(withSpot, without.filter((p) => !onSpot(p)));
});

test('thinning the scenery keeps props near the track first, but not only those', () => {
  const zone = L.zones[0];
  const inner = ALL[0].filter((p) => reachOf(zone, p) < 0.5).map((p) => p.priority);
  const outer = ALL[0].filter((p) => reachOf(zone, p) >= 0.5).map((p) => p.priority);
  assert.ok(mean(inner) + 0.1 < mean(outer), `mean priority near ${mean(inner).toFixed(2)}, far ${mean(outer).toFixed(2)}`);
  // The lowest quality tier keeps 45 % of each prop type, lowest priority first.
  const kept = [...ALL[0]].sort((a, b) => a.priority - b.priority).slice(0, Math.ceil(0.45 * ALL[0].length));
  assert.ok(kept.some((p) => reachOf(zone, p) > 0.75), 'some of the farthest props stay');
});

test("the default ride's scenery fits in half the triangle budget even if all of it were in view at once", () => {
  const cost = new Map();
  const triangles = ({ type, variant }) => {
    const key = `${type}#${variant}`;
    if (!cost.has(key)) {
      const { body, glow } = createPropGeometry(type, variant);
      cost.set(key, triangleCount(body) + (glow ? triangleCount(glow) : 0));
    }
    return cost.get(key);
  };
  const total = ALL.flat().reduce((sum, p) => sum + triangles(p), 0);
  assert.ok(total <= 125_000, `${total} triangles; the budget for everything in view is 250,000`);
});
