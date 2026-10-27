// When things happen in the finale, and where the two of them go: the numbers finale.js keys its choreography by
// (finaleTracks), and the finale's own sounds keep time with (foleyTiming.js).
//
// Places are given in the frame of the finale station [along, right, up], as finale.js describes: `along` is metres
// further along the track, `right` is right of the track (the platform side) and `up` is metres above the rails'
// ground.
//
// Pure and DOM-free, so the Node unit tests and the sounds can import it without the finale's scene.

import { FIREWORK_TIMING } from './fireworkTiming.js';

/** When things happen (s from the start of the finale). */
export const FINALE_TIMES = Object.freeze({
  cameraDone: 2.6, herStepStart: 2.6, herStepEnd: 4.2, himWalkStart: 4.0, himWalkEnd: 7.0,
  handoffStart: 7.0, handoffEnd: 8.0, hearts: 8.0, fireworks: FIREWORK_TIMING.START, card: 9.5, end: 12,
});

const T = FINALE_TIMES;

/**
 * Her hop off the carriage (s): she steps to the edge of the doorway, crouches, takes off, is at the top of her
 * hop, lands with a little squash and takes two small steps further onto the platform by herStepEnd.
 */
export const HOP = Object.freeze({
  edge: T.herStepStart + 0.4, takeoff: T.herStepStart + 0.55, apex: T.herStepStart + 0.8,
  land: T.herStepStart + 1.1, settle: T.herStepStart + 1.25,
});

/** Where she goes [along, right, up]: from beside her seat to the platform, by way of the top of her hop. */
export const HER = Object.freeze({
  seat: [0.4, 1.0, 0.9], edge: [0.4, 1.3, 0.9], apex: [0.4, 2.2, 1.2], land: [0.4, 2.95, 0.6], end: [0.4, 3.4, 0.6],
});

/** Where he goes: from just outside the station house door (R27: its face is 6.9 m out) to beside her. */
export const HIM = Object.freeze({ door: [7.5, 6.6, 0.6], end: [1.2, 3.6, 0.6] });

/** How his walk over to her, from himWalkStart to himWalkEnd, eases in and out (one of timeline.js's EASES). */
export const WALK_EASE = 'inOut';

/** How far a walk swings per metre walked (rad), for his stride and her shorter one. */
export const STRIDE = Object.freeze({ HIM: (Math.PI * 2) / 1.15, HER: (Math.PI * 2) / 0.6 });

/** At this pace (m/s) or faster a walk swings in full; slower, its swing shrinks with the pace. */
export const FULL_SWING = Object.freeze({ HIM: 0.9, HER: 0.8 });

/** A walker's pace at a moment is measured over this long either side of it (s). */
export const PACE_SPAN = 0.05;

/** The most the finale's clock moves on in one frame (s): a longer frame counts as only this. */
export const MAX_STEP = 0.1;
