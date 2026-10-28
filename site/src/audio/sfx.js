// The ride's sound effects, and the engine the ambience (ambience.js) and the cues (cueSounds.js) play through. Its
// own are the train's sounds (trainSounds.js): a "choo-choo" and a puff of steam as it sets off, chugs and the
// clickety-clack of the rail joints following its speed, a brake hiss as it slows for a stop, a long steam sigh once
// it stands there, and a longer, happy whistle at the Day 365 station; and, from tapSounds.js, the soft shimmer of a
// shooting star.
//
// They play on the music's AudioContext, into the effects bus of its master chain (mixer.js), so the Sound button,
// a video's sound and the page going into the background govern them together with the music (music.js). Nothing
// plays while the sound is off, ducked or held: those sounds are skipped, not saved up. The one exception is the
// moment the sound is coming on: a sound asked for then (the whistle as she taps Begin, before the browser has let
// the context run, or as she taps Continue after a video's sound, while the rest of the sound comes back) plays
// once it is fully on, if it comes on within WAKE_GRACE. Likewise a one-shot asked for while the master fader is
// still rising starts once it is up, so the first toot of a whistle is never lost in a fade.
//
// The app drives it: depart(), arrive() and finale() from the ride's events, and update(speed, distance, seconds,
// toStop) every frame, which allocates nothing unless a sound starts. Its timing keeps to real time under a
// ?speed= time warp and skips rather than bursts (sfxTiming.js), and every sound plays at most once per its own
// gap. All the sounds together, the ambience's beds included, hold at most NODE_BUDGET audio nodes at a time: a
// passing sound that does not fit is skipped, and a bed waits until there is room for it.
//
// The ambience and the cues use it this way:
//   sfx.kit      null until the Begin tap has made the AudioContext; then what a sound needs to make itself (Kit,
//                below): the context, the three buses, the shared noise and dust, a seeded random, and the node
//                budget.
//   sfx.define(name, { gap, play(kit, at, level) })
//                adds a one-shot. `play` builds its nodes to start at context time `at`, counts them with
//                kit.room() and kit.track(), and returns false if it played nothing. It plays at most once per
//                `gap` seconds of real time. A continuous sound (an ambience bed) counts its nodes with kit.hold()
//                for as long as it stays, and gives them back with kit.release().
//   sfx.play(name, delay = 0, level = 1)
//                plays a one-shot `delay` seconds from now (later, if the master fader is still coming up), if the
//                sound is on and its gap allows.
//   sfx.audible  true while a sound started now would be heard: for continuous layers, such as an ambience bed
//                on kit.buses.ambience updated from the frame loop, that need to know when to schedule.
//   sfx.settled  true while a one-shot asked for now would be heard at once, the master fader all the way up.
// A continuous layer's own nodes stay connected to its bus: the master chain fades and suspends them with
// everything else, so it need only stop scheduling new sounds while sfx.audible is false.

import {
  FINALE_WHISTLE_AFTER, TRAIN, bogieDelay, chugLevel, clickLevel, createChugClock, createGate, isBraking, jointCrossed,
} from './sfxTiming.js';
import { createTrainSounds } from './trainSounds.js';
import { createTapSounds } from './tapSounds.js';
import { RIDE } from '../ride/rideController.js';
import { createRng } from '../util/rng.js';

/** Sounds are booked this far ahead of the context's clock (s), so none starts late. */
const LEAD = 0.05;

/** The most audio nodes all the effects and the ambience (its beds and its passing sounds) may hold at once. */
const NODE_BUDGET = 40;

/** A one-shot asked for while the sound is coming on plays if it comes on within this (s); later, it is dropped. */
const WAKE_GRACE = 1;

/** How many one-shots can wait for the sound to come on. */
const WAITING = 6;

/** The shared noise: this many seconds of it, from this seed, so every render of it is the same. */
const NOISE_SECONDS = 2;
const NOISE_SEED = 29;

/**
 * The shared dust: sparse single-sample crackles, DUST_DENSITY a second on average, mostly faint with a few strong
 * (their sizes squared), from a seed of its own. Filtered, it is rustling leaves, a paper's crinkle or a firework's
 * crackle.
 */
const DUST_DENSITY = 900;
const DUST_SEED = 31;

/** When the steam puffs after the whistle as the train sets off (s). The finale's whistle is in sfxTiming.js. */
const PUFF_AFTER = 0.95;

/** Beyond this distance from its stop (m) the train cannot be braking yet: the brake hiss is ready for the stop. */
const BRAKE_ARM = (RIDE.CRUISE * RIDE.CRUISE) / (2 * RIDE.BRAKE) + 1;

/**
 * @typedef {object} Kit
 * @property {BaseAudioContext} ctx
 * @property {{ music: GainNode, ambience: GainNode, effects: GainNode }} buses  into the master chain
 * @property {AudioBuffer} noise  NOISE_SECONDS of white noise, mono, made once; loop it from a random point
 * @property {AudioBuffer} dust  NOISE_SECONDS of sparse crackles, mono, made once
 * @property {() => number} random  a seeded random number in [0, 1)
 * @property {(nodes: number) => boolean} room  whether a sound of `nodes` audio nodes fits in the budget now
 * @property {(source: AudioScheduledSourceNode, nodes: number, last: AudioNode) => void} track
 *   counts a sound's `nodes` until `source` ends, then disconnects `last` (the node joining it to its bus)
 * @property {(nodes: number) => boolean} hold  counts a continuous sound's `nodes` until release(), if they fit
 *   (false, counting nothing, if they do not)
 * @property {(nodes: number) => void} release  stops counting `nodes` that hold() counted
 * @property {number} live  audio nodes playing now
 */

/**
 * What the sounds need, on `mixer`'s context. Exported so the sounds can be rendered offline.
 * @param {import('./mixer.js').Mixer} mixer
 * @param {{ budget?: number }} [options]  the most nodes held at once: NODE_BUDGET in the ride. An offline render,
 *   which books every sound before any has played (so none has ended to free its nodes), lifts it to Infinity.
 * @returns {Kit}
 */
export function createKit(mixer, { budget = NODE_BUDGET } = {}) {
  const { ctx } = mixer;
  const random = createRng(NOISE_SEED);
  const noise = ctx.createBuffer(1, Math.round(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
  const dust = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  const grains = dust.getChannelData(0);
  const scatter = createRng(DUST_SEED);
  const chance = DUST_DENSITY / ctx.sampleRate;
  for (let i = 0; i < grains.length; i++) {
    if (scatter() >= chance) continue;
    const size = scatter();
    grains[i] = (scatter() < 0.5 ? -1 : 1) * size * size;
  }
  let live = 0;
  return {
    ctx,
    buses: { music: mixer.music, ambience: mixer.ambience, effects: mixer.effects },
    noise,
    dust,
    random,
    room: (nodes) => live + nodes <= budget,
    hold(nodes) {
      if (live + nodes > budget) return false;
      live += nodes;
      return true;
    },
    release(nodes) {
      live -= nodes;
    },
    track(source, nodes, last) {
      live += nodes;
      source.onended = () => {
        live -= nodes;
        last.disconnect();
      };
    },
    get live() {
      return live;
    },
  };
}

/**
 * @typedef {{
 *   kit: Kit|null, audible: boolean, settled: boolean,
 *   define: (name: string, shot: { gap: number, play: (kit: Kit, at: number, level: number) => boolean|void }) => void,
 *   play: (name: string, delay?: number, level?: number) => boolean,
 *   depart: () => void, arrive: () => void, finale: () => void,
 *   update: (speed: number, distance: number, seconds: number, toStop?: number) => void,
 * }} Sfx
 */

/**
 * The sound effects, on `music`'s context and master chain.
 * @param {Pick<import('./music.js').Music, 'mixer'|'audible'|'waking'>} music
 * @param {{ now?: () => number }} [options]  `now` is the clock (ms) that times how long a one-shot has waited for
 *   the sound to come on; the unit tests set it
 * @returns {Sfx}
 */
export function createSfx(music, { now = () => performance.now() } = {}) {
  /** @type {Kit|null} */
  let kit = null;
  /** @type {import('./trainSounds.js').TrainSounds|null} */
  let train = null;
  /** @type {ReturnType<typeof createTapSounds>|null} */
  let tap = null;

  /** @type {Map<string, { gate: ReturnType<typeof createGate>, play: (kit: Kit, at: number, level: number) => boolean|void }>} */
  const shots = new Map();

  // One-shots waiting for the sound to come on: name, delay, level and when they were asked for (now(), ms).
  const waitingName = new Array(WAITING).fill('');
  const waitingDelay = new Float64Array(WAITING);
  const waitingLevel = new Float64Array(WAITING);
  const waitingSince = new Float64Array(WAITING);
  let waiting = 0;

  // The train in motion.
  const chugs = createChugClock();
  const joints = createGate(TRAIN.JOINT_GAP);
  let lastDistance = NaN;
  let brakeReady = false; // the brake hiss sounds once per stop: it is ready again once the train is far from one

  /** The kit, made once the music has made the context. */
  function ready() {
    if (kit) return kit;
    if (!music.mixer) return null;
    kit = createKit(music.mixer);
    train = createTrainSounds(kit);
    tap = createTapSounds(kit);
    return kit;
  }

  function audible() {
    return Boolean(ready()) && music.audible && kit.ctx.state === 'running';
  }

  /**
   * Plays `shot` `delay` s from now (context time), if its gap allows. Assumes audible(). One that plays nothing
   * (no room in the node budget) does not use up its gap.
   */
  function fire(shot, delay, level) {
    const time = kit.ctx.currentTime;
    if (!shot.gate.open(time)) return false;
    if (shot.play(kit, Math.max(time, time + LEAD + delay), level) !== false) return true;
    shot.gate.reset();
    return false;
  }

  /** Whether the sound is on its way: the browser is still answering, or the context has yet to start running. */
  function coming() {
    return music.waking || music.audible;
  }

  /** Keeps `shot` to play once the sound is on, dropping any that have waited too long to make room. */
  function wait(name, delay, level) {
    const asked = now();
    let kept = 0;
    for (let i = 0; i < waiting; i++) {
      if (asked - waitingSince[i] > WAKE_GRACE * 1000) continue;
      waitingName[kept] = waitingName[i];
      waitingDelay[kept] = waitingDelay[i];
      waitingLevel[kept] = waitingLevel[i];
      waitingSince[kept] = waitingSince[i];
      kept += 1;
    }
    waiting = kept;
    if (waiting === WAITING) return;
    waitingName[waiting] = name;
    waitingDelay[waiting] = delay;
    waitingLevel[waiting] = level;
    waitingSince[waiting] = asked;
    waiting += 1;
  }

  /**
   * How long until the master fader is all the way up (s, from LEAD ahead of now): a one-shot that starts then is
   * not lost in its fade. Once the sound is on, the fader's last move was up, so this is 0 when it has finished.
   */
  function up() {
    return Math.max(0, music.mixer.fadeEnd - kit.ctx.currentTime - LEAD);
  }

  /** Plays the one-shots that waited for the sound to come on, unless they waited too long, once the fader is up. */
  function playWaiting() {
    const played = now();
    const delay = up();
    for (let i = 0; i < waiting; i++) {
      const shot = shots.get(waitingName[i]);
      if (shot && played - waitingSince[i] <= WAKE_GRACE * 1000) fire(shot, delay + waitingDelay[i], waitingLevel[i]);
    }
    waiting = 0;
  }

  const sfx = {
    get kit() {
      return ready();
    },
    get audible() {
      return audible();
    },
    /**
     * True while a one-shot asked for now would be heard at once: the sound is on, not still coming on, and the master
     * fader all the way up. The finale's cues skip what falls when it is not (cueSounds.js), rather than bunch up.
     */
    get settled() {
      return audible() && !music.waking && up() === 0;
    },
    define(name, { gap, play }) {
      shots.set(name, { gate: createGate(gap), play });
    },
    play(name, delay = 0, level = 1) {
      const shot = shots.get(name);
      if (!shot) {
        console.warn(`[sfx] There is no sound called "${name}".`);
        return false;
      }
      // While a request to sound is still being answered, the fader has yet to start back up (after a video's
      // sound, the context can still be running): the one-shot waits for it, like one asked for at Begin.
      if (audible() && !music.waking) return fire(shot, up() + delay, level);
      if (coming()) wait(name, delay, level);
      return false;
    },
    /** The train sets off: after Begin, after Continue, and riding again. Not after a jump, which teleports. */
    depart() {
      chugs.reset(TRAIN.DEPART_PHASE);
      sfx.play('whistle');
      sfx.play('puff', PUFF_AFTER);
    },
    /** The train has pulled in at a stop (a jump along the timeline puts it there silently instead). */
    arrive() {
      sfx.play('sigh');
    },
    /** The train has pulled in at the Day 365 station. */
    finale() {
      sfx.play('sigh');
      sfx.play('whistle-finale', FINALE_WHISTLE_AFTER);
    },
    /**
     * Every frame: the train makes `speed` m/s (the ride's own speed, 0 standing still or paused), is `distance` m
     * along the track and has `toStop` m to go to where it stops next (Infinity when it is not moving). `seconds`
     * is the frame's real time.
     */
    update(speed, distance, seconds, toStop = Infinity) {
      const from = lastDistance;
      lastDistance = distance;
      if (toStop > BRAKE_ARM) brakeReady = true;
      const brake = brakeReady && isBraking(speed, toStop);
      if (brake) brakeReady = false;
      if (!audible()) {
        if (!coming()) waiting = 0;
        return;
      }
      if (waiting > 0 && !music.waking) playWaiting();

      const ago = chugs.step(speed, seconds);
      if (ago >= 0) fire(chug, -ago, chugLevel(speed));
      if (jointCrossed(from, distance) >= 0 && joints.open(kit.ctx.currentTime)) {
        const level = clickLevel(speed);
        fire(click, 0, level);
        fire(click, bogieDelay(speed), level);
      }
      if (brake) sfx.play('brake');
    },
  };

  // The train's sounds. The chug and the click come every frame from update(), timed by sfxTiming.js; their gates
  // only guard against doubles.
  const chug = { gate: createGate(0.1), play: (k, at, level) => train.chug(at, level) };
  const click = { gate: createGate(0), play: (k, at, level) => train.click(at, level) };
  sfx.define('whistle', { gap: 1.5, play: (k, at) => train.whistle('depart', at) });
  sfx.define('whistle-finale', { gap: 3, play: (k, at) => train.whistle('finale', at) });
  sfx.define('puff', { gap: 1, play: (k, at) => train.steam('puff', at) });
  sfx.define('brake', { gap: 1, play: (k, at) => train.steam('brake', at) });
  sfx.define('sigh', { gap: 1.5, play: (k, at) => train.steam('sigh', at) });
  // The scenery's small sounds (tapSounds.js): the shimmer of a shooting star.
  sfx.define('shimmer', { gap: 2, play: (k, at, level) => tap.shimmer(at, level) });
  return sfx;
}
