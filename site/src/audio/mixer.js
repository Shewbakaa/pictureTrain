// The one master chain every sound in the ride goes through: three buses (music, ambience, effects) into a master
// fader, then a compressor, then the speakers. music.js builds it on the ride's one AudioContext and moves the
// master fader for the Sound button, for a video's sound (everything ducks for it) and for the page going into the
// background, so every bus follows them together.
//
// It works on any BaseAudioContext, so the whole mix can be rendered offline (OfflineAudioContext) to check levels.

/**
 * Each bus's level. MUSIC is the built-in tune's overall level, a third lower (−3.7 dB) than the 0.16 it had when
 * it played alone, so the train's sounds can be heard under it. The ambience and the effects set their own levels
 * sound by sound.
 */
export const BUS = Object.freeze({ MUSIC: 0.105, AMBIENCE: 1, EFFECTS: 1 });

/**
 * The compressor after the master fader. Web Audio's compressor adds its own makeup gain, which lifts everything by
 * about 10 dB: the tune comes out at about −25 dBFS RMS. Its threshold sits above the mix, so it leaves the sound
 * alone and only touches the loudest bell strikes and chugs, by a decibel at most (measured offline,
 * tests/e2e/audioLevels.spec.js).
 */
const COMPRESSOR = { threshold: -20, knee: 6, ratio: 20, attack: 0.01, release: 0.4 };

/**
 * @typedef {{ fade: (on: boolean, seconds: number) => void, end: number }} Fader
 */

/**
 * A fader on `gain` (a GainNode's gain), from silence (0) to full (1): `fade(on, seconds)` moves it all the way up
 * or down over `seconds` by a linear ramp, from wherever it is, even mid-ramp. `end` is the context time the last
 * fade finishes. It starts silent.
 * @param {BaseAudioContext} ctx
 * @param {AudioParam} gain
 * @returns {Fader}
 */
export function createFader(ctx, gain) {
  gain.value = 0;
  // The level at any moment is worked out here rather than read back from the AudioParam, which not every browser
  // reports mid-ramp.
  let from = 0;
  let to = 0;
  let rampStart = 0;
  let rampEnd = 0;
  const levelAt = (t) => (t >= rampEnd ? to : from + ((to - from) * (t - rampStart)) / (rampEnd - rampStart));
  return {
    fade(on, seconds) {
      const now = ctx.currentTime;
      const level = levelAt(now);
      const end = now + Math.max(seconds, 0.01);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(level, now);
      gain.linearRampToValueAtTime(on ? 1 : 0, end);
      from = level;
      to = on ? 1 : 0;
      rampStart = now;
      rampEnd = end;
    },
    get end() {
      return rampEnd;
    },
  };
}

/**
 * @typedef {{ ctx: BaseAudioContext, music: GainNode, ambience: GainNode, effects: GainNode,
 *             fade: (on: boolean, seconds: number) => void, fadeEnd: number }} Mixer
 */

/**
 * The master chain on `ctx`, silent until fade(true).
 * @param {BaseAudioContext} ctx
 * @returns {Mixer}  connect a sound to one of the buses; `fade(on, seconds)` moves the master fader all the way up
 *   or down over `seconds`, from wherever it is, and `fadeEnd` is the context time that fade finishes
 */
export function createMixer(ctx) {
  const compressor = ctx.createDynamicsCompressor();
  for (const [name, value] of Object.entries(COMPRESSOR)) compressor[name].value = value;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(compressor);
  const fader = createFader(ctx, master.gain);

  const bus = (level) => {
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(master);
    return gain;
  };

  return {
    ctx,
    music: bus(BUS.MUSIC),
    ambience: bus(BUS.AMBIENCE),
    effects: bus(BUS.EFFECTS),
    fade: fader.fade,
    get fadeEnd() {
      return fader.end;
    },
  };
}
