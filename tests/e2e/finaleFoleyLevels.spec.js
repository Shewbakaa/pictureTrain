// The finale's foley levels, rendered offline (OfflineAudioContext, stereo) through the real master chain
// (audio/mixer.js) with the real voices (audio/foleySounds.js), against the targets in the sound design's finale
// foley addendum (docs/superpowers/specs/2026-10-26-sound-effects-design.md): the station bell peaking about
// −22 dBFS, the shop bell about −26, the footsteps, the landing tap, the heartbeats, the whoosh, the rustle, the
// crinkle, the door and the doves about −30; each under the music at its loudest; and the whole finale, with the
// music, the evening's crickets, the arrival's sigh and whistle, the sparkle and the fireworks, never clipping. What
// it measured goes with the test's results (and to the console with AUDIO_LEVELS=1).
import { test, expect } from '@playwright/test';

test('the finale\'s foley sits at its targets, under the music, and the whole finale never clips', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'levels are measured in one engine, Chromium');
  test.setTimeout(180_000);
  await page.route('**/site/finale-levels.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>levels</title>' }));
  await page.goto('finale-levels.html');

  const m = await page.evaluate(async () => {
    const { createMixer } = await import('./src/audio/mixer.js');
    const { createSynth } = await import('./src/audio/musicBox.js');
    const { composeLoop } = await import('./src/audio/compose.js');
    const { createKit } = await import('./src/audio/sfx.js');
    const { createTrainSounds } = await import('./src/audio/trainSounds.js');
    const { createBed } = await import('./src/audio/ambienceBeds.js');
    const { createCueSounds } = await import('./src/audio/cueSounds.js');
    const { createFoleySounds } = await import('./src/audio/foleySounds.js');
    const { STATION_BELL } = await import('./src/audio/sfxTiming.js');
    const { foleyCues } = await import('./src/finale/foleyTiming.js');
    const { fireworkBlooms } = await import('./src/finale/fireworkTiming.js');

    const RATE = 48000;
    const STEP = 0.1;
    const db = (x) => 20 * Math.log10(x);

    /** Renders `seconds` of stereo through a fresh master chain, fully up (as ambienceLevels.spec.js does). */
    async function render(seconds, build) {
      const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE);
      const mixer = createMixer(ctx);
      mixer.fade(true, 0.01);
      const tick = build(ctx, mixer, createKit(mixer, { budget: Infinity }));
      if (tick) {
        tick(0);
        for (let t = STEP; t < seconds - STEP; t += STEP) {
          const at = t;
          ctx.suspend(at).then(() => {
            tick(at);
            ctx.resume();
          });
        }
      }
      const buffer = await ctx.startRendering();
      return [buffer.getChannelData(0), buffer.getChannelData(1)];
    }
    const peak = (channels) => Math.max(...channels.map((data) => data.reduce((p, x) => Math.max(p, Math.abs(x)), 0)));
    const rmsOf = (data, from, to) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    };
    const loudest = (channels) => {
      const n = Math.round(0.05 * RATE);
      let top = 0;
      for (const data of channels) for (let i = 0; i + n <= data.length; i += n) top = Math.max(top, rmsOf(data, i, i + n));
      return top;
    };
    const measure = (channels) => ({ peakDb: db(peak(channels)), loudestDb: db(loudest(channels)) });

    const out = {};
    const loop = composeLoop();
    const music = await render(10, (ctx, mixer) => {
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < 10) synth.playNote(note, note.t + 0.05);
    });
    out.music = measure(music);

    // Each voice at full level, several times (some are drawn afresh each time): its loudest.
    const voices = {
      bell: [3, 3], 'shop-bell': [4, 1.2], step: [10, 0.5], land: [6, 0.5], heartbeat: [4, 1.2], hop: [5, 1],
      dress: [5, 0.8], crinkle: [4, 1], door: [4, 1], doves: [3, 2],
    };
    for (const [name, [count, every]] of Object.entries(voices)) {
      const channels = await render(count * every + 0.5, (ctx, mixer, kit) => {
        const foley = createFoleySounds(kit, mixer.effects);
        for (let i = 0; i < count; i++) foley[name](0.2 + i * every, 1);
      });
      out[name] = measure(channels);
    }

    // The whole finale as the ride plays it: the music and the evening's crickets throughout; the train stops at 0.2 s
    // (its sigh, the whistle, the station bell), and the finale's clock starts 0.4 s later, under the blush; then
    // every foley cue and footstep at its time, the sparkle, and the fireworks (four bursts) to the end.
    const finale = await render(16, (ctx, mixer, kit) => {
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < 16) synth.playNote(note, note.t + 0.05);
      const stop = 0.2;
      const start = stop + 0.4;
      const train = createTrainSounds(kit);
      train.steam('sigh', stop);
      train.whistle('finale', stop + 0.35);
      const foley = createFoleySounds(kit, mixer.effects);
      foley.bell(stop + STATION_BELL.AFTER, 1);
      const cues = createCueSounds(kit);
      foleyCues(0, 15, (name, t, level) => {
        if (name === 'sparkle') cues.sparkle(start + t, level);
        else foley[name](start + t, level);
      });
      const pans = [-0.35, 0.3, -0.1, 0.45];
      fireworkBlooms(0, 15, 4, (b, t) => cues.firework(start + t, 1, pans[b]));
      const bed = createBed(kit, 'evening');
      bed.fade.gain.value = 1;
      return (t) => bed.tick(t + 0.3);
    });
    out.finaleMix = measure(finale);
    return out;
  });

  const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)])));
  const levels = JSON.stringify(round(m));
  await test.info().attach('finale-foley-levels.json', { body: levels, contentType: 'application/json' });
  if (process.env.AUDIO_LEVELS) console.log('[finale foley levels]', levels);

  const targets = {
    bell: -22, 'shop-bell': -26, step: -30, land: -30, heartbeat: -30, hop: -30, dress: -30, crinkle: -30, door: -30, doves: -30,
  };
  for (const [name, target] of Object.entries(targets)) {
    expect(Math.abs(m[name].peakDb - target), `${name} peaks at ${m[name].peakDb.toFixed(2)} dBFS`).toBeLessThanOrEqual(2);
    expect(m[name].loudestDb, `${name} under the music`).toBeLessThan(m.music.loudestDb);
  }
  expect(Math.pow(10, m.finaleMix.peakDb / 20), 'the finale never clips').toBeLessThan(0.9);
});
