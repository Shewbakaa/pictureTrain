// Where things sit along the track: each scenery zone, each photo stop and the finale.
//
// The ride, the scenery, the signs and the timeline all measure in metres of distance from the start
// station, so this is the one place that turns the content (zones and moments) into those distances.
// A zone is a fixed stretch plus room for each of its moments, so a zone with more photos is longer
// and a zone without any is a short scenic stretch.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { smoothstep } from '../util/math.js';

/**
 * @typedef {import('../content/normalize.js').ZoneId} ZoneId
 * @typedef {{ id: ZoneId, start: number, end: number, momentIndices: number[] }} ZoneSeg
 *   `start` and `end` are distances (m); `momentIndices` are the moments (0-based places in the ride)
 *   that stop in this zone, in ride order.
 * @typedef {{ index: number, distance: number, zone: ZoneId, side: 'right'|'left' }} Stop
 *   The train halts at `distance` for moment `index`; its photo sign stands on `side` of the track.
 * @typedef {{ zones: ZoneSeg[], stops: Stop[], finaleDistance: number, total: number }} Layout
 *   `zones` run end to end from distance 0; `total` is the track length including the run-out.
 */

/** Lengths in metres. */
export const LAYOUT = Object.freeze({
  LEAD_IN: 30,         // extra run at the start of the first zone, before its first stop
  ZONE_BASE: 40,       // what every zone has, with or without moments
  MOMENT_SPACING: 70,  // room for each moment in a zone; its stop sits in the middle of that room
  FINALE_EXTRA: 60,    // extra room at the end of the last zone, for the finale
  FINALE_BACK: 30,     // the finale happens this far before the end of the last zone
  RUNOUT: 40,          // track kept beyond the end of the last zone
  BLEND: 30,           // width of the window around each zone boundary where the scenery fades
});

/** Her eye height above the rails in the seat (m); the camera rig and the finale both start from it. */
export const EYE_HEIGHT = 2.05;

/**
 * @param {import('../content/normalize.js').Content} content  normalized, so the moments follow the zone order
 * @returns {Layout}
 */
export function buildLayout(content) {
  const { LEAD_IN, ZONE_BASE, MOMENT_SPACING, FINALE_EXTRA, FINALE_BACK, RUNOUT } = LAYOUT;
  const { zones: zoneIds, moments } = content;
  const zones = [];
  const stops = [];
  let start = 0;
  zoneIds.forEach((id, position) => {
    const leadIn = position === 0 ? LEAD_IN : 0;
    const finaleExtra = position === zoneIds.length - 1 ? FINALE_EXTRA : 0;
    const momentIndices = [];
    moments.forEach((moment, index) => {
      if (moment.zone === id) momentIndices.push(index);
    });
    const end = start + leadIn + ZONE_BASE + MOMENT_SPACING * momentIndices.length + finaleExtra;
    momentIndices.forEach((index, k) => {
      stops.push({
        index,
        distance: start + leadIn + ZONE_BASE / 2 + MOMENT_SPACING * (k + 0.5),
        zone: id,
        side: index % 2 === 0 ? 'right' : 'left',
      });
    });
    zones.push({ id, start, end, momentIndices });
    start = end;
  });
  const lastEnd = zones[zones.length - 1].end;
  return { zones, stops, finaleDistance: lastEnd - FINALE_BACK, total: lastEnd + RUNOUT };
}

/**
 * The zone the train is in at distance `d`, and how far the scenery has blended towards its neighbour.
 *
 * Around each zone boundary is a window of BLEND metres, centred on it, where the scenery eases from
 * the zone before into the zone after: `t` runs from 0 to 1 across the open window (0.5 at the boundary).
 * Outside every window the blend is `{ a: current, b: current, t: 0 }`. Before the start or past the
 * end it is the first or last zone. The windows never overlap, because even an empty zone is ZONE_BASE
 * long, which is more than BLEND.
 *
 * @param {Layout} layout
 * @param {number} d  distance along the track (m)
 * @returns {{ current: ZoneSeg, blend: { a: ZoneId, b: ZoneId, t: number } }}
 */
export function zoneAt(layout, d) {
  const { zones } = layout;
  const half = LAYOUT.BLEND / 2;
  let current = zones[zones.length - 1];
  for (let i = 0; i < zones.length; i++) {
    if (d < zones[i].end) {
      current = zones[i];
      break;
    }
  }
  const blend = { a: current.id, b: current.id, t: 0 };
  for (let i = 0; i + 1 < zones.length; i++) {
    const boundary = zones[i].end;
    if (d > boundary - half && d < boundary + half) {
      blend.a = zones[i].id;
      blend.b = zones[i + 1].id;
      blend.t = smoothstep(boundary - half, boundary + half, d);
      break;
    }
  }
  return { current, blend };
}
