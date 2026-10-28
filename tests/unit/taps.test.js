// Hidden taps (site/src/ride/taps.js): telling a tap from a drag, finding what she tapped along the ray, and the
// router that turns a point on the screen into a reaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from '../../site/src/three.js';
import { TAP, createTapRouter, isTap, pickTarget } from '../../site/src/ride/taps.js';

/** A target that stands at `at` (or nowhere, when `at` is null) and counts its reactions. */
function target(name, at, radius = 0.1) {
  const t = {
    name,
    radius,
    reactions: [],
    position: (out) => (at ? out.copy(at) : null),
    react(now, fx) { t.reactions.push({ now, fx }); },
  };
  return t;
}

const ORIGIN = new Vector3(0, 0, 0);
const AHEAD = new Vector3(0, 0, -1);

test('a drag that comes back to where it began is not a tap', () => {
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 120 }, { x: 0, y: 0, t: 240 }]), false);
});

test('a short still touch is a tap; a long press is not', () => {
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 4, y: 3, t: 90 }]), true);
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 600 }]), false);
});

test('the nearest target on the ray wins; behind her never', () => {
  const near = target('near', new Vector3(0, 0, -5));
  const far = target('far', new Vector3(0, 0, -20));
  assert.equal(pickTarget(ORIGIN, AHEAD, [far, near]), near);
  assert.equal(pickTarget(ORIGIN, AHEAD, [near, far]), near);
  assert.equal(pickTarget(ORIGIN, AHEAD, [target('behind', new Vector3(0, 0, 5))]), null);
});

test('far targets are hit within MIN_ANGLE even when tiny', () => {
  const off = 0.05;
  const balloon = target('balloon', new Vector3(Math.sin(off) * 180, 0, -Math.cos(off) * 180), 0.1);
  assert.equal(pickTarget(ORIGIN, AHEAD, [balloon]), balloon);
});

test('the cooldown keeps a mashed tap to one reaction', () => {
  const cord = target('cord', new Vector3(0, 0, -1));
  const router = createTapRouter({ camera: camera(), element: screen(), sources: [() => [cord]], fx: noFx() });
  assert.equal(router.tap(200, 400, 10), 'cord');
  assert.equal(router.tap(200, 400, 10.4), 'cord');
  assert.equal(router.tap(201, 401, 11.4), 'cord');
  assert.equal(cord.reactions.length, 1);
  router.tap(200, 400, 10 + TAP.COOLDOWN + 0.01);
  assert.equal(cord.reactions.length, 2, 'it answers again once the cooldown is over');
});

// Beyond the brief.

/** A camera at the origin looking down -Z, as tall as `screen()`. */
function camera() {
  const c = new PerspectiveCamera(60, 400 / 800, 0.1, 400);
  c.updateMatrixWorld(true);
  return c;
}

/** Stands in for the canvas: 400 × 800 CSS px, `left`, `top` from the page's corner. */
function screen(left = 0, top = 0) {
  return { getBoundingClientRect: () => ({ left, top, width: 400, height: 800 }) };
}

const noFx = () => ({ play() {}, burst() {} });

test('TAP holds the brief\'s numbers', () => {
  assert.deepEqual({ ...TAP }, { SLOP: 10, TIME: 350, MIN_ANGLE: 0.06, COOLDOWN: 1.5 });
  assert.ok(Object.isFrozen(TAP));
});

test('isTap: a touch exactly SLOP away and TIME long still counts; one pixel or millisecond more does not', () => {
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 6, y: 8, t: TAP.TIME }]), true);
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: TAP.SLOP + 1, y: 0, t: 10 }]), false);
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: TAP.TIME + 1 }]), false);
  assert.equal(isTap([{ x: 5, y: 5, t: 0 }]), true, 'a touch released where and when it began');
  assert.equal(isTap([]), false);
});

test('pickTarget: a near target is hit within its radius, and missed beyond it', () => {
  // 1 m ahead, 0.08 m to the side: 0.08 rad off the ray, past MIN_ANGLE, so only the radius can catch it.
  const cord = target('cord', new Vector3(0.08, 0, -1), 0.1);
  assert.equal(pickTarget(ORIGIN, AHEAD, [cord]), cord);
  const thin = target('thin', new Vector3(0.08, 0, -1), 0.05);
  assert.equal(pickTarget(ORIGIN, AHEAD, [thin]), null);
});

test('pickTarget skips targets that are not showing', () => {
  const hidden = target('hidden', null);
  const shown = target('shown', new Vector3(0, 0, -30));
  assert.equal(pickTarget(ORIGIN, AHEAD, [hidden, shown]), shown);
  assert.equal(pickTarget(ORIGIN, AHEAD, [hidden]), null);
});

test('the router casts the ray through the tapped point of the canvas, wherever the canvas sits', () => {
  const cam = camera();
  // A target up and to the left of the middle of the view, and one in the middle.
  const left = new Vector3(-0.5, 0.5, -3);
  const ndc = left.clone().project(cam);
  const leftTarget = target('left', left, 0.05);
  const middle = target('middle', new Vector3(0, 0, -3), 0.05);
  const element = screen(30, 50);
  const router = createTapRouter({ camera: cam, element, sources: [() => [middle], () => [leftTarget]], fx: noFx() });
  const x = 30 + ((ndc.x + 1) / 2) * 400;
  const y = 50 + ((1 - ndc.y) / 2) * 800;
  assert.equal(router.tap(x, y, 0), 'left');
  assert.equal(router.tap(30 + 200, 50 + 400, 0), 'middle');
});

test('the router hands a reaction the time of the tap and the effects', () => {
  const fx = noFx();
  const lamp = target('lamp', new Vector3(0, 0, -2));
  const router = createTapRouter({ camera: camera(), element: screen(), sources: [() => [lamp]], fx });
  router.tap(200, 400, 7.5);
  assert.equal(lamp.reactions.length, 1);
  assert.equal(lamp.reactions[0].now, 7.5);
  assert.equal(lamp.reactions[0].fx, fx);
});

test('the cooldown is kept per target name', () => {
  const a = target('a', new Vector3(-0.3, 0, -2), 0.1);
  const b = target('b', new Vector3(0.3, 0, -2), 0.1);
  const cam = camera();
  const router = createTapRouter({ camera: cam, element: screen(), sources: [() => [a, b]], fx: noFx() });
  const at = (v) => {
    const p = v.clone().project(cam);
    return [((p.x + 1) / 2) * 400, ((1 - p.y) / 2) * 800];
  };
  router.tap(...at(new Vector3(-0.3, 0, -2)), 0);
  router.tap(...at(new Vector3(0.3, 0, -2)), 0.2);
  assert.equal(a.reactions.length, 1);
  assert.equal(b.reactions.length, 1, 'a tap on one target does not hold up another');
});

test('a tap that hits nothing goes to the fallback with its ray, and returns null', () => {
  const rays = [];
  const router = createTapRouter({
    camera: camera(),
    element: screen(),
    sources: [() => [target('far-left', new Vector3(-50, 0, -10))]],
    fx: noFx(),
    fallback: (ray, now) => rays.push({ origin: ray.origin.clone(), direction: ray.direction.clone(), now }),
  });
  assert.equal(router.tap(200, 400, 3), null);
  assert.equal(rays.length, 1);
  assert.ok(rays[0].origin.length() < 1e-9);
  assert.ok(rays[0].direction.distanceTo(AHEAD) < 1e-9, 'the ray runs through the middle of the view');
  assert.equal(rays[0].now, 3);
  // Without a fallback a miss is simply nothing.
  const quiet = createTapRouter({ camera: camera(), element: screen(), sources: [], fx: noFx() });
  assert.equal(quiet.tap(200, 400, 0), null);
});

test('a tap on a target that is still cooling down is still its own: it neither reacts nor falls through', () => {
  let fellThrough = 0;
  const cord = target('cord', new Vector3(0, 0, -1));
  const router = createTapRouter({
    camera: camera(), element: screen(), sources: [() => [cord]], fx: noFx(), fallback: () => { fellThrough += 1; },
  });
  router.tap(200, 400, 0);
  assert.equal(router.tap(200, 400, 0.5), 'cord');
  assert.equal(cord.reactions.length, 1);
  assert.equal(fellThrough, 0);
});

test('a canvas with no size yet takes no taps', () => {
  const cord = target('cord', new Vector3(0, 0, -1));
  const element = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
  const router = createTapRouter({ camera: camera(), element, sources: [() => [cord]], fx: noFx() });
  assert.equal(router.tap(0, 0, 0), null);
  assert.equal(cord.reactions.length, 0);
});

test('debugTargets: where each showing target in front of her is on the canvas, in CSS px', () => {
  const cam = camera();
  const router = createTapRouter({
    camera: cam,
    element: screen(30, 50),
    sources: [
      () => [target('middle', new Vector3(0, 0, -3)), target('hidden', null)],
      () => [target('behind', new Vector3(0, 0, 3))],
    ],
    fx: noFx(),
  });
  const spots = router.debugTargets();
  assert.deepEqual(spots.map((s) => s.name), ['middle']);
  assert.ok(Math.abs(spots[0].x - 230) < 1e-6 && Math.abs(spots[0].y - 450) < 1e-6, JSON.stringify(spots[0]));
});

// The cabin hides the world (Task 14): a tap on the dashboard or a pillar never reaches a balloon behind it.

/** A square `size` m across, facing her, `z` m down the view and `x` m to the side: a piece of the cabin's body. */
function wall(z, size = 0.1, x = 0) {
  const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial());
  mesh.position.set(x, 0, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** A target that belongs to the cabin itself, which the cabin's body never hides. */
const aboard = (name, at, radius) => Object.assign(target(name, at, radius), { aboard: true });

test('pickTarget: beyond `hiddenBeyond` (where the cabin is in the way) only the cabin\'s own targets count', () => {
  const balloon = target('balloon', new Vector3(0, 0, -12), 1.5);
  const lantern = aboard('lantern', new Vector3(0, 0, -0.7), 0.1);
  assert.equal(pickTarget(ORIGIN, AHEAD, [balloon], 0.6), null);
  assert.equal(pickTarget(ORIGIN, AHEAD, [balloon], 20), balloon);
  assert.equal(pickTarget(ORIGIN, AHEAD, [balloon, lantern], 0.6), lantern);
  const moth = target('moth', new Vector3(0, 0, -0.4), 0.1);
  assert.equal(pickTarget(ORIGIN, AHEAD, [balloon, moth], 0.6), moth, 'a world target in front of the cabin still counts');
});

test('a tap on the cabin\'s body does not reach a world target behind it; with the body out of the way, it does', () => {
  const dash = wall(-0.6);
  const balloon = target('balloon', new Vector3(0, 0, -12), 1.5);
  const router = createTapRouter({ camera: camera(), element: screen(), sources: [() => [balloon]], blockers: [dash], fx: noFx() });
  assert.equal(router.tap(200, 400, 0), null, 'the tap lands on the dashboard');
  assert.equal(balloon.reactions.length, 0);
  // A hidden cabin (the finale) hides nothing.
  dash.visible = false;
  assert.equal(router.tap(200, 400, 1), 'balloon');
  dash.visible = true;
  // Nor does a piece of the cabin off to the side of the tap.
  dash.position.x = 2;
  dash.updateMatrixWorld(true);
  assert.equal(router.tap(200, 400, 5), 'balloon');
  assert.equal(balloon.reactions.length, 2);
});

test('the cabin never hides its own targets, and a tap on its body is not a tap on the world: no fallback', () => {
  let fellThrough = 0;
  const lantern = aboard('lantern', new Vector3(0, 0, -0.7), 0.1);
  const sources = [() => [lantern]];
  const router = createTapRouter({ camera: camera(), element: screen(), sources, blockers: [wall(-0.6)], fx: noFx(), fallback: () => { fellThrough += 1; } });
  assert.equal(router.tap(200, 400, 0), 'lantern');
  sources.length = 0;
  assert.equal(router.tap(200, 400, 5), null);
  assert.equal(fellThrough, 0, 'the fireflies do not scatter from a tap on the dashboard');
  assert.equal(router.tap(399, 400, 10), null);
  assert.equal(fellThrough, 1, 'but do from one beside it');
});

test('debugTargets says which targets the cabin hides from her', () => {
  const router = createTapRouter({
    camera: camera(),
    element: screen(),
    sources: [() => [
      target('behind-the-dash', new Vector3(0, 0, -12), 1.5),
      target('beside-it', new Vector3(1.5, 0, -12), 1.5),
      aboard('lantern', new Vector3(0, 0, -0.7), 0.1),
    ]],
    blockers: [wall(-0.6)],
    fx: noFx(),
  });
  const hidden = Object.fromEntries(router.debugTargets().map((t) => [t.name, t.hidden]));
  assert.deepEqual(hidden, { 'behind-the-dash': true, 'beside-it': false, lantern: false });
});

// Fix round 1: a tap inside a target's own sphere counts before one that finds a nearer target only through its cone.

test('pickTarget: a target the ray passes inside the radius of beats a nearer one it only finds through the cone', () => {
  // 30 m out: a small thing a little nearer and lower, whose cone takes in the bigger one's whole sphere.
  const pet = target('pet', new Vector3(0, -0.7, -29.55), 0.35);
  const couple = target('couple', new Vector3(0, 0, -30), 0.85);
  assert.equal(pickTarget(ORIGIN, AHEAD, [pet, couple]), couple, 'aimed at the couple');
  assert.equal(pickTarget(ORIGIN, new Vector3(0, -0.7, -29.55).normalize(), [pet, couple]), pet, 'aimed at the pet');
  // With only cone hits, the nearest still wins; with only sphere hits, too.
  const far = target('far', new Vector3(0.5, 0, -100), 0.1);
  const farther = target('farther', new Vector3(-0.5, 0, -120), 0.1);
  assert.equal(pickTarget(ORIGIN, AHEAD, [farther, far]), far);
  assert.equal(pickTarget(ORIGIN, AHEAD, [target('b', new Vector3(0, 0, -9), 0.5), target('a', new Vector3(0, 0, -5), 0.5)]).name, 'a');
});
