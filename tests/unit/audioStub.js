// A stand-in for an AudioContext, for the sound unit tests: enough of the Web Audio API for the master chain, the
// train's sounds, the ambience and the cues. It logs every sound source's start, and throws where browsers do on
// a misuse the tests should catch: stopping a source twice or at a time that is not finite, and automation curves
// (setValueCurveAtTime) that overlap each other on one parameter.

/**
 * @param {{ panning?: boolean }} [options]  `panning: false` leaves out StereoPannerNode, as an old browser would
 */
export function stubContext({ panning = true } = {}) {
  const starts = []; // { type: 'noise'|'osc', at, node }
  const sources = [];
  let nodes = 0; // every node ever made
  const param = (value = 0) => {
    const curves = []; // [from, to] of each setValueCurveAtTime
    return {
      value,
      events: 0,
      target: value, // the value setTargetAtTime last aimed for
      setValueAtTime() { this.events++; return this; },
      linearRampToValueAtTime() { this.events++; return this; },
      exponentialRampToValueAtTime(v) {
        if (!(v > 0)) throw new RangeError('exponentialRampToValueAtTime needs a positive value');
        this.events++;
        return this;
      },
      setTargetAtTime(v) { this.target = v; this.events++; return this; },
      setValueCurveAtTime(curve, at, duration) {
        for (const [from, to] of curves) {
          if (at < to && at + duration > from) throw new Error(`NotSupportedError: curve at ${at} overlaps one at ${from}`);
        }
        curves.push([at, at + duration]);
        this.events++;
        return this;
      },
      cancelScheduledValues() { return this; },
    };
  };
  const node = (extra) => {
    nodes += 1;
    return {
      disconnected: false,
      connect(target) { return target; },
      disconnect() { this.disconnected = true; },
      ...extra,
    };
  };
  const source = (type, extra) => {
    const n = node({
      onended: null,
      stopAt: Infinity,
      stopped: false,
      start(at) { starts.push({ type, at, node: n }); },
      stop(at) {
        if (!Number.isFinite(at)) throw new TypeError('stop() needs a finite time');
        if (n.stopped) throw new Error('InvalidStateError: stopped twice');
        n.stopped = true;
        n.stopAt = at;
      },
      ...extra,
    });
    sources.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0,
    state: 'suspended',
    sampleRate: 8000,
    destination: node({}),
    createGain: () => node({ gain: param(1) }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBufferSource: () => source('noise', { buffer: null, loop: false, playbackRate: param(1) }),
    createOscillator: () => source('osc', { type: 'sine', frequency: param(440), detune: param() }),
    createDelay: () => node({ delayTime: param() }),
    createBuffer: (channels, length, rate) => {
      const data = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => data };
    },
  };
  const panners = [];
  if (panning) {
    ctx.createStereoPanner = () => {
      const panner = node({ pan: param() });
      panners.push(panner);
      return panner;
    };
  }
  /** Moves the clock on to `t`, ending every source that has stopped by then. */
  const advance = (t) => {
    ctx.currentTime = t;
    for (const s of sources) {
      if (s.stopAt <= t && s.onended) {
        const ended = s.onended;
        s.onended = null;
        ended();
      }
    }
  };
  return { ctx, starts, sources, panners, advance, get nodes() { return nodes; } };
}
