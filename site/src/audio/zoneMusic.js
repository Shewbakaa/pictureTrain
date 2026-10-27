// Each scene's music as numbers: which piece plays in which zone, how loud, how two pieces crossfade at a zone
// boundary, where a recording's loop fades, and when a recording starts loading. music.js plays them.
//
// Spring, summer, autumn and the evening town each have a recording of a piece by Chopin (PIECES); the winter hills
// have Silent Night on the music box (carol.js). The built-in tune (compose.js) is only a fallback, for a scene
// whose recording cannot be played. Her own song (content.music), when there is one, plays instead of all of them.
//
// A piece follows its zone's weight in envAt's blend (zoneWeights), the same blend the scenery, the light and the
// ambience follow, through a dip: across a boundary the piece behind fades away over the first part of the blend
// and the piece ahead rises over the last part, so two melodies are never heard loudly together (pieceShare).
//
// Pure and DOM-free, so the Node unit tests can import it.

import { ZONE_IDS } from '../content/normalize.js';
import { clamp } from '../util/math.js';

/**
 * How loud the built-in tune comes out of its instruments (createSynth, fully up), in integrated LUFS (EBU R128) on
 * both speakers: −13.46, measured on an offline render of two loops of it (tests/e2e/loudness.js, which agrees
 * with ffmpeg's ebur128 to 0.05 LU on the recordings). The music bus (mixer.js BUS.MUSIC) and the master chain then
 * bring it to about −22.8 LUFS, −25.2 dBFS RMS, at the speakers.
 */
export const TUNE_LUFS = -13.46;

/**
 * Each scene's recording: Frédéric Chopin, from Musopen's Complete Chopin Collection (CC0 1.0,
 * https://archive.org/details/musopen-chopin), loudness-normalised and re-encoded to 96 kbps stereo MP3.
 *
 * `lufs` is the file's own loudness as measured (integrated LUFS, EBU R128, ffmpeg's ebur128), and `trim` the gain
 * that lifts it to the tune's TUNE_LUFS before the music bus, so every scene's music sits as loud as the tune did
 * (the bus sets them all alike): 10^((TUNE_LUFS − lufs) / 20), +11.5 dB (autumn, −25.0 LUFS) to +12.9 dB (spring,
 * −26.4 LUFS), a gain of 3.8 to 4.4. Through the master chain each then measures within 0.2 LU of the tune; their
 * loudest passages, 6 to 7 LU over their average, reach the compressor, which takes up to 3 dB off their peaks
 * (tests/e2e/zoneMusicLevels.spec.js).
 *
 * The paths are relative to the page. Replacing a file with another piece keeps its scene's trim: give `lufs` the
 * new file's loudness.
 */
export const PIECES = Object.freeze({
  spring: piece('music/zones/spring.mp3', -26.4), // Wiosna ("Spring"), 1:27
  summer: piece('music/zones/summer.mp3', -25.7), // Nocturne in E-flat, Op. 9 No. 2, 4:37
  autumn: piece('music/zones/autumn.mp3', -25.0), // Prelude in D-flat, Op. 28 No. 15, "Raindrop", 4:55
  evening: piece('music/zones/evening.mp3', -25.2), // Nocturne in D-flat, Op. 27 No. 2, 6:18 (and the finale)
});

function piece(file, lufs) {
  return Object.freeze({ file, lufs, trim: 10 ** ((TUNE_LUFS - lufs) / 20) });
}

/** Every piece the soundtrack can play: the fallback tune, and each zone's own ('winter' is the carol). */
export const PIECE_NAMES = Object.freeze(['tune', ...ZONE_IDS]);

export const ZONE_MUSIC = Object.freeze({
  /**
   * Across a boundary the piece behind fades over the first MIX_OVERLAP of the blend and the piece ahead rises over
   * the last: each is silent for the other's first 45%.
   */
  MIX_OVERLAP: 0.55,
  /** A recording starts loading once its zone is this close to the train (m), or is the zone after the train's. */
  PRELOAD_RANGE: 250,
  /** A recording fades out over its last SEAM_OUT seconds and, once it has looped, in over its first SEAM_IN. */
  SEAM_OUT: 3,
  SEAM_IN: 1,
  /**
   * A recording whose share has fallen to 0 plays on this long (s) while its gain eases out (music.js eases each
   * piece's gain with a 0.12 s time constant: after 0.5 s it is 36 dB down), then pauses and goes back to its top.
   */
  TAIL: 0.5,
  /** The most pieces playing at once, fading-out tails included. */
  MAX_PLAYING: 2,
});

/**
 * How much of a piece plays (its gain share, 0 to 1) when its zones' weight is `weight`: none until the weight is
 * past 1 − MIX_OVERLAP, then rising on an equal-power curve to all of it at 1. Across a boundary, where one zone's
 * weight is 1 − t and the next's t, the two pieces dip: the one behind is gone by the middle of the blend before the
 * one ahead begins, so they are never heard clearly together, and never louder together than either alone.
 * @param {number} weight
 */
export function pieceShare(weight) {
  const { MIX_OVERLAP } = ZONE_MUSIC;
  const x = (weight - (1 - MIX_OVERLAP)) / MIX_OVERLAP;
  // Exactly silent and exactly whole at the ends: rounding must not start a piece at a share of 1e-16.
  if (x <= 1e-9) return 0;
  return x >= 1 ? 1 : Math.sin((Math.PI / 2) * x);
}

/**
 * The piece that plays in `zone`: the carol in winter, else the zone's recording, or the built-in tune where it
 * has none or it cannot be played (`failed`).
 * @param {string} zone
 * @param {Record<string, { failed: boolean }>} recordings  zone to its recording, as far as one has been made
 * @returns {string}  one of PIECE_NAMES
 */
export function pieceFor(zone, recordings) {
  if (zone === 'winter') return 'winter';
  const recording = recordings[zone];
  return recording && !recording.failed ? zone : 'tune';
}

/**
 * Every piece's share (pieceShare) for the zones' `weights` (zoneWeights: zone id to 0..1). A piece played in two
 * zones at once (the tune, standing in for both) takes their weights together, so it plays on whole across their
 * boundary. Writes every name of PIECE_NAMES into `out` and returns it, so the frame loop allocates nothing.
 * @param {Record<string, number>} weights
 * @param {Record<string, { failed: boolean }>} recordings
 * @param {Record<string, number>} [out]
 * @returns {Record<string, number>}
 */
export function pieceShares(weights, recordings, out = {}) {
  for (let i = 0; i < PIECE_NAMES.length; i++) out[PIECE_NAMES[i]] = 0;
  for (let i = 0; i < ZONE_IDS.length; i++) {
    const zone = ZONE_IDS[i];
    out[pieceFor(zone, recordings)] += weights[zone] || 0;
  }
  for (let i = 0; i < PIECE_NAMES.length; i++) out[PIECE_NAMES[i]] = pieceShare(out[PIECE_NAMES[i]]);
  return out;
}

/**
 * A looping recording's level at `position` s into a file `duration` s long: it fades out to silence over the last
 * SEAM_OUT seconds of every pass and, once it has `looped`, back in over the first SEAM_IN, so a scene longer than
 * its piece hears it start again gently rather than stop dead. Until the length is known it is not faded.
 * @param {number} position
 * @param {number} duration
 * @param {boolean} looped
 */
export function seamLevel(position, duration, looped) {
  if (!(duration > 0) || !Number.isFinite(duration)) return 1;
  const out = clamp((duration - position) / ZONE_MUSIC.SEAM_OUT, 0, 1);
  return looped ? Math.min(out, clamp(position / ZONE_MUSIC.SEAM_IN, 0, 1)) : out;
}

/**
 * Which zones' recordings should be loading with the train at `distance` (m): every zone within PRELOAD_RANGE of it
 * (ahead or behind; the train's own zone is 0 m away) and the zone after the one it is in, however long that one is.
 * Before the track the first zone counts as the train's, past it the last. Writes every zone id into `out`.
 * @param {Array<{ id: string, start: number, end: number }>} zones  the layout's zones, in ride order
 * @param {number} distance
 * @param {Record<string, boolean>} [out]
 * @returns {Record<string, boolean>}
 */
export function zonesToLoad(zones, distance, out = {}) {
  for (let i = 0; i < ZONE_IDS.length; i++) out[ZONE_IDS[i]] = false;
  let current = -1; // the train's zone
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (Math.max(0, zone.start - distance, distance - zone.end) <= ZONE_MUSIC.PRELOAD_RANGE) out[zone.id] = true;
    if (current < 0 && distance < zone.end) current = i;
  }
  if (current >= 0 && current + 1 < zones.length) out[zones[current + 1].id] = true;
  return out;
}
