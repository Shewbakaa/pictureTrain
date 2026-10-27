// The mix's levels, rendered offline (OfflineAudioContext) through the real master chain (audio/mixer.js) with the
// real instruments: the built-in tune and the train's sounds. It checks the targets in the sound design
// (docs/superpowers/specs/2026-10-26-sound-effects-design.md) and attaches what it measured to the results.
import { test, expect } from '@playwright/test';

test('the mix never clips, the music is a third quieter, and the train sits at its target levels', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'levels are measured in one engine, Chromium');
  // A blank page under site/, so the modules import as the ride's own do.
  await page.route('**/site/audio-levels.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>levels</title>' }));
  await page.goto('audio-levels.html');

  const m = await page.evaluate(async () => {
    const { createMixer, BUS } = await import('./src/audio/mixer.js');
    const { createSynth } = await import('./src/audio/music.js');
    const { composeLoop } = await import('./src/audio/compose.js');
    const { createKit } = await import('./src/audio/sfx.js');
    const { createTrainSounds } = await import('./src/audio/trainSounds.js');
    const { TRAIN, chugInterval, chugLevel, clickLevel, bogieDelay } = await import('./src/audio/sfxTiming.js');
    const { RIDE } = await import('./src/ride/rideController.js');

    const RATE = 48000;
    const SECONDS = 10;
    const OLD_MUSIC_LEVEL = 0.16; // the tune's level before the train's sounds joined it
    const loop = composeLoop();
    const db = (x) => 20 * Math.log10(x);

    /** Renders `seconds` of mono through a fresh master chain, fully up; `build` adds the sounds. */
    async function render(seconds, build) {
      const ctx = new OfflineAudioContext(1, seconds * RATE, RATE);
      const mixer = createMixer(ctx);
      mixer.fade(true, 0.01);
      build(ctx, mixer);
      return (await ctx.startRendering()).getChannelData(0);
    }
    const peak = (data) => data.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
    const rms = (data, from = 0, to = data.length) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    };

    const playTune = (ctx, mixer, level) => {
      if (level) mixer.music.gain.value = level;
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < SECONDS) synth.playNote(note, note.t + 0.05);
    };
    const train = (mixer) => createTrainSounds(createKit(mixer));
    // Cruising from `from` s to the end: a chug every interval, a joint's two clicks every 12 m.
    const chugs = (sounds, from) => {
      for (let t = from; t < SECONDS - 0.3; t += chugInterval(RIDE.CRUISE)) sounds.chug(t, chugLevel(RIDE.CRUISE));
    };
    const clicks = (sounds, from) => {
      for (let t = from; t < SECONDS - 0.6; t += TRAIN.JOINT_EVERY / RIDE.CRUISE) {
        sounds.click(t, clickLevel(RIDE.CRUISE));
        sounds.click(t + bogieDelay(RIDE.CRUISE), clickLevel(RIDE.CRUISE));
      }
    };
    const afterFade = Math.round(1 * RATE);

    // The compressor's makeup gain: a quiet sine in, how much louder it comes out.
    const makeupData = await render(1, (ctx, mixer) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.01;
      osc.connect(gain).connect(mixer.effects);
      osc.start(0);
    });
    const makeupDb = db(peak(makeupData.subarray(RATE / 2)) / 0.01);

    const musicOld = await render(SECONDS, (ctx, mixer) => playTune(ctx, mixer, OLD_MUSIC_LEVEL));
    const musicNew = await render(SECONDS, (ctx, mixer) => playTune(ctx, mixer, 0));
    const whistle = await render(3, (ctx, mixer) => train(mixer).whistle('depart', 0.2));
    const whistleFinale = await render(3, (ctx, mixer) => train(mixer).whistle('finale', 0.2));
    const chugOnly = await render(SECONDS, (ctx, mixer) => chugs(train(mixer), 0.1));
    const clickOnly = await render(SECONDS, (ctx, mixer) => clicks(train(mixer), 0.3));
    const steam = {};
    for (const kind of ['puff', 'brake', 'sigh']) steam[kind] = await render(3, (ctx, mixer) => train(mixer).steam(kind, 0.1));
    const mix = await render(SECONDS, (ctx, mixer) => {
      playTune(ctx, mixer, 0);
      const sounds = train(mixer);
      sounds.whistle('depart', 1);
      sounds.steam('puff', 1.95);
      chugs(sounds, 2.2);
      clicks(sounds, 2.5);
      sounds.steam('brake', 8);
    });

    // Loudness in 50 ms windows: a noise burst's sample peak says little about how loud it sounds, its loudest
    // 50 ms (its momentary level) says more.
    const windowed = (data) => {
      const n = Math.round(0.05 * RATE);
      const out = [];
      for (let i = 0; i + n <= data.length; i += n) out.push(rms(data, i, i + n));
      return out;
    };
    const loudest = (data) => db(Math.max(...windowed(data)));
    // How long the sigh is heard: until its momentary level has fallen 30 dB below its loudest.
    const sighWindows = windowed(steam.sigh);
    const sighTop = Math.max(...sighWindows);
    const sighHeard = sighWindows.filter((x) => x > sighTop * 10 ** (-30 / 20)).length * 0.05;

    // Chug RMS over whole chug periods (from the first chug to the last full period).
    const period = chugInterval(RIDE.CRUISE);
    const chugTo = Math.round((0.1 + Math.floor((SECONDS - 0.4) / period) * period) * RATE);
    return {
      makeupDb,
      musicOldRmsDb: db(rms(musicOld, afterFade)),
      musicNewRmsDb: db(rms(musicNew, afterFade)),
      musicNewPeak: peak(musicNew),
      musicNewLoudestDb: loudest(musicNew),
      whistlePeakDb: db(peak(whistle)),
      whistleLoudestDb: loudest(whistle),
      whistleFinalePeakDb: db(peak(whistleFinale)),
      chugRmsDb: db(rms(chugOnly, Math.round(0.1 * RATE), chugTo)),
      chugPeakDb: db(peak(chugOnly)),
      chugLoudestDb: loudest(chugOnly),
      clickRmsDb: db(rms(clickOnly, Math.round(0.3 * RATE), chugTo)),
      clickPeakDb: db(peak(clickOnly)),
      clickLoudestDb: loudest(clickOnly),
      puffPeakDb: db(peak(steam.puff)),
      puffLoudestDb: loudest(steam.puff),
      brakePeakDb: db(peak(steam.brake)),
      brakeLoudestDb: loudest(steam.brake),
      sighPeakDb: db(peak(steam.sigh)),
      sighLoudestDb: loudest(steam.sigh),
      sighHeardS: sighHeard,
      mixPeak: peak(mix),
      mixRmsDb: db(rms(mix, afterFade)),
    };
  });

  // The numbers go with the test's results (and to the console with AUDIO_LEVELS=1).
  const levels = JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 100) / 100])));
  await test.info().attach('audio-levels.json', { body: levels, contentType: 'application/json' });
  if (process.env.AUDIO_LEVELS) console.log('[audio levels]', levels);

  expect(m.mixPeak).toBeLessThan(0.9);
  const musicDrop = m.musicOldRmsDb - m.musicNewRmsDb;
  expect(musicDrop).toBeGreaterThanOrEqual(3);
  expect(musicDrop).toBeLessThanOrEqual(4);
  expect(Math.abs(m.whistlePeakDb - -20)).toBeLessThanOrEqual(2);
  expect(m.whistleFinalePeakDb).toBeLessThanOrEqual(-18);
  expect(Math.abs(m.chugRmsDb - -34)).toBeLessThanOrEqual(2);
  expect(m.clickRmsDb).toBeLessThan(m.chugRmsDb - 3);
  // Every effect's loudest moment stays below the music's: they sit under it.
  for (const key of ['whistleLoudestDb', 'chugLoudestDb', 'clickLoudestDb', 'puffLoudestDb', 'brakeLoudestDb', 'sighLoudestDb']) {
    expect(m[key], key).toBeLessThan(m.musicNewLoudestDb);
  }
  // The steam is softer than the whistle, the clicks softer than the chug.
  for (const key of ['puffLoudestDb', 'brakeLoudestDb', 'sighLoudestDb']) expect(m[key], key).toBeLessThan(m.whistleLoudestDb);
  expect(m.clickLoudestDb).toBeLessThan(m.chugLoudestDb);
  expect(m.sighHeardS).toBeGreaterThanOrEqual(1.2);
  expect(m.sighHeardS).toBeLessThanOrEqual(2);
});
