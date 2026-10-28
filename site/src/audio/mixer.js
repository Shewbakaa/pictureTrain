// The one master chain every sound in the ride goes through: three buses (music, ambience, effects) into a master
// fader, then a compressor, then the speakers. music.js builds it on the ride's one AudioContext and moves the
// master fader for the Sound button, for a video's sound (everything ducks for it) and for the page going into the
// background, so every bus follows them together.
//
// Two things sit beside them for the tunnel. The train's own sounds have a bus of their own (`train`, into the
// effects bus), so the tunnel's echo (tunnelEcho.js) can take just them. And the ambience goes through a low-pass
// on its way to the master that closes (`setMuffle`) as she goes inside, so the world outside sounds shut away.
//
// It works on any BaseAudioContext, so the whole mix can be rendered offline (OfflineAudioContext) to check levels.

/**
 * Each bus's level. MUSIC is the built-in tune's overall level, a third lower (−3.7 dB) than the 0.16 it had when
 * it played alone, so the train's sounds can be heard under it. The ambience and the effects set their own levels
 * sound by sound. The train's bus feeds the effects bus at unity.
 */
export const BUS = Object.freeze({ MUSIC: 0.105, AMBIENCE: 1, EFFECTS: 1, TRAIN: 1 });

/**
 * The ambience's low-pass: OPEN Hz (above what is heard, so it changes nothing) when she is in the open, CLOSED Hz
 * deep inside the tunnel. It moves with a time constant of EASE seconds, and Q is in decibels: −3 dB is a
 * Butterworth, a plain slope with no resonant bump.
 */
export const MUFFLE = Object.freeze({ OPEN: 20000, CLOSED: 700, EASE: 0.15, Q: -3 });

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
 * @typedef {{ ctx: BaseAudioContext, music: GainNode, ambience: GainNode, effects: GainNode, train: GainNode,
 *             setMuffle: (amount: number) => void,
 *             fade: (on: boolean, seconds: number) => void, fadeEnd: number }} Mixer
 */

/**
 * The master chain on `ctx`, silent until fade(true).
 * @param {BaseAudioContext} ctx
 * @returns {Mixer}  connect a sound to one of the buses (`train` is the train's sounds, on their way into `effects`);
 *   `setMuffle(amount)` closes the ambience's low-pass, from 0 (open) to 1 (MUFFLE.CLOSED Hz); `fade(on, seconds)`
 *   moves the master fader all the way up or down over `seconds`, from wherever it is, and `fadeEnd` is the context
 *   time that fade finishes
 */
export function createMixer(ctx) {
  const compressor = ctx.createDynamicsCompressor();
  for (const [name, value] of Object.entries(COMPRESSOR)) compressor[name].value = value;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(compressor);
  const fader = createFader(ctx, master.gain);

  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = MUFFLE.OPEN;
  muffle.Q.value = MUFFLE.Q;
  muffle.connect(master);
  let muffled = 0;

  const bus = (level, into = master) => {
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(into);
    return gain;
  };

  // The first four gains are the master and these three buses, in this order: tests/e2e/helpers.js meters them.
  const music = bus(BUS.MUSIC);
  const ambience = bus(BUS.AMBIENCE, muffle);
  const effects = bus(BUS.EFFECTS);

  return {
    ctx,
    music,
    ambience,
    effects,
    train: bus(BUS.TRAIN, effects),
    setMuffle(amount) {
      const closed = Math.min(Math.max(amount, 0), 1);
      if (closed === muffled) return;
      muffled = closed;
      // Pitch is heard in ratios, so the cut-off closes by them: the middle of the way is the geometric mean.
      const hz = MUFFLE.OPEN * (MUFFLE.CLOSED / MUFFLE.OPEN) ** closed;
      muffle.frequency.setTargetAtTime(hz, ctx.currentTime, MUFFLE.EASE);
    },
    fade: fader.fade,
    get fadeEnd() {
      return fader.end;
    },
  };
}
