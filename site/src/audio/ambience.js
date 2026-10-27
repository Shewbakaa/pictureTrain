// The ambience: each zone's own sounds, following the scenery. A bed under every zone (ambienceBeds.js: breeze,
// waves, rustling leaves, wind, crickets) and, over it, random passing sounds (natureSounds.js: birds, a bee, a
// balloon's burner, a gull, sleigh bells), crossfading with envAt's zone blend like the sky and the particles; and
// the evening's clock tower, striking once as the train rolls into the evening. The waves, and the gulls over them,
// come from the sea's side of wherever she is looking.
//
// It plays on the sound effects' kit (sfx.js), into the ambience bus, so the Sound button, a video's sound and the
// page going into the background govern it with everything else: a bed's nodes stay connected and the master
// chain fades and suspends them, and nothing new is booked or started while the sound is not heard. Events are
// skipped then, not saved up.
//
// The app calls update(env, yaw, seconds, distance) every frame. It works out the zones' weights (allocating
// nothing), and every TICK of real time it tends the beds (making one as its zone comes near, fading it with the
// zone, taking it down once its zone has been silent for RELEASE) and books their sound LOOKAHEAD ahead, and steps
// the events' clocks, which keep to real time (ambienceTiming.js): a ?speed= time warp never piles sounds up.
// `weights` are the zones' weights, which the scenes' music follows too (music.js setZones).

import { AMBIENCE, bedGain, createChimeTrigger, createEventClock, wavePan, zoneWeights } from './ambienceTiming.js';
import { BED_ZONES, createBed } from './ambienceBeds.js';
import { createNatureSounds } from './natureSounds.js';
import { createRng } from '../util/rng.js';

/** Real seconds between the ambience's scheduler ticks, and how far ahead (s) the beds' sound is booked. */
const TICK = 0.05;
const LOOKAHEAD = 0.3;

/** A bed whose zone has been silent this long (real s) is taken down; it is made again if the zone comes back. */
const RELEASE = 2;

/** A bed's fade follows its zone's weight with this time constant (s), moving for changes of at least BED_STEP. */
const BED_EASE = 0.15;
const BED_STEP = 0.01;

/**
 * The clock tower strikes this long (s) after the train rolls into the evening; with no room in the node budget
 * just then, it waits for room up to CHIME_PATIENCE (real s) rather than being lost, since it strikes only once.
 */
const CHIME_DELAY = 0.4;
const CHIME_PATIENCE = 3;

/** The sea lies on this side of the track (zones.js: `water` puts it on the left). */
const SEA_SIDE = 'left';

/**
 * Each zone's random events: the one-shot to play, its real-time gaps (s, at the zone's full weight) and its own
 * gate (s) against doubles.
 */
const EVENTS = Object.freeze([
  { zone: 'spring', name: 'bird-spring', min: 2.2, max: 6.5, gap: 1 },
  { zone: 'spring', name: 'bee', min: 18, max: 40, gap: 10 },
  { zone: 'spring', name: 'burner', min: 24, max: 55, gap: 12 },
  { zone: 'summer', name: 'gull', min: 11, max: 28, gap: 6 },
  { zone: 'autumn', name: 'bird-autumn', min: 6, max: 15, gap: 3 },
  { zone: 'winter', name: 'sleigh', min: 18, max: 42, gap: 10 },
]);

/** How near an event sounds: its level is its zone's weight times a share drawn from NEAR. */
const NEAR = [0.55, 1];

/** The events' timing, the same on every ride. */
const EVENT_SEED = 1026;

/**
 * @typedef {{ readonly weights: Readonly<Record<string, number>>, readonly beds: string[],
 *             update: (env: import('../world/environment.js').Env, yaw: number, seconds: number,
 *             distance: number) => void }} Ambience
 *   `weights` is each zone's weight at the last update (zoneWeights), every frame, sound or no sound; `beds` lists
 *   the zones whose beds are up (for tests and a curious look in the console)
 */

/**
 * The ambience, on `sfx`'s kit once the sound has started.
 * @param {import('./sfx.js').Sfx} sfx
 * @returns {Ambience}
 */
export function createAmbience(sfx) {
  /** @type {import('./natureSounds.js').NatureSounds|null} */
  let nature = null;
  const voice = (kit) => nature || (nature = createNatureSounds(kit));
  const play = {
    'bird-spring': (v, at, level) => v.bird('spring', at, level),
    'bird-autumn': (v, at, level) => v.bird('autumn', at, level),
    bee: (v, at, level) => v.bee(at, level),
    burner: (v, at, level) => v.burner(at, level),
    gull: (v, at, level) => v.gull(at, level, seaPan),
    sleigh: (v, at, level) => v.sleigh(at, level),
  };
  for (const event of EVENTS) {
    sfx.define(event.name, { gap: event.gap, play: (kit, at, level) => play[event.name](voice(kit), at, level) });
  }
  sfx.define('chime', { gap: 10, play: (kit, at, level) => voice(kit).chime(at, level) });

  const random = createRng(EVENT_SEED);
  const clocks = EVENTS.map((event) => ({ zone: event.zone, name: event.name, clock: createEventClock(event.min, event.max, random) }));
  const chime = createChimeTrigger();
  /** @type {Record<string, number>} */
  const weights = {};
  /** @type {Record<string, import('./ambienceBeds.js').Bed|null>} */
  const beds = {};
  const levels = {}; // where each bed's fade is heading
  const silent = {}; // real seconds each bed's zone has been silent
  let up = []; // the zones whose beds are up, made again only when that changes
  let seaPan = 0; // where the sea is from where she is looking (stereo pan), for the waves and the gulls
  let chimeWait = 0; // while the chime is due: how much longer (real s) it may wait for room
  let since = 0; // real seconds since the last tick

  /** Makes, fades, books or takes down `zone`'s bed. */
  function tend(kit, zone, weight, step, audible) {
    let bed = beds[zone];
    if (!bed) {
      if (!(weight > 0) || !audible) return;
      bed = createBed(kit, zone);
      if (!bed) return; // no room in the node budget yet: passing sounds end within seconds
      beds[zone] = bed;
      levels[zone] = 0;
      silent[zone] = 0;
      up = BED_ZONES.filter((id) => beds[id]);
    }
    const now = kit.ctx.currentTime;
    const level = bedGain(weight);
    const change = Math.abs(level - levels[zone]);
    if (change >= BED_STEP || (change > 0 && (level === 0 || level === 1))) {
      levels[zone] = level;
      bed.fade.gain.setTargetAtTime(level, now, BED_EASE);
    }
    if (weight > 0) {
      silent[zone] = 0;
    } else if ((silent[zone] += step) >= RELEASE) {
      bed.free();
      beds[zone] = null;
      up = BED_ZONES.filter((id) => beds[id]);
      return;
    }
    if (audible) bed.tick(now + LOOKAHEAD);
  }

  return {
    get weights() {
      return weights;
    },
    get beds() {
      return up;
    },
    /**
     * How many waves she has heard come in, its fraction how far into the one now (ambienceBeds.js waveAt); NaN
     * while none is heard, the sound's clock standing still (a video's sound, the page away) among those times.
     */
    seaWave() {
      const kit = sfx.kit;
      return kit && beds.summer && sfx.audible ? beds.summer.waveAt(kit.ctx.currentTime) : NaN;
    },
    update(env, yaw, seconds, distance) {
      zoneWeights(env, weights);
      if (chime.step(weights.evening, distance)) chimeWait = CHIME_PATIENCE;
      since += Math.min(seconds > 0 ? seconds : 0, AMBIENCE.MAX_STEP);
      if (since < TICK) return;
      const step = since;
      since = 0;
      const kit = sfx.kit;
      if (!kit) return;
      const audible = sfx.audible;
      seaPan = wavePan(yaw, SEA_SIDE);
      for (let i = 0; i < BED_ZONES.length; i++) tend(kit, BED_ZONES[i], weights[BED_ZONES[i]], step, audible);
      if (beds.summer) beds.summer.setPan(seaPan);
      if (!audible) {
        chimeWait = 0; // skipped, like every sound asked for while the sound is off
        return;
      }
      if (chimeWait > 0) chimeWait = sfx.play('chime', CHIME_DELAY) ? 0 : chimeWait - step;
      for (let i = 0; i < clocks.length; i++) {
        const c = clocks[i];
        const weight = weights[c.zone];
        if (!c.clock.step(step, weight)) continue;
        sfx.play(c.name, random() * TICK, weight * (NEAR[0] + random() * (NEAR[1] - NEAR[0])));
      }
    },
  };
}
