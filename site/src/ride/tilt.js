// Looking around by moving the phone. With tilt on, the view follows how she turns and tips her phone, as if it were
// a window onto the world: turn it left and the view turns left, tip its top back and she looks up. How she held it
// when she turned tilt on is "straight ahead", so she can sit however she likes. It rides on top of her drags (look.js):
// the app adds the two, so a drag still turns her head, and only the drag part eases back to its rest after the wait;
// the tilt part stays, since the phone is where she is looking.
//
// The phone tells the page its orientation in 'deviceorientation' events: alpha (turned round the vertical), beta
// (tipped forward and back) and gamma (rolled sideways), in degrees. iOS asks her first, and only from inside a tap,
// so `enable` asks before anything else. Some browsers have the event but no sensor behind it: if no reading comes
// within TILT.WAIT, tilt turns itself off again. It is off while the page is away, and on its return however she
// holds the phone becomes straight ahead again.
//
// `deviceLook` and `createTilt` are pure: Node's tests hand `createTilt` a stand-in for `window`, and nothing here
// touches the page until `enable` is called.

import { Euler, Quaternion, Vector3 } from '../three.js';
import { clamp, damp } from '../util/math.js';
import { LOOK } from './look.js';

/** Tuning constants. */
export const TILT = Object.freeze({
  SMOOTHING: 12, // how closely the view follows the phone (see `damp`; higher is snappier, lower hides more jitter)
  WAIT: 1000,    // how long to wait for the first reading before deciding the phone is not sending any (ms)
});

const DEG = Math.PI / 180;

// Scratch for deviceLook.
const euler = new Euler();
const pose = new Quaternion();
const screenTurn = new Quaternion();
const SCREEN_AXIS = new Vector3(0, 0, 1);
/** A quarter turn back about x: the camera looks out of the back of the phone, not out of its top. */
const OUT_OF_THE_BACK = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

/**
 * Where a phone held at (`alpha`, `beta`, `gamma`) looks, with its screen turned `screenAngle` (degrees, all of them):
 * `yaw` (radians, + is left, within ±π) and `pitch` (radians, + is up). This is three.js's DeviceOrientationControls
 * maths: the Euler (beta, alpha, −gamma, 'YXZ') is the phone in three's axes (y up), a quarter turn back about x looks
 * out of its back, and −screenAngle about z undoes the screen's rotation. How far the phone is rolled about the line
 * of sight is left out: the horizon stays level.
 * @param {number} alpha
 * @param {number} beta
 * @param {number} gamma
 * @param {number} screenAngle  0 portrait, 90 turned anticlockwise (its top to her left), 270 (or −90) clockwise
 * @returns {{ yaw: number, pitch: number }}
 */
export function deviceLook(alpha, beta, gamma, screenAngle) {
  euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
  pose.setFromEuler(euler).multiply(OUT_OF_THE_BACK).multiply(screenTurn.setFromAxisAngle(SCREEN_AXIS, -screenAngle * DEG));
  euler.setFromQuaternion(pose, 'YXZ');
  return { yaw: wrapAngle(euler.y), pitch: euler.x };
}

/** `a` (radians) brought within ±π. */
function wrapAngle(a) {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

/**
 * @typedef {object} Tilt
 * @property {boolean} available  whether this browser has DeviceOrientationEvent at all (the button shows only if so)
 * @property {'off'|'on'} state   'on' from the first reading after `enable`
 * @property {number} yaw         how far she has turned the phone from straight ahead (rad, + is left), smoothed and
 *   kept within LOOK's limits
 * @property {number} pitch       how far she has tipped it up from straight ahead (rad, + is up), the same way
 * @property {() => Promise<'on'|'denied'|'silent'|'off'>} enable
 *   Turns tilt on, asking iOS first. 'on' at the first reading, which is straight ahead; 'denied' if she (or the
 *   browser) said no; 'silent' if no reading came within TILT.WAIT; 'off' if `disable` was called meanwhile. Anything
 *   but 'on' leaves it off. Called again while it waits, it hands back the same promise.
 * @property {() => void} disable  Turns it off: the view eases back to straight ahead.
 * @property {(frameSeconds: number) => void} update  Eases the view towards where the phone points.
 */

/**
 * @param {{ win?: Window }} [options]  the page's window (a stand-in in the tests)
 * @returns {Tilt}
 */
export function createTilt({ win = window } = {}) {
  const available = Boolean(win) && 'DeviceOrientationEvent' in win;
  /** @type {'off'|'on'} */
  let state = 'off';
  let wanted = false;    // she has asked for it and not turned it off since
  let pending = null;    // enable()'s promise while it has no answer yet
  let waiting = null;    // the wait for the first reading: { timer, finish(result) }
  let ahead = null;      // straight ahead, { yaw, pitch }: the first reading since it went on or the page came back
  let away = false;      // the page is hidden
  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;

  /** The screen's rotation (degrees). window.orientation first: Safari before 16.4 has nothing else. */
  function screenAngle() {
    if (typeof win.orientation === 'number') return win.orientation;
    const orientation = win.screen && win.screen.orientation;
    return orientation && typeof orientation.angle === 'number' ? orientation.angle : 0;
  }

  function onReading(event) {
    const { alpha, beta, gamma } = event;
    // A browser with the event but no sensor behind it sends an empty reading (nulls); that is no reading at all.
    if (away || !Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const now = deviceLook(alpha, beta, gamma, screenAngle());
    if (!ahead) {
      ahead = now;
      if (waiting) {
        state = 'on';
        waiting.finish('on');
      }
    }
    targetYaw = clamp(wrapAngle(now.yaw - ahead.yaw), -LOOK.YAW_LIMIT, LOOK.YAW_LIMIT);
    targetPitch = clamp(now.pitch - ahead.pitch, LOOK.PITCH_MIN, LOOK.PITCH_MAX);
  }

  function onVisibility() {
    away = Boolean(win.document.hidden);
    if (!away) ahead = null; // however she holds the phone when she comes back is straight ahead
  }

  /** Listens for readings until the first comes ('on') or TILT.WAIT passes without one ('silent'). */
  function firstReading() {
    if (!wanted) return Promise.resolve('off');
    ahead = null;
    away = Boolean(win.document.hidden);
    win.addEventListener('deviceorientation', onReading);
    win.document.addEventListener('visibilitychange', onVisibility);
    return new Promise((resolve) => {
      const timer = win.setTimeout(() => waiting.finish('silent'), TILT.WAIT);
      waiting = {
        timer,
        finish(result) {
          win.clearTimeout(timer);
          waiting = null;
          resolve(result);
        },
      };
    });
  }

  /** Stops listening and lets the view ease back to straight ahead. */
  function stop() {
    state = 'off';
    ahead = null;
    targetYaw = 0;
    targetPitch = 0;
    win.removeEventListener('deviceorientation', onReading);
    win.document.removeEventListener('visibilitychange', onVisibility);
  }

  /** Asks iOS for the motion sensors (true if granted). Elsewhere there is no one to ask. */
  function askPermission() {
    const ask = win.DeviceOrientationEvent.requestPermission;
    if (typeof ask !== 'function') return Promise.resolve(true);
    try {
      return Promise.resolve(ask.call(win.DeviceOrientationEvent)).then((answer) => answer === 'granted', () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function enable() {
    if (!available) return Promise.resolve('silent');
    if (state === 'on') return Promise.resolve('on');
    wanted = true;
    if (pending) return pending;
    // iOS only shows its question from inside her tap, so it is asked first, with nothing awaited before it.
    pending = askPermission()
      .then((granted) => (granted ? firstReading() : 'denied'))
      .then((result) => {
        pending = null;
        if (result !== 'on') {
          wanted = false;
          stop();
        }
        return result;
      });
    return pending;
  }

  function disable() {
    wanted = false;
    if (waiting) waiting.finish('off');
    stop();
  }

  function update(frameSeconds) {
    if (!(frameSeconds > 0)) return;
    yaw = damp(yaw, targetYaw, TILT.SMOOTHING, frameSeconds);
    pitch = damp(pitch, targetPitch, TILT.SMOOTHING, frameSeconds);
  }

  return {
    get available() { return available; },
    get state() { return state; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    enable,
    disable,
    update,
  };
}
