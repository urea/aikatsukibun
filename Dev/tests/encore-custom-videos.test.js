import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomVideos, normalizeVideoMetadata } from '../../Encore/model.js';

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
