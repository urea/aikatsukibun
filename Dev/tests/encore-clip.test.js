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

test('不正または未完成の区間は動画全体に戻し、無効な終了時刻をYouTubeに渡さない', () => {
  const malformed = [null, {}, { startSeconds: -1, endSeconds: 531 }, { startSeconds: '435', endSeconds: 531 }, { startSeconds: NaN, endSeconds: 531 }, { startSeconds: Infinity, endSeconds: 531 }, { startSeconds: 435 }, { startSeconds: 435, endSeconds: 435 }, { startSeconds: 435, endSeconds: 400 }, { startSeconds: 435, endSeconds: '531' }, { startSeconds: 435, endSeconds: NaN }, { startSeconds: 435, endSeconds: Infinity }];
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
