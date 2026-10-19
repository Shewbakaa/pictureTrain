// Small pure math helpers shared by the world, ride and UI code.

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Where v sits between a and b (0 at a, 1 at b, not clamped). 0 when a === b. */
export function invLerp(a, b, v) {
  return a === b ? 0 : (v - a) / (b - a);
}

/** Hermite ramp from 0 (at e0) to 1 (at e1). Works with e0 > e1 too; e0 === e1 is a hard step. */
export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Frame-rate independent ease of `current` towards `target`; a higher `rate` is snappier. */
export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
