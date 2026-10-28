// Looking around by moving the phone: how a phone's orientation becomes a look, and the tilt she turns on and off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTilt, deviceLook, TILT } from '../../site/src/ride/tilt.js';
import { LOOK } from '../../site/src/ride/look.js';

const near = (actual, expected, tolerance, message) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${message || ''} expected ${expected}, got ${actual}`,
);

const DEG = Math.PI / 180;

// --- deviceLook ---

test('the phone held upright in portrait, facing ahead, looks straight ahead and level', () => {
  const { yaw, pitch } = deviceLook(0, 90, 0, 0);
  near(yaw, 0, 1e-9);
  near(pitch, 0, 1e-9);
});

test('turning left 30 degrees turns the view left (+yaw)', () => {
  const { yaw, pitch } = deviceLook(30, 90, 0, 0);
  near(yaw, 0.5236, 1e-4);
  near(pitch, 0, 1e-9);
});

test('tilting the top of the phone back 20 degrees looks up (+pitch)', () => {
  const { yaw, pitch } = deviceLook(0, 110, 0, 0);
  near(pitch, 0.349, 1e-3);
  near(yaw, 0, 1e-9);
});

// Landscape (Review Focus 5). The phone upright with its screen facing her, looking where portrait's (0, 90, 0) looks:
// - screen angle 90, turned a quarter anticlockwise (its top to her left): its x axis points up, its top points left,
//   which is alpha 90, beta 0, gamma −90;
// - screen angle 270, turned a quarter clockwise (its top to her right): its x axis points down, its top points right,
//   which is alpha 270, beta 0, gamma 90.
// (The same beta and gamma with alpha 0 are those poses turned a quarter to the right or left: see the next test.)
test('held upright in landscape either way, facing the way portrait faces, the view is level and straight ahead', () => {
  const ahead = deviceLook(0, 90, 0, 0);
  for (const [alpha, beta, gamma, screenAngle] of [[90, 0, -90, 90], [270, 0, 90, 270]]) {
    const { yaw, pitch } = deviceLook(alpha, beta, gamma, screenAngle);
    near(pitch, 0, 1e-9, `pitch at screen angle ${screenAngle}:`);
    near(yaw, ahead.yaw, 1e-6, `yaw at screen angle ${screenAngle}:`);
  }
});

test('alpha 0 in landscape is the same upright phone turned a quarter: right at screen angle 90, left at 270', () => {
  const right = deviceLook(0, 0, -90, 90);
  near(right.pitch, 0, 1e-9);
  near(right.yaw, -Math.PI / 2, 1e-9);
  const left = deviceLook(0, 0, 90, 270);
  near(left.pitch, 0, 1e-9);
  near(left.yaw, Math.PI / 2, 1e-9);
});

test('in landscape, turning left still turns the view left, and rolling the screen to face up looks down', () => {
  near(deviceLook(120, 0, -90, 90).yaw, 30 * DEG, 1e-9);
  near(deviceLook(300, 0, 90, 270).yaw, 30 * DEG, 1e-9);
  near(deviceLook(90, 0, -70, 90).pitch, -20 * DEG, 1e-9);
  near(deviceLook(270, 0, 70, 270).pitch, -20 * DEG, 1e-9);
});

test('yaw is wrapped to ±π', () => {
  near(deviceLook(200, 90, 0, 0).yaw, -160 * DEG, 1e-9);
  for (let alpha = 0; alpha < 360; alpha += 15) {
    const { yaw } = deviceLook(alpha, 90, 0, 0);
    assert.ok(yaw >= -Math.PI && yaw <= Math.PI, `alpha ${alpha} gave yaw ${yaw}`);
  }
});

// --- createTilt ---

/**
 * A stand-in for `window`: DeviceOrientationEvent (with requestPermission when `permission` is given, answering it),
 * the screen's angle as window.orientation, a document that can be hidden, and a clock that only moves when told.
 * `turn(alpha, beta, gamma)` sends a reading to whoever listens for one.
 */
function fakeWindow({ permission, orientation = 0, hasEvent = true } = {}) {
  const listeners = {};
  const on = (table) => ({
    addEventListener(type, fn) { (table[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { if (table[type]) table[type].delete(fn); },
  });
  const docListeners = {};
  const document = {
    hidden: false,
    ...on(docListeners),
    fire(type) { for (const fn of docListeners[type] || []) fn({ type }); },
  };
  let now = 0;
  let timers = [];
  const win = {
    orientation,
    document,
    asked: 0,
    ...on(listeners),
    setTimeout(fn, ms) {
      const timer = { fn, at: now + ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timers = timers.filter((t) => t !== timer); },
    /** Moves the clock on `ms`, running every timer that comes due. */
    advance(ms) {
      now += ms;
      for (const timer of timers.filter((t) => t.at <= now)) {
        timers = timers.filter((t) => t !== timer);
        timer.fn();
      }
    },
    turn(alpha, beta, gamma) {
      for (const fn of listeners.deviceorientation || []) fn({ type: 'deviceorientation', alpha, beta, gamma });
    },
    listening: () => (listeners.deviceorientation ? listeners.deviceorientation.size : 0),
  };
  if (hasEvent) {
    win.DeviceOrientationEvent = function DeviceOrientationEvent() {};
    if (permission !== undefined) {
      win.DeviceOrientationEvent.requestPermission = () => {
        win.asked += 1;
        return typeof permission === 'function' ? permission() : Promise.resolve(permission);
      };
    }
  }
  return win;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Turns tilt on with the phone upright in portrait, facing ahead (the first reading is straight ahead). */
async function tiltOn(win) {
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  await tick();
  win.turn(0, 90, 0);
  assert.equal(await enabled, 'on');
  return tilt;
}

test('available is whether the browser has DeviceOrientationEvent', () => {
  assert.equal(createTilt({ win: fakeWindow() }).available, true);
  assert.equal(createTilt({ win: fakeWindow({ hasEvent: false }) }).available, false);
});

test('it starts off, looking straight ahead', () => {
  const tilt = createTilt({ win: fakeWindow() });
  assert.equal(tilt.state, 'off');
  assert.equal(tilt.yaw, 0);
  assert.equal(tilt.pitch, 0);
});

test('iOS is asked inside her tap: enable calls requestPermission before it returns', () => {
  const win = fakeWindow({ permission: 'granted' });
  const tilt = createTilt({ win });
  tilt.enable();
  assert.equal(win.asked, 1);
});

test("'denied' when she says no: it stays off and listens for nothing", async () => {
  const win = fakeWindow({ permission: 'denied' });
  const tilt = createTilt({ win });
  assert.equal(await tilt.enable(), 'denied');
  assert.equal(tilt.state, 'off');
  assert.equal(win.listening(), 0);
});

test("'denied' too when asking fails (no tap behind it, say)", async () => {
  const win = fakeWindow({ permission: () => Promise.reject(new Error('NotAllowedError')) });
  const tilt = createTilt({ win });
  assert.equal(await tilt.enable(), 'denied');
  assert.equal(tilt.state, 'off');
});

test(`'silent' when no reading comes within ${TILT.WAIT} ms: it turns itself off`, async () => {
  const win = fakeWindow({ permission: 'granted' });
  const tilt = createTilt({ win });
  let result = null;
  tilt.enable().then((r) => { result = r; });
  await tick();
  assert.equal(win.listening(), 1);
  win.turn(null, null, null); // a browser with no sensor behind it sends one empty reading
  win.advance(TILT.WAIT - 1);
  await tick();
  assert.equal(result, null, 'still waiting');
  win.advance(1);
  await tick();
  assert.equal(result, 'silent');
  assert.equal(tilt.state, 'off');
  assert.equal(win.listening(), 0);
});

test("without requestPermission (Android) it listens at once, and is 'on' at the first reading", async () => {
  const win = fakeWindow();
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  await tick();
  assert.equal(tilt.state, 'off', 'not before a reading');
  win.turn(0, 90, 0);
  assert.equal(await enabled, 'on');
  assert.equal(tilt.state, 'on');
});

test('a second tap while it waits for the first reading changes nothing', async () => {
  const win = fakeWindow({ permission: 'granted' });
  const tilt = createTilt({ win });
  const first = tilt.enable();
  const second = tilt.enable();
  assert.equal(second, first);
  assert.equal(win.asked, 1);
  await tick();
  assert.equal(win.listening(), 1);
  win.turn(0, 90, 0);
  assert.equal(await first, 'on');
});

test('the first reading is straight ahead, and turning from there turns the view', async () => {
  const win = fakeWindow({ permission: 'granted' });
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  await tick();
  win.turn(50, 80, 0); // held turned a little and tipped forward: that is straight ahead now
  await enabled;
  tilt.update(10);
  near(tilt.yaw, 0, 1e-9);
  near(tilt.pitch, 0, 1e-9);
  win.turn(80, 90, 0); // 30 degrees left and 10 up from there
  tilt.update(10);
  near(tilt.yaw, 30 * DEG, 1e-9);
  near(tilt.pitch, 10 * DEG, 1e-9);
});

test('the view follows the phone smoothly, not in one jump', async () => {
  const win = fakeWindow();
  const tilt = await tiltOn(win);
  win.turn(30, 90, 0);
  tilt.update(1 / 60);
  near(tilt.yaw, 30 * DEG * (1 - Math.exp(-TILT.SMOOTHING / 60)), 1e-9);
  tilt.update(0); // a frame of no time moves nothing
  near(tilt.yaw, 30 * DEG * (1 - Math.exp(-TILT.SMOOTHING / 60)), 1e-9);
});

test("readings are clamped to the look's limits", async () => {
  const win = fakeWindow();
  const tilt = await tiltOn(win);
  win.turn(150, 90, 0);
  tilt.update(10);
  near(tilt.yaw, LOOK.YAW_LIMIT, 1e-9);
  win.turn(-150 + 360, 90, 0);
  tilt.update(10);
  near(tilt.yaw, -LOOK.YAW_LIMIT, 1e-9);
  win.turn(0, 170, 0); // tipped right back, looking almost straight up
  tilt.update(10);
  near(tilt.pitch, LOOK.PITCH_MAX, 1e-9);
  win.turn(0, 10, 0); // almost flat, looking almost straight down
  tilt.update(10);
  near(tilt.pitch, LOOK.PITCH_MIN, 1e-9);
});

test("it follows the screen's rotation: in landscape, turning left still turns the view left", async () => {
  const win = fakeWindow({ orientation: 90 });
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  await tick();
  win.turn(90, 0, -90);
  await enabled;
  win.turn(120, 0, -90);
  tilt.update(10);
  near(tilt.yaw, 30 * DEG, 1e-9);
  near(tilt.pitch, 0, 1e-9);
  win.orientation = -90; // she turns the phone round the other way: window.orientation says -90 for 270
  win.turn(300, 0, 90);
  tilt.update(10);
  near(tilt.yaw, 30 * DEG, 1e-9);
  near(tilt.pitch, 0, 1e-9);
});

test('without window.orientation it reads screen.orientation.angle', async () => {
  const win = fakeWindow();
  delete win.orientation;
  win.screen = { orientation: { angle: 270 } };
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  await tick();
  win.turn(270, 0, 90);
  await enabled;
  win.turn(270, 0, 70); // the screen rolled 20 degrees to face up: she looks down
  tilt.update(10);
  near(tilt.pitch, -20 * DEG, 1e-9);
  near(tilt.yaw, 0, 1e-9);
});

test('it pauses while the page is hidden, and takes a fresh straight ahead when it returns', async () => {
  const win = fakeWindow();
  const tilt = await tiltOn(win);
  win.turn(30, 90, 0);
  tilt.update(10);
  near(tilt.yaw, 30 * DEG, 1e-9);
  win.document.hidden = true;
  win.document.fire('visibilitychange');
  win.turn(60, 90, 0);
  tilt.update(10);
  near(tilt.yaw, 30 * DEG, 1e-9, 'readings while hidden are ignored:');
  win.document.hidden = false;
  win.document.fire('visibilitychange');
  win.turn(90, 100, 0); // however she holds it now is straight ahead
  tilt.update(10);
  near(tilt.yaw, 0, 1e-9);
  near(tilt.pitch, 0, 1e-9);
  win.turn(100, 100, 0);
  tilt.update(10);
  near(tilt.yaw, 10 * DEG, 1e-9);
  assert.equal(tilt.state, 'on');
});

test('disable stops listening, and the view eases back to straight ahead', async () => {
  const win = fakeWindow();
  const tilt = await tiltOn(win);
  win.turn(30, 90, 0);
  tilt.update(10);
  tilt.disable();
  assert.equal(tilt.state, 'off');
  assert.equal(win.listening(), 0);
  tilt.update(1 / 60);
  assert.ok(tilt.yaw > 0 && tilt.yaw < 30 * DEG, 'eases rather than jumps');
  tilt.update(10);
  near(tilt.yaw, 0, 1e-9);
});

test('on again after off takes a fresh straight ahead', async () => {
  const win = fakeWindow();
  const tilt = await tiltOn(win);
  win.turn(30, 90, 0);
  tilt.disable();
  const enabled = tilt.enable();
  await tick();
  win.turn(60, 90, 0);
  assert.equal(await enabled, 'on');
  tilt.update(10);
  near(tilt.yaw, 0, 1e-9);
});

test("turned off while it waits, the wait ends as 'off' and a late reading does not turn it on", async () => {
  const win = fakeWindow({ permission: 'granted' });
  const tilt = createTilt({ win });
  const enabled = tilt.enable();
  tilt.disable(); // before iOS has even answered
  assert.equal(await enabled, 'off');
  win.turn(0, 90, 0);
  assert.equal(tilt.state, 'off');
  assert.equal(win.listening(), 0);
});

test('without DeviceOrientationEvent, enable is a quiet no', async () => {
  const tilt = createTilt({ win: fakeWindow({ hasEvent: false }) });
  assert.equal(await tilt.enable(), 'silent');
  assert.equal(tilt.state, 'off');
});
