// Loudness as EBU R128 / ITU-R BS.1770 measures it (the integrated LUFS that ffmpeg's ebur128 filter reports), for
// renders at 48 kHz. The level specs serve this file to their blank page and import it there, so it runs in the
// browser: plain functions, no imports.

/** BS.1770's K-weighting at 48 kHz: a high shelf (the head), then a high-pass (RLB). Biquad coefficients. */
const K_WEIGHTING = [
  { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
  { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] },
];

/** One channel through the K-weighting, as a new array. */
function kWeighted(data) {
  let x = data;
  for (const { b, a } of K_WEIGHTING) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const out = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = out;
      y[i] = out;
    }
    x = y;
  }
  return x;
}

const toLufs = (power) => -0.691 + 10 * Math.log10(power);

/**
 * `channels` (Float32Arrays at 48 kHz, every speaker weighted 1 as for stereo) measured as BS.1770 does:
 * `integrated`, the gated loudness of the whole (LUFS); `shortTermMax`, its loudest 3 s (LUFS); `peak`, the largest
 * sample (dBFS); and `rms`, the louder channel's RMS (dBFS).
 * @param {Float32Array[]} channels
 * @param {number} rate  must be 48000
 */
export function loudness(channels, rate) {
  if (rate !== 48000) throw new Error('loudness() measures 48 kHz renders only');
  const step = rate / 10; // 100 ms: blocks of 400 ms overlap by 75%, short-term windows are 3 s
  const segments = Math.floor(channels[0].length / step);
  const sums = new Float64Array(segments); // each 100 ms's K-weighted energy, summed over the channels
  let peak = 0;
  let rms = 0;
  for (const data of channels) {
    const k = kWeighted(data);
    let energy = 0;
    for (let s = 0; s < segments; s++) {
      let sum = 0;
      for (let i = s * step; i < (s + 1) * step; i++) sum += k[i] * k[i];
      sums[s] += sum;
    }
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      energy += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    rms = Math.max(rms, Math.sqrt(energy / data.length));
  }
  const windowPower = (from, count) => {
    let sum = 0;
    for (let s = from; s < from + count; s++) sum += sums[s];
    return sum / (count * step);
  };
  const blocks = [];
  for (let s = 0; s + 4 <= segments; s++) blocks.push(windowPower(s, 4));
  let shortTermMax = -Infinity;
  for (let s = 0; s + 30 <= segments; s++) shortTermMax = Math.max(shortTermMax, toLufs(windowPower(s, 30)));
  // The gates: blocks under −70 LUFS are silence; then blocks more than 10 LU under the rest's mean.
  const mean = (list) => list.reduce((a, p) => a + p, 0) / list.length;
  const audible = blocks.filter((p) => toLufs(p) > -70);
  const relative = toLufs(mean(audible)) - 10;
  const integrated = toLufs(mean(audible.filter((p) => toLufs(p) > relative)));
  return { integrated, shortTermMax, peak: 20 * Math.log10(peak), rms: 20 * Math.log10(rms) };
}
