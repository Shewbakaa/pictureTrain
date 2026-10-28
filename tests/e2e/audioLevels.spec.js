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
    const { createSynth } = await import('./src/audio/musicBox.js');
    const { composeLoop } = await import('./src/audio/compose.js');
    const { createKit } = await import('./src/audio/sfx.js');
    const { createTrainSounds } = await import('./src/audio/trainSounds.js');
    const { createTapSounds } = await import('./src/audio/tapSounds.js');
    const { createNatureSounds } = await import('./src/audio/natureSounds.js');
    const { ECHO, createTunnelEcho } = await import('./src/audio/tunnelEcho.js');
    const { tunnelInside } = await import('./src/world/tunnel.js');
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
    // Every sound is booked before any plays, so none frees its nodes in time: no budget here (else the busy mix
    // would silently drop the sounds that come last).
    const train = (mixer) => createTrainSounds(createKit(mixer, { budget: Infinity }));
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
    // The shooting star's shimmer, struck three times a few seconds apart: its peak is the same each time.
    const shimmer = await render(8, (ctx, mixer) => {
      const tap = createTapSounds(createKit(mixer, { budget: Infinity }));
      for (const at of [0.2, 3, 5.8]) tap.shimmer(at);
    });
    // The lantern's whoosh as she taps it, three times: noise from a random point of the loop each time.
    const lantern = await render(6, (ctx, mixer) => {
      const tap = createTapSounds(createKit(mixer, { budget: Infinity }));
      for (const at of [0.2, 2.2, 4.2]) tap.lantern(at);
    });
    // Her taps on the world (Task 14): a balloon cluster's pop, a snowman's jingle and a deer's rustle, three times each.
    const tapSound = (name) => render(6, (ctx, mixer) => {
      const tap = createTapSounds(createKit(mixer, { budget: Infinity }));
      for (const at of [0.2, 2.2, 4.2]) tap[name](at);
    });
    const pop = await tapSound('pop');
    const jingle = await tapSound('jingle');
    const rustle = await tapSound('rustle');
    // Every sound a tap can make, all at once, on a kit with the ride's own node budget: the cord's whistle, the
    // lantern, the pop, the jingle, the rustle, a hot-air balloon's burner and a gull.
    let tapsPlayed = [];
    let tapsNodes = 0;
    await render(3, (ctx, mixer) => {
      const kit = createKit(mixer);
      const tap = createTapSounds(kit);
      const nature = createNatureSounds(kit);
      tapsPlayed = [
        createTrainSounds(kit).whistle('depart', 0.1), tap.lantern(0.1), tap.pop(0.1), tap.jingle(0.1), tap.rustle(0.1),
        nature.burner(0.1, 1), nature.gull(0.1, 1),
      ];
      tapsNodes = kit.live;
    });
    const mix = await render(SECONDS, (ctx, mixer) => {
      playTune(ctx, mixer, 0);
      const sounds = train(mixer);
      sounds.whistle('depart', 1);
      sounds.steam('puff', 1.95);
      chugs(sounds, 2.2);
      clicks(sounds, 2.5);
      sounds.steam('brake', 8);
    });

    // The tunnel's echo: a rail-joint click, heard `at` m along a ride whose tunnel runs from 540 m to 600 m, through
    // a kit on the ride's own node budget. `peakNodes` is what the kit holds once the click is booked, echo and all.
    const span = { from: 540, to: 600, boundary: 570 };
    const CLICK_AT = 0.5;
    let peakNodes = 0;
    const clickAt = (at) => render(1.2, (ctx, mixer) => {
      const kit = createKit(mixer);
      const echo = createTunnelEcho(kit);
      echo.update(tunnelInside(span, at), at >= span.from - ECHO.NEAR && at <= span.to + ECHO.NEAR);
      createTrainSounds(kit).click(CLICK_AT, 1);
      peakNodes = Math.max(peakNodes, kit.live);
    });
    const inTunnel = await clickAt(570);
    const inOpen = await clickAt(400);

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

    // Energy in a window `from`–`to` s after the click (−120 dBFS at the quietest, so silence compares).
    const after = (data, from, to) => db(Math.max(rms(data, Math.round((CLICK_AT + from) * RATE), Math.round((CLICK_AT + to) * RATE)), 1e-6));
    // The loudest 10 ms from `from` to `to` s after the click: the click itself, then its first echo.
    const burst = (data, from, to) => {
      const n = Math.round(0.01 * RATE);
      let loudest = 0;
      for (let i = Math.round((CLICK_AT + from) * RATE); i + n <= Math.round((CLICK_AT + to) * RATE); i += n) loudest = Math.max(loudest, rms(data, i, i + n));
      return db(loudest);
    };

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
      shimmerPeakDb: db(peak(shimmer)),
      shimmerLoudestDb: loudest(shimmer),
      lanternPeakDb: db(peak(lantern)),
      lanternLoudestDb: loudest(lantern),
      popPeakDb: db(peak(pop)),
      popLoudestDb: loudest(pop),
      jinglePeakDb: db(peak(jingle)),
      jingleLoudestDb: loudest(jingle),
      rustlePeakDb: db(peak(rustle)),
      rustleLoudestDb: loudest(rustle),
      tapsAllPlayed: tapsPlayed.every(Boolean) ? 1 : 0,
      tapsPeakNodes: tapsNodes,
      mixPeak: peak(mix),
      mixRmsDb: db(rms(mix, afterFade)),
      echoTailDb: after(inTunnel, 0.12, 0.3),
      openTailDb: after(inOpen, 0.12, 0.3),
      echoUnderDryDb: burst(inTunnel, 0.1, 0.2) - burst(inTunnel, 0, 0.1),
      echoPeakNodes: peakNodes,
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
  // About 6 dB under the design's first −34, so the whistle's loudest moment is clearly above the chug's.
  expect(Math.abs(m.chugRmsDb - -40)).toBeLessThanOrEqual(2);
  expect(m.whistleLoudestDb).toBeGreaterThanOrEqual(m.chugLoudestDb + 1);
  expect(m.clickRmsDb).toBeLessThan(m.chugRmsDb - 3);
  // Every effect's loudest moment stays below the music's: they sit under it.
  for (const key of ['whistleLoudestDb', 'chugLoudestDb', 'clickLoudestDb', 'puffLoudestDb', 'brakeLoudestDb', 'sighLoudestDb']) {
    expect(m[key], key).toBeLessThan(m.musicNewLoudestDb);
  }
  // The steam is softer than the whistle, the clicks softer than the chug.
  for (const key of ['puffLoudestDb', 'brakeLoudestDb', 'sighLoudestDb']) expect(m[key], key).toBeLessThan(m.whistleLoudestDb);
  expect(m.clickLoudestDb).toBeLessThan(m.chugLoudestDb);
  // The shooting star's shimmer is the softest sound in the ride: about −30 dBFS at its loudest, under the steam.
  expect(Math.abs(m.shimmerPeakDb - -30)).toBeLessThanOrEqual(2);
  expect(m.shimmerLoudestDb).toBeLessThan(m.musicNewLoudestDb);
  for (const key of ['puffLoudestDb', 'brakeLoudestDb', 'sighLoudestDb']) expect(m.shimmerLoudestDb, key).toBeLessThan(m[key]);
  // The lantern she taps: a soft whoosh about −24 dBFS at its peak, like the ambience's passing sounds, under the music.
  expect(Math.abs(m.lanternPeakDb - -24)).toBeLessThanOrEqual(2);
  expect(m.lanternLoudestDb).toBeLessThan(m.musicNewLoudestDb);
  // The world's tap sounds: about −24 dBFS at their peaks too, under the music; and every sound a tap can make, fired
  // at once, fits in the 40-node budget with none skipped.
  for (const key of ['pop', 'jingle', 'rustle']) {
    expect(Math.abs(m[`${key}PeakDb`] - -24), key).toBeLessThanOrEqual(2);
    expect(m[`${key}LoudestDb`], key).toBeLessThan(m.musicNewLoudestDb);
  }
  expect(m.tapsAllPlayed).toBe(1);
  expect(m.tapsPeakNodes).toBeLessThanOrEqual(40);
  expect(m.sighHeardS).toBeGreaterThanOrEqual(1.2);
  expect(m.sighHeardS).toBeLessThanOrEqual(2);
  // The tunnel's echo: a click at 570 m has a tail 120 to 300 ms after it that the same click at 400 m, out in the
  // open, does not, and its first repeat is about 10 dB under the click. The echo fits in the 40-node budget.
  expect(m.echoTailDb - m.openTailDb).toBeGreaterThanOrEqual(6);
  expect(Math.abs(m.echoUnderDryDb - -10)).toBeLessThanOrEqual(3);
  expect(m.echoPeakNodes).toBeLessThanOrEqual(40);
});
