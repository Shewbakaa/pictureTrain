// The small building blocks the ambience's and the cues' sounds are made of (ambienceBeds.js, natureSounds.js,
// cueSounds.js): the kit's shared noise looping from a random point, filters, gains, tones and a stereo pan. Each
// takes the node it feeds, so a sound reads from its output back to its source.

/**
 * @typedef {{
 *   ctx: BaseAudioContext,
 *   source: (buffer: AudioBuffer, at: number, end?: number) => AudioBufferSourceNode,
 *   filter: (type: BiquadFilterType, frequency: number, q: number, into: AudioNode) => BiquadFilterNode,
 *   gain: (value: number, into: AudioNode) => GainNode,
 *   tone: (type: OscillatorType, frequency: number, into: AudioNode, at: number, end?: number) => OscillatorNode,
 *   pan: (value: number, into: AudioNode) => AudioNode,
 * }} VoiceParts
 */

/**
 * Builders on `kit`'s context.
 * @param {import('./sfx.js').Kit} kit
 * @returns {VoiceParts}
 */
export function voiceParts(kit) {
  const { ctx } = kit;
  // Safari has had StereoPannerNode since 14.1, but a browser without one simply plays the sound unpanned.
  const panning = typeof ctx.createStereoPanner === 'function';
  return {
    ctx,
    /** `buffer` (the kit's noise or dust) looping from a random point, from `at`, until `end` if given. */
    source(buffer, at, end) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(at, kit.random() * buffer.duration);
      if (end !== undefined) src.stop(end);
      return src;
    },
    filter(type, frequency, q, into) {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      node.connect(into);
      return node;
    },
    gain(value, into) {
      const node = ctx.createGain();
      node.gain.value = value;
      node.connect(into);
      return node;
    },
    /** An oscillator starting at `frequency` (set before it starts), from `at`, until `end` if given. */
    tone(type, frequency, into, at, end) {
      const osc = ctx.createOscillator();
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
      const node = ctx.createStereoPanner();
      node.pan.value = value;
      node.connect(into);
      return node;
    },
  };
}

/** An envelope's level `seconds` after it was at `level` and began falling towards 0 with time constant `tau`. */
export function fallen(level, seconds, tau) {
  return level * Math.exp(-seconds / tau);
}
