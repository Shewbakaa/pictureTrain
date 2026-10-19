// A tiny keyframe timeline, for the finale's choreography (finale.js).
//
// A track is a list of keys, each a time and a value: a number or an array of numbers (a position). Between two
// keys the value is interpolated component by component, eased with the later key's ease. Before the first key
// a track holds the first value and after the last key it holds the last one, so every track has a value at any
// time. Events are named moments; `events(prevT, t)` says which ones fall in (prevT, t], so a caller that asks
// over back-to-back intervals hears each event exactly once.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { easeInOutCubic, easeOutCubic } from '../util/math.js';

/**
 * @typedef {'linear'|'in'|'out'|'inOut'} Ease
 * @typedef {{ t: number, v: number|number[], ease?: Ease }} Key  `ease` shapes the run from the key before into this one
 * @typedef {{ key: string, keys: Key[] }} Track  `keys` in time order
 * @typedef {{ name: string, t: number }} TimelineEvent
 */

/** The eases, each taking a share of the way through a run (0 to 1) to a share of the change. */
const EASES = Object.freeze({
  linear: (u) => u,
  in: (u) => u * u * u,
  out: easeOutCubic,
  inOut: easeInOutCubic,
});

/**
 * @param {Track[]} tracks
 * @param {TimelineEvent[]} [events]
 * @returns {{ duration: number, sample: (t: number, out?: Record<string, number|number[]>) => Record<string, number|number[]>,
 *             events: (prevT: number, t: number) => string[] }}
 *   `duration` is the time of the last key or event. `sample` writes every track's value at `t` into `out` (and
 *   returns it); a track of arrays reuses the array already in `out`, so per-frame sampling allocates nothing.
 */
export function createTimeline(tracks, events = []) {
  for (const track of tracks) {
    if (!track.keys.length) throw new Error(`createTimeline: track "${track.key}" has no keys`);
    for (const key of track.keys) {
      if (key.ease !== undefined && !EASES[key.ease]) throw new Error(`createTimeline: "${key.ease}" is not an ease`);
    }
  }
  const sorted = events.slice().sort((a, b) => a.t - b.t);
  let duration = 0;
  for (const track of tracks) duration = Math.max(duration, track.keys[track.keys.length - 1].t);
  for (const event of sorted) duration = Math.max(duration, event.t);

  /** Writes the value of `track` at `t` into `out[track.key]`. */
  function sampleTrack(track, t, out) {
    const { keys } = track;
    let from = keys[0];
    let to = keys[0];
    let u = 0;
    if (t >= keys[keys.length - 1].t) {
      from = to = keys[keys.length - 1];
    } else if (t > keys[0].t) {
      let i = 1;
      while (keys[i].t < t) i++;
      from = keys[i - 1];
      to = keys[i];
      const span = to.t - from.t;
      u = span > 0 ? EASES[to.ease || 'linear']((t - from.t) / span) : 1;
    }
    if (Array.isArray(from.v)) {
      let value = out[track.key];
      if (!Array.isArray(value) || value.length !== from.v.length) value = out[track.key] = new Array(from.v.length);
      for (let k = 0; k < value.length; k++) value[k] = from.v[k] + (to.v[k] - from.v[k]) * u;
    } else {
      out[track.key] = from.v + (to.v - from.v) * u;
    }
  }

  return {
    duration,
    sample(t, out = {}) {
      for (const track of tracks) sampleTrack(track, t, out);
      return out;
    },
    events(prevT, t) {
      const fired = [];
      for (const event of sorted) if (event.t > prevT && event.t <= t) fired.push(event.name);
      return fired;
    },
  };
}
