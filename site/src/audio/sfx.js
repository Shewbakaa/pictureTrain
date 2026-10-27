// The ride's sound effects. For now the train's own sounds (trainSounds.js): a "choo-choo" and a puff of steam as it
// sets off, chugs and the clickety-clack of the rail joints following its speed, a brake hiss as it slows for a
// stop, a long steam sigh once it stands there, and a longer, happy whistle at the Day 365 station.
//
// They play on the music's AudioContext, into the effects bus of its master chain (mixer.js), so the Sound button,
// a video's sound and the page going into the background govern them together with the music (music.js). Nothing
// plays while the sound is off, ducked or held: those sounds are skipped, not saved up. The one exception is the
// moment the sound is coming on: a sound asked for then (the whistle as she taps Begin, before the browser has let
// the context run) plays as soon as it is on, if that is within WAKE_GRACE.
//
// The app drives it: depart(), arrive() and finale() from the ride's events, and update(speed, distance, seconds,
// toStop) every frame, which allocates nothing unless a sound starts. Its timing keeps to real time under a
// ?speed= time warp and skips rather than bursts (sfxTiming.js), and every sound plays at most once per its own
// gap. All the sounds together hold at most NODE_BUDGET audio nodes at a time; one that does not fit is skipped.
//
// For the sounds still to come (the ambience, the finale's fireworks, the card's rustle and so on):
//   sfx.kit      null until the Begin tap has made the AudioContext; then what a sound needs to make itself (Kit,
//                below): the context, the three buses, the shared noise, a seeded random, and the node budget.
//   sfx.define(name, { gap, play(kit, at, level) })
//                adds a one-shot. `play` builds its nodes to start at context time `at`, counts them with
//                kit.room() and kit.track(), and returns false if it played nothing. It plays at most once per
//                `gap` seconds of real time.
//   sfx.play(name, delay = 0, level = 1)
//                plays a one-shot `delay` seconds from now, if the sound is on and its gap allows.
//   sfx.audible  true while a sound started now would be heard: for continuous layers, such as an ambience bed
//                on kit.buses.ambience updated from the frame loop, that need to know when to schedule.
// A continuous layer's own nodes stay connected to its bus: the master chain fades and suspends them with
// everything else, so it need only stop scheduling new sounds while sfx.audible is false.

import {
  TRAIN, bogieDelay, chugLevel, clickLevel, createChugClock, createGate, isBraking, jointCrossed,
} from './sfxTiming.js';
import { createTrainSounds } from './trainSounds.js';
import { RIDE } from '../ride/rideController.js';
import { createRng } from '../util/rng.js';

/** Sounds are booked this far ahead of the context's clock (s), so none starts late. */
const LEAD = 0.05;

/** The most audio nodes all the effects and the ambience may hold at once. */
const NODE_BUDGET = 40;

/** A one-shot asked for while the sound is coming on plays if it comes on within this (s); later, it is dropped. */
const WAKE_GRACE = 1;

/** How many one-shots can wait for the sound to come on. */
const WAITING = 6;

/** The shared noise: this many seconds of it, from this seed, so every render of it is the same. */
const NOISE_SECONDS = 2;
const NOISE_SEED = 29;

/** When the steam puffs after the whistle as the train sets off, and the finale's whistle after its sigh (s). */
const PUFF_AFTER = 0.95;
const FINALE_WHISTLE_AFTER = 0.35;

/** Beyond this distance from its stop (m) the train cannot be braking yet: the brake hiss is ready for the stop. */
const BRAKE_ARM = (RIDE.CRUISE * RIDE.CRUISE) / (2 * RIDE.BRAKE) + 1;

/**
 * @typedef {object} Kit
 * @property {BaseAudioContext} ctx
 * @property {{ music: GainNode, ambience: GainNode, effects: GainNode }} buses  into the master chain
 * @property {AudioBuffer} noise  NOISE_SECONDS of white noise, mono, made once; loop it from a random point
 * @property {() => number} random  a seeded random number in [0, 1)
 * @property {(nodes: number) => boolean} room  whether a sound of `nodes` audio nodes fits in the budget now
 * @property {(source: AudioScheduledSourceNode, nodes: number, last: AudioNode) => void} track
 *   counts a sound's `nodes` until `source` ends, then disconnects `last` (the node joining it to its bus)
 * @property {number} live  audio nodes playing now
 */

/**
 * What the sounds need, on `mixer`'s context. Exported so the sounds can be rendered offline.
 * @param {import('./mixer.js').Mixer} mixer
 * @returns {Kit}
 */
export function createKit(mixer) {
  const { ctx } = mixer;
  const random = createRng(NOISE_SEED);
  const noise = ctx.createBuffer(1, Math.round(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
  let live = 0;
  return {
    ctx,
    buses: { music: mixer.music, ambience: mixer.ambience, effects: mixer.effects },
    noise,
    random,
    room: (nodes) => live + nodes <= NODE_BUDGET,
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
 *   kit: Kit|null, audible: boolean,
 *   define: (name: string, shot: { gap: number, play: (kit: Kit, at: number, level: number) => boolean|void }) => void,
 *   play: (name: string, delay?: number, level?: number) => boolean,
 *   depart: () => void, arrive: () => void, finale: () => void,
 *   update: (speed: number, distance: number, seconds: number, toStop?: number) => void,
 * }} Sfx
 */

/**
 * The sound effects, on `music`'s context and master chain.
 * @param {import('./music.js').Music} music
 * @returns {Sfx}
 */
export function createSfx(music) {
  /** @type {Kit|null} */
  let kit = null;
  /** @type {import('./trainSounds.js').TrainSounds|null} */
  let train = null;

  /** @type {Map<string, { gate: ReturnType<typeof createGate>, play: (kit: Kit, at: number, level: number) => boolean|void }>} */
  const shots = new Map();

  // One-shots waiting for the sound to come on: name, delay, level and when they were asked for (performance.now()).
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
    return kit;
  }

  function audible() {
    return Boolean(ready()) && music.audible && kit.ctx.state === 'running';
  }

  /** Plays `shot` `delay` s from now (context time), if its gap allows. Assumes audible(). */
  function fire(shot, delay, level) {
    const now = kit.ctx.currentTime;
    if (!shot.gate.open(now)) return false;
    return shot.play(kit, Math.max(now, now + LEAD + delay), level) !== false;
  }

  /** Whether the sound is on its way: the browser is still answering, or the context has yet to start running. */
  function coming() {
    return music.waking || music.audible;
  }

  /** Keeps `shot` to play once the sound is on, dropping any that have waited too long to make room. */
  function wait(name, delay, level) {
    const now = performance.now();
    let kept = 0;
    for (let i = 0; i < waiting; i++) {
      if (now - waitingSince[i] > WAKE_GRACE * 1000) continue;
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
    waitingSince[waiting] = now;
    waiting += 1;
  }

  /** Plays the one-shots that waited for the sound to come on, unless they waited too long. */
  function playWaiting() {
    const now = performance.now();
    for (let i = 0; i < waiting; i++) {
      const shot = shots.get(waitingName[i]);
      if (shot && now - waitingSince[i] <= WAKE_GRACE * 1000) fire(shot, waitingDelay[i], waitingLevel[i]);
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
    define(name, { gap, play }) {
      shots.set(name, { gate: createGate(gap), play });
    },
    play(name, delay = 0, level = 1) {
      const shot = shots.get(name);
      if (!shot) {
        console.warn(`[sfx] There is no sound called "${name}".`);
        return false;
      }
      if (audible()) return fire(shot, delay, level);
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
      if (waiting > 0) playWaiting();

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
  return sfx;
}
