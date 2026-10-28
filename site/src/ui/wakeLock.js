// Keeps the screen on while she rides. A phone dims and locks its screen after a minute or so, and a ride is
// longer than that, with a card to read at every stop. The browser's Screen Wake Lock holds the screen on, but
// only while the page is showing: it lets go of the lock when she switches away, so the lock is asked for again
// each time the page comes back. It is never given up on purpose: she may sit on the finale card reading.
//
// Not every browser has it (iOS before 16.4 does not), and a browser may refuse it (a phone short of battery
// does). Neither matters to the ride, so neither is an error; the screen just dims as it always would.

/**
 * 'held': the screen is being kept on. 'off': it is not at the moment (before the first answer, or the browser
 * has let the lock go while the page was away). 'refused': the browser said no. 'none': it has no Wake Lock API.
 * @typedef {'held'|'none'|'refused'|'off'} WakeLockState
 */

/**
 * Asks the browser to keep the screen on, now and every time the page comes back into view. Call it while her tap
 * on Begin is being handled, as a browser may want a tap behind the request.
 * @param {{ nav?: { wakeLock?: { request: (type: 'screen') => Promise<EventTarget> } }, doc?: Document }} [options]
 * @returns {{ readonly state: WakeLockState }}
 */
export function keepAwake({ nav = navigator, doc = document } = {}) {
  const api = nav && nav.wakeLock;
  if (!api || typeof api.request !== 'function') return { get state() { return 'none'; } };

  /** @type {WakeLockState} */
  let state = 'off';
  let asking = false; // a request is waiting for its answer
  let current = null; // the lock last granted

  async function ask() {
    if (asking) return;
    asking = true;
    try {
      const sentinel = await api.request('screen');
      current = sentinel;
      state = 'held';
      // The browser lets the lock go when the page is hidden, and the lock says so: it is not held then.
      sentinel.addEventListener('release', () => { if (current === sentinel) state = 'off'; });
    } catch {
      state = 'refused';
    } finally {
      asking = false;
    }
  }

  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) ask(); });
  ask();
  return { get state() { return state; } };
}
