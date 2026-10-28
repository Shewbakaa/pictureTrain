import test from 'node:test';
import assert from 'node:assert/strict';
import { createLook, fovForAspect, attachPointerControls, LOOK } from '../../site/src/ride/look.js';
import { TAP } from '../../site/src/ride/taps.js';

const settle = (l, s) => { for (let t = 0; t < s; t += 1 / 60) l.update(1 / 60); };

test('drag turns the view (grab the world)', () => {
  const l = createLook();
  l.beginDrag(); l.drag(100, 0);
  assert.ok(Math.abs(l.yaw - 100 * LOOK.SENSITIVITY) < 1e-9);
  l.drag(0, 50);
  assert.ok(l.pitch > 0);
});

test('clamps yaw and pitch', () => {
  const l = createLook();
  l.beginDrag(); l.drag(1e6, 1e6);
  assert.equal(l.yaw, LOOK.YAW_LIMIT);
  assert.equal(l.pitch, LOOK.PITCH_MAX);
  l.drag(-1e7, -1e7);
  assert.equal(l.yaw, -LOOK.YAW_LIMIT);
  assert.equal(l.pitch, LOOK.PITCH_MIN);
});

test('eases back to rest only after the delay', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0); l.endDrag();
  const y = l.yaw;
  settle(l, LOOK.RETURN_DELAY * 0.9);
  assert.equal(l.yaw, y);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw) < 0.01);
});

test('no return while dragging', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 200 * LOOK.SENSITIVITY) < 1e-9);
});

test('setRest retargets', () => {
  const l = createLook();
  l.setRest(0.75);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 0.75) < 0.01);
});

test('fovForAspect', () => {
  assert.equal(fovForAspect(390 / 844), 80);
  assert.equal(fovForAspect(16 / 9), 50);
  assert.ok(Math.abs(fovForAspect(1) - 78) < 0.1);
});

// --- the look controller, beyond the brief's six ---

test('dragging follows beginDrag and endDrag, and moves outside a drag are ignored', () => {
  const l = createLook();
  assert.equal(l.dragging, false);
  l.drag(100, 100);
  assert.equal(l.yaw, 0);
  assert.equal(l.pitch, 0);
  l.beginDrag();
  assert.equal(l.dragging, true);
  l.endDrag();
  assert.equal(l.dragging, false);
  l.drag(100, 100);
  assert.equal(l.yaw, 0);
  assert.equal(l.pitch, 0);
});

test('endDrag outside a drag does not restart the delay', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0); l.endDrag();
  settle(l, LOOK.RETURN_DELAY + 0.5);
  l.endDrag();
  const y = l.yaw;
  settle(l, 0.2);
  assert.ok(l.yaw < y);
});

test('every release restarts the delay, even a touch that never moved', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0); l.endDrag();
  settle(l, LOOK.RETURN_DELAY * 0.9);
  l.beginDrag(); l.endDrag();
  const y = l.yaw;
  settle(l, LOOK.RETURN_DELAY * 0.9);
  assert.equal(l.yaw, y);
  settle(l, LOOK.RETURN_DELAY * 0.5);
  assert.ok(l.yaw < y);
});

test('setRest during the delay does not restart it', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0); l.endDrag();
  const y = l.yaw;
  settle(l, LOOK.RETURN_DELAY * 0.5);
  l.setRest(-0.5);
  settle(l, LOOK.RETURN_DELAY * 0.4);
  assert.equal(l.yaw, y);
  settle(l, LOOK.RETURN_DELAY * 0.4);
  assert.ok(l.yaw < y);
});

test('setRest while dragging waits for the release and the delay', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0);
  l.setRest(-0.5);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 200 * LOOK.SENSITIVITY) < 1e-9);
  l.endDrag();
  settle(l, LOOK.RETURN_DELAY + 5);
  assert.ok(Math.abs(l.yaw + 0.5) < 0.01);
});

test('setRest takes a pitch, which defaults to level', () => {
  const l = createLook();
  l.setRest(0.2, 0.3);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 0.2) < 0.01);
  assert.ok(Math.abs(l.pitch - 0.3) < 0.01);
  l.setRest(0.2);
  settle(l, 5);
  assert.ok(Math.abs(l.pitch) < 0.01);
});

test('setRest keeps the rest within the look limits', () => {
  const l = createLook();
  l.setRest(10, 10);
  settle(l, 10);
  assert.ok(l.yaw <= LOOK.YAW_LIMIT && l.yaw > LOOK.YAW_LIMIT - 0.01);
  assert.ok(l.pitch <= LOOK.PITCH_MAX && l.pitch > LOOK.PITCH_MAX - 0.01);
  l.setRest(-10, -10);
  settle(l, 20);
  assert.ok(l.yaw >= -LOOK.YAW_LIMIT && l.yaw < -LOOK.YAW_LIMIT + 0.01);
  assert.ok(l.pitch >= LOOK.PITCH_MIN && l.pitch < LOOK.PITCH_MIN + 0.01);
});

test('a long frame lands on the rest without overshooting', () => {
  const l = createLook();
  l.setRest(0.75, 0.2);
  l.update(60);
  assert.equal(l.yaw, 0.75);
  assert.equal(l.pitch, 0.2);
});

test('update ignores frames that are not positive times', () => {
  const l = createLook();
  l.setRest(0.75);
  l.update(0); l.update(-1); l.update(NaN);
  assert.equal(l.yaw, 0);
});

test('easing does not depend on the frame rate', () => {
  const seconds = LOOK.RETURN_DELAY + 1;
  const after = (fps) => {
    const l = createLook();
    l.beginDrag(); l.drag(200, 0); l.endDrag();
    for (let i = 0; i < Math.round(seconds * fps); i++) l.update(1 / fps);
    return l.yaw;
  };
  const expected = 200 * LOOK.SENSITIVITY * Math.exp(-LOOK.RETURN_RATE * (seconds - LOOK.RETURN_DELAY));
  for (const fps of [20, 30, 60, 144]) assert.ok(Math.abs(after(fps) - expected) < 1e-6, `${fps} fps`);
});

// --- field of view ---

test('fovForAspect keeps the horizontal field of view between the clamps', () => {
  for (const aspect of [1, 1.2, 1.5, 1.7]) {
    const vfov = fovForAspect(aspect);
    const hfov = (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    assert.ok(Math.abs(hfov - LOOK.HFOV) < 1e-9, `aspect ${aspect}`);
  }
});

test('fovForAspect grows as the screen gets taller and stays within the clamps', () => {
  let previous = Infinity;
  for (const aspect of [0.3, 0.46, 0.56, 0.75, 1, 1.4, 1.78, 2.2, 3]) {
    const vfov = fovForAspect(aspect);
    assert.ok(vfov >= LOOK.VFOV_MIN && vfov <= LOOK.VFOV_MAX, `aspect ${aspect}`);
    assert.ok(vfov <= previous, `aspect ${aspect}`);
    previous = vfov;
  }
});

test('fovForAspect copes with a viewport that has no size yet', () => {
  assert.equal(fovForAspect(0), LOOK.VFOV_MAX);
  assert.equal(fovForAspect(NaN), LOOK.VFOV_MAX);
  assert.equal(fovForAspect(-1), LOOK.VFOV_MAX);
  assert.equal(fovForAspect(Infinity), LOOK.VFOV_MIN);
});

// --- pointer wiring ---

/** Stands in for the canvas: an EventTarget that records pointer capture; `fire` sends it a pointer event. */
function fakeCanvas({ refuseCapture = false } = {}) {
  const el = new EventTarget();
  el.captured = [];
  el.setPointerCapture = (id) => {
    if (refuseCapture) throw new Error('NotFoundError');
    el.captured.push(id);
  };
  el.fire = (type, fields = {}) => {
    const event = new Event(type);
    // Defined rather than assigned: an Event's timeStamp has only a getter.
    const all = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0, timeStamp: 0, ...fields };
    for (const [key, value] of Object.entries(all)) Object.defineProperty(event, key, { value });
    return el.dispatchEvent(event);
  };
  return el;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('a touch drag turns the look and lets go on release', () => {
  const el = fakeCanvas();
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointermove', { clientX: 50, clientY: 50 });
  assert.equal(l.yaw, 0);
  el.fire('pointerdown', { clientX: 100, clientY: 300 });
  assert.equal(l.dragging, true);
  assert.deepEqual(el.captured, [1]);
  el.fire('pointermove', { clientX: 150, clientY: 280 });
  assert.ok(near(l.yaw, 50 * LOOK.SENSITIVITY));
  assert.ok(near(l.pitch, -20 * LOOK.SENSITIVITY));
  el.fire('pointermove', { clientX: 160, clientY: 280 });
  assert.ok(near(l.yaw, 60 * LOOK.SENSITIVITY));
  el.fire('pointerup', { clientX: 160, clientY: 280 });
  assert.equal(l.dragging, false);
  el.fire('pointermove', { clientX: 400, clientY: 400 });
  assert.ok(near(l.yaw, 60 * LOOK.SENSITIVITY));
});

test('a mouse drags with the left button only', () => {
  const el = fakeCanvas();
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointerdown', { pointerType: 'mouse', button: 2 });
  assert.equal(l.dragging, false);
  el.fire('pointermove', { pointerType: 'mouse', clientX: 50 });
  assert.equal(l.yaw, 0);
  el.fire('pointerdown', { pointerType: 'mouse', button: 0 });
  el.fire('pointermove', { pointerType: 'mouse', clientX: 150 });
  assert.ok(near(l.yaw, 150 * LOOK.SENSITIVITY));
  el.fire('pointerup', { pointerType: 'mouse' });
  assert.equal(l.dragging, false);
});

test('only the primary pointer drags, so a second finger is ignored', () => {
  const el = fakeCanvas();
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointerdown', { pointerId: 1, clientX: 100 });
  el.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 300 });
  assert.deepEqual(el.captured, [1]);
  el.fire('pointermove', { pointerId: 2, isPrimary: false, clientX: 500 });
  assert.equal(l.yaw, 0);
  el.fire('pointerup', { pointerId: 2, isPrimary: false });
  assert.equal(l.dragging, true);
  el.fire('pointermove', { pointerId: 1, clientX: 110 });
  assert.ok(near(l.yaw, 10 * LOOK.SENSITIVITY));
  el.fire('pointerup', { pointerId: 1 });
  assert.equal(l.dragging, false);
});

test('a cancelled pointer or lost capture ends the drag', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const el = fakeCanvas();
    const l = createLook();
    attachPointerControls(el, l);
    el.fire('pointerdown');
    el.fire(type);
    assert.equal(l.dragging, false, type);
  }
});

test('a new touch takes over a drag whose release never arrived', () => {
  const el = fakeCanvas();
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointerdown', { pointerId: 1, clientX: 0 });
  el.fire('pointerdown', { pointerId: 2, clientX: 100 });
  el.fire('lostpointercapture', { pointerId: 1 });
  assert.equal(l.dragging, true);
  el.fire('pointermove', { pointerId: 2, clientX: 110 });
  assert.ok(near(l.yaw, 10 * LOOK.SENSITIVITY));
  el.fire('pointerup', { pointerId: 2 });
  assert.equal(l.dragging, false);
});

test('dragging still works when pointer capture is refused', () => {
  const el = fakeCanvas({ refuseCapture: true });
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointerdown', { clientX: 0 });
  el.fire('pointermove', { clientX: 40 });
  assert.equal(l.dragging, true);
  assert.ok(near(l.yaw, 40 * LOOK.SENSITIVITY));
});

test('detach removes the listeners and lets go of a drag in progress', () => {
  const el = fakeCanvas();
  const l = createLook();
  const detach = attachPointerControls(el, l);
  el.fire('pointerdown');
  detach();
  assert.equal(l.dragging, false);
  el.fire('pointerdown');
  el.fire('pointermove', { clientX: 100 });
  assert.equal(l.dragging, false);
  assert.equal(l.yaw, 0);
  assert.doesNotThrow(detach);
});

// --- taps (Task 13) ---

/** Pointer controls on a fake canvas, with every tap they report kept in `taps`. */
function tapping() {
  const el = fakeCanvas();
  const look = createLook();
  const taps = [];
  attachPointerControls(el, look, { onTap: (x, y) => taps.push([x, y]) });
  return { el, look, taps };
}

test('a still touch is a tap, at the point she let go; a drag is not', () => {
  const t = tapping();
  t.el.fire('pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
  t.el.fire('pointermove', { clientX: 103, clientY: 202, timeStamp: 1040 });
  t.el.fire('pointerup', { clientX: 104, clientY: 203, timeStamp: 1090 });
  assert.deepEqual(t.taps, [[104, 203]]);
  assert.equal(t.look.dragging, false);

  const d = tapping();
  d.el.fire('pointerdown', { clientX: 100, clientY: 200, timeStamp: 0 });
  d.el.fire('pointermove', { clientX: 160, clientY: 200, timeStamp: 60 });
  d.el.fire('pointerup', { clientX: 160, clientY: 200, timeStamp: 120 });
  assert.deepEqual(d.taps, []);
  assert.ok(d.look.yaw > 0, 'the drag still turns the view');
});

test('a drag that comes back to where it began is not a tap: the furthest point counts, not the net move', () => {
  const t = tapping();
  t.el.fire('pointerdown', { clientX: 100, clientY: 200, timeStamp: 0 });
  t.el.fire('pointermove', { clientX: 140, clientY: 200, timeStamp: 80 });
  t.el.fire('pointermove', { clientX: 101, clientY: 200, timeStamp: 160 });
  t.el.fire('pointerup', { clientX: 100, clientY: 200, timeStamp: 200 });
  assert.deepEqual(t.taps, []);
});

test('a long press is not a tap, nor a touch that wanders past SLOP', () => {
  const t = tapping();
  t.el.fire('pointerdown', { clientX: 0, clientY: 0, timeStamp: 0 });
  t.el.fire('pointerup', { clientX: 0, clientY: 0, timeStamp: TAP.TIME + 50 });
  t.el.fire('pointerdown', { clientX: 0, clientY: 0, timeStamp: 1000 });
  t.el.fire('pointermove', { clientX: TAP.SLOP + 2, clientY: 0, timeStamp: 1020 });
  t.el.fire('pointerup', { clientX: TAP.SLOP + 2, clientY: 0, timeStamp: 1040 });
  assert.deepEqual(t.taps, []);
  // A touch within SLOP and TIME after them is a tap all the same: nothing carries over from the last.
  t.el.fire('pointerdown', { clientX: 50, clientY: 50, timeStamp: 2000 });
  t.el.fire('pointerup', { clientX: 50, clientY: 50, timeStamp: 2100 });
  assert.deepEqual(t.taps, [[50, 50]]);
});

test('a cancelled touch or lost capture is never a tap', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const t = tapping();
    t.el.fire('pointerdown', { timeStamp: 0 });
    t.el.fire(type, { timeStamp: 10 });
    t.el.fire('pointerup', { timeStamp: 20 });
    assert.deepEqual(t.taps, [], type);
  }
});

test('only the primary pointer taps, and the controls work as before without onTap', () => {
  const t = tapping();
  t.el.fire('pointerdown', { pointerId: 1, timeStamp: 0 });
  t.el.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 300, timeStamp: 10 });
  t.el.fire('pointerup', { pointerId: 2, isPrimary: false, clientX: 300, timeStamp: 20 });
  assert.deepEqual(t.taps, []);
  t.el.fire('pointerup', { pointerId: 1, timeStamp: 30 });
  assert.deepEqual(t.taps, [[0, 0]]);

  const el = fakeCanvas();
  const l = createLook();
  attachPointerControls(el, l);
  el.fire('pointerdown', { timeStamp: 0 });
  assert.doesNotThrow(() => el.fire('pointerup', { timeStamp: 10 }));
  assert.equal(l.dragging, false);
});
