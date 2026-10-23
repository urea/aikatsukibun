import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoId, isEntryId, videoIdFor, uniqueIds, normalizeCustomVideos, normalizeVideoMetadata } from '../../Encore/model.js';

const videoId = 'fYibOFCMpnE';
const firstId = `clip_${'a'.repeat(32)}`;
const secondId = `clip_${'b'.repeat(32)}`;

test('元YouTube IDと曲IDを区別し、正確な長さと小文字hexを検証する', () => {
  assert.equal(isVideoId(videoId), true);
  assert.equal(isEntryId(videoId), true);
  assert.equal(isVideoId(firstId), false);
  assert.equal(isEntryId(firstId), true);
  for (const value of [undefined, null, 123, '', `${videoId}\n`, `${videoId}x`, ` ${videoId}`, `${firstId}\n`, `${firstId} `, `clip_${'a'.repeat(31)}`, `clip_${'a'.repeat(33)}`, `clip_${'A'.repeat(32)}`, `clip_${'g'.repeat(32)}`, `CLIP_${'a'.repeat(32)}`]) {
    assert.equal(isVideoId(value), false, String(value));
    assert.equal(isEntryId(value), false, String(value));
  }
});

test('曲から元動画を解決し、旧IDの食い違いや元動画不明のclipを拒否する', () => {
  assert.equal(videoIdFor(videoId), videoId);
  assert.equal(videoIdFor(videoId, {}), videoId);
  assert.equal(videoIdFor(videoId, { videoId }), videoId);
  assert.equal(videoIdFor(firstId, { videoId }), videoId);
  for (const value of [null, '', 'invalid', `${videoId}\n`, 'tJAcDG-eS-Q', firstId]) assert.equal(videoIdFor(videoId, { videoId: value }), null);
  for (const data of [undefined, null, {}, { videoId: null }, { videoId: firstId }, { videoId: `${videoId}\n` }]) assert.equal(videoIdFor(firstId, data), null);
  for (const id of ['invalid', `${firstId}\n`, `clip_${'A'.repeat(32)}`]) assert.equal(videoIdFor(id, { videoId }), null);
});

test('曲ID単位で重複を除き、同じ元動画の複数曲と旧曲を保持する', () => {
  const legacy = { id: videoId, title: '以前の曲' };
  const first = { id: firstId, videoId, title: '1曲目', startSeconds: null, endSeconds: 96, revision: 'c'.repeat(32) };
  const second = { id: secondId, videoId, title: '2曲目', startSeconds: 120, endSeconds: null, difficulty: 'むずかしい' };
  const values = [legacy, { id: firstId, title: '元動画がない不正な先行データ' }, first, second, { ...first, title: '重複' }, { id: videoId, videoId: 'tJAcDG-eS-Q', title: '旧IDとの不一致' }, { id: `clip_${'d'.repeat(32)}`, videoId: null }];
  assert.deepEqual(normalizeCustomVideos(JSON.parse(JSON.stringify(values))), [legacy, first, second]);
  assert.deepEqual(uniqueIds([videoId, firstId, secondId, firstId, null, `${firstId}\n`]), [videoId, firstId, secondId]);
});

test('メタデータは有効な元YouTube IDだけを保持する', () => {
  assert.deepEqual(normalizeVideoMetadata({ title: '楽曲', videoId }), { title: '楽曲', videoId });
  for (const value of [undefined, null, '', firstId, `${videoId}\n`]) assert.deepEqual(normalizeVideoMetadata({ title: '楽曲', videoId: value }), { title: '楽曲' });
  assert.deepEqual(normalizeCustomVideos([{ id: videoId, videoId: 'tJAcDG-eS-Q' }]), []);
});

test('追加した楽曲情報と区間が保存データの再読み込みで失われない', () => {
  const video = { id: 'fYibOFCMpnE', title: '追加した楽曲', startSeconds: 435, endSeconds: 531, mode: 'じゆうにアイカツ！モード', difficulty: '-', idol: 'マイキャラ', result: 'オールパーフェクト', author: '投稿者@handle' };
  assert.deepEqual(normalizeCustomVideos(JSON.parse(JSON.stringify([video]))), [video]);
});

test('詳細情報がない旧版の追加動画を保持し、不正IDや重複だけを除く', () => {
  const old = { id: 'fYibOFCMpnE', title: '以前追加した動画' };
  assert.deepEqual(normalizeCustomVideos([old, { ...old, title: '重複' }, null, { id: 'bad' }]), [old]);
});

test('壊れた再生区間や成績を使わず、必要な文字列情報だけ保持する', () => {
  const base = { title: '楽曲', author: '投稿者', result: '架空の成績', arbitrary: '不要な情報' };
  for (const [startSeconds, endSeconds] of [[-1, 10], [10, 10], [20, 10], [NaN, 10], [1, Infinity], ['1', 10], [0.5, 10]]) {
    assert.deepEqual(normalizeVideoMetadata({ ...base, startSeconds, endSeconds }), { title: '楽曲', author: '投稿者' });
  }
});
