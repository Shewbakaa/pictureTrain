// The small building blocks the ambience's and the cues' sounds are made of (ambienceBeds.js, natureSounds.js,
// cueSounds.js): the kit's shared noise looping from a random point, filters, gains, tones and a stereo pan. Each
// takes the node it feeds, so a sound reads from its output back to its source.

/**
 * @typedef {{
 *   ctx: BaseAudioContext,
 *   readonly made: number,
 *   source: (buffer: AudioBuffer, at: number, end?: number) => AudioBufferSourceNode,
 *   filter: (type: BiquadFilterType, frequency: number, q: number, into: AudioNode) => BiquadFilterNode,
 *   gain: (value: number, into: AudioNode) => GainNode,
 *   tone: (type: OscillatorType, frequency: number, into: AudioNode, at: number, end?: number) => OscillatorNode,
 *   pan: (value: number, into: AudioNode) => AudioNode,
 * }} VoiceParts
 */

/**
 * Builders on `kit`'s context. `made` counts the audio nodes they have made, for the kit's node budget.
 * @param {import('./sfx.js').Kit} kit
 * @returns {VoiceParts}
 */
export function voiceParts(kit) {
  const { ctx } = kit;
  // Safari has had StereoPannerNode since 14.1, but a browser without one simply plays the sound unpanned.
  const panning = typeof ctx.createStereoPanner === 'function';
  let made = 0;
  const count = (node) => {
    made += 1;
    return node;
  };
  return {
    ctx,
    get made() {
      return made;
    },
    /** `buffer` (the kit's noise or dust) looping from a random point, from `at`, until `end` if given. */
    source(buffer, at, end) {
      const src = count(ctx.createBufferSource());
      src.buffer = buffer;
      src.loop = true;
      src.start(at, kit.random() * buffer.duration);
      if (end !== undefined) src.stop(end);
      return src;
    },
    filter(type, frequency, q, into) {
      const node = count(ctx.createBiquadFilter());
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      node.connect(into);
      return node;
    },
    gain(value, into) {
      const node = count(ctx.createGain());
      node.gain.value = value;
      node.connect(into);
      return node;
    },
    /** An oscillator starting at `frequency` (set before it starts), from `at`, until `end` if given. */
    tone(type, frequency, into, at, end) {
      const osc = count(ctx.createOscillator());
      osc.type = type;
      osc.frequency.value = frequency;
      osc.connect(into);
      osc.start(at);
      if (end !== undefined) osc.stop(end);
      return osc;
    },
    /** A stereo pan (−1 left to 1 right) into `into`; without StereoPannerNode, `into` itself. */
    pan(value, into) {
      if (!panning) return into;
      const node = count(ctx.createStereoPanner());
      node.pan.value = value;
      node.connect(into);
      return node;
    },
  };
}

/**
 * An envelope's level `seconds` after it was at `level` and began falling towards 0 with time constant `tau`. A time
 * before it began falling counts as none: it never rises.
 */
export function fallen(level, seconds, tau) {
  return level * Math.exp(-Math.max(0, seconds) / tau);
}

/** Every envelope closes with a ramp this long (s) down to exactly zero before its sources stop. */
export const TAIL = 0.02;

/** A time constant (s) for setTargetAtTime that falls to −60 dB over `decay` seconds. */
export function toSilence(decay) {
  return decay / Math.log(1000);
}

/**
 * Strikes `param` at each of `strikes` ([time, peak], in time order) times `scale`: up to the peak over `attack`,
 * then dying away with time constant `tau`. A strike starts from where the last one has got to: partway up its rise,
 * if it lands within that, or as far as its ring has fallen. So the envelope never jumps, and never goes above the
 * larger of their peaks, however close together they come.
 */
export function strike(param, strikes, scale, attack, tau) {
  let from = 0; // where the last strike rose from
  let start = -Infinity; // when it began
  let top = 0; // the peak it rose to
  for (const [t, peak] of strikes) {
    const into = t - start;
    const level = into < attack ? from + ((top - from) * Math.max(0, into)) / attack : fallen(top, into - attack, tau);
    param.setValueAtTime(level, t);
    param.linearRampToValueAtTime(peak * scale, t + attack);
    param.setTargetAtTime(0, t + attack, tau);
    from = level;
    start = t;
    top = peak * scale;
  }
}
