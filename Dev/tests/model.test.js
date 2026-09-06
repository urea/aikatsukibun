import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, DEFAULT_VIDEO_ID as id, extractVideoId, uniqueIds, readSaved, normalizeCustomVideos, normalizeSettings, chooseRandom, formatTime } from '../../App/model.js';

test('通常・共有・Shorts・ライブ・埋め込みURLと動画IDを受け付ける', () => {
  for (const value of [id, ` https://www.youtube.com/watch?v=${id}&t=10 `, `https://youtu.be/${id}?si=abc`, `youtube.com/shorts/${id}`, `https://m.youtube.com/live/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://music.youtube.com/watch?v=${id}`]) assert.equal(extractVideoId(value), id, value);
});
test('別ドメイン・偽装ホスト・コード・不正IDを動画URLとして扱わない', () => {
  for (const value of [null, '', 'a', `https://youtube.com.evil.example/watch?v=${id}`, `https://evil.example/?v=${id}`, `https://youtube.com@evil.example/watch?v=${id}`, 'javascript:alert(1)', '<script>alert(1)</script>', 'https://youtube.com/watch?v=short', `https://youtube.com/playlist?list=${id}`]) assert.equal(extractVideoId(value), null, String(value));
});
test('旧版の保存データを維持し、不正データと重複だけを除く', () => {
  assert.deepEqual(uniqueIds([id, null, id, 'rtyUIopASDf', {}, 'bad']), [id, 'rtyUIopASDf']);
  assert.deepEqual(normalizeCustomVideos([{ id, title: '旧版で追加した曲', thumbnail: 'old' }, { id, title: '重複' }, null, { id: 'bad' }]), [{ id, title: '旧版で追加した曲' }]);
  assert.deepEqual(normalizeCustomVideos({ id }), []);
  assert.deepEqual(uniqueIds('broken'), []);
});
test('壊れたJSONや保存禁止でも初期表示を妨げない', () => {
  assert.deepEqual(readSaved({ getItem: () => '{broken' }, 'fav_ids', []), []);
  assert.deepEqual(readSaved({ getItem: () => { throw new Error('blocked'); } }, 'fav_ids', []), []);
  assert.deepEqual(readSaved(undefined, 'fav_ids', []), []);
  assert.deepEqual(readSaved({ getItem: () => JSON.stringify([id]) }, 'fav_ids', []), [id]);
});
test('不正な設定値を補正し、以前の音量と配色を引き継ぐ', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const result = normalizeSettings({ sound: false, soundVolume: -10, videoVolume: 120, muted: 'true', appearance: 'light', effects: false });
  assert.equal(result.sound, false); assert.equal(result.soundVolume, 0); assert.equal(result.videoVolume, 100);
  assert.equal(result.muted, false); assert.equal(result.appearance, 'light'); assert.equal(result.effects, false);
  assert.equal(normalizeSettings({ videoVolume: NaN, appearance: 'unknown' }).videoVolume, 70);
});
test('おまかせは現在の曲と直近履歴を避け、候補が1曲・0曲でも停止しない', () => {
  const other = 'rtyUIopASDf'; const fresh = 'cvbNM123456';
  assert.equal(chooseRandom([id, other, fresh], id, [other], () => 0), fresh);
  assert.equal(chooseRandom([id, other], id, [other], () => 0), other);
  assert.equal(chooseRandom([id], id, [id]), id);
  assert.equal(chooseRandom([], id), null);
});
test('時間未取得・長い動画の表示', () => {
  assert.equal(formatTime(NaN), '0:00'); assert.equal(formatTime(-3), '0:00');
  assert.equal(formatTime(125.9), '2:05'); assert.equal(formatTime(3661), '61:01');
});
