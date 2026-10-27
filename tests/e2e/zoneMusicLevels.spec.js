// The scenes' recordings against the built-in tune, rendered offline (OfflineAudioContext, stereo, 48 kHz) through
// the real master chain (audio/mixer.js) and measured as EBU R128 does (loudness.js): each recording, at its trim
// (audio/zoneMusic.js PIECES), sits as loud as the tune, and none clips. A media element cannot play into an
// offline context, so each file is decoded and played from a buffer instead, into the same gains as the element
// would be. What it measured goes with the test's results (and to the console with AUDIO_LEVELS=1).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const loudnessModule = readFileSync(new URL('./loudness.js', import.meta.url), 'utf8');

test('each scene\'s recording sits at the tune\'s loudness through the master chain, and none clips', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'levels are measured in one engine, Chromium');
  test.setTimeout(180_000);
  await page.route('**/site/zone-music-levels.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>levels</title>' }));
  await page.route('**/site/loudness.js', (r) => r.fulfill({ contentType: 'text/javascript', body: loudnessModule }));
  await page.goto('zone-music-levels.html');

  const m = await page.evaluate(async () => {
    const { loudness } = await import('./loudness.js');
    const { createMixer } = await import('./src/audio/mixer.js');
    const { createSynth } = await import('./src/audio/music.js');
    const { composeLoop } = await import('./src/audio/compose.js');
    const { PIECES, TUNE_LUFS } = await import('./src/audio/zoneMusic.js');

    const RATE = 48000;
    /** Renders `seconds` of stereo; `build(ctx)` adds the sound. */
    async function render(seconds, build) {
      const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE);
      build(ctx);
      const buffer = await ctx.startRendering();
      return [buffer.getChannelData(0), buffer.getChannelData(1)];
    }
    /** `sound(ctx, into)` through a fresh master chain, fully up. */
    const throughChain = (sound) => (ctx) => {
      const mixer = createMixer(ctx);
      mixer.fade(true, 0.01);
      sound(ctx, mixer.music);
    };

    // The tune, two whole loops of it: from its instruments alone (TUNE_LUFS), and through the chain.
    const loop = composeLoop();
    const LOOPS = 2;
    const tune = (ctx, into) => {
      const synth = createSynth(ctx, into);
      synth.fade(true, 0.01);
      for (let k = 0; k < LOOPS; k++) for (const note of loop.notes) synth.playNote(note, 0.05 + k * loop.lengthSec + note.t);
    };
    const seconds = LOOPS * loop.lengthSec + 1;
    const out = {
      tuneAlone: loudness(await render(seconds, (ctx) => tune(ctx, ctx.destination)), RATE),
      tune: loudness(await render(seconds, throughChain(tune)), RATE),
    };

    // Each recording whole: the file alone, and through its trim and the chain.
    for (const [zone, piece] of Object.entries(PIECES)) {
      const bytes = await (await fetch(piece.file)).arrayBuffer();
      const decoded = await new OfflineAudioContext(2, RATE, RATE).decodeAudioData(bytes);
      out[`${zone}File`] = loudness([decoded.getChannelData(0), decoded.getChannelData(1)], RATE);
      out[zone] = loudness(await render(decoded.duration, throughChain((ctx, into) => {
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        const trim = ctx.createGain();
        trim.gain.value = piece.trim;
        source.connect(trim).connect(into);
        source.start(0);
      })), RATE);
    }
    return { levels: out, table: PIECES, tuneLufs: TUNE_LUFS };
  });

  const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)])));
  const levels = JSON.stringify(round(m.levels));
  await test.info().attach('zone-music-levels.json', { body: levels, contentType: 'application/json' });
  if (process.env.AUDIO_LEVELS) console.log('[zone music levels]', levels);

  const L = m.levels;
  // The numbers the trims are worked out from are what the files and the tune measure.
  expect(Math.abs(L.tuneAlone.integrated - m.tuneLufs)).toBeLessThanOrEqual(0.2);
  for (const zone of ['spring', 'summer', 'autumn', 'evening']) {
    expect(Math.abs(L[`${zone}File`].integrated - m.table[zone].lufs), `${zone}'s file`).toBeLessThanOrEqual(0.2);
    // Through the chain, as loud as the tune (within 1 LU, its compressor taking a little off the loudest chords)...
    expect(Math.abs(L[zone].integrated - L.tune.integrated), zone).toBeLessThanOrEqual(1);
    expect(Math.abs(L[zone].rms - L.tune.rms), `${zone} RMS`).toBeLessThanOrEqual(1.5);
    // ...and never near clipping.
    expect(Math.pow(10, L[zone].peak / 20), `${zone} peak`).toBeLessThan(0.9);
  }
});
