import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent, ZONE_IDS, POSES, DEFAULT_HINT } from '../../site/src/content/normalize.js';
import shipped from '../../site/content.js';
import fixture from '../fixtures/content.fixture.js';

// The plan ran this one on site/content.js. That is the file the author rewrites, so its exact
// contents are not pinned: these assertions run on the fixture, and the shipped file only gets the
// invariant tests further down.
test('fixture content normalizes with no errors, in the default zone order', () => {
  const { content, errors } = normalizeContent(fixture);
  assert.deepEqual(errors, []);
  assert.deepEqual(content.zones, ZONE_IDS);
  assert.deepEqual(content.moments.map((m) => m.zone),
    ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'evening', 'evening']);
  assert.deepEqual(content.moments.map((m) => m.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('non-object input gives defaults and an error', () => {
  const { content, errors } = normalizeContent(undefined);
  assert.match(errors[0], /did not export an object/);
  assert.deepEqual(content.moments, []);
  assert.deepEqual(content.zones, ZONE_IDS);
});

test('derived defaults from names', () => {
  const { content } = normalizeContent({ herName: 'Maya', yourName: 'Sam' });
  assert.equal(content.intro.title, 'For Maya');
  assert.equal(content.finale.wish, 'Happy 1 year, Maya');
  assert.equal(content.finale.signoff, '— Sam');
  assert.equal(content.intro.button, 'Begin the ride');
});

test('zones: unknown dropped, duplicates removed, evening forced last', () => {
  const { content, warnings } = normalizeContent({ zones: ['autumn', 'moon', 'evening', 'winter', 'autumn'] });
  assert.deepEqual(content.zones, ['autumn', 'winter', 'evening']);
  assert.ok(warnings.some((w) => w.includes('"moon"')));
});

test('zones: evening appended when missing', () => {
  assert.deepEqual(normalizeContent({ zones: ['spring', 'summer'] }).content.zones, ['spring', 'summer', 'evening']);
});

test('moment without zone inherits the previous one', () => {
  const { content, warnings } = normalizeContent({ moments: [{ zone: 'summer' }, {}] });
  assert.equal(content.moments[1].zone, 'summer');
  assert.ok(warnings.some((w) => w.includes('Moment 2')));
});

test('first moment without zone takes the first zone', () => {
  assert.equal(normalizeContent({ zones: ['winter', 'evening'], moments: [{}] }).content.moments[0].zone, 'winter');
});

test('moment zone not in zones list is treated as missing', () => {
  const { content } = normalizeContent({ zones: ['autumn', 'evening'], moments: [{ zone: 'spring' }] });
  assert.equal(content.moments[0].zone, 'autumn');
});

test('out-of-order zone is an error and is coerced', () => {
  const { content, errors } = normalizeContent({ moments: [{ zone: 'summer' }, { zone: 'spring' }] });
  assert.ok(errors.some((e) => e.includes('Moment 2') && e.includes('zone order')));
  assert.equal(content.moments[1].zone, 'summer');
});

test('invalid colours fall back with a warning', () => {
  const { content, warnings } = normalizeContent({ characters: { her: { hair: 'red' } } });
  assert.equal(content.characters.her.hair, '#3b2416');
  assert.ok(warnings.length > 0);
});

test('text coercion and trimming', () => {
  const { content } = normalizeContent({ herName: '  Maya ', moments: [{ title: 42, caption: null }] });
  assert.equal(content.herName, 'Maya');
  assert.equal(content.moments[0].title, '42');
  assert.equal(content.moments[0].caption, '');
});

test('no cap on number of moments', () => {
  const moments = Array.from({ length: 14 }, () => ({ zone: 'spring' }));
  assert.equal(normalizeContent({ moments }).content.moments.length, 14);
});

test('music must be a string', () => {
  const { content, warnings } = normalizeContent({ music: 5 });
  assert.equal(content.music, '');
  assert.ok(warnings.length > 0);
});

// ---------------------------------------------------------------------------
// Everything above is the plan's own tests. Below: the rest of the rules table, the exact
// shape later tasks consume, and the guards that keep a hand-edited file from breaking the page.

const DEFAULT_HER = { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' };
const DEFAULT_YOU = { skin: '#e8b994', hair: '#2a1a10', outfit: '#5b7fc4' };

test('an empty object gives every default, in exactly the shape later tasks consume', () => {
  const { content, warnings, errors } = normalizeContent({});
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(content, {
    herName: '',
    yourName: '',
    intro: {
      eyebrow: 'Our first year', title: 'For you', note: '', button: 'Begin the ride',
      hint: 'Best with sound on and headphones in.',
    },
    finale: { eyebrow: 'One year of us', wish: 'Happy 1 year', message: '', signoff: '', voice: '' },
    zones: ['spring', 'summer', 'autumn', 'winter', 'evening'],
    moments: [],
    characters: { her: DEFAULT_HER, you: DEFAULT_YOU },
    pets: 'random',
    music: '',
  });
});

test('anything that is not a plain object is reported and replaced by the defaults', () => {
  for (const junk of [null, undefined, 'text', 42, true, [], [{ herName: 'Maya' }]]) {
    const { content, warnings, errors } = normalizeContent(junk);
    assert.deepEqual(errors, ['content.js did not export an object'], `for ${JSON.stringify(junk)}`);
    assert.deepEqual(warnings, []);
    assert.equal(content.herName, '');
    assert.deepEqual(content.moments, []);
  }
});

test('written text wins over the derived defaults', () => {
  const { content } = normalizeContent({
    herName: 'Maya',
    yourName: 'Sam',
    intro: { eyebrow: 'Hello', title: 'Our ride', note: 'Come in.', button: 'Go' },
    finale: { eyebrow: 'Forever', wish: 'Cheers, love', message: 'Thank you.', signoff: 'Love, Sam' },
  });
  assert.deepEqual(content.intro, {
    eyebrow: 'Hello', title: 'Our ride', note: 'Come in.', button: 'Go', hint: 'Best with sound on and headphones in.',
  });
  assert.deepEqual(content.finale, {
    eyebrow: 'Forever', wish: 'Cheers, love', message: 'Thank you.', signoff: 'Love, Sam', voice: '',
  });
});

test('blank text counts as empty, so the defaults apply', () => {
  const { content } = normalizeContent({
    herName: 'Maya',
    intro: { eyebrow: '', title: '   ', button: '\n' },
    finale: { eyebrow: '  ', wish: null, signoff: 7 },
  });
  assert.equal(content.intro.eyebrow, 'Our first year');
  assert.equal(content.intro.title, 'For Maya');
  assert.equal(content.intro.button, 'Begin the ride');
  assert.equal(content.finale.eyebrow, 'One year of us');
  assert.equal(content.finale.wish, 'Happy 1 year, Maya');
  assert.equal(content.finale.signoff, '7');
});

test('text fields: numbers are written out, other non-strings count as missing', () => {
  const { content } = normalizeContent({
    moments: [{ title: true, date: 7 }, { title: NaN, caption: ['x'] }, { title: {}, photo: false }],
  });
  assert.deepEqual(content.moments.map((m) => m.title), ['Moment 1', 'Moment 2', 'Moment 3']);
  assert.equal(content.moments[0].date, '7');
  assert.equal(content.moments[1].caption, '');
  assert.equal(content.moments[2].photo, '');
});

test('zones: the first four can be reordered without a murmur', () => {
  const { content, warnings, errors } = normalizeContent({ zones: ['autumn', 'winter', 'spring', 'summer', 'evening'] });
  assert.deepEqual(content.zones, ['autumn', 'winter', 'spring', 'summer', 'evening']);
  assert.deepEqual([...warnings, ...errors], []);
});

test('zones: a repeat, a misplaced evening and a missing evening are each reported', () => {
  const repeated = normalizeContent({ zones: ['spring', 'spring', 'evening'] });
  assert.deepEqual(repeated.content.zones, ['spring', 'evening']);
  assert.ok(repeated.warnings.some((w) => w.includes('"spring"') && w.includes('more than once')));

  const misplaced = normalizeContent({ zones: ['evening', 'spring'] });
  assert.deepEqual(misplaced.content.zones, ['spring', 'evening']);
  assert.ok(misplaced.warnings.some((w) => w.includes('"evening"') && w.includes('last')));

  const missing = normalizeContent({ zones: ['spring'] });
  assert.deepEqual(missing.content.zones, ['spring', 'evening']);
  assert.ok(missing.warnings.some((w) => w.includes('"evening"') && w.includes('added')));
});

test('zones: something that is not a list falls back to the default order, with a warning', () => {
  const { content, warnings } = normalizeContent({ zones: 'spring' });
  assert.deepEqual(content.zones, ZONE_IDS);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^zones /);
});

test('zones: the shared ZONE_IDS list is never handed out to be changed', () => {
  const { content } = normalizeContent({});
  content.zones.reverse();
  assert.deepEqual(ZONE_IDS, ['spring', 'summer', 'autumn', 'winter', 'evening']);
  assert.throws(() => ZONE_IDS.push('moon'), TypeError);
});

test('a moment zone that is unknown or not in the zones list is reported by moment number', () => {
  const unknown = normalizeContent({ moments: [{ zone: 'summer' }, { zone: 'moon' }] });
  assert.equal(unknown.content.moments[1].zone, 'summer');
  assert.ok(unknown.warnings.some((w) => w.includes('Moment 2') && w.includes('"moon"')));

  const unlisted = normalizeContent({ zones: ['autumn', 'evening'], moments: [{ zone: 'spring' }] });
  assert.equal(unlisted.content.moments[0].zone, 'autumn');
  assert.ok(unlisted.warnings.some((w) => w.includes('Moment 1') && w.includes('"spring"')));
  assert.deepEqual(unlisted.errors, []);
});

test('zone order is checked against the corrected zone of the moment before', () => {
  const { content, errors } = normalizeContent({
    moments: [{ zone: 'summer' }, { zone: 'spring' }, { zone: 'autumn' }, { zone: 'summer' }],
  });
  assert.deepEqual(content.moments.map((m) => m.zone), ['summer', 'summer', 'autumn', 'autumn']);
  assert.equal(errors.length, 2);
  assert.ok(errors[0].includes('Moment 2') && errors[1].includes('Moment 4'));
});

test('a reordered zones list reorders what counts as "earlier"', () => {
  const { content, errors } = normalizeContent({
    zones: ['autumn', 'spring', 'evening'],
    moments: [{ zone: 'autumn' }, { zone: 'spring' }, { zone: 'autumn' }],
  });
  assert.deepEqual(content.moments.map((m) => m.zone), ['autumn', 'spring', 'spring']);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('Moment 3'));
});

test('missing moment fields get their defaults, and a full moment is kept as written', () => {
  const { content } = normalizeContent({
    moments: [
      {},
      { photo: ' photos/01.jpg ', date: 'Oct 2025', title: 'First coffee', caption: 'We met.', zone: 'spring' },
    ],
  });
  assert.deepEqual(content.moments[0], {
    index: 0, photo: '', live: '', date: '', title: 'Moment 1', caption: '', zone: 'spring', pose: 'holding-hands',
  });
  assert.deepEqual(content.moments[1], {
    index: 1, photo: 'photos/01.jpg', live: '', date: 'Oct 2025', title: 'First coffee', caption: 'We met.', zone: 'spring',
    pose: 'holding-hands',
  });
});

test('a moment that is not an object is filled in with defaults and reported', () => {
  const { content, warnings } = normalizeContent({ moments: [{ title: 'One' }, null, 'two', , { title: 'Four' }] });
  assert.deepEqual(content.moments.map((m) => m.title), ['One', 'Moment 2', 'Moment 3', 'Moment 4', 'Four']);
  assert.deepEqual(content.moments.map((m) => m.index), [0, 1, 2, 3, 4]);
  for (const n of [2, 3, 4]) assert.ok(warnings.some((w) => w.startsWith(`Moment ${n} `)), `Moment ${n}`);
});

test('a moment that is not an object gets one message, and the zone of the moment before it', () => {
  const first = normalizeContent({ moments: [null] });
  assert.equal(first.content.moments[0].zone, 'spring');
  assert.equal(first.warnings.length, 1);
  assert.match(first.warnings[0], /^Moment 1 should be a \{ \.\.\. \} block/);

  const later = normalizeContent({ moments: [{ zone: 'summer' }, 'oops'] });
  assert.equal(later.content.moments[1].zone, 'summer');
  assert.equal(later.warnings.length, 1);
  assert.match(later.warnings[0], /^Moment 2 should be a \{ \.\.\. \} block/);
});

test('moments that are not a list are ignored and reported', () => {
  const { content, warnings } = normalizeContent({ moments: { title: 'Oops' } });
  assert.deepEqual(content.moments, []);
  assert.ok(warnings.some((w) => w.startsWith('moments ')));
});

test('colours: valid hex is kept, anything else falls back with a warning that names the field', () => {
  const { content, warnings } = normalizeContent({
    characters: {
      her: { skin: '#ABCDEF', hair: '#fff', outfit: 12 },
      you: { skin: ' #123456 ', hair: 'blue', outfit: '#1234567' },
    },
  });
  assert.deepEqual(content.characters.her, { skin: '#ABCDEF', hair: DEFAULT_HER.hair, outfit: DEFAULT_HER.outfit });
  assert.deepEqual(content.characters.you, { skin: '#123456', hair: DEFAULT_YOU.hair, outfit: DEFAULT_YOU.outfit });
  assert.equal(warnings.length, 4);
  for (const field of ['characters.her.hair', 'characters.her.outfit', 'characters.you.hair', 'characters.you.outfit']) {
    assert.ok(warnings.some((w) => w.startsWith(field)), field);
  }
});

test('a section that is not an object is reported and replaced by its defaults', () => {
  const { content, warnings } = normalizeContent({ herName: 'Maya', intro: 'hello', finale: 5, characters: { her: 'x' } });
  assert.equal(content.intro.title, 'For Maya');
  assert.equal(content.finale.wish, 'Happy 1 year, Maya');
  assert.deepEqual(content.characters.her, DEFAULT_HER);
  assert.equal(warnings.length, 3);
  for (const path of ['intro', 'finale', 'characters.her']) assert.ok(warnings.some((w) => w.startsWith(`${path} `)), path);
});

test('music: a file path is kept, trimmed', () => {
  const { content, warnings } = normalizeContent({ music: ' music/our-song.mp3 ' });
  assert.equal(content.music, 'music/our-song.mp3');
  assert.deepEqual(warnings, []);
});

// A leading "/" works on the computer (npm run serve) but not at user.github.io/repo/, and "site/" works nowhere:
// paths are relative to the site folder, so both are taken off (and "./", for tidiness), with a warning.
test('photo paths: a leading "/", "./" or "site/" is taken off, with a warning naming the moment', () => {
  const photos = ['/photos/01.jpg', './photos/02.jpg', 'site/photos/03.jpg', '/site/photos/04.jpg', ' ./site/photos/05.jpg ', 'photos/06.jpg'];
  const { content, warnings, errors } = normalizeContent({ moments: photos.map((photo) => ({ photo, zone: 'spring' })) });
  assert.deepEqual(content.moments.map((m) => m.photo), ['photos/01.jpg', 'photos/02.jpg', 'photos/03.jpg', 'photos/04.jpg', 'photos/05.jpg', 'photos/06.jpg']);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 5);
  warnings.forEach((w, i) => {
    assert.ok(w.startsWith(`Moment ${i + 1} photo: `), w);
    assert.ok(w.includes(JSON.stringify(photos[i].trim())) && w.includes(`"photos/0${i + 1}.jpg"`), w);
  });
});

test('music path: a leading "/", "./" or "site/" is taken off, with a warning naming the field', () => {
  for (const music of ['/music/our-song.mp3', './music/our-song.mp3', 'site/music/our-song.mp3', '/site/music/our-song.mp3']) {
    const { content, warnings } = normalizeContent({ music });
    assert.equal(content.music, 'music/our-song.mp3', music);
    assert.equal(warnings.length, 1, music);
    assert.ok(warnings[0].startsWith('music: ') && warnings[0].includes(JSON.stringify(music)), warnings[0]);
  }
});

test('whatever ends up in content.js, the result is well-formed and nothing throws', () => {
  const junk = [
    undefined, null, 0, 42, '', 'text', true, [], [1, 2], {},
    { moments: 'x' }, { moments: 5 }, { moments: {} },
    { moments: [null, undefined, 5, 'x', [], {}, , { zone: 5, title: {}, caption: [], date: NaN, photo: false }] },
    { zones: 'x' }, { zones: 5 }, { zones: {} }, { zones: [] }, { zones: [null, 5, {}, 'moon', 'evening', 'evening'] },
    { intro: 'x', finale: 5, characters: 'x' },
    { intro: [], finale: [], characters: { her: 'x', you: [] } },
    { characters: { her: { skin: 5, hair: null, outfit: {} }, you: { skin: '#12', hair: '#gggggg', outfit: ' #AABBCC ' } } },
    { music: 5 }, { music: {} }, { music: null },
    { herName: {}, yourName: [], intro: { title: 5, note: [] } },
  ];
  for (const raw of junk) {
    const label = (() => { try { return JSON.stringify(raw); } catch { return String(raw); } })();
    const { content, warnings, errors } = normalizeContent(raw);
    const why = `for ${label}`;
    assert.ok([...warnings, ...errors].every((message) => typeof message === 'string'), why);
    for (const value of [content.herName, content.yourName, content.music, ...Object.values(content.intro), ...Object.values(content.finale)]) {
      assert.equal(typeof value, 'string', why);
    }
    assert.equal(content.zones[content.zones.length - 1], 'evening', why);
    assert.equal(new Set(content.zones).size, content.zones.length, why);
    assert.ok(content.zones.every((zone) => ZONE_IDS.includes(zone)), why);
    let position = 0;
    content.moments.forEach((moment, i) => {
      assert.equal(moment.index, i, why);
      for (const key of ['photo', 'date', 'title', 'caption']) assert.equal(typeof moment[key], 'string', why);
      assert.notEqual(moment.title, '', why);
      const at = content.zones.indexOf(moment.zone);
      assert.ok(at >= position, `${why}: Moment ${i + 1} is outside its zone order`);
      position = at;
    });
    for (const look of [content.characters.her, content.characters.you]) {
      for (const colour of [look.skin, look.hair, look.outfit]) assert.match(colour, /^#[0-9a-f]{6}$/i, why);
    }
  }
});

// The two tests below are about whatever site/content.js holds right now. They pin no text and no
// count, so personalising that file (names, twelve moments, another zone order) cannot turn them
// red; a mistake in it can, which is the point.
test('shipped content.js normalizes with no errors, and its moments follow its zones', () => {
  const { content, errors } = normalizeContent(shipped);
  assert.deepEqual(errors, []);
  assert.equal(content.zones[content.zones.length - 1], 'evening');
  assert.ok(content.moments.every((m) => content.zones.includes(m.zone)));
  assert.deepEqual(content.moments.map((m) => m.index), content.moments.map((_, i) => i));
});

test('shipped content.js has no warnings either', () => {
  assert.deepEqual(normalizeContent(shipped).warnings, []);
});

test('the e2e fixture is clean and gives the exact strings the e2e specs look for', () => {
  const { content, warnings, errors } = normalizeContent(fixture);
  assert.deepEqual([...warnings, ...errors], []);
  assert.equal(content.herName, 'Maya');
  assert.equal(content.yourName, 'Sam');
  assert.equal(content.intro.title, 'For Maya');
  assert.equal(content.intro.note, 'A little ride through our first year.');
  assert.equal(content.intro.button, 'Begin the ride');
  assert.equal(content.finale.wish, 'Happy 1 year, Maya');
  assert.equal(content.finale.message, 'Thank you for the best year of my life.');
  assert.equal(content.finale.signoff, '— Sam');
  assert.deepEqual(content.zones, ZONE_IDS);
  assert.deepEqual(content.moments.map((m) => m.title),
    ['First coffee', 'Rainy walk', 'Beach day', 'Sunset pier', 'Pumpkin patch', 'Movie night', 'First snow', 'Ice skating', 'City lights', 'Our dinner']);
  assert.equal(content.moments[0].date, 'Oct 2025');
  assert.equal(content.moments[9].date, 'Sep 2026');
  assert.deepEqual(content.moments.map((m) => m.zone),
    ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'evening', 'evening']);
  assert.ok(content.moments.every((m) => m.photo === ''));
  // The fixture leaves the immersion fields out on purpose, so the specs see their defaults.
  assert.equal(content.intro.hint, DEFAULT_HINT);
  assert.equal(content.finale.voice, '');
  assert.equal(content.pets, 'random');
  assert.ok(content.moments.every((m) => m.pose === 'holding-hands'));
  // Later specs copy fixture moments and read .zone straight off them, so each must say it outright.
  assert.ok(fixture.moments.every((m) => typeof m.zone === 'string'));
});

// Live Photos: a moment's optional `live` motion clip beside its still `photo`.

test('live: a motion clip beside a still photo is kept, its path cleaned like a photo\'s', () => {
  const { content, warnings } = normalizeContent({ moments: [
    { photo: 'photos/04.jpg', live: '  photos/04.mp4 ' },
    { photo: 'photos/05.jpg', live: '/photos/05.MOV' },
    { photo: 'photos/06.jpg' },
  ] });
  assert.deepEqual(content.moments.map((m) => m.live), ['photos/04.mp4', 'photos/05.MOV', '']);
  assert.ok(warnings.some((w) => w.includes('Moment 2 live')), warnings.join('\n'));
});

test('live: left out, with a warning, when it is not a video or there is no still photo for it', () => {
  const { content, warnings } = normalizeContent({ moments: [
    { photo: 'photos/04.jpg', live: 'photos/04.jpg' },
    { photo: '', live: 'photos/05.mp4' },
    { photo: 'photos/06.mp4', live: 'photos/06b.mp4' },
  ] });
  assert.deepEqual(content.moments.map((m) => m.live), ['', '', '']);
  for (const n of [1, 2, 3]) assert.ok(warnings.some((w) => w.includes(`Moment ${n} live`)), `Moment ${n}: ${warnings.join('\n')}`);
});

// Immersion fields: the sound hint, his voice note, a pose for each moment, and the pets.

test('the sound hint: a default line, your own, or none', () => {
  assert.equal(normalizeContent({}).content.intro.hint, 'Best with sound on and headphones in.');
  assert.equal(normalizeContent({ intro: { hint: 'Headphones!' } }).content.intro.hint, 'Headphones!');
  assert.equal(normalizeContent({ intro: { hint: 'none' } }).content.intro.hint, '');
});

test('the voice note is an audio file in the site folder, or nothing', () => {
  const read = (voice) => normalizeContent({ finale: { voice } });
  assert.equal(read('').content.finale.voice, '');
  assert.equal(read('voice/message.m4a').content.finale.voice, 'voice/message.m4a');
  assert.equal(read('/voice/a.mp3').content.finale.voice, 'voice/a.mp3');
  const notAudio = read('voice/message.jpg');
  assert.equal(notAudio.content.finale.voice, '');
  assert.match(notAudio.warnings.join('\n'), /finale\.voice/);
});

test('each moment has a pose, holding hands unless it says otherwise', () => {
  const { content, warnings } = normalizeContent({ zones: ['spring', 'evening'], moments: [
    { zone: 'spring' }, { zone: 'spring', pose: 'hug' }, { zone: 'evening', pose: 'cartwheel' },
  ] });
  assert.deepEqual(content.moments.map((m) => m.pose), ['holding-hands', 'hug', 'holding-hands']);
  assert.match(warnings.join('\n'), /Moment 3 pose/);
});

test('pets: random unless dog, cat or none', () => {
  assert.equal(normalizeContent({}).content.pets, 'random');
  assert.equal(normalizeContent({ pets: 'cat' }).content.pets, 'cat');
  assert.equal(normalizeContent({ pets: 'hamster' }).content.pets, 'random');
});

test('the immersion fields: every pose is accepted, the warnings say what to write, and blank means the default', () => {
  assert.ok(Object.isFrozen(POSES));
  assert.deepEqual([...POSES], ['holding-hands', 'waving', 'hug', 'sitting', 'dancing', 'pointing', 'none']);
  assert.equal(DEFAULT_HINT, 'Best with sound on and headphones in.');
  const all = normalizeContent({ moments: POSES.map((pose) => ({ zone: 'spring', pose })) });
  assert.deepEqual(all.content.moments.map((m) => m.pose), [...POSES]);
  assert.deepEqual(all.warnings, []);

  const odd = normalizeContent({
    finale: { voice: 'voice/Message.M4A' }, pets: 'dog',
    moments: [{ zone: 'spring', pose: '  ' }, { zone: 'spring', pose: 'cartwheel' }],
  });
  assert.equal(odd.content.finale.voice, 'voice/Message.M4A');
  assert.equal(odd.content.pets, 'dog');
  assert.deepEqual(odd.warnings, [
    'Moment 2 pose: "cartwheel" is not one of holding-hands, waving, hug, sitting, dancing, pointing or none, so they hold hands.',
  ]);

  assert.deepEqual(normalizeContent({ finale: { voice: 'voice/note.jpg' } }).warnings, [
    'finale.voice: "voice/note.jpg" is not an audio file (.m4a, .mp3, .aac or .wav), so there is no voice note.',
  ]);
  assert.match(normalizeContent({ finale: { voice: 5 } }).warnings[0], /^finale\.voice /);
  assert.deepEqual(normalizeContent({ pets: 'hamster' }).warnings, [
    'pets: "hamster" is not one of random, dog, cat or none, so random is used.',
  ]);
  assert.deepEqual(normalizeContent({ pets: ' ' }).warnings, []);
  assert.equal(normalizeContent({ intro: { hint: '  ' } }).content.intro.hint, DEFAULT_HINT);
});
