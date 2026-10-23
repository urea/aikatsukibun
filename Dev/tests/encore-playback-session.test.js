import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackSession } from '../../Encore/playback-session.js';

const source = 'XTAE6nTGf3w';
const first = `clip_${'a'.repeat(32)}`;
const second = `clip_${'b'.repeat(32)}`;

test('a session rejects observations before begin and rejects mismatched songs or source videos', () => {
  const session = createPlaybackSession();
  assert.equal(session.pending, false);
  assert.equal(session.accept(first, source, 1, 100), false);
  session.begin(first, source, 100, 500);
  assert.equal(session.accept(second, source, 1, 100), false);
  assert.equal(session.accept(first, 'otherVideo1', 1, 100), false);
  assert.equal(session.pending, true);
  assert.equal(session.accept(first, source, 1, 100), true);
  assert.equal(session.pending, false);
  assert.equal(session.accept(first, 'otherVideo1', 1, 100), false);
});

test('both directions of a same-video song change ignore old playing, ended and timer positions', () => {
  for (const [previous, target] of [[100, 500], [500, 100]]) {
    const session = createPlaybackSession();
    session.begin(first, source, previous);
    assert.equal(session.accept(first, source, 1, previous), true);
    session.begin(second, source, target, previous);
    for (const state of [1, 0, 2, 3, 5, 1]) {
      assert.equal(session.accept(second, source, state, previous), false);
      assert.equal(session.pending, true);
    }
    assert.equal(session.accept(second, source, 1, target), true, 'position arrival works without a BUFFERING callback');
    assert.equal(session.accept(second, source, 1, target + 10), true, 'confirmed playback can leave the arrival window');
  }
});

test('pending ENDED never confirms arrival, including an adjacent clip boundary', () => {
  const session = createPlaybackSession();
  session.begin(second, source, 100, 100);
  for (let index = 0; index < 10; index++) assert.equal(session.accept(second, source, 0, 100, { native: true }), false);
  assert.equal(session.pending, true);
  assert.equal(session.accept(second, source, 1, 100), false);
  assert.equal(session.accept(second, source, 1, 100.3), true);
});

test('repeated stale PLAYING and polled BUFFERING/CUED do not unlock an ambiguous position', () => {
  const session = createPlaybackSession();
  session.begin(second, source, 100, 100);
  for (const state of [3, 5, 1, 3, 5, 1, 2, 1]) assert.equal(session.accept(second, source, state, 100), false);
  assert.equal(session.pending, true);
  assert.equal(session.accept(second, source, 1, 100.3), true);
});

test('native transition plus target arrival confirms a paused cue or replay without time progression', () => {
  for (const transition of [-1, 3, 5]) {
    const session = createPlaybackSession();
    session.begin(second, source, 100, 100);
    const confirmed = session.accept(second, source, transition, 100, { native: true });
    assert.equal(confirmed, transition === 5);
    assert.equal(session.accept(second, source, 2, 100), true);
    assert.equal(session.pending, false);
  }
});

test('a native transition alone cannot accept the old position away from the requested start', () => {
  const session = createPlaybackSession();
  session.begin(second, source, 500, 100);
  assert.equal(session.accept(second, source, 3, 100, { native: true }), false);
  assert.equal(session.accept(second, source, 1, 100, { native: true }), false);
  assert.equal(session.accept(second, source, 5, 100, { native: true }), false);
  assert.equal(session.pending, true);
  assert.equal(session.accept(second, source, 5, 500, { native: true }), true);
});

test('keyframe timestamps up to one second before the requested start are accepted', () => {
  for (const current of [99, 99.2, 99.999, 100, 100.3, 102]) {
    const session = createPlaybackSession({ now: () => 0 });
    session.begin(second, source, 100, 500);
    assert.equal(session.accept(second, source, 1, current), true);
  }
  for (const current of [0, 98.99, 102.01, 500]) {
    const session = createPlaybackSession({ now: () => 0 });
    session.begin(second, source, 100, 500);
    assert.equal(session.accept(second, source, 1, current), false);
  }
});

test('a source-video change confirms arrival even when the old video had the same timestamp', () => {
  const session = createPlaybackSession();
  session.begin(first, 'otherVideo1', 100);
  assert.equal(session.accept(first, 'otherVideo1', 1, 100), true);
  session.begin(second, source, 100, 100);
  assert.equal(session.accept(second, 'otherVideo1', 1, 100), false);
  assert.equal(session.accept(second, source, 1, 100), true);
});

test('a new begin replaces an unconfirmed earlier selection and supports seek targets', () => {
  const session = createPlaybackSession();
  session.begin(first, source, 100, 0);
  session.begin(second, source, 500, 0);
  assert.equal(session.accept(first, source, 1, 100), false);
  assert.equal(session.accept(second, source, 1, 100), false);
  assert.equal(session.accept(second, source, 1, 500), true);
  session.begin(second, source, 550, 500);
  assert.equal(session.accept(second, source, 1, 500), false);
  assert.equal(session.accept(second, source, 2, 550), true);
});

test('a delayed first observation accepts valid playback without accepting the old later clip', () => {
  let milliseconds = 0;
  const session = createPlaybackSession({ now: () => milliseconds });
  session.begin(second, source, 100, 500);
  milliseconds = 30000;
  assert.equal(session.accept(second, source, 1, 530), false);
  assert.equal(session.accept(second, source, 1, 130), true);
});

test('invalid positions cannot confirm a session and invalid begin arguments fail immediately', () => {
  const session = createPlaybackSession();
  session.begin(first, source, 0);
  for (const time of [undefined, null, '0', NaN, Infinity, -1]) assert.equal(session.accept(first, source, 1, time), false);
  assert.equal(session.accept(first, source, 1, 0), true);
  for (const target of [undefined, null, NaN, Infinity, -1]) assert.throws(() => session.begin(first, source, target), TypeError);
});
