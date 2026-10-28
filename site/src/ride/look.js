// Looking around: drag to turn your head, plus the field of view that suits the screen.
//
// The controls grab the world: the view follows the finger as if she were pulling the scene by hand, so
// dragging right turns the view left (+yaw) and dragging down tilts it up (+pitch). Both angles are
// clamped, so she cannot turn right round or look straight up or down. After she lets go the view waits
// RETURN_DELAY seconds, then eases back to a rest direction, which the app moves with `setRest`: towards a
// photo sign while the train stands at a stop, straight ahead while it rides.
//
// `createLook` and `fovForAspect` are pure, so the Node unit tests can import this file. Only
// `attachPointerControls` touches the DOM, and only once it is called.

import { clamp, damp } from '../util/math.js';

/** Tuning constants. Angles are radians except the field of view, which is degrees. */
export const LOOK = Object.freeze({
  SENSITIVITY: 0.0055,  // turn per pixel dragged (rad/px)
  YAW_LIMIT: 1.75,      // furthest she can turn either way (about 100 degrees)
  PITCH_MIN: -0.45,     // furthest she can look down
  PITCH_MAX: 0.6,       // furthest she can look up
  RETURN_DELAY: 4,      // how long the view stays where she left it before easing back (s)
  RETURN_RATE: 2.0,     // how fast it eases back (see `damp`; higher is snappier)
  HFOV: 78,             // horizontal field of view to aim for
  VFOV_MIN: 50,         // vertical field of view limits: wide screens stop narrowing at VFOV_MIN ...
  VFOV_MAX: 80,         // ... and tall phones stop widening at VFOV_MAX, so they see less sideways
});

/**
 * @typedef {object} Look
 * @property {number} yaw       how far she has turned, + = left
 * @property {number} pitch     how far she looks up, + = up
 * @property {boolean} dragging a drag is in progress, so the view stays where her finger holds it
 * @property {() => void} beginDrag
 * @property {(dxPx: number, dyPx: number) => void} drag
 *   Turn by how far the pointer moved since the last call (pixels, screen axes: x right, y down).
 *   Does nothing outside a drag.
 * @property {() => void} endDrag  Lets go and starts the RETURN_DELAY wait.
 * @property {(yaw: number, pitch?: number) => void} setRest
 *   Where the view eases back to (`pitch` defaults to level), kept within the same limits as a drag. It never
 *   restarts the wait, so a change while she is idle starts easing straight away.
 * @property {(frameSeconds: number) => void} update
 *   Ease towards the rest once she has been idle for RETURN_DELAY. A frame that is not a positive time is
 *   ignored; a very long one just lands on the rest.
 */

/** @returns {Look} */
export function createLook() {
  let yaw = 0;
  let pitch = 0;
  let restYaw = 0;
  let restPitch = 0;
  let dragging = false;
  let hold = 0;  // seconds still to wait before easing back; 0 once the delay is over (or she never dragged)

  function beginDrag() {
    dragging = true;
  }

  function drag(dxPx, dyPx) {
    if (!dragging) return;
    yaw = clamp(yaw + dxPx * LOOK.SENSITIVITY, -LOOK.YAW_LIMIT, LOOK.YAW_LIMIT);
    pitch = clamp(pitch + dyPx * LOOK.SENSITIVITY, LOOK.PITCH_MIN, LOOK.PITCH_MAX);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    hold = LOOK.RETURN_DELAY;
  }

  function setRest(toYaw, toPitch = 0) {
    restYaw = clamp(toYaw, -LOOK.YAW_LIMIT, LOOK.YAW_LIMIT);
    restPitch = clamp(toPitch, LOOK.PITCH_MIN, LOOK.PITCH_MAX);
  }

  function update(frameSeconds) {
    if (!(frameSeconds > 0) || dragging) return;
    // The wait takes its share of the frame first; only what is left eases, so the delay is exact at any frame rate.
    const waited = Math.min(hold, frameSeconds);
    hold -= waited;
    const easing = frameSeconds - waited;
    if (easing <= 0) return;
    yaw = damp(yaw, restYaw, LOOK.RETURN_RATE, easing);
    pitch = damp(pitch, restPitch, LOOK.RETURN_RATE, easing);
  }

  return {
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get dragging() { return dragging; },
    beginDrag,
    drag,
    endDrag,
    setRest,
    update,
  };
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * The vertical field of view (degrees) that gives a horizontal field of view of HFOV on a screen `aspect` wide
 * for its height, kept within VFOV_MIN..VFOV_MAX. Portrait phones come out at the top of that range; a viewport
 * with no size yet (aspect 0 or NaN) gets VFOV_MAX rather than a NaN camera.
 */
export function fovForAspect(aspect) {
  if (!(aspect > 0)) return LOOK.VFOV_MAX;
  const halfHfov = (LOOK.HFOV / 2) / RAD_TO_DEG;
  return clamp(2 * Math.atan(Math.tan(halfHfov) / aspect) * RAD_TO_DEG, LOOK.VFOV_MIN, LOOK.VFOV_MAX);
}

/**
 * Let a finger or mouse drag on `element` (the canvas) drive `look`. Only the primary pointer counts, so a second
 * finger cannot fight the first, and a mouse only drags with its left button. Scrolling and zooming gestures on
 * the canvas are switched off by its CSS (`touch-action: none`), not here.
 * @param {HTMLElement} element
 * @param {Look} look
 * @returns {() => void} detach: removes the listeners and lets go of a drag in progress
 */
export function attachPointerControls(element, look) {
  let activePointer = null;  // id of the pointer that is dragging, or null
  let lastX = 0;
  let lastY = 0;

  function onDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    // A new touch simply takes over from a drag whose release never arrived (say, the app was backgrounded),
    // so the controls cannot be left stuck.
    activePointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    try {
      // Capture keeps the moves and the release coming when the pointer leaves the canvas.
      element.setPointerCapture(event.pointerId);
    } catch {
      // The pointer has already gone. Dragging works without capture, so carry on.
    }
    look.beginDrag();
  }

  function onMove(event) {
    if (event.pointerId !== activePointer) return;
    look.drag(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onEnd(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    look.endDrag();
  }

  const listeners = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onEnd],
    ['pointercancel', onEnd],
    ['lostpointercapture', onEnd],
  ];
  for (const [type, handler] of listeners) element.addEventListener(type, handler);

  return function detach() {
    for (const [type, handler] of listeners) element.removeEventListener(type, handler);
    if (activePointer !== null) {
      activePointer = null;
      look.endDrag();
    }
  };
}
