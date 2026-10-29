// Turns whatever site/content.js exports into the one shape the rest of the site relies on.
//
// The author edits content.js by hand, so it can hold almost anything. This copes with all of it and
// never hands back a half-filled object: each problem is repaired with the nearest sensible value
// and reported, as a warning (something was fixed or ignored) or as an error (the author has to
// change something). main.js prints both to the console as "[content.js] ...".
//
// Pure and DOM-free, so the Node unit tests can import it.

import { mediaKind } from '../photos/videos.js';

/**
 * @typedef {'spring'|'summer'|'autumn'|'winter'|'evening'} ZoneId
 * @typedef {{ skin: string, hair: string, outfit: string }} Look  hex colours such as '#f2c9a5'
 * @typedef {'holding-hands'|'waving'|'hug'|'sitting'|'dancing'|'pointing'|'none'} Pose  how the couple stand at a stop
 * @typedef {{ index: number, photo: string, live: string, date: string, title: string, caption: string, zone: ZoneId, pose: Pose }} Moment
 *   `live` is a Live Photo's motion clip, shown with the still `photo` ('' for none)
 *   `index` is the 0-based place in the ride; `photo` is a path relative to site/ ('' = no photo).
 * @typedef {{
 *   herName: string, yourName: string,
 *   intro: { eyebrow: string, title: string, note: string, button: string, hint: string },
 *   finale: { eyebrow: string, wish: string, message: string, signoff: string, voice: string },
 *   zones: ZoneId[], moments: Moment[],
 *   characters: { her: Look, you: Look },
 *   pets: 'random'|'dog'|'cat'|'none',
 *   music: string,
 * }} Content
 *   `intro.hint` is the line under the start button: the default one, or '' when hidden.
 *   `finale.voice` is his voice note, an audio file path relative to site/ ('' = none).
 */

/** Every scenery zone, in the default ride order. */
export const ZONE_IDS = Object.freeze(['spring', 'summer', 'autumn', 'winter', 'evening']);

/** How the couple can stand at a stop. 'none' leaves them out of that stop. */
export const POSES = Object.freeze([
  'holding-hands', 'waving', 'hug', 'sitting', 'dancing', 'pointing', 'celebrate', 'walking', 'selfie', 'goofy', 'heart', 'none',
]);

const DEFAULT_POSE = 'holding-hands';

/** What the pets field can say. 'random' lets the ride choose, 'none' leaves them out. */
const PET_CHOICES = Object.freeze(['random', 'dog', 'cat', 'none']);

/** The line under the start button when content.js leaves intro.hint empty. */
export const DEFAULT_HINT = 'Best with sound on and headphones in.';

/** A voice note is one of these, which is what an iPhone Voice Memo exports (.m4a) and what browsers play. */
const AUDIO_ENDING = /\.(?:m4a|mp3|aac|wav)$/i;

/** The ride always ends here: the finale happens in the evening town. */
const FINAL_ZONE = 'evening';

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const DEFAULT_LOOKS = {
  her: { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' },
  you: { skin: '#e8b994', hair: '#2a1a10', outfit: '#5b7fc4' },
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMissing = (value) => value === undefined || value === null;

/** A value as it would be written in content.js, for messages: "moon", 5. */
const show = (value) => (typeof value === 'string' ? JSON.stringify(value) : String(value));

/** A trimmed string. Numbers are written out; anything else, or an empty string, gives `fallback`. */
function text(value, fallback = '') {
  const string = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof string !== 'string') return fallback;
  return string.trim() || fallback;
}

/**
 * A file path as the site needs it: relative to the site folder, like 'photos/01.jpg'. A "/" in front works on
 * the computer but not once the site is online under a sub-path (user.github.io/repo/), and "site/" in front
 * works nowhere, so both are taken off (and "./", which changes nothing), with a warning naming `label`.
 */
function sitePath(value, label, warnings) {
  const path = text(value);
  const clean = path.replace(/^(?:\.?\/)+/, '').replace(/^site\/+/, '');
  if (clean !== path) {
    warnings.push(
      `${label}: ${show(path)} was read as ${show(clean)}. Write paths from inside the site folder, like ` +
      `'photos/01.jpg', with nothing in front: a "/" or "site/" in front breaks once the site is online.`,
    );
  }
  return clean;
}

/** parent[key] as an object. Leaving it out is fine ({}); anything else that is not an object is reported. */
function readBlock(parent, key, warnings, path = key) {
  const value = parent[key];
  if (isMissing(value)) return {};
  if (isObject(value)) return value;
  warnings.push(`${path} should be a { ... } block, so it was ignored and the defaults are used.`);
  return {};
}

/** The ride order: known zones only, each once, with 'evening' last. */
function readZones(value, warnings) {
  if (isMissing(value)) return [...ZONE_IDS];
  if (!Array.isArray(value)) {
    warnings.push(`zones should be a list like ['${ZONE_IDS.join("', '")}'], so the default order is used.`);
    return [...ZONE_IDS];
  }
  const zones = [];
  for (const id of value) {
    if (!ZONE_IDS.includes(id)) {
      warnings.push(`zones: ${show(id)} is not a zone name, so it was skipped (use ${ZONE_IDS.join(', ')}).`);
    } else if (zones.includes(id)) {
      warnings.push(`zones: ${show(id)} is listed more than once, so the repeat was skipped.`);
    } else {
      zones.push(id);
    }
  }
  const at = zones.indexOf(FINAL_ZONE);
  if (at === -1) {
    warnings.push(`zones: "${FINAL_ZONE}" was missing, so it was added at the end (the ride always finishes there).`);
    zones.push(FINAL_ZONE);
  } else if (at !== zones.length - 1) {
    warnings.push(`zones: "${FINAL_ZONE}" has to come last, so it was moved to the end (the ride always finishes there).`);
    zones.splice(at, 1);
    zones.push(FINAL_ZONE);
  }
  return zones;
}

/**
 * The zone of Moment `n` (1-based). A missing or unlisted zone borrows the previous moment's
 * (the first zone for Moment 1). A zone earlier in the ride than the previous moment's is an error.
 */
function readMomentZone(value, n, zones, previousZone, warnings, errors) {
  if (!zones.includes(value)) {
    const problem = isMissing(value) ? 'has no zone' : `is in the zone ${show(value)}, which is not in your zones list`;
    const borrowedFrom = n === 1 ? 'the first zone of the ride' : `the zone of Moment ${n - 1}`;
    warnings.push(`Moment ${n} ${problem}, so it uses ${show(previousZone)} (${borrowedFrom}).`);
    return previousZone;
  }
  if (zones.indexOf(value) < zones.indexOf(previousZone)) {
    // Only possible from Moment 2 on: the first moment is compared with zones[0], which nothing precedes.
    errors.push(
      `Moment ${n} is in ${show(value)} but Moment ${n - 1} is already in ${show(previousZone)}. ` +
      `Moments have to follow the zone order, so Moment ${n} was moved into ${show(previousZone)}. ` +
      'Put the moments in the same order as your zones, or change its zone.',
    );
    return previousZone;
  }
  return value;
}

function readMoments(value, zones, warnings, errors) {
  if (isMissing(value)) return [];
  if (!Array.isArray(value)) {
    warnings.push('moments should be a list of moments, so none were used.');
    return [];
  }
  const moments = [];
  let previousZone = zones[0];
  // A plain loop, not forEach: it also visits the gap left by a stray double comma.
  for (let i = 0; i < value.length; i++) {
    const n = i + 1;
    let moment = value[i];
    if (!isObject(moment)) {
      warnings.push(`Moment ${n} should be a { ... } block, so it was filled in with defaults.`);
      moment = { zone: previousZone };
    }
    const zone = readMomentZone(moment.zone, n, zones, previousZone, warnings, errors);
    previousZone = zone;
    const photo = sitePath(moment.photo, `Moment ${n} photo`, warnings);
    moments.push({
      index: i,
      photo,
      live: readLive(moment.live, photo, n, warnings),
      date: text(moment.date),
      title: text(moment.title, `Moment ${n}`),
      caption: text(moment.caption),
      zone,
      pose: readPose(moment.pose, n, warnings),
    });
  }
  return moments;
}

/**
 * A moment's Live Photo motion: a video beside a still photo. Anything else is left out with a warning saying why.
 */
function readLive(value, photo, n, warnings) {
  const live = sitePath(value, `Moment ${n} live`, warnings);
  if (!live) return '';
  if (mediaKind(live) !== 'video') {
    warnings.push(`Moment ${n} live: ${show(live)} is not a video (.mp4, .m4v, .webm or .mov), so it was left out.`);
    return '';
  }
  if (mediaKind(photo) !== 'image') {
    warnings.push(`Moment ${n} live: a Live Photo needs its still picture in photo as well, so the live part was left out.`);
    return '';
  }
  return live;
}

/** "a, b, c or d": a list of choices for a message. */
const listOf = (choices) => `${choices.slice(0, -1).join(', ')} or ${choices[choices.length - 1]}`;

/** How the couple stand at Moment `n`: one of POSES, or holding hands (with a warning when the author wrote something else). */
function readPose(value, n, warnings) {
  if (isMissing(value)) return DEFAULT_POSE;
  const pose = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (POSES.includes(pose)) return pose;
  if (typeof value === 'string' && pose === '') return DEFAULT_POSE; // blank counts as not written
  warnings.push(`Moment ${n} pose: ${show(value)} is not one of ${listOf(POSES)}, so they hold hands.`);
  return DEFAULT_POSE;
}

/** A line the author can hide, like the one under the start button: `fallback` when empty, '' (hidden) for 'none', otherwise the author's words. */
function hideable(value, fallback) {
  const words = text(value);
  if (words === '') return fallback;
  return words.toLowerCase() === 'none' ? '' : words;
}

/** The voice note: an audio file in the site folder, or '' (with a warning when it is something else). */
function readVoice(value, warnings) {
  if (isMissing(value)) return '';
  if (typeof value !== 'string') {
    warnings.push(`finale.voice should be a file name in quotes, like 'voice/message.m4a', so there is no voice note.`);
    return '';
  }
  const voice = sitePath(value, 'finale.voice', warnings);
  if (!voice) return '';
  if (!AUDIO_ENDING.test(voice.split(/[?#]/)[0])) {
    warnings.push(`finale.voice: ${show(voice)} is not an audio file (.m4a, .mp3, .aac or .wav), so there is no voice note.`);
    return '';
  }
  return voice;
}

/** Which pets wander the ride: one of PET_CHOICES, or 'random' (with a warning when the author wrote something else). */
function readPets(value, warnings) {
  if (isMissing(value)) return 'random';
  const pets = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (PET_CHOICES.includes(pets)) return pets;
  if (typeof value === 'string' && pets === '') return 'random'; // blank counts as not written
  warnings.push(`pets: ${show(value)} is not one of ${listOf(PET_CHOICES)}, so random is used.`);
  return 'random';
}

/** A '#rrggbb' colour, or `fallback` (with a warning when the author gave something else). */
function readColour(value, fallback, path, warnings) {
  if (isMissing(value)) return fallback;
  const colour = typeof value === 'string' ? value.trim() : '';
  if (HEX_COLOUR.test(colour)) return colour;
  warnings.push(`${path}: ${show(value)} is not a colour like ${fallback} (a # then six letters or numbers), so ${fallback} is used.`);
  return fallback;
}

function readLook(block, defaults, path, warnings) {
  return {
    skin: readColour(block.skin, defaults.skin, `${path}.skin`, warnings),
    hair: readColour(block.hair, defaults.hair, `${path}.hair`, warnings),
    outfit: readColour(block.outfit, defaults.outfit, `${path}.outfit`, warnings),
  };
}

function readMusic(value, warnings) {
  if (isMissing(value)) return '';
  if (typeof value !== 'string') {
    warnings.push(`music should be a file name in quotes, like 'music/our-song.mp3', so the built-in music is used.`);
    return '';
  }
  return sitePath(value, 'music', warnings);
}

/**
 * @param {unknown} raw  the default export of site/content.js
 * @returns {{ content: Content, warnings: string[], errors: string[] }}
 */
export function normalizeContent(raw) {
  const warnings = [];
  const errors = [];
  if (!isObject(raw)) errors.push('content.js did not export an object');
  const source = isObject(raw) ? raw : {};

  // Read in the order the fields appear in content.js, so the messages come out in that order too.
  const herName = text(source.herName);
  const yourName = text(source.yourName);
  const intro = readBlock(source, 'intro', warnings);
  const finale = readBlock(source, 'finale', warnings);
  const voice = readVoice(finale.voice, warnings);
  const zones = readZones(source.zones, warnings);
  const moments = readMoments(source.moments, zones, warnings, errors);
  const characters = readBlock(source, 'characters', warnings);

  // The lines derived from a name leave the name out when there is none, rather than show a
  // dangling "For " or "Happy 1 year, ".
  /** @type {Content} */
  const content = {
    herName,
    yourName,
    intro: {
      eyebrow: text(intro.eyebrow, 'Our first year'),
      title: text(intro.title, herName ? `For ${herName}` : 'For you'),
      note: text(intro.note),
      button: text(intro.button, 'Begin the ride'),
      hint: hideable(intro.hint, DEFAULT_HINT),
    },
    finale: {
      eyebrow: hideable(finale.eyebrow, 'One year of us'),
      wish: text(finale.wish, herName ? `Happy 1 year, ${herName}` : 'Happy 1 year'),
      message: text(finale.message),
      signoff: text(finale.signoff, yourName),
      voice,
    },
    zones,
    moments,
    characters: {
      her: readLook(readBlock(characters, 'her', warnings, 'characters.her'), DEFAULT_LOOKS.her, 'characters.her', warnings),
      you: readLook(readBlock(characters, 'you', warnings, 'characters.you'), DEFAULT_LOOKS.you, 'characters.you', warnings),
    },
    pets: readPets(source.pets, warnings),
    music: readMusic(source.music, warnings),
  };
  return { content, warnings, errors };
}
