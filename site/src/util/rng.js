// Seeded random numbers: the world must look identical on every phone and every run.

/** mulberry32. Returns a function that yields floats in [0, 1). */
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** A random element of a non-empty array. */
export function rngPick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}
