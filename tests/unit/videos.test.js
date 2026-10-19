// Video moments: telling a video from a photo, which one clip plays, and the player that plays it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaKind, videoToPlay, createVideoDirector, VIDEO } from '../../site/src/photos/videos.js';

test('mediaKind tells videos from photos by their ending', () => {
  for (const path of ['photos/01.mp4', 'photos/beach.MOV', 'a.m4v', 'clip.webm', 'photos/02.mp4?v=2']) {
    assert.equal(mediaKind(path), 'video', path);
  }
  for (const path of ['photos/01.jpg', 'photos/02.PNG', 'photo.jpeg', 'mp4.jpg']) assert.equal(mediaKind(path), 'image', path);
  assert.equal(mediaKind(''), 'none');
  assert.equal(mediaKind(undefined), 'none');
});

const stops = [85, 155, 265];
const isVideo = [true, false, true];

test('videoToPlay: the stopped-at video, else the nearest video sign coming up', () => {
  assert.equal(videoToPlay({ stops, isVideo, distance: 0 }), -1, 'stop 0 is still too far off');
  assert.equal(videoToPlay({ stops, isVideo, distance: 85 - VIDEO.AHEAD }), 0, 'coming into range');
  assert.equal(videoToPlay({ stops, isVideo, distance: 80 }), 0);
  assert.equal(videoToPlay({ stops, isVideo, distance: 85, stoppedIndex: 0 }), 0, 'stopped at it');
  assert.equal(videoToPlay({ stops, isVideo, distance: 85 + VIDEO.BEHIND + 1 }), -1, 'left behind');
  assert.equal(videoToPlay({ stops, isVideo, distance: 150 }), -1, 'stop 1 is a photo');
  assert.equal(videoToPlay({ stops, isVideo, distance: 155, stoppedIndex: 1 }), -1, 'stopped at a photo');
  assert.equal(videoToPlay({ stops, isVideo, distance: 230 }), 2);
  assert.equal(videoToPlay({ stops: [], isVideo: [], distance: 10 }), -1);
});

/** A stand-in for an HTMLVideoElement: play() resolves, or rejects like a browser that holds back autoplay. */
function fakeVideo({ refuse = false } = {}) {
  return {
    muted: true, paused: true, currentTime: 3, plays: 0,
    play() {
      this.plays += 1;
      if (refuse && this.muted) return Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('the director plays one clip at a time, muted, and pauses the rest', async () => {
  const videos = [fakeVideo(), null, fakeVideo()];
  const director = createVideoDirector(videos);
  director.play(0);
  await settle();
  assert.equal(videos[0].paused, false);
  assert.equal(videos[0].muted, true);
  director.play(0);
  await settle();
  assert.equal(videos[0].plays, 1, 'asking again for the same clip does nothing');
  director.play(2);
  await settle();
  assert.equal(videos[0].paused, true);
  assert.equal(videos[2].paused, false);
  director.play(-1);
  assert.equal(videos[2].paused, true);
  assert.equal(director.current, -1);
});

test('sound: on for the playing clip only, off again when the clip changes', async () => {
  const videos = [fakeVideo(), null, fakeVideo()];
  const changes = [];
  const director = createVideoDirector(videos, { onChange: () => changes.push(director.sound) });
  director.play(0);
  await settle();
  director.setSound(true);
  assert.equal(videos[0].muted, false);
  assert.equal(director.sound, true);
  director.play(2);
  await settle();
  assert.equal(videos[0].muted, true);
  assert.equal(director.sound, false);
  assert.deepEqual(changes, [true, false]);
  director.setSound(true);
  director.setSound(false);
  assert.equal(videos[2].muted, true);
});

test('restart rewinds the playing clip', async () => {
  const videos = [fakeVideo()];
  const director = createVideoDirector(videos);
  director.play(0);
  director.restart();
  assert.equal(videos[0].currentTime, 0);
});

test('a browser that refuses to autoplay leaves the clip blocked until a tap turns the sound on', async () => {
  const videos = [fakeVideo({ refuse: true })];
  const director = createVideoDirector(videos);
  director.play(0);
  await settle();
  assert.equal(director.blocked, true);
  assert.equal(videos[0].paused, true);
  director.play(0);
  await settle();
  assert.equal(videos[0].plays, 1, 'no retry every frame');
  director.setSound(true); // a tap: muted is off, so the fake lets it play
  await settle();
  assert.equal(videos[0].paused, false);
  assert.equal(director.blocked, false);
});

test('hidden: the clip pauses in the background and plays again on return', async () => {
  const videos = [fakeVideo()];
  const director = createVideoDirector(videos);
  director.play(0);
  await settle();
  director.setHidden(true);
  assert.equal(videos[0].paused, true);
  director.play(0);
  await settle();
  assert.equal(videos[0].paused, true, 'stays paused while hidden');
  director.setHidden(false);
  await settle();
  assert.equal(videos[0].paused, false);
});
