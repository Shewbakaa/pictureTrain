// Debug query params. Harmless in production: anything missing or junk falls back to the default.
//
//   speed=N      ride speed multiplier, clamped to 1..50
//   at=M         start M metres along the track (frozen), M >= 0
//   look=DEG     initial look direction in degrees, + = left
//   quality=Q    force a quality tier: low | medium | high
//   fallback=1   show the 2D fallback page
//   finale=1     jump straight to the finale
//   ft=S         freeze the finale at S seconds, S >= 0
//   stats=1      show the fps / draw calls / triangles readout
//   ui=0         hide the overlay UI
import { clamp } from './util/math.js';

const QUALITIES = ['low', 'medium', 'high'];

/** A finite number from a raw query value, or null when it is missing, blank or not numeric. */
function numberParam(raw) {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} search  e.g. location.search ('?speed=4&at=120')
 * @returns {{ speed: number, at: number|null, look: number, quality: 'low'|'medium'|'high'|null,
 *             fallback: boolean, finale: boolean, ft: number|null, stats: boolean, hideUi: boolean }}
 */
export function parseDebugParams(search) {
  const params = new URLSearchParams(search);
  const speed = numberParam(params.get('speed'));
  const at = numberParam(params.get('at'));
  const look = numberParam(params.get('look'));
  const ft = numberParam(params.get('ft'));
  const quality = params.get('quality');
  return {
    speed: speed === null ? 1 : clamp(speed, 1, 50),
    at: at !== null && at >= 0 ? at : null,
    look: look === null ? 0 : look,
    quality: QUALITIES.includes(quality) ? quality : null,
    fallback: params.get('fallback') === '1',
    finale: params.get('finale') === '1',
    ft: ft !== null && ft >= 0 ? ft : null,
    stats: params.get('stats') === '1',
    hideUi: params.get('ui') === '0',
  };
}
