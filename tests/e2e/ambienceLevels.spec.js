// The ambience's, the carol's and the cues' levels, rendered offline (OfflineAudioContext, stereo) through the real
// master chain (audio/mixer.js) with the real voices, against the targets in the sound design
// (docs/superpowers/specs/2026-10-26-sound-effects-design.md): each zone's bed about −36 dBFS RMS (the crickets
// about 6 dB under), the passing sounds peaking about −24 dBFS (the celebratory fireworks, sparkle and sleigh bells
// about 6 dB over), everything under the music, the carol faint, and the mix never clipping. What it measured goes
// with the test's results (and to the console with AUDIO_LEVELS=1).
import { test, expect } from '@playwright/test';

test('the ambience, the carol and the cues sit at their targets, under the music, and the mix never clips', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'levels are measured in one engine, Chromium');
  test.setTimeout(180_000);
  await page.route('**/site/ambience-levels.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>levels</title>' }));
  await page.goto('ambience-levels.html');

  const m = await page.evaluate(async () => {
    const { createMixer } = await import('./src/audio/mixer.js');
    const { createSynth, createSoundtrack } = await import('./src/audio/music.js');
    const { composeLoop } = await import('./src/audio/compose.js');
    const { createKit } = await import('./src/audio/sfx.js');
    const { createTrainSounds } = await import('./src/audio/trainSounds.js');
    const { createBed } = await import('./src/audio/ambienceBeds.js');
    const { createNatureSounds } = await import('./src/audio/natureSounds.js');
    const { createCueSounds } = await import('./src/audio/cueSounds.js');
    const { pieceShares } = await import('./src/audio/zoneMusic.js');
    const { chugInterval, chugLevel } = await import('./src/audio/sfxTiming.js');
    const { RIDE } = await import('./src/ride/rideController.js');

    const RATE = 48000;
    const STEP = 0.1; // the scheduler's tick in these renders (s): the ride's is 0.05, booking 0.25 to 0.3 ahead
    const db = (x) => 20 * Math.log10(x);

    /**
     * Renders `seconds` of stereo through a fresh master chain, fully up. `build(ctx, mixer, kit)` adds the sounds
     * and may return a tick(t) to run every STEP of the render (a bed's or a scheduler's booking).
     */
    async function render(seconds, build) {
      const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE);
      const mixer = createMixer(ctx);
      mixer.fade(true, 0.01);
      // Every sound is booked before any plays, so none frees its nodes in time: no budget here.
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
    /** RMS of the louder channel from `fromS` seconds on. */
    const rms = (channels, fromS = 0, toS = Infinity) => {
      const from = Math.round(fromS * RATE);
      const to = Math.min(channels[0].length, Math.round(toS * RATE));
      return Math.max(...channels.map((data) => rmsOf(data, from, to)));
    };
    /** The loudest 50 ms (RMS) of the louder channel: how loud a sound sounds at its loudest. */
    const loudest = (channels) => {
      const n = Math.round(0.05 * RATE);
      let top = 0;
      for (const data of channels) for (let i = 0; i + n <= data.length; i += n) top = Math.max(top, rmsOf(data, i, i + n));
      return top;
    };
    const measure = (channels, fromS = 0) => ({ peakDb: db(peak(channels)), loudestDb: db(loudest(channels)), rmsDb: db(rms(channels, fromS)) });

    const out = {};

    // The music, as the train's sounds were measured against it.
    const loop = composeLoop();
    const tune = await render(10, (ctx, mixer) => {
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < 10) synth.playNote(note, note.t + 0.05);
    });
    out.music = measure(tune, 1);

    // Each zone's bed at full weight (the waves with the sea on her left, as she looks ahead along the beach).
    for (const zone of ['spring', 'summer', 'autumn', 'winter', 'evening']) {
      const channels = await render(32, (ctx, mixer, kit) => {
        const bed = createBed(kit, zone);
        bed.fade.gain.value = 1;
        bed.setPan(-0.7);
        return (t) => bed.tick(t + 0.3);
      });
      out[`bed-${zone}`] = measure(channels, 2);
    }

    // The passing sounds at full level, each several times (they are drawn afresh each time): their loudest.
    const events = {
      'bird-spring': [16, 1.6, (v, at) => v.bird('spring', at, 1)],
      'bird-autumn': [12, 2.2, (v, at) => v.bird('autumn', at, 1)],
      gull: [5, 2.5, (v, at) => v.gull(at, 1, -0.7)], // the sea on her left, looking ahead
      bee: [4, 3, (v, at) => v.bee(at, 1)],
      burner: [4, 3.5, (v, at) => v.burner(at, 1)],
      sleigh: [4, 3.5, (v, at) => v.sleigh(at, 1)],
      chime: [1, 12, (v, at) => v.chime(at, 1)],
    };
    for (const [name, [count, every, play]] of Object.entries(events)) {
      const channels = await render(count * every + 0.5, (ctx, mixer, kit) => {
        const voices = createNatureSounds(kit);
        for (let i = 0; i < count; i++) play(voices, 0.2 + i * every);
      });
      out[name] = measure(channels);
    }
    const cues = {
      rustle: [4, 1, (v, at) => v.rustle(at, 1)],
      sparkle: [2, 2, (v, at) => v.sparkle(at, 1)],
      firework: [4, 2, (v, at, i) => v.firework(at, 1, [-0.35, 0.3, -0.1, 0.45][i])],
    };
    for (const [name, [count, every, play]] of Object.entries(cues)) {
      const channels = await render(count * every + 0.5, (ctx, mixer, kit) => {
        const voices = createCueSounds(kit);
        for (let i = 0; i < count; i++) play(voices, 0.2 + i * every, i);
      });
      out[name] = measure(channels);
    }

    // The carol, and the tune crossfading into it as the train rolls into winter (the blend's 30 m at the cruise
    // speed, about 4.6 s, eased as envAt eases it), through the real soundtrack and its scheduler. No recordings
    // here (they cannot play offline), so the autumn forest plays the tune, as it does if its recording fails.
    const manual = () => {
      const ticks = new Set();
      return { start: (fn) => { ticks.add(fn); return fn; }, stop: (fn) => ticks.delete(fn), tick: () => ticks.forEach((fn) => fn()) };
    };
    const soundtrack = (winterAt) => async (seconds) => render(seconds, (ctx, mixer) => {
      const timer = manual();
      const music = createSoundtrack(ctx, mixer.music, { timer });
      const zones = (w) => ({ autumn: 1 - w, winter: w });
      music.setZones(zones(winterAt(0)));
      music.play();
      music.fade(true, 0.01);
      return (t) => {
        music.setZones(zones(winterAt(t)));
        timer.tick();
      };
    });
    const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const tuneAlone = await soundtrack(() => 0)(36);
    const carolAlone = await soundtrack(() => 1)(36);
    out.tuneLoop = measure(tuneAlone, 1);
    out.carol = measure(carolAlone, 1);
    const blendFrom = 6;
    const blend = 30 / RIDE.CRUISE;
    const crossing = await soundtrack((t) => smooth((t - blendFrom) / blend))(20);
    out.crossfade = measure(crossing, 1);
    // The loudest second of the crossing against the louder of the two pieces' loudest seconds.
    const secondly = (channels, from, to) => {
      let top = 0;
      for (let t = from; t + 1 <= to; t += 0.5) top = Math.max(top, rms(channels, t, t + 1));
      return top;
    };
    out.crossfadeLoudestSecondDb = db(secondly(crossing, blendFrom - 1, blendFrom + blend + 1));
    out.piecesLoudestSecondDb = db(Math.max(secondly(tuneAlone, 1, 20), secondly(carolAlone, 1, 20)));
    const halfway = pieceShares({ autumn: 0.5, winter: 0.5 }, {}, {});
    out.crossfadeHalfway = { tune: halfway.tune, carol: halfway.winter };

    // Busy moments, everything at once: riding through the meadow, and the finale.
    const meadow = await render(14, (ctx, mixer, kit) => {
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < 14) synth.playNote(note, note.t + 0.05);
      const train = createTrainSounds(kit);
      train.whistle('depart', 0.5);
      train.steam('puff', 1.45);
      for (let t = 1.7; t < 13; t += chugInterval(RIDE.CRUISE)) train.chug(t, chugLevel(RIDE.CRUISE));
      for (let t = 2; t < 13; t += 1.85) { train.click(t, 1); train.click(t + 0.31, 1); }
      const nature = createNatureSounds(kit);
      for (let t = 1; t < 13; t += 1.3) nature.bird('spring', t, 1);
      nature.bee(3, 1);
      nature.burner(5, 1);
      const cuesNow = createCueSounds(kit);
      cuesNow.rustle(9, 1);
      const bed = createBed(kit, 'spring');
      bed.fade.gain.value = 1;
      return (t) => bed.tick(t + 0.3);
    });
    out.meadowMix = measure(meadow, 1);
    const finale = await render(14, (ctx, mixer, kit) => {
      const synth = createSynth(ctx, mixer.music);
      synth.fade(true, 0.01);
      for (const note of loop.notes) if (note.t < 14) synth.playNote(note, note.t + 0.05);
      const train = createTrainSounds(kit);
      train.steam('sigh', 0.2);
      train.whistle('finale', 0.55);
      const nature = createNatureSounds(kit);
      nature.chime(1, 1);
      const voices = createCueSounds(kit);
      voices.sparkle(3, 1);
      for (let t = 3.5; t < 13; t += 0.8) voices.firework(t, 1, 0.3);
      const bed = createBed(kit, 'evening');
      bed.fade.gain.value = 1;
      return (t) => bed.tick(t + 0.3);
    });
    out.finaleMix = measure(finale, 1);
    return out;
  });

  const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)])));
  const levels = JSON.stringify(round(m));
  await test.info().attach('ambience-levels.json', { body: levels, contentType: 'application/json' });
  if (process.env.AUDIO_LEVELS) console.log('[ambience levels]', levels);

  const music = m.music;
  // Each zone's bed: about −36 dBFS RMS at full weight; the crickets about 6 dB under, as high tones carry.
  for (const zone of ['spring', 'summer', 'autumn', 'winter']) {
    expect(Math.abs(m[`bed-${zone}`].rmsDb - -36), `bed-${zone}`).toBeLessThanOrEqual(2.5);
  }
  expect(Math.abs(m['bed-evening'].rmsDb - -42)).toBeLessThanOrEqual(2.5);
  // The passing sounds peak about −24 dBFS (the bee and the burner softer, far off), never above −22...
  for (const name of ['bird-spring', 'gull', 'chime']) {
    expect(Math.abs(m[name].peakDb - -24), name).toBeLessThanOrEqual(2);
  }
  // ...and the celebration about 6 dB over that, to be clearly heard under the music.
  for (const name of ['sleigh', 'firework', 'sparkle']) {
    expect(Math.abs(m[name].peakDb - -18), name).toBeLessThanOrEqual(2);
  }
  for (const name of ['bird-autumn', 'bee', 'burner']) {
    expect(m[name].peakDb, name).toBeLessThanOrEqual(-24);
    expect(m[name].peakDb, name).toBeGreaterThanOrEqual(-32);
  }
  // The card's rustle is quiet.
  expect(m.rustle.peakDb).toBeLessThanOrEqual(-28);
  expect(m.rustle.peakDb).toBeGreaterThanOrEqual(-40);
  // Everything sits under the music at its loudest.
  for (const name of ['bird-spring', 'bird-autumn', 'gull', 'bee', 'burner', 'sleigh', 'chime', 'firework', 'sparkle', 'rustle',
    'bed-spring', 'bed-summer', 'bed-autumn', 'bed-winter', 'bed-evening']) {
    expect(m[name].loudestDb, name).toBeLessThan(music.loudestDb);
  }
  // The carol is fainter than the tune, and their crossfade is never louder than either.
  const carolUnder = m.tuneLoop.rmsDb - m.carol.rmsDb;
  expect(carolUnder).toBeGreaterThanOrEqual(1.5);
  expect(carolUnder).toBeLessThanOrEqual(6);
  expect(m.crossfadeLoudestSecondDb).toBeLessThanOrEqual(m.piecesLoudestSecondDb + 0.5);
  // Nothing clips, even at the busiest.
  for (const name of ['meadowMix', 'finaleMix', 'crossfade', 'carol']) expect(Math.pow(10, m[name].peakDb / 20), name).toBeLessThan(0.9);
});
