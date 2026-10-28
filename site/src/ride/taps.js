// Hidden taps: some things in the world answer when she taps them. A touch on the 3D view still turns her head
// (look.js); one that ends as a tap (released within SLOP of where it came down, within TIME) also casts a ray from
// her eye through the point she tapped, and the nearest tappable thing along it answers: the whistle cord tugs and
// the train whistles, the lantern flares.
//
// Each tappable thing has a generous invisible hit shape: a sphere `radius` round its position, so a fingertip need
// not land on a thin cord exactly, and for things far off (a balloon, a gull) a cone MIN_ANGLE either side of the
// ray, so even a tiny one is easy to tap. Each answers at most once per COOLDOWN, so mashing a tap does not stack
// sounds past the node budget.
//
// A tappable animates itself and asks for its effects (a sound, a burst of hearts) through the TapEffects it is
// handed, so the world modules never import the sound or the hearts.
//
// `isTap` and `pickTarget` are pure; `createTapRouter` needs only a camera and something with a bounding rect (the
// canvas), so the Node unit tests can import this file.

import { Raycaster, Vector2, Vector3 } from '../three.js';

/** SLOP: how far a tap may stray (CSS px). TIME: how long it may last (ms). MIN_ANGLE: the far targets' cone (rad). COOLDOWN (s). */
export const TAP = Object.freeze({ SLOP: 10, TIME: 350, MIN_ANGLE: 0.06, COOLDOWN: 1.5 });

/**
 * @typedef {object} TapEffects  what a reaction can ask for: the app makes it once
 * @property {(name: string) => void} play  a one-shot sound (audio/sfx.js), if the sound is on
 * @property {(at: Vector3) => void} burst  a little burst of hearts at a point in the world
 */

/**
 * @typedef {object} Tappable  something in the world she can tap
 * @property {string} name  what it is; reactions cool down per name, and the app reports the last one hit
 * @property {(out: Vector3) => Vector3|null} position  where it is in the world, written into `out`; null when it is
 *   not showing
 * @property {number} radius  its hit sphere (m)
 * @property {(now: number, fx: TapEffects) => void} react  it answers a tap at `now` (s, the app's clock)
 */

/**
 * Whether a touch that followed `path` (screen points, CSS px, and their times, ms, in order) is a tap: it never
 * strayed more than SLOP from where it came down, and lasted no longer than TIME. A drag that came back to where it
 * began is not one.
 * @param {Array<{ x: number, y: number, t: number }>} path
 */
export function isTap(path) {
  if (path.length === 0) return false;
  const first = path[0];
  if (path[path.length - 1].t - first.t > TAP.TIME) return false;
  return path.every((p) => Math.hypot(p.x - first.x, p.y - first.y) <= TAP.SLOP);
}

const toTarget = new Vector3();
const spot = new Vector3();

/**
 * The target a ray from `origin` along `direction` (a unit vector) hits: one whose position is within its radius of
 * the ray, or within MIN_ANGLE of it. Only targets ahead count, and the nearest along the ray wins.
 * @param {Vector3} origin
 * @param {Vector3} direction
 * @param {Tappable[]} targets
 * @returns {Tappable|null}
 */
export function pickTarget(origin, direction, targets) {
  let best = null;
  let bestAlong = Infinity;
  for (const target of targets) {
    if (!target.position(spot)) continue;
    toTarget.subVectors(spot, origin);
    const along = toTarget.dot(direction);
    if (!(along > 0) || along >= bestAlong) continue;
    const off = Math.sqrt(Math.max(0, toTarget.lengthSq() - along * along));
    if (off <= target.radius || Math.atan2(off, along) <= TAP.MIN_ANGLE) {
      best = target;
      bestAlong = along;
    }
  }
  return best;
}

/**
 * Turns her taps on the canvas into reactions.
 * @param {{
 *   camera: import('../three.js').Camera,
 *   element: { getBoundingClientRect: () => { left: number, top: number, width: number, height: number } },
 *   sources: Array<() => Tappable[]>,
 *   fx: TapEffects,
 *   fallback?: (ray: import('../three.js').Ray, now: number) => void,
 * }} options  `element` is the canvas the camera draws into. Each of `sources` gives the targets one part of the
 *   world has now. `fallback` hears the taps that hit nothing (the fireflies scatter from them).
 * @returns {{ tap: (clientX: number, clientY: number, now: number) => string|null,
 *             debugTargets: () => Array<{ name: string, x: number, y: number }> }}
 *   `tap` finds what is at that point of the page (CSS px) and has it react at `now` (s), unless it reacted less
 *   than COOLDOWN ago. It returns the name of the target hit, cooling down or not, or null when it hit none.
 *   `debugTargets` says where each showing target in front of her is on the page (CSS px), for tests.
 */
export function createTapRouter({ camera, element, sources, fx, fallback }) {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  /** @type {Map<string, number>} when each target (by name) last reacted */
  const reacted = new Map();
  /** @type {Tappable[]} every target now, gathered afresh for each tap */
  const targets = [];

  function gather() {
    targets.length = 0;
    for (const source of sources) for (const target of source()) targets.push(target);
    return targets;
  }

  return {
    tap(clientX, clientY, now) {
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      const { ray } = raycaster;
      const hit = pickTarget(ray.origin, ray.direction, gather());
      targets.length = 0;
      if (!hit) {
        if (fallback) fallback(ray, now);
        return null;
      }
      const last = reacted.get(hit.name);
      if (last === undefined || now - last >= TAP.COOLDOWN) {
        reacted.set(hit.name, now);
        hit.react(now, fx);
      }
      return hit.name;
    },

    debugTargets() {
      const rect = element.getBoundingClientRect();
      const spots = [];
      for (const target of gather()) {
        if (!target.position(spot)) continue;
        // Behind her, a point projects onto the screen all the same; it is left out instead.
        if (camera.worldToLocal(toTarget.copy(spot)).z >= 0) continue;
        spot.project(camera);
        spots.push({
          name: target.name,
          x: rect.left + ((spot.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - spot.y) / 2) * rect.height,
        });
      }
      targets.length = 0;
      return spots;
    },
  };
}
