import test from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_CATEGORIES, SETTINGS_KEY, categoryLabel, isPlayableVideo, isVideoId, isEntryId, videoIdFor, uniqueIds, readSaved, normalizeSettings, normalizeCustomVideos, normalizeVideoMetadata } from '../../Encore/model.js';

test('おまかせの分類を復元し、旧設定のオンをアイカツE、オフをすべての分類に引き継ぐ', () => {
  for (const [stored, expected] of [
    [{}, 'all'],
    [{ shuffleExcludeOther: false }, 'all'],
    [{ shuffleExcludeOther: true }, 'encore'],
    [{ shuffleExcludeOther: 'true' }, 'all'],
    [{ shuffleCategory: 'all', shuffleExcludeOther: true }, 'all'],
    [{ shuffleCategory: 'encore' }, 'encore'],
    [{ shuffleCategory: 'other' }, 'other'],
    [{ shuffleCategory: 'misc' }, 'misc'],
    [{ shuffleCategory: '__proto__' }, 'all'],
    [{ shuffleCategory: true, shuffleExcludeOther: true }, 'encore'],
  ]) {
    const storage = new Map([[SETTINGS_KEY, JSON.stringify({ sound: false, ...stored })]]);
    const settings = normalizeSettings(readSaved({ getItem: key => storage.get(key) }, SETTINGS_KEY, {}));
    assert.equal(settings.shuffleCategory, expected);
    assert.equal(settings.sound, false);
  }
});

test('選曲画面の分類を保持し、旧版ではその他表示オンのみをその他の動画へ引き継ぐ', () => {
  for (const [stored, expected] of [
    [{}, 'encore'],
    [{ libraryShowMisc: true }, 'misc'],
    [{ libraryShowMisc: 'true' }, 'encore'],
    [{ libraryCategory: 'other' }, 'other'],
    [{ libraryCategory: 'misc' }, 'misc'],
    [{ libraryCategory: 'encore', libraryShowMisc: true }, 'encore'],
    [{ libraryCategory: 'invalid', libraryShowMisc: true }, 'misc'],
    [{ libraryCategory: '__proto__' }, 'encore'],
  ]) {
    const settings = normalizeSettings({ shuffleCategory: 'other', ...stored });
    assert.equal(settings.libraryCategory, expected);
    assert.equal(settings.shuffleCategory, 'other');
  }
});

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
  const video = { id: 'fYibOFCMpnE', title: '追加した楽曲', startSeconds: 435, endSeconds: 531, mode: 'じゆうにアイカツ！モード', difficulty: '-', idol: 'マイキャラ', result: 'オールパーフェクト', author: '投稿者@handle', category: 'other' };
  assert.deepEqual(normalizeCustomVideos(JSON.parse(JSON.stringify([video]))), [video]);
});

test('保存済みの分類は定義済みの値だけ保持し、未登録・不正値は未分類と表示する', () => {
  assert.deepEqual(VIDEO_CATEGORIES, { encore: 'アイカツE', other: 'その他アイカツ', misc: 'その他の動画' });
  assert.equal(Object.isFrozen(VIDEO_CATEGORIES), true);
  for (const [category, label] of Object.entries(VIDEO_CATEGORIES)) {
    assert.equal(categoryLabel(category), label);
    assert.deepEqual(normalizeVideoMetadata({ title: '楽曲', category }), { title: '楽曲', category });
  }
  for (const category of [undefined, null, '', 'other ', 'アイカツアンコール', '__proto__', 'constructor', ['encore']]) {
    assert.equal(categoryLabel(category), '未分類');
    assert.deepEqual(normalizeVideoMetadata({ title: '楽曲', category }), { title: '楽曲' });
  }
});

test('遊べるかの保存値を分類より優先し、未設定の旧データは分類で補う', () => {
  for (const category of ['encore', 'other', 'misc', undefined]) {
    const base = category === undefined ? { title: '動画' } : { title: '動画', category };
    for (const playable of [true, false]) {
      const metadata = normalizeVideoMetadata(JSON.parse(JSON.stringify({ ...base, playable })));
      assert.deepEqual(metadata, { ...base, playable });
      assert.equal(isPlayableVideo(metadata), playable);
    }
    for (const playable of [undefined, null, 'false', 'no', 0, 1, [], {}]) {
      const metadata = normalizeVideoMetadata({ ...base, playable });
      assert.deepEqual(metadata, base);
      assert.equal(isPlayableVideo(metadata), category !== 'misc');
    }
  }
  for (const video of [null, undefined, false, '動画', []]) assert.equal(isPlayableVideo(video), false);
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
