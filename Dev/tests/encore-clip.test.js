import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlaybackRange, getClipPosition, seekTimeForPercent, youtubeVideoOptions } from '../../Encore/clip.js';

const videoId = 'lTLqkpcqWs8';
const clip = { startSeconds: 435, endSeconds: 531 };

test('7:15から8:51の楽曲区間は動画の長さを待たずに96秒として扱う', () => {
  assert.deepEqual(getPlaybackRange(clip), { start: 435, end: 531, duration: 96 });
  assert.deepEqual(getPlaybackRange(clip, 720), { start: 435, end: 531, duration: 96 });
  assert.deepEqual(getClipPosition(clip, 483, 720), { start: 435, end: 531, duration: 96, elapsed: 48, percent: 50 });
});

test('楽曲の開始前と終了後を表示上の0秒と96秒に収める', () => {
  for (const time of [0, 434, -Infinity, NaN, undefined]) {
    const position = getClipPosition(clip, time);
    assert.equal(position.elapsed, 0);
    assert.equal(position.percent, 0);
  }
  for (const time of [531, 600, Infinity]) {
    const position = getClipPosition(clip, time);
    assert.equal(position.elapsed, 96);
    assert.equal(position.percent, 100);
  }
});

test('最初から再生は7:15に戻り、シークは楽曲区間の両端を超えない', () => {
  assert.equal(seekTimeForPercent(clip, 0), 435);
  assert.equal(seekTimeForPercent(clip, 50), 483);
  assert.equal(seekTimeForPercent(clip, 100), 531);
  for (const percent of [-20, -Infinity, NaN, undefined, '50']) assert.equal(seekTimeForPercent(clip, percent), 435);
  for (const percent of [120, Infinity]) assert.equal(seekTimeForPercent(clip, percent), 531);
  assert.deepEqual(youtubeVideoOptions(videoId, clip), { videoId, startSeconds: 435, endSeconds: 531 });
});

test('区間指定のない追加動画は動画全体の時間とシークを維持する', () => {
  assert.deepEqual(getPlaybackRange(undefined, 240), { start: 0, end: 240, duration: 240 });
  assert.deepEqual(getClipPosition({}, 60, 240), { start: 0, end: 240, duration: 240, elapsed: 60, percent: 25 });
  assert.equal(seekTimeForPercent(null, 50, 240), 120);
  assert.deepEqual(youtubeVideoOptions(videoId), { videoId, startSeconds: 0 });
});

test('開始と終了が空欄なら動画の先頭から終端までを使う', () => {
  const data = { startSeconds: null, endSeconds: null };
  assert.deepEqual(getPlaybackRange(data, 240), { start: 0, end: 240, duration: 240 });
  assert.deepEqual(getClipPosition(data, 60, 240), { start: 0, end: 240, duration: 240, elapsed: 60, percent: 25 });
  assert.equal(seekTimeForPercent(data, -20, 240), 0);
  assert.equal(seekTimeForPercent(data, 50, 240), 120);
  assert.equal(seekTimeForPercent(data, 120, 240), 240);
  assert.deepEqual(youtubeVideoOptions(videoId, data), { videoId, startSeconds: 0 });
});

test('開始だけ空欄なら先頭から指定終了までを動画の長さを待たずに使う', () => {
  const data = { startSeconds: null, endSeconds: 96.5 };
  assert.deepEqual(getPlaybackRange(data), { start: 0, end: 96.5, duration: 96.5 });
  assert.deepEqual(getClipPosition(data, 48.25), { start: 0, end: 96.5, duration: 96.5, elapsed: 48.25, percent: 50 });
  assert.equal(seekTimeForPercent(data, 100), 96.5);
  assert.deepEqual(youtubeVideoOptions(videoId, data), { videoId, startSeconds: 0, endSeconds: 96.5 });
});

test('終了だけ空欄なら指定開始から動画終端までの経過とシークを使う', () => {
  const data = { startSeconds: 435.25, endSeconds: null };
  assert.deepEqual(getPlaybackRange(data, 531.75), { start: 435.25, end: 531.75, duration: 96.5 });
  assert.deepEqual(getClipPosition(data, 483.5, 531.75), { start: 435.25, end: 531.75, duration: 96.5, elapsed: 48.25, percent: 50 });
  assert.equal(getClipPosition(data, 0, 531.75).elapsed, 0);
  assert.equal(getClipPosition(data, 600, 531.75).percent, 100);
  assert.equal(seekTimeForPercent(data, -20, 531.75), 435.25);
  assert.equal(seekTimeForPercent(data, 50, 531.75), 483.5);
  assert.equal(seekTimeForPercent(data, 120, 531.75), 531.75);
  assert.deepEqual(youtubeVideoOptions(videoId, data), { videoId, startSeconds: 435.25 });
});

test('終端が空欄で動画の長さが未取得・不正・開始前でも長さを0に収める', () => {
  for (const start of [null, 435.25]) {
    const data = { startSeconds: start, endSeconds: null };
    const resolvedStart = start ?? 0;
    for (const duration of [undefined, 0, -10, NaN, Infinity, '720', null]) {
      assert.deepEqual(getPlaybackRange(data, duration), { start: resolvedStart, end: resolvedStart, duration: 0 });
      assert.deepEqual(getClipPosition(data, Infinity, duration), { start: resolvedStart, end: resolvedStart, duration: 0, elapsed: 0, percent: 0 });
      assert.equal(seekTimeForPercent(data, Infinity, duration), resolvedStart);
    }
  }
  assert.deepEqual(getPlaybackRange({ startSeconds: 435.25, endSeconds: null }, 300), { start: 435.25, end: 435.25, duration: 0 });
});

test('不正または未完成の区間は動画全体に戻し、無効な終了時刻をYouTubeに渡さない', () => {
  const malformed = [null, {}, { startSeconds: -1, endSeconds: 531 }, { startSeconds: '435', endSeconds: 531 }, { startSeconds: NaN, endSeconds: 531 }, { startSeconds: Infinity, endSeconds: 531 }, { startSeconds: 435 }, { startSeconds: 435, endSeconds: 435 }, { startSeconds: 435, endSeconds: 400 }, { startSeconds: 435, endSeconds: '531' }, { startSeconds: 435, endSeconds: NaN }, { startSeconds: 435, endSeconds: Infinity }, { startSeconds: null }, { endSeconds: null }, { endSeconds: 531 }, { startSeconds: 435, endSeconds: undefined }, { startSeconds: -1, endSeconds: null }, { startSeconds: '435', endSeconds: null }, { startSeconds: null, endSeconds: 0 }, { startSeconds: null, endSeconds: '531' }];
  for (const data of malformed) {
    assert.deepEqual(getPlaybackRange(data, 720), { start: 0, end: 720, duration: 720 });
    assert.equal(Object.hasOwn(youtubeVideoOptions(videoId, data), 'endSeconds'), false);
  }
  assert.deepEqual(youtubeVideoOptions(videoId, { startSeconds: 435 }), { videoId, startSeconds: 435 });
});

test('動画の長さが未取得または不正でもNaNを画面やシークに出さない', () => {
  for (const duration of [0, -10, NaN, Infinity, '240', null]) {
    assert.deepEqual(getClipPosition({}, 60, duration), { start: 0, end: 0, duration: 0, elapsed: 0, percent: 0 });
    assert.equal(seekTimeForPercent({}, 50, duration), 0);
  }
});

test('0秒開始の有効区間と小数秒の区間を保持する', () => {
  assert.deepEqual(youtubeVideoOptions(videoId, { startSeconds: 0, endSeconds: 10 }), { videoId, startSeconds: 0, endSeconds: 10 });
  assert.deepEqual(getPlaybackRange({ startSeconds: 0.25, endSeconds: 1.75 }), { start: 0.25, end: 1.75, duration: 1.5 });
  assert.equal(seekTimeForPercent({ startSeconds: 0.25, endSeconds: 1.75 }, 50), 1);
});
