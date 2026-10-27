// When the finale's fireworks burst: the timing finale.js draws them by, and the ride's sounds pop with
// (audio/cueSounds.js). Up to MAX bursts (LOW on the low tier) launch STAGGER seconds apart from the finale's
// 'fireworks' event (START, s into the finale), each relaunching every PERIOD; a shell rises for RISE seconds and
// then blooms into sparks.
//
// Pure and DOM-free, so the Node unit tests and the sounds can import it without the finale's scene.

export const FIREWORK_TIMING = Object.freeze({ START: 8.5, MAX: 4, LOW: 2, STAGGER: 0.8, PERIOD: 3.2, RISE: 0.7 });

/**
 * The fireworks' blooms (each moment a burst's shell bursts into sparks) after finale time `from` and up to `to`,
 * with `bursts` bursts going (the finale's `bursts`, fewer on the low tier): calls `visit(burst, t)` for each,
 * burst by burst. Burst b first blooms a shell's RISE after it launches, START + STAGGER × b, and again every
 * PERIOD. A stretch that runs backwards (a new finale's clock starting again) has none.
 * @param {number} from
 * @param {number} to
 * @param {number} bursts
 * @param {(burst: number, t: number) => void} visit
 */
export function fireworkBlooms(from, to, bursts, visit) {
  const F = FIREWORK_TIMING;
  for (let b = 0; b < bursts; b++) {
    const first = F.START + b * F.STAGGER + F.RISE;
    const k = Math.max(0, Math.floor((from - first) / F.PERIOD) + 1);
    for (let t = first + k * F.PERIOD; t <= to; t += F.PERIOD) visit(b, t);
  }
}
