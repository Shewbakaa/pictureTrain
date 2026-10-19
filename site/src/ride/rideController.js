// The ride: a pure state machine that moves the train along the track.
//
//   idle --start()--> moving --reaches a stop--> stopped --continue()--> moving --> ... --> finale
//
// The train speeds up to a cruising speed, brakes along a steady-deceleration curve so that it comes to
// rest exactly on each photo stop, waits there until `continue()`, and ends at the finale. Pausing eases
// the train to a halt and back up to speed. `jumpTo(i)` puts the train on a stop it has already reached
// and `restart()` sends it back to the beginning. Distances are metres along the track (see
// world/layout.js), times are seconds.
//
// The app calls `update(dt)` once per animation frame with real seconds, mirrors the getters into
// `appState`, and reacts to the events. The state is always up to date before an event fires, so a
// handler may call `continue()` (or any other method) straight away. The one exception is a handler of
// the `arrive` that `jumpTo` fires: `jumpTo` always leaves the train parked, so a `continue()` there is
// ignored.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { clamp } from '../util/math.js';

/** Motion constants. */
export const RIDE = Object.freeze({
  CRUISE: 6.5,       // top speed (m/s)
  ACCEL: 1.0,        // speeding up (m/s^2)
  BRAKE: 1.2,        // slowing down into a stop (m/s^2)
  MAX_DT: 0.1,       // longest frame that counts (s): after a backgrounded tab, one long frame is only this
  ARRIVE_EPS: 0.05,  // this close to a stop (or the finale) the train settles onto it and arrives (m)
  PAUSE_EASE: 0.5,   // time to ease to a halt, or back up to speed, when pausing and resuming (s)
});

/**
 * @typedef {'idle'|'moving'|'stopped'|'finale'} RideState
 *   idle: not started (or restarted). moving: between stops. stopped: waiting at a stop. finale: reached the end.
 * @typedef {{ index: number, jumped: boolean }} ArriveEvent
 *   The train is now standing at stop `index`; `jumped` is true when `jumpTo` put it there rather than the ride.
 * @typedef {{ index: number }} DepartEvent  The train has left stop `index`.
 * @typedef {{}} FinaleEvent                  The train has reached the finale.
 *
 * @typedef {object} Ride
 * @property {RideState} state
 * @property {number} distance      metres along the track
 * @property {number} speed         m/s the train is making right now: 0 when standing still or held by a pause
 * @property {number} stopIndex     the stop the train is standing at while `stopped`, otherwise -1
 * @property {number} nextStopIndex the stop it will stop at next; -1 when only the finale is ahead
 * @property {number} reachedMax    the highest stop it has stood at, -1 for none; `restart` keeps it
 * @property {boolean} paused       what `setPaused` last asked for (the train may still be easing to a halt)
 * @property {() => void} start     idle -> moving; no-op in any other state
 * @property {() => void} continue
 *   stopped -> moving, emitting `depart`; no-op in any other state (and while a jump's `arrive` is being delivered)
 * @property {(paused: boolean) => void} setPaused
 * @property {(index: number) => boolean} jumpTo
 *   Put the train on stop `index`, from any state, if `0 <= index <= reachedMax`; emits `arrive` with `jumped: true`.
 *   When it returns true the train is `stopped` on that stop, even if a handler tried to `continue()` meanwhile.
 * @property {() => void} restart   back to distance 0 and `idle`, keeping `reachedMax` and the handlers
 * @property {(frameSeconds: number) => void} update
 * @property {(event: 'arrive'|'depart'|'finale', handler: (payload: ArriveEvent|DepartEvent|FinaleEvent) => void) => () => void} on
 *   Returns the function that removes the handler again.
 */

/**
 * @param {object} options
 * @param {number[]} options.stops          distance of each photo stop, ascending (`layout.stops.map((s) => s.distance)`)
 * @param {number} options.finaleDistance   where the ride ends
 * @param {number} [options.speedScale=1]   time-warp for debugging, > 0: everything runs this many times faster
 * @param {number} [options.startDistance=0]
 * @param {number} [options.reachedMax=-1]
 * @returns {Ride}
 */
export function createRide({ stops, finaleDistance, speedScale = 1, startDistance = 0, reachedMax = -1 }) {
  const lastStop = stops.length - 1;
  const listeners = new Map([['arrive', []], ['depart', []], ['finale', []]]);

  /** The first stop clearly ahead of `d`; a train standing on a stop is about to leave it. -1 if none. */
  function firstStopAhead(d) {
    for (let i = 0; i < stops.length; i++) {
      if (stops[i] > d + RIDE.ARRIVE_EPS) return i;
    }
    return -1;
  }

  let state = 'idle';
  let distance = startDistance;
  let v = 0;                // m/s along the track before the pause factor; `speed` is what is left after it
  let pauseFactor = 1;      // 1 = running, 0 = held still; eases between the two over PAUSE_EASE
  let paused = false;
  let stopIndex = -1;
  let nextStopIndex = firstStopAhead(startDistance);
  let reached = Math.min(reachedMax, lastStop);
  let jumping = false;      // true while a jump's `arrive` event is being delivered

  function emit(event, payload) {
    for (const entry of listeners.get(event).slice()) {
      if (entry.active) entry.fn(payload);
    }
  }

  /** Put the train at rest on stop `index`. All state is set before the event fires. */
  function settleAtStop(index, jumped) {
    distance = stops[index];
    v = 0;
    state = 'stopped';
    stopIndex = index;
    nextStopIndex = index < lastStop ? index + 1 : -1;
    reached = Math.max(reached, index);
    emit('arrive', { index, jumped });
  }

  function settleAtFinale() {
    distance = finaleDistance;
    v = 0;
    state = 'finale';
    stopIndex = -1;
    nextStopIndex = -1;
    emit('finale', {});
  }

  function update(frameSeconds) {
    if (!(frameSeconds > 0)) return;     // 0, negative or NaN: nothing happened
    const dt = Math.min(frameSeconds, RIDE.MAX_DT) * speedScale;

    // The pause eases whatever the train is doing, so it keeps ramping while it waits at a stop. It scales
    // the movement (`v * pauseFactor` below), not `v`, which keeps following its acceleration and braking
    // limits underneath: resuming ramps the train back up to the speed it would have by now.
    pauseFactor = clamp(pauseFactor + (paused ? -dt : dt) / RIDE.PAUSE_EASE, 0, 1);
    if (state !== 'moving') return;

    const target = nextStopIndex >= 0 ? stops[nextStopIndex] : finaleDistance;
    const remaining = target - distance;
    v = Math.min(v + RIDE.ACCEL * dt, RIDE.CRUISE, Math.sqrt(2 * RIDE.BRAKE * Math.max(remaining, 0)));
    distance += v * pauseFactor * dt;
    if (target - distance > RIDE.ARRIVE_EPS) return;

    // Close enough, or a long frame carried it to or past the target: sit exactly on it, never beyond.
    if (nextStopIndex >= 0) settleAtStop(nextStopIndex, false);
    else settleAtFinale();
  }

  function start() {
    if (state === 'idle') state = 'moving';
  }

  function continueRide() {
    if (state !== 'stopped' || jumping) return;
    const index = stopIndex;
    state = 'moving';
    stopIndex = -1;
    emit('depart', { index });
  }

  function setPaused(value) {
    paused = Boolean(value);
  }

  function jumpTo(index) {
    if (!Number.isInteger(index) || index < 0 || index > reached) return false;
    // Once `jumpTo` returns true the train is parked on the stop, whatever its handlers do: a handler that
    // calls `continue()` while the jump's `arrive` is being delivered is ignored. (Arrivals by motion are
    // different: there a handler's `continue()` sets the train going again.)
    const wasJumping = jumping;
    jumping = true;
    try {
      settleAtStop(index, true);
    } finally {
      jumping = wasJumping;
    }
    return true;
  }

  function restart() {
    state = 'idle';
    distance = 0;
    v = 0;
    stopIndex = -1;
    nextStopIndex = firstStopAhead(0);
  }

  function on(event, fn) {
    const list = listeners.get(event);
    if (!list) throw new Error(`Unknown ride event "${event}"`);
    const entry = { fn, active: true };
    list.push(entry);
    return () => {
      entry.active = false;
      const at = list.indexOf(entry);
      if (at >= 0) list.splice(at, 1);
    };
  }

  return {
    get state() { return state; },
    get distance() { return distance; },
    get speed() { return v * pauseFactor; },
    get stopIndex() { return stopIndex; },
    get nextStopIndex() { return nextStopIndex; },
    get reachedMax() { return reached; },
    get paused() { return paused; },
    start,
    continue: continueRide,
    setPaused,
    jumpTo,
    restart,
    update,
    on,
  };
}
