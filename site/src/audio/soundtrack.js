// The scenes' music as it plays: each zone's piece (zoneMusic.js), started, crossfaded and stopped as the train
// rolls through the scenery. The recordings of spring, summer, autumn and the evening (recording.js), the winter
// carol (carol.js) and the built-in tune (compose.js) for a scene whose recording cannot play, the last two on the
// music box (musicBox.js). music.js makes it the first time the scenes' music plays, and holds and wakes it with
// the rest of the sound.
//
// It touches no DOM (the recordings it is given do), so offline renders and the Node unit tests can drive it.

import { composeLoop } from './compose.js';
import { CAROL, composeCarol } from './carol.js';
import { createFader } from './mixer.js';
import { INTERVAL, createScheduler, createSynth } from './musicBox.js';
import { PIECE_NAMES, ZONE_MUSIC, pieceShares } from './zoneMusic.js';
import { ZONE_IDS } from '../content/normalize.js';

/**
 * How quickly each piece follows the zone blend (s, a time constant), so a jump along the timeline from one scene
 * to another eases across rather than clicks.
 */
const CROSSFADE_EASE = 0.12;

/** The smallest change in a piece's share of the music worth moving its gain for. */
const SHARE_STEP = 0.01;

/**
 * @typedef {{ play: () => void, pause: () => void, fade: (on: boolean, seconds: number) => void,
 *             setZones: (weights: Record<string, number>) => void, readonly shares: Record<string, number>,
 *             readonly loudest: string|null, gainOf: (name: string) => GainNode|null }} Soundtrack
 */

/**
 * The scenes' music on `ctx`, into `out` (the mixer's music bus): each zone's piece (zoneMusic.js), behind a gain
 * that follows the zone blend (pieceShares) and then one fader for them all. The recordings are `recordings`
 * (recording.js), each at its share times its trim; the winter carol (carol.js) and the built-in tune (compose.js),
 * the stand-in for a scene whose recording cannot play (or is held back), are each on a music box of their own
 * (createSynth), made the first time they are heard.
 *
 * A piece starts from its top as its zone becomes audible (its share rises from 0): the carol from "Silent night"
 * as the train rolls into winter, a recording from its first note. Once its share has fallen back to 0 a carol or
 * tune books no more notes (those booked ring out), and a recording plays on for ZONE_MUSIC.TAIL while its gain
 * eases out, then pauses and goes back to its top. No more than ZONE_MUSIC.MAX_PLAYING pieces play at once: a piece
 * starting while two others play cuts short the tails of those fading out (only a jump along the timeline from the
 * middle of a blend makes three).
 *
 * `play()` and `pause()` run and hold the pieces (pause once the sound has faded out: each recording pauses where
 * it is, and plays on from there); `fade` swells the music in (its first 3 s) or out; `setZones` takes each zone's
 * weight, every frame. `shares` is how much of each piece (PIECE_NAMES) is playing (0 to 1, where its gain is
 * heading; the carol's gain is CAROL.LEVEL at most, a recording's its trim), and `loudest` names the piece with the
 * largest share, or null while none is heard. `gainOf(name)` is a piece's gain, null until it is first heard.
 * Exported so the unit tests and offline renders can drive it with their own `timer` ({ start(tick) → id,
 * stop(id) }) and recordings.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{ timer?: { start: (tick: () => void) => unknown, stop: (id: unknown) => void },
 *           recordings?: Record<string, import('./recording.js').Recording> }} [options]
 * @returns {Soundtrack}
 */
export function createSoundtrack(ctx, out, { timer = INTERVAL, recordings = {} } = {}) {
  const faded = ctx.createGain();
  faded.connect(out);
  const fader = createFader(ctx, faded.gain);

  /** A piece's gain: silent until it has a share. */
  const shareGain = () => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(faded);
    return gain;
  };
  /** A piece played on instruments of its own: the carol, or the tune. */
  const played = (name, loop, level) => () => {
    const gain = shareGain();
    const synth = createSynth(ctx, gain);
    synth.fade(true, 0.01); // the soundtrack's fader swells it in, and its share brings it in and out
    const scheduler = createScheduler(ctx, synth, loop, timer);
    return { name, level, gain, tails: false, start: scheduler.start, stop: scheduler.stop, update() {} };
  };
  /** A scene's recording: it plays on through a tail as its share falls to 0. */
  const recorded = (recording) => () => {
    const gain = shareGain();
    recording.output.connect(gain);
    return {
      name: recording.name,
      level: recording.trim,
      gain,
      tails: true,
      start: (fromTop) => recording.start(fromTop),
      stop: (rewind) => recording.stop(rewind),
      update: () => recording.update(),
    };
  };
  /** @type {Record<string, () => object>} how to make each piece, the first time it is heard */
  const makers = { tune: played('tune', composeLoop(), 1), winter: played('winter', composeCarol(), CAROL.LEVEL) };
  for (const zone of Object.keys(recordings)) makers[zone] = recorded(recordings[zone]);

  const pieces = {}; // name to piece, once made
  const made = []; // the same, as a list
  const shares = {};
  for (const name of PIECE_NAMES) shares[name] = 0;
  const weights = {};
  const mix = {}; // every piece's share for the weights, worked out each frame
  let playing = false;
  let first = true; // until the first weights, shares are set at once; after them they ease

  /**
   * Starts or stops the piece for its share: playing while the music plays and the piece is heard, from its top if
   * it was silent; a recording whose share has just fallen to 0 plays on through its tail.
   */
  function run(p) {
    if (playing && p.share > 0) {
      p.tailEnd = 0;
      if (!p.on) {
        makeRoom(p);
        p.start(p.fromTop);
        p.on = true;
      }
      p.fromTop = false;
    } else if (playing && p.share === 0 && p.on && p.tails) {
      if (!p.tailEnd) p.tailEnd = ctx.currentTime + ZONE_MUSIC.TAIL;
    } else {
      halt(p);
    }
  }

  /** Stops the piece: back to its top if its share is 0 (even while held), else where it is. */
  function halt(p) {
    const silent = p.share === 0;
    if (p.on || (silent && !p.fromTop)) p.stop(silent);
    p.on = false;
    p.tailEnd = 0;
    if (silent) p.fromTop = true;
  }

  /** Before `p` starts: if two others are playing, those fading out stop now. */
  function makeRoom(p) {
    let on = 0;
    for (const q of made) if (q !== p && q.on) on += 1;
    if (on < ZONE_MUSIC.MAX_PLAYING) return;
    for (const q of made) if (q !== p && q.on && q.share === 0) halt(q);
  }

  function setShare(name, share) {
    let p = pieces[name];
    if (!p) {
      if (!(share > 0) || !makers[name]) return;
      p = pieces[name] = makers[name]();
      Object.assign(p, { share: 0, on: false, fromTop: true, tailEnd: 0 });
      made.push(p);
    }
    const change = Math.abs(share - p.share);
    if (change === 0 || (change < SHARE_STEP && share > 0 && share < 1)) return;
    p.share = share;
    shares[name] = share;
    if (first) p.gain.gain.value = share * p.level;
    else p.gain.gain.setTargetAtTime(share * p.level, ctx.currentTime, CROSSFADE_EASE);
    run(p);
  }

  return {
    get shares() {
      return shares;
    },
    get loudest() {
      let loudest = null;
      let top = 0;
      for (const p of made) {
        if (p.share > top) {
          top = p.share;
          loudest = p.name;
        }
      }
      return loudest;
    },
    gainOf(name) {
      return pieces[name] ? pieces[name].gain : null;
    },
    play() {
      playing = true;
      for (const p of made) run(p);
    },
    pause() {
      playing = false;
      for (const p of made) run(p);
    },
    fade(on, seconds) {
      fader.fade(on, seconds);
    },
    setZones(next) {
      for (let i = 0; i < ZONE_IDS.length; i++) weights[ZONE_IDS[i]] = next[ZONE_IDS[i]] || 0;
      pieceShares(weights, recordings, mix);
      // The pieces fading first, then those rising, so a piece starting finds the room it needs.
      for (let i = 0; i < PIECE_NAMES.length; i++) {
        if (mix[PIECE_NAMES[i]] <= shares[PIECE_NAMES[i]]) setShare(PIECE_NAMES[i], mix[PIECE_NAMES[i]]);
      }
      for (let i = 0; i < PIECE_NAMES.length; i++) {
        if (mix[PIECE_NAMES[i]] > shares[PIECE_NAMES[i]]) setShare(PIECE_NAMES[i], mix[PIECE_NAMES[i]]);
      }
      first = false;
      const now = ctx.currentTime;
      for (let i = 0; i < made.length; i++) {
        const p = made[i];
        if (p.tailEnd && now >= p.tailEnd) halt(p);
        if (p.on) p.update();
      }
    },
  };
}
