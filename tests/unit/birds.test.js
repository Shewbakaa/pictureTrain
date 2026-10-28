// The birds (Task 8): a flock of songbirds crossing the spring sky, gulls looping over the summer sea, and robins on
// the winter fences that flutter off as the train comes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIRD_KINDS, BIRD_MATERIAL, BIRDS, birdGeometry, createBirds, createDoves, DOVES, dovesAt, flockPlace, gullBank,
  gullPlace, robinLeave,
} from '../../site/src/world/birds.js';
import { CHIMNEY, HOUSE, RIDGE } from '../../site/src/world/stations.js';
import { FINALE_TIMES, finaleTracks } from '../../site/src/finale/finale.js';
import { FOLEY_CUES } from '../../site/src/finale/foleyTiming.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { TIERS } from '../../site/src/perf/quality.js';
import { FINALE_PATH } from './finaleStage.js';
import { createTrackPath, TRACK } from '../../site/src/world/trackPath.js';
import { buildLayout, EYE_HEIGHT } from '../../site/src/world/layout.js';
import { envAt } from '../../site/src/world/environment.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { InstancedBufferAttribute, Matrix4, ShaderLib, UniformsUtils, Vector3 } from '../../site/src/three.js';

/** The ride through `zones`, two moments in each, as the default ride has. */
const layoutOf = (zones) => buildLayout(normalizeContent({ zones, moments: zones.flatMap((zone) => [{ zone }, { zone }]) }).content);
const DEFAULT_ZONES = ['spring', 'summer', 'autumn', 'winter', 'evening'];
const pathOf = (layout) => createTrackPath(layout.total, TRACK.SEED, { straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]] });
const L = layoutOf(DEFAULT_ZONES);
const PATH = pathOf(L);
const zone = (layout, id) => layout.zones.find((z) => z.id === id);
const middleOf = (layout, id) => (zone(layout, id).start + zone(layout, id).end) / 2;

/** A world built for the birds: the layout, its track, the birds, and a way to run them with the train at `d`. */
function world({ layout = L, path = PATH, perches = [] } = {}) {
  const birds = createBirds({ path, perches });
  const env = envAt(layout, 0);
  const camera = new Vector3();
  const mesh = (kind) => birds.group.getObjectByName(`birds-${kind}`);
  return {
    birds, path, camera, mesh,
    /**
     * Runs `seconds` of frames of `dt` with the train standing at `d` (or moving from it at `speed`), her view along
     * `view` if given; `each` hears every frame.
     */
    run(seconds, d, { dt = 1 / 30, speed = 0, view, each = () => {} } = {}) {
      const frames = Math.round(seconds / dt);
      for (let i = 0; i < frames; i++) {
        const at = d + speed * dt * i;
        path.frameAt(at, 0, EYE_HEIGHT, camera);
        birds.update(dt, envAt(layout, at, env), camera, at, view);
        each(at, i);
      }
    },
  };
}

/** Each bird drawn now: its world position, scale, up axis and flap (phase, rate, amount). */
function drawn(mesh) {
  const matrix = new Matrix4();
  const flap = mesh.geometry.getAttribute('aFlap');
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    const scale = new Vector3().setFromMatrixScale(matrix).x;
    const up = new Vector3().setFromMatrixColumn(matrix, 1).normalize();
    out.push({ position: new Vector3().setFromMatrixPosition(matrix), scale, up, amount: flap.getZ(i) });
  }
  return out;
}
const seen = (mesh) => (mesh.visible ? drawn(mesh).filter((b) => b.scale > 1e-3) : []);

/** Where a world point is from the track at `d`: z metres further along it, x to the right of it there, y up. */
function fromTrack(path, d, p) {
  // Slide along the track to the point beside it.
  let along = d;
  const v = new Vector3();
  for (let k = 0; k < 12; k++) along += v.subVectors(p, path.pointAt(along)).dot(path.tangentAt(along));
  v.subVectors(p, path.pointAt(along));
  return { x: v.dot(path.sideAt(along)), y: v.y, z: along - d };
}

/** How far a bird is tipped from upright (rad): banking, or its nose up or down. */
const tilt = (b) => Math.acos(Math.min(1, Math.max(-1, b.up.y)));

test('the numbers the birds are made of', () => {
  assert.ok(Object.isFrozen(BIRDS) && Object.isFrozen(BIRDS.FLOCK) && Object.isFrozen(BIRDS.GULLS) && Object.isFrozen(BIRDS.ROBINS));
  const { FLOCK, GULLS, ROBINS } = BIRDS;
  assert.equal(FLOCK.COUNT, 6);
  assert.deepEqual([...FLOCK.EVERY], [14, 30]);
  assert.deepEqual([...FLOCK.HEIGHT], [40, 70]);
  assert.deepEqual([...FLOCK.AHEAD], [60, 120]);
  assert.equal(FLOCK.SPEED, 9);
  assert.equal(GULLS.COUNT, 4);
  assert.deepEqual([...GULLS.HEIGHT], [14, 35]);
  assert.deepEqual([...GULLS.RADIUS], [12, 25]);
  assert.equal(GULLS.SPEED, 6);
  assert.equal(GULLS.FLAPPING, 0.2);
  assert.equal(ROBINS.COUNT, 3);
  assert.deepEqual([...ROBINS.AHEAD], [2, 60]);
  assert.equal(ROBINS.LEAVE, 9);
});

// ---------------------------------------------------------------------------------------------
// The birds' shapes and their flapping
// ---------------------------------------------------------------------------------------------

test('each bird is a body with two wings, and its wings say how far out towards their tips each vertex is', () => {
  assert.deepEqual([...BIRD_KINDS], ['songbird', 'gull', 'robin', 'dove']);
  for (const kind of BIRD_KINDS) {
    const g = birdGeometry(kind);
    const { position: p, wing, normal, color } = g.attributes;
    assert.ok(wing && wing.itemSize === 1 && normal && color, kind);
    assert.equal(wing.count, p.count);
    let zeros = 0, left = 0, right = 0, tip = 0;
    for (let i = 0; i < p.count; i++) {
      const w = wing.getX(i), x = p.getX(i);
      assert.ok(w >= -1 && w <= 1, `${kind}: ${w}`);
      if (w === 0) zeros++;
      else assert.equal(Math.sign(w), Math.sign(x), `${kind}: a wing's sign is its side`);
      if (w > 0) right++;
      if (w < 0) left++;
      if (Math.abs(x) > Math.abs(p.getX(tip))) tip = i;
      if (Math.abs(x) < 0.02) assert.equal(w, 0, `${kind}: the body down the middle stays still`);
    }
    assert.ok(left > 0 && right > 0 && left === right, `${kind}: both wings, alike`);
    assert.ok(zeros > 0.3 * p.count, `${kind}: the body (${zeros} of ${p.count} vertices) does not flap`);
    assert.ok(Math.abs(wing.getX(tip)) > 0.95, `${kind}: the wing's tip flaps the most`);
    // The beak (furthest forward, +Z) and the tail (furthest back) are the body's.
    let front = 0, back = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > p.getZ(front)) front = i;
      if (p.getZ(i) < p.getZ(back)) back = i;
    }
    assert.equal(wing.getX(front), 0, `${kind}: its beak`);
    assert.equal(wing.getX(back), 0, `${kind}: its tail`);
  }
  assert.throws(() => birdGeometry('ostrich'), /ostrich/);
});

test('the wings flap in three.js\'s own Lambert shader, each bird to its own instanced phase, rate and amount', () => {
  const shader = {
    uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms),
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  BIRD_MATERIAL.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec3 aFlap;/);
  assert.match(shader.vertexShader, /attribute float wing;/);
  assert.match(shader.vertexShader, /uniform float uBirdTime;/);
  // amount · 0.9 · sin(2π · rate · t + phase), times the wing's own share (its sign the side), about the long axis (Z).
  assert.match(shader.vertexShader, /aFlap\.z \* 0\.9 \* sin\(6\.283\d* \* aFlap\.y \* uBirdTime \+ aFlap\.x\) \* wing/);
  assert.match(shader.vertexShader, /#include <beginnormal_vertex>\s+objectNormal\.xy = birdWing\(objectNormal\.xy\);/);
  assert.match(shader.vertexShader, /#include <begin_vertex>\s+transformed\.xy = birdWing\(transformed\.xy\);/);
  assert.equal(shader.fragmentShader, ShaderLib.lambert.fragmentShader, 'the colours are left as they are');
  assert.ok(BIRD_MATERIAL.isMeshLambertMaterial && BIRD_MATERIAL.vertexColors);
  assert.equal(BIRD_MATERIAL.customProgramCacheKey(), 'birds');

  // The birds keep the wings' time.
  const w = world();
  w.run(2, middleOf(L, 'spring'), { dt: 0.1 });
  assert.ok(Math.abs(shader.uniforms.uBirdTime.value - 2) < 1e-9, `${shader.uniforms.uBirdTime.value}`);
});

test('one instanced mesh for each kind of bird, all on the birds\' material, with a flap for each bird', () => {
  const { birds } = world();
  assert.deepEqual(birds.group.children.map((m) => m.name), ['birds-songbird', 'birds-gull', 'birds-robin']);
  for (const mesh of birds.group.children) {
    assert.ok(mesh.isInstancedMesh && mesh.material === BIRD_MATERIAL, mesh.name);
    assert.equal(mesh.frustumCulled, false, 'they move about with the camera');
    assert.equal(mesh.castShadow, false);
    const flap = mesh.geometry.getAttribute('aFlap');
    assert.ok(flap instanceof InstancedBufferAttribute && flap.itemSize === 3, mesh.name);
  }
  assert.deepEqual(birds.targets, []);
});

// ---------------------------------------------------------------------------------------------
// The pure parts
// ---------------------------------------------------------------------------------------------

test('a gull called banks: nothing before the call, up to 0.6 rad at 0.4 s, level again by 2 s', () => {
  assert.equal(gullBank(-1), 0);
  assert.equal(gullBank(0), 0);
  assert.equal(gullBank(Infinity), 0, 'never called');
  assert.ok(gullBank(0.4) > 0.5);
  assert.ok(Math.abs(gullBank(3)) < 0.01);
  let peak = 0;
  for (let t = 0; t <= 3; t += 0.01) {
    peak = Math.max(peak, gullBank(t));
    assert.ok(Math.abs(gullBank(t + 0.01) - gullBank(t)) < 0.05, `smooth at ${t.toFixed(2)} s`);
  }
  assert.ok(Math.abs(peak - 0.6) < 1e-6);
  assert.ok(Math.abs(gullBank(2)) < 1e-9);
});

test('a flock crosses the sky ahead every 14 to 30 s, from one side to the other, 40 to 70 m up and 60 to 120 m ahead, in view, at 9 m/s', () => {
  const flock = { seed: 3 };
  const out = new Vector3();
  const dt = 0.05;
  const stretches = [];
  let current = null;
  for (let i = 0; i <= 1200 / dt; i++) {
    const t = i * dt;
    if (flockPlace(flock, t, out)) {
      if (!current) current = { from: t, path: [] };
      current.path.push(out.clone());
    } else if (current) {
      stretches.push(current);
      current = null;
    }
  }
  assert.ok(stretches.length > 1200 / 30 && stretches[0].from < 30, `${stretches.length} crossings, the first at ${stretches[0].from} s`);
  for (const { from, path } of stretches) {
    const first = path[0], last = path[path.length - 1];
    assert.ok(Math.sign(first.x) === -Math.sign(last.x) && Math.abs(first.x) > 40 && Math.abs(last.x) > 40,
      `the crossing at ${from.toFixed(1)} s goes from ${first.x.toFixed(0)} to ${last.x.toFixed(0)} m across`);
    assert.ok(path.length * dt < 14, 'over before the next can start');
    for (const p of path) {
      assert.ok(p.y >= 40 && p.y <= 70 && p.z >= 60 && p.z <= 120, `at ${p.toArray().map((v) => v.toFixed(1))}`);
      // Under the cabin's roof and its bunting, which hide the sky above about 35 degrees as she looks ahead.
      assert.ok(Math.atan2(p.y - EYE_HEIGHT, p.z) <= (30.01 * Math.PI) / 180, `${p.y.toFixed(0)} m up only ${p.z.toFixed(0)} m ahead`);
    }
    for (let k = 1; k < path.length; k++) assert.ok(Math.abs(path[k].distanceTo(path[k - 1]) / dt - 9) < 0.01, 'at 9 m/s');
  }
  const gaps = stretches.slice(1).map((s, k) => s.from - stretches[k].from);
  assert.ok(Math.min(...gaps) >= 14 - dt && Math.max(...gaps) <= 30 + dt, `gaps ${Math.min(...gaps)} to ${Math.max(...gaps)} s`);
  const ways = new Set(stretches.map(({ path }) => Math.sign(path[0].x)));
  assert.equal(ways.size, 2, 'both ways across');
  // Another flock keeps its own times.
  const firstFrom = (seed) => {
    for (let i = 0; ; i++) if (flockPlace({ seed }, i * dt, out)) return i * dt;
  };
  assert.notEqual(firstFrom(4), firstFrom(3));
});

test('a gull glides round its loop at 6 m/s, its height rising and falling a little', () => {
  const gull = { ahead: 40, out: 30, radius: 15, height: 20, dir: 1, phase: 0.5 };
  const a = new Vector3(), b = new Vector3();
  const dt = 0.01;
  for (let t = 0; t < 30; t += 0.5) {
    gullPlace(gull, t, a);
    gullPlace(gull, t + dt, b);
    assert.ok(Math.abs(Math.hypot(a.x + 30, a.z - 40) - 15) < 1e-9, 'round its loop, 30 m out to the left and 40 m ahead');
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) / dt - 6) < 0.01, 'at 6 m/s');
    assert.ok(Math.abs(a.y - 20) <= 3, `at ${a.y} m up`);
  }
  // The other way round, the other way: from the same place, mirrored along the track.
  const start = { ...gull, phase: 0 };
  gullPlace(start, 1, a);
  gullPlace({ ...start, dir: -1 }, 1, b);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs((a.z - 40) + (b.z - 40)) < 1e-9);
});

test('a robin sits until the train is within 9 m, and is gone by the time it gets there', () => {
  assert.equal(robinLeave(20), 0);
  assert.equal(robinLeave(9.01), 0);
  assert.ok(robinLeave(9) > 0);
  assert.equal(robinLeave(0), 1);
  for (let d = 0; d < 20; d += 0.25) {
    const k = robinLeave(d);
    assert.ok(k >= 0 && k <= 1 && robinLeave(d + 0.25) <= k, `${d} m`);
  }
});

// ---------------------------------------------------------------------------------------------
// The birds in the world
// ---------------------------------------------------------------------------------------------

test('a ride without summer has no gulls anywhere', () => {
  const layout = layoutOf(['spring', 'autumn', 'winter', 'evening']);
  const w = world({ layout, path: pathOf(layout) });
  for (let d = 0; d <= layout.total; d += 2) {
    w.run(1 / 30, d);
    assert.equal(w.mesh('gull').count, 0, `at ${d} m`);
  }
  // The default ride has them in its summer, so the above is not empty by accident.
  const summer = world();
  summer.run(1, middleOf(L, 'summer'));
  assert.equal(summer.mesh('gull').count, 4);
  assert.equal(seen(summer.mesh('gull')).length, 4);
});

test('each kind shows only in its own zones: songbirds in spring and autumn, gulls in summer, robins in winter', () => {
  const perches = [Object.assign(PATH.frameAt(middleOf(L, 'winter') + 30, 5, 1.06), { rank: 0, zone: 'winter' })];
  const shown = { songbird: new Set(), gull: new Set(), robin: new Set() };
  for (const id of DEFAULT_ZONES) {
    const w = world({ perches });
    w.run(120, middleOf(L, id), {
      dt: 0.1,
      each() {
        for (const kind of Object.keys(shown)) if (seen(w.mesh(kind)).length > 0) shown[kind].add(id);
      },
    });
  }
  assert.deepEqual([...shown.songbird], ['spring', 'autumn']);
  assert.deepEqual([...shown.gull], ['summer']);
  assert.deepEqual([...shown.robin], ['winter']);
});

test('the flock crosses high ahead of the train, never near her; in autumn about half as often as in spring', () => {
  const crossings = (id) => {
    const w = world();
    const d = middleOf(L, id);
    let count = 0, was = false;
    w.run(1200, d, {
      dt: 0.1,
      each() {
        const birds = seen(w.mesh('songbird'));
        if (birds.length > 0 && !was) count++;
        was = birds.length > 0;
        for (const b of birds) {
          const p = fromTrack(w.path, d, b.position);
          assert.ok(p.y > 34 && p.y < 76 && p.z > 50 && p.z < 130, `${id}: a songbird ${p.y.toFixed(0)} m up and ${p.z.toFixed(0)} m ahead`);
          assert.ok(Math.abs(p.x) <= 50, 'across the view ahead, fading out at either side');
          assert.ok(b.amount > 0.5, 'flapping');
        }
        if (birds.length > 0) assert.equal(w.mesh('songbird').count, 6);
      },
    });
    return count;
  };
  const spring = crossings('spring'), autumn = crossings('autumn');
  assert.ok(spring >= 1200 / 30, `${spring} flocks in 20 minutes of spring`);
  assert.ok(autumn >= 0.25 * spring && autumn <= 0.75 * spring, `${autumn} in autumn against ${spring}`);
});

test('the gulls loop over the sea side, 14 to 35 m up, leaning into their loops and flapping a fifth of the time', () => {
  const w = world();
  const d = middleOf(L, 'summer');
  let frames = 0, flapping = 0, leaning = 0;
  const before = [];
  const matrix = new Matrix4();
  w.run(240, d, {
    dt: 0.1,
    each() {
      // Each gull's last two places: the turn's inside is where its way bends (the train stands still here).
      seen(w.mesh('gull')).forEach((b, i) => {
        const [older, old] = before[i] ?? [];
        if (older) {
          const bend = b.position.clone().sub(old).sub(old.clone().sub(older)).setY(0);
          w.mesh('gull').getMatrixAt(i, matrix);
          const wing = new Vector3().setFromMatrixColumn(matrix, 0); // its +X wing
          if (Math.sign(wing.dot(bend)) === -Math.sign(wing.y)) leaning++;
        }
        before[i] = [old, b.position.clone()];
      });
      for (const b of seen(w.mesh('gull'))) {
        const p = fromTrack(w.path, d, b.position);
        assert.ok(p.y >= 14 && p.y <= 35, `${p.y} m up`);
        assert.ok(p.x <= -10, `${p.x.toFixed(1)} m out: on the sea's side, over the shore and the water`);
        assert.ok(b.position.distanceTo(w.camera) > 15);
        frames++;
        if (b.amount > 0.5) flapping++;
      }
    },
  });
  assert.ok(flapping / frames > 0.12 && flapping / frames < 0.3, `flapping ${(100 * flapping / frames).toFixed(0)} % of the time`);
  assert.ok(leaning > 0.98 * (frames - 2 * 4), `the inside wing is the lower one: ${leaning} of ${frames}`);
});

test('when a gull calls one of the gulls flaps and banks, and with no calls they bank now and then on their own', () => {
  const w = world();
  const d = middleOf(L, 'summer');
  w.run(1, d);
  assert.ok(seen(w.mesh('gull')).every((b) => tilt(b) < 0.45), 'level, but for leaning into their loops');
  w.birds.gullCall();
  w.run(0.4, d);
  const banked = seen(w.mesh('gull')).filter((b) => tilt(b) > 0.6);
  assert.equal(banked.length, 1, 'one gull banks');
  assert.ok(banked[0].amount > 0.9, 'and flaps');
  w.run(3, d);
  assert.ok(seen(w.mesh('gull')).every((b) => tilt(b) < 0.45), 'and glides on');

  // The sound off: no calls come, and the gulls bank on their own clock.
  const quiet = world();
  let banks = 0, was = false;
  quiet.run(120, d, {
    dt: 0.05,
    each() {
      const now = seen(quiet.mesh('gull')).some((b) => tilt(b) > 0.6);
      if (now && !was) banks++;
      was = now;
    },
  });
  assert.ok(banks >= 4 && banks <= 12, `${banks} banks in 2 minutes`);

  // A call with no gulls about (spring) is harmless.
  const spring = world();
  spring.run(1, middleOf(L, 'spring'));
  spring.birds.gullCall();
  spring.run(1, middleOf(L, 'spring'));
  assert.equal(spring.mesh('gull').count, 0);
});

test('a gull call is answered by a gull she can see: the one nearest where she is looking', () => {
  const d = middleOf(L, 'summer');
  const ahead = PATH.tangentAt(d), left = PATH.sideAt(d).negate();
  // She looks out over the sea, 40 degrees left of the line and a little up, as ?look=40 does on a portrait phone.
  const view = ahead.clone().multiplyScalar(Math.cos(0.7)).addScaledVector(left, Math.sin(0.7)).setY(0.3).normalize();
  const offView = (b) => b.position.clone().sub(w.camera).normalize().angleTo(view);
  const offLine = (b) => b.position.clone().sub(w.camera).setY(0).normalize().angleTo(ahead);
  const argmin = (list, key) => list.reduce((best, b, i) => (key(b) < key(list[best]) ? i : best), 0);
  const banking = () => seen(w.mesh('gull')).findIndex((b) => tilt(b) > 0.6);

  const w = world();
  w.run(1, d, { view });
  const before = seen(w.mesh('gull'));
  const looked = argmin(before, offView);
  assert.ok(offView(before[looked]) < (20 * Math.PI) / 180, 'a gull is in her view');
  assert.notEqual(argmin(before, offLine), looked, 'and it is not the one nearest the line ahead');
  w.birds.gullCall();
  w.run(0.4, d, { view });
  assert.equal(banking(), looked, 'the gull in her view flaps and banks');

  // Without her view, it is the one nearest the line ahead, where she mostly looks.
  const blind = world();
  blind.run(1, d);
  const nearest = argmin(seen(blind.mesh('gull')), offLine);
  blind.birds.gullCall();
  blind.run(0.4, d);
  assert.equal(seen(blind.mesh('gull')).findIndex((b) => tilt(b) > 0.6), nearest);
});

test('the gulls fly off as summer gives way to autumn, shrinking away to nothing rather than popping out', () => {
  const w = world();
  const boundary = zone(L, 'summer').end;
  const full = BIRDS.GULLS.SIZE;
  let last = null;
  w.run(80 / 6, boundary - 40, {
    dt: 1 / 60,
    speed: 6,
    each() {
      const mesh = w.mesh('gull');
      const now = mesh.visible ? drawn(mesh).map((b) => b.scale) : [];
      if (last && last.length > 0) {
        if (now.length === 0) assert.ok(last.every((s) => s < 0.02 * full), `gone only once they were tiny: ${last}`);
        else now.forEach((s, i) => assert.ok(Math.abs(s - last[i]) < 0.05 * full, 'a little smaller each frame'));
      }
      last = now;
    },
  });
  assert.equal(w.mesh('gull').count, 0, 'none in autumn');
});

test('robins sit on the winter perches 2 to 60 m ahead, three at most, facing the track; none on a thinned prop or out of winter', () => {
  const winter = zone(L, 'winter');
  const perchAt = (d, right, extra = {}) => Object.assign(PATH.frameAt(d, right, 1.06), { rank: 0, zone: 'winter', ...extra });
  const at = 640;
  const perches = [
    perchAt(at + 12, 5), perchAt(at + 20, -5.5, { rank: 0.9 }), perchAt(at + 30, 4.8), perchAt(at + 50, -5),
    perchAt(at + 70, 5), perchAt(winter.end + 50, 5, { zone: 'evening' }),
  ];
  const w = world({ perches });
  w.run(0.5, at);
  const near = (b, p) => Math.hypot(b.position.x - p.x, b.position.z - p.z) < 0.05 && b.position.y > p.y && b.position.y < p.y + 0.4;
  const robins = () => seen(w.mesh('robin'));
  let shown = robins();
  assert.equal(shown.length, 3);
  for (const p of [perches[0], perches[1], perches[2]]) assert.ok(shown.some((b) => near(b, p)), `a robin ${p.distanceTo(w.camera).toFixed(0)} m away`);
  assert.ok(shown.every((b) => b.amount === 0), 'their wings folded');
  const matrix = new Matrix4();
  for (let i = 0; i < 3; i++) {
    w.mesh('robin').getMatrixAt(i, matrix);
    const facing = new Vector3().setFromMatrixColumn(matrix, 2).setY(0).normalize();
    const toTrain = w.camera.clone().sub(shown[i].position).setY(0).normalize();
    assert.ok(facing.dot(toTrain) > 0.95, 'each turned to the train coming');
  }

  // A slow phone draws fewer fences: no robin is left sitting on air.
  w.birds.setDensity(0.5);
  w.run(0.5, at);
  shown = robins();
  assert.ok(!shown.some((b) => near(b, perches[1])) && shown.some((b) => near(b, perches[3])));
  w.birds.setQuality(0.35);
  w.run(0.5, at);
  assert.equal(robins().length, 2, 'and fewer robins');
  w.birds.setQuality(1);
  w.birds.setDensity(1);

  // The train comes within 9 m of the first: it flutters up and away from the track, and is gone.
  w.run(0.3, at + 4);
  const up = robins().find((b) => Math.hypot(b.position.x - perches[0].x, b.position.z - perches[0].z) < 4);
  assert.ok(up && up.position.y > perches[0].y + 0.3 && up.amount === 1, 'up and flapping');
  assert.ok(fromTrack(PATH, at + 4, up.position).x > 5, 'away from the track');
  assert.ok(up.position.distanceTo(w.camera) > 3, 'and never near her');
  w.run(2, at + 4);
  assert.ok(!robins().some((b) => Math.hypot(b.position.x - perches[0].x, b.position.z - perches[0].z) < 10), 'gone');

  // None in the evening, whatever perches there are.
  w.run(1, winter.end + 30);
  assert.equal(w.mesh('robin').count, 0);
});

test('after a jump back along the ride, the robins are back on the perches ahead of her', () => {
  const perchAt = (d, right) => Object.assign(PATH.frameAt(d, right, 1.06), { rank: 0, zone: 'winter' });
  const perches = [perchAt(660, 5), perchAt(680, -5)];
  const onPerch = (w, p) => seen(w.mesh('robin')).some((b) => Math.hypot(b.position.x - p.x, b.position.z - p.z) < 0.05);
  const w = world({ perches });
  w.run(0.5, 640);
  assert.ok(perches.every((p) => onPerch(w, p)), 'both sitting');
  w.run(50 / 6.5, 640, { speed: 6.5 }); // the train rides past both: they fly off
  w.run(2, 690);
  assert.equal(seen(w.mesh('robin')).length, 0, 'both gone');
  // A jump back along the timeline (or Ride again) puts the train 30 m before the first.
  w.run(0.5, 630);
  assert.ok(perches.every((p) => onPerch(w, p)), 'both back on their perches, 30 and 50 m ahead');
});

test('the quality tier thins every kind', () => {
  const counts = (share) => {
    const w = world({ perches: [10, 20, 30, 40].map((k) => Object.assign(PATH.frameAt(640 + k, 5, 1.06), { rank: 0, zone: 'winter' })) });
    w.birds.setQuality(share);
    const most = { songbird: 0, gull: 0, robin: 0 };
    for (const [id, d] of [['spring', middleOf(L, 'spring')], ['summer', middleOf(L, 'summer')], ['winter', 640]]) {
      w.run(id === 'spring' ? 40 : 1, d, { dt: 0.1, each() { for (const k of Object.keys(most)) most[k] = Math.max(most[k], seen(w.mesh(k)).length); } });
    }
    return most;
  };
  assert.deepEqual(counts(1), { songbird: 6, gull: 4, robin: 3 });
  assert.deepEqual(counts(0.7), { songbird: 5, gull: 3, robin: 3 });
  assert.deepEqual(counts(0.35), { songbird: 3, gull: 2, robin: 2 });
});

// ---------------------------------------------------------------------------------------------
// The finale's doves (Task 12): on the station house's ridge until the fireworks, then up and away over the town
// ---------------------------------------------------------------------------------------------

const T = FINALE_TIMES;
const doveIndexes = Array.from({ length: DOVES.COUNT }, (_, i) => i);
const dove = new Vector3();
/** Every dove at each moment from `from` (s into the finale) to a second after they are gone: `visit(t, i, visible)`, `dove` where it is. */
function eachDove(visit, { from = 0, step = 0.05 } = {}) {
  for (let t = from; t <= T.fireworks + DOVES.TIME + 1; t += step) {
    for (const i of doveIndexes) visit(t, i, dovesAt(t, i, dove).visible);
  }
}

test('five doves, which take off at the moment the finale plays its dove sound', () => {
  assert.equal(DOVES.COUNT, 5);
  assert.ok(Object.isFrozen(DOVES));
  const cue = FOLEY_CUES.find((c) => c.name === 'doves');
  assert.equal(DOVES.TAKE_OFF, cue.t);
  assert.equal(DOVES.TAKE_OFF, T.fireworks);
  // Not one moves until then; each has left its perch and is flapping hard half a second after.
  const sat = new Vector3(), early = new Vector3(), away = new Vector3();
  for (const i of doveIndexes) {
    dovesAt(0, i, sat);
    assert.equal(dovesAt(cue.t - 0.01, i, early).flap, 0);
    assert.ok(early.distanceTo(sat) < 1e-9, `dove ${i} has not moved before the cue`);
    assert.ok(dovesAt(cue.t + 0.5, i, away).flap > 0.9, `dove ${i} flaps hard half a second in`);
    assert.ok(away.distanceTo(sat) > 1, `dove ${i} has left its perch by then`);
  }
  // And the first goes at once, as the sound plays.
  dovesAt(0, 0, sat);
  dovesAt(cue.t + 0.1, 0, away);
  assert.ok(away.distanceTo(sat) > 0.2);
});

test('until then they sit on the station house roof\'s ridge, spaced out along it, not flapping', () => {
  const along = [];
  for (const i of doveIndexes) {
    for (const t of [0, 3, T.fireworks - 0.1]) {
      const r = dovesAt(t, i, dove);
      assert.equal(r.visible, true, `dove ${i} at ${t}`);
      assert.equal(r.flap, 0, 'not flapping while it sits');
      // [along, right, up]: on the ridge line, from its top up by a dove's own half height (it is drawn bigger than life).
      assert.ok(dove.x >= RIDGE.ALONG[0] && dove.x <= RIDGE.ALONG[1], `along the ridge: ${dove.x}`);
      assert.ok(Math.abs(dove.y - RIDGE.RIGHT) < 1e-9, `right of the track: ${dove.y}`);
      assert.ok(dove.z >= RIDGE.TOP && dove.z <= RIDGE.TOP + 0.35, `up: ${dove.z} on a ridge ${RIDGE.TOP} high`);
    }
    along.push(dove.x);
  }
  const sorted = [...along].sort((a, b) => a - b);
  for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k] - sorted[k - 1] >= 0.75, `spaced out: ${sorted}`);
  // The quality tier takes the last ones away, so whichever first few are left are spread along the ridge too.
  for (const n of [2, 3]) {
    const some = along.slice(0, n).sort((a, b) => a - b);
    assert.ok(some[some.length - 1] - some[0] >= n, `the first ${n} are spread out: ${some}`);
  }
});

test('they burst up and out, then wheel over the town beyond the track and never come back to the roof', () => {
  const sat = new Vector3(), at = new Vector3();
  for (const i of doveIndexes) {
    dovesAt(0, i, sat);
    const flying = dovesAt(T.fireworks + 1, i, at);
    assert.ok(flying.visible && flying.flap > 0.8, `dove ${i} flaps`);
    let top = 0;
    for (let tau = 0; tau <= 1.5; tau += 0.05) {
      dovesAt(T.fireworks + tau, i, at);
      top = Math.max(top, at.z - sat.z);
    }
    assert.ok(top > 1, `dove ${i} springs up from the roof: ${top} m`);
    dovesAt(T.fireworks + 1, i, at);
    assert.ok(Math.hypot(at.x - sat.x, at.y - sat.y) > 2, `and out: ${Math.hypot(at.x - sat.x, at.y - sat.y)}`);
    // Further and further from where it sat as it goes out over the town...
    let last = 0;
    for (let tau = 0.5; tau <= 2.5; tau += 0.25) {
      dovesAt(T.fireworks + tau, i, at);
      const far = at.distanceTo(sat);
      assert.ok(far > last, `dove ${i} ${tau} s in: ${far} m from its perch, after ${last}`);
      last = far;
    }
    // ... then it wheels over the town (across the track and beyond it), a good way from the roof, up in the sky.
    for (let tau = 3; tau <= DOVES.TIME - 0.05; tau += 0.25) {
      dovesAt(T.fireworks + tau, i, at);
      assert.ok(at.distanceTo(sat) > 15, `dove ${i} ${tau} s in is ${at.distanceTo(sat)} m from its perch`);
      assert.ok(at.y < -5 && at.x > 5, `dove ${i} ${tau} s in is over the town: ${at.toArray()}`);
      assert.ok(at.z > RIDGE.TOP - 2.5 && at.z < RIDGE.TOP + 4, `and flies about the height of the roof: ${at.z}`);
    }
  }
});

test('they are gone by 6 s after take-off, and a moment before that they are still there', () => {
  assert.equal(DOVES.TIME, 6);
  for (const i of doveIndexes) {
    assert.equal(dovesAt(T.fireworks + DOVES.TIME - 0.05, i, dove).visible, true);
    assert.equal(dovesAt(T.fireworks + DOVES.TIME, i, dove).visible, false, `dove ${i} at 6 s`);
    assert.equal(dovesAt(T.fireworks + 6.5, i, dove).visible, false);
    assert.equal(dovesAt(T.fireworks + 30, i, dove).visible, false);
  }
});

test('where a dove is depends only on the finale\'s clock: any order, any skip, the same answer, with nothing allocated', () => {
  const a = new Vector3(), b = new Vector3();
  const times = [9.2, 3, 14, 8.5, 11.1, 0, 9.2];
  const first = times.map((t) => { const r = dovesAt(t, 2, a); return [a.x, a.y, a.z, r.visible, r.flap]; });
  for (let k = times.length - 1; k >= 0; k--) {
    const r = dovesAt(times[k], 2, b);
    assert.deepEqual([b.x, b.y, b.z, r.visible, r.flap], first[k], `at ${times[k]}`);
  }
  // It writes its answer into the result it is handed, so that a frame allocates nothing.
  const into = { visible: false, flap: 0 };
  assert.equal(dovesAt(9.2, 2, a, into), into);
  assert.deepEqual([into.visible, into.flap], [first[0][3], first[0][4]]);
});

test('on their way up they are never inside the roof or the chimney', () => {
  const slope = HOUSE.RISE / ((HOUSE.BACK - HOUSE.FRONT) / 2);
  eachDove((t, i, visible) => {
    if (!visible) return;
    // Over the house, no lower than the roof's surface, which falls away either side of the ridge.
    const over = dove.y > HOUSE.FRONT - 0.3 && dove.y < HOUSE.BACK + 0.3 && dove.x > HOUSE.FROM - 0.3 && dove.x < HOUSE.TO + 0.3;
    if (over) assert.ok(dove.z >= RIDGE.TOP - slope * Math.abs(dove.y - RIDGE.RIGHT), `dove ${i} at ${t} is in the roof: ${dove.toArray()}`);
    const inChimney = dove.x > CHIMNEY.ALONG[0] - 0.4 && dove.x < CHIMNEY.ALONG[1] + 0.4
      && dove.y > CHIMNEY.RIGHT[0] - 0.4 && dove.y < CHIMNEY.RIGHT[1] + 0.4 && dove.z < CHIMNEY.TOP + 0.4;
    assert.ok(!inChimney, `dove ${i} at ${t} is in the chimney: ${dove.toArray()}`);
  });
});

test('they are never in front of the couple\'s faces: always well off the line of sight to them', () => {
  const timeline = createTimeline(finaleTracks(FINALE_PATH, 960));
  const sample = {};
  const camera = new Vector3(), face = new Vector3(), place = new Vector3();
  // Where the two of them stand once he has reached her, their faces about 1.1 m above the platform's 0.6.
  FINALE_PATH.frameAt(960 + 0.8, 3.5, 1.7, face);
  eachDove((t, i, visible) => {
    if (!visible) return;
    timeline.sample(t, sample);
    camera.fromArray(sample.camera);
    FINALE_PATH.frameAt(960 + dove.x, dove.y, dove.z, place);
    const angle = (place.sub(camera).angleTo(new Vector3().copy(face).sub(camera)) * 180) / Math.PI;
    assert.ok(angle > 14, `dove ${i} at ${t} is ${angle.toFixed(1)} degrees from their faces`);
  }, { from: T.fireworks });
});

test('createDoves: one instanced mesh on the birds\' material, each dove drawn where dovesAt puts it', () => {
  assert.equal(createDoves().mesh.instanceMatrix.count, 5, 'five by default');
  const doves = createDoves(3);
  const { mesh } = doves;
  assert.ok(mesh.isInstancedMesh && mesh.material === BIRD_MATERIAL);
  assert.equal(mesh.name, 'birds-dove');
  assert.equal(mesh.instanceMatrix.count, 3);
  assert.equal(mesh.frustumCulled, false);
  assert.ok(mesh.geometry.getAttribute('wing') && mesh.geometry.getAttribute('aFlap').count === 3);
  const matrix = new Matrix4(), at = new Vector3(), want = new Vector3();
  // The mesh's own frame is the station's, the one the station house is built in: x right of the track, y up, z back.
  for (const t of [0, T.fireworks - 0.1, T.fireworks + 0.7, T.fireworks + 2.5, T.fireworks + 5.5]) {
    assert.equal(doves.update(t), 3, `three showing at ${t}`);
    assert.ok(mesh.visible && mesh.count === 3);
    for (let i = 0; i < 3; i++) {
      dovesAt(t, i, want);
      mesh.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix);
      assert.ok(at.distanceTo(want.set(want.y, want.z, -want.x)) < 1e-4, `dove ${i} at ${t}: ${at.toArray()} for ${want.toArray()}`);
    }
  }
  assert.equal(doves.update(T.fireworks + DOVES.TIME), 0);
  assert.ok(!mesh.visible && mesh.count === 0, 'none once they are gone');
  assert.equal(doves.update(T.fireworks + 1), 3, 'and they are back, skipping back along the finale');
});

test('a dove sits with its wings folded down, flaps once it flies, grows as it goes and shrinks to nothing as it is gone', () => {
  const doves = createDoves();
  const { mesh } = doves;
  const flap = mesh.geometry.getAttribute('aFlap');
  const matrix = new Matrix4();
  const scaleOf = (i) => { mesh.getMatrixAt(i, matrix); return new Vector3().setFromMatrixScale(matrix).x; };
  doves.update(T.fireworks - 1);
  const sitting = scaleOf(0);
  for (let i = 0; i < DOVES.COUNT; i++) {
    // Rate 0: the wings hold still, at the bottom of the flap's swing (the sine of the phase is −1), `amount` of the way.
    assert.equal(flap.getY(i), 0, 'no wingbeats');
    assert.ok(Math.abs(Math.sin(flap.getX(i)) + 1) < 1e-6, 'held at the bottom of the swing');
    assert.ok(flap.getZ(i) > 0.5 && flap.getZ(i) < 1, 'folded down against the roof');
  }
  // They fold their wings until the moment each takes off, not a moment before (the first goes at the cue).
  doves.update(T.fireworks - 0.05);
  assert.equal(flap.getY(0), 0, 'still folded a moment before the cue');
  doves.update(T.fireworks + 0.2);
  assert.ok(flap.getY(0) > 0 && flap.getZ(0) > 0.9, 'and flapping a moment after it');
  doves.update(T.fireworks + 1.5);
  for (let i = 0; i < DOVES.COUNT; i++) {
    assert.ok(flap.getY(i) >= 3 && flap.getY(i) <= 6, `wingbeats a second: ${flap.getY(i)}`);
    assert.ok(flap.getZ(i) > 0.6, 'flapping hard');
  }
  assert.ok(scaleOf(0) > sitting * 1.4, 'bigger as it gets further, so that it still reads as a dove on her phone');
  doves.update(T.fireworks + DOVES.TIME - 0.02);
  assert.ok(scaleOf(0) < 0.1 * sitting, 'and almost nothing as it goes');
});

test('a dove points the way it goes: along the ridge to start, then the way it flies', () => {
  const doves = createDoves();
  const matrix = new Matrix4(), forward = new Vector3(), before = new Vector3(), after = new Vector3(), flew = new Vector3();
  const heading = (i) => { doves.mesh.getMatrixAt(i, matrix); return forward.setFromMatrixColumn(matrix, 2).normalize(); };
  doves.update(0);
  for (let i = 0; i < DOVES.COUNT; i++) {
    const h = heading(i);
    assert.ok(Math.abs(h.y) < 1e-6 && Math.abs(h.x) < 1e-6 && Math.abs(Math.abs(h.z) - 1) < 1e-6, `dove ${i} faces along the ridge: ${h.toArray()}`);
  }
  // In the air it points the way it moves (the mesh's frame: x right, y up, z back), its nose never far from level.
  for (const t of [T.fireworks + 2, T.fireworks + 4]) {
    doves.update(t);
    for (let i = 0; i < DOVES.COUNT; i++) {
      const h = heading(i);
      dovesAt(t - 0.05, i, before);
      dovesAt(t + 0.05, i, after);
      flew.set(after.y - before.y, 0, -(after.x - before.x)).normalize();
      assert.ok(new Vector3(h.x, 0, h.z).normalize().dot(flew) > 0.98, `dove ${i} at ${t} points the way it goes: ${h.toArray()} against ${flew.toArray()}`);
      assert.ok(Math.abs(h.y) < 0.6, `dove ${i} at ${t} is nowhere near upright`);
    }
  }
});

test('on the lower tiers fewer doves show (the particles share), the ones left spread along the ridge', () => {
  const counts = [];
  for (const tier of ['low', 'medium', 'high']) {
    const doves = createDoves();
    doves.setQuality(TIERS[tier].particles);
    counts.push(doves.update(T.fireworks - 1));
    assert.equal(doves.mesh.count, counts[counts.length - 1]);
  }
  assert.deepEqual(counts, [2, 4, 5]);
  const none = createDoves();
  none.setQuality(0);
  assert.equal(none.update(T.fireworks + 1), 0);
  assert.ok(!none.mesh.visible);
});
