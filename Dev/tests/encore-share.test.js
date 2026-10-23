import test from 'node:test';
import assert from 'node:assert/strict';
import { readSharedVideoId, buildVideoShareUrl, buildVideoShareText, buildXShareUrl } from '../../Encore/share.js';

const id = 'tJAcDG-eS-Q';
const firstId = `clip_${'a'.repeat(32)}`;
const secondId = `clip_${'b'.repeat(32)}`;
const baseUrl = 'https://aikatsu-encore-kibun.vercel.app/';
const video = { id, title: 'MY STARWAY', difficulty: 'むずかしい' };

test('共有URL文字列とURLオブジェクトから正確な11文字のvだけを読み込む', () => {
  assert.equal(readSharedVideoId(`${baseUrl}?v=${id}`), id);
  assert.equal(readSharedVideoId(new URL(`${baseUrl}?other=1&v=${id}#screen`)), id);
  for (const value of [undefined, null, {}, '', 'invalid', '/?v=tJAcDG-eS-Q', baseUrl, `${baseUrl}?v=`, `${baseUrl}?v=${id}a`, `${baseUrl}?v=${id.slice(0, -1)}`, `${baseUrl}?v=${id}%0A`, `${baseUrl}?v=${id}%20`, `${baseUrl}?v=%E3%81%82abcdefghij`, `${baseUrl}?v=abcdefghij!`]) assert.equal(readSharedVideoId(value), null);
});

test('共有URLはqueryとhashを除去しvを1つだけ持ち、元URLを変更しない', () => {
  const original = new URL(`${baseUrl}play/?v=old&v=another&tracking=1#settings`);
  const snapshot = original.href;
  const shared = buildVideoShareUrl(original, id);
  assert.equal(shared, `${baseUrl}play/?v=${id}`);
  assert.equal(original.href, snapshot);
  const parsed = new URL(shared);
  assert.deepEqual([...parsed.searchParams], [['v', id]]);
  assert.equal(parsed.hash, '');
  assert.equal(buildVideoShareUrl('http://127.0.0.1:18743/?test=1#player', id), `http://127.0.0.1:18743/?v=${id}`);
});

test('共有URLは資格情報入り・HTTP以外・不正IDを拒否する', () => {
  for (const value of [undefined, null, {}, '', 'invalid', 'javascript:alert(1)', 'data:text/html,test', 'file:///app/index.html', 'https://user:password@example.test/', 'https://user@example.test/']) assert.equal(buildVideoShareUrl(value, id), null);
  for (const value of [undefined, null, 123, '', `${id}a`, id.slice(0, -1), `${id}\n`, 'abcdefghij!', 'あabcdefghij']) assert.equal(buildVideoShareUrl(baseUrl, value), null);
});

test('X投稿文は曲名と半角数字の難易度を使った指定文面になる', () => {
  assert.equal(buildVideoShareText(video), 'アイカツ！アンコール気分で「MY STARWAY☆3」を遊んだよ♪');
  for (const [level, difficulty] of ['かんたん', 'ふつう', 'むずかしい', 'すごくむずかしい', 'とてもむずかしい'].entries()) assert.equal(buildVideoShareText({ ...video, difficulty }), `アイカツ！アンコール気分で「MY STARWAY☆${level + 1}」を遊んだよ♪`);
  for (const difficulty of ['-', undefined, null, '', '☆３', '架空の難易度']) assert.equal(buildVideoShareText({ ...video, difficulty }), 'アイカツ！アンコール気分で「MY STARWAY」を遊んだよ♪');
});

test('曲名は既存の表示整形を使い、空欄や未取得なら投稿文を生成しない', () => {
  assert.equal(buildVideoShareText({ ...video, title: '【720p】アイカツ！ - MY STARWAY' }), buildVideoShareText(video));
  assert.equal(buildVideoShareText({ ...video, title: '  MY\nSTARWAY\t  ' }), buildVideoShareText(video));
  for (const value of [undefined, null, {}, { title: '' }, { title: ' \n ' }, { title: 123 }]) assert.equal(buildVideoShareText(value), '');
});

test('長い自由入力曲名はUnicodeコードポイント80個までにし絵文字を壊さない', () => {
  const title = '🎶'.repeat(81);
  assert.equal(buildVideoShareText({ ...video, title }), `アイカツ！アンコール気分で「${'🎶'.repeat(80)}…☆3」を遊んだよ♪`);
  assert.equal(buildVideoShareText({ ...video, title: '🎶'.repeat(80) }), `アイカツ！アンコール気分で「${'🎶'.repeat(80)}☆3」を遊んだよ♪`);
});

test('X Web Intentは特殊文字を安全にencodeし投稿文と共有URLを正確にプリセットする', () => {
  const title = '君の&Entrance #100%「✨」/ ?';
  const shared = buildXShareUrl(`${baseUrl}?tracking=ignored#screen`, { ...video, title });
  const parsed = new URL(shared);
  assert.equal(parsed.origin, 'https://x.com');
  assert.equal(parsed.pathname, '/intent/tweet');
  assert.equal(parsed.searchParams.get('text'), `アイカツ！アンコール気分で「${title}☆3」を遊んだよ♪`);
  assert.equal(parsed.searchParams.get('url'), `${baseUrl}?v=${id}`);
  assert.deepEqual([...parsed.searchParams.keys()], ['text', 'url']);
  assert.equal(parsed.hash, '');
});

test('曲名・ID・共有元URLが使えない場合はXリンクを生成しない', () => {
  for (const value of [undefined, null, {}, { ...video, title: '' }, { ...video, id: 'invalid' }, { ...video, id: `${id}\n` }]) assert.equal(buildXShareUrl(baseUrl, value), null);
  assert.equal(buildXShareUrl('https://user:password@example.test/', video), null);
  assert.equal(buildXShareUrl('javascript:alert(1)', video), null);
});

test('同じ元動画の別々の曲を曲IDの共有URLで読み込み、Xリンクにも保持する', () => {
  const urls = [];
  for (const entryId of [firstId, secondId]) {
    const shared = buildVideoShareUrl(`${baseUrl}?v=${id}&tracking=1#settings`, entryId);
    assert.equal(shared, `${baseUrl}?v=${entryId}`);
    assert.equal(readSharedVideoId(shared), entryId);
    assert.equal(readSharedVideoId(new URL(shared)), entryId);
    const intent = new URL(buildXShareUrl(baseUrl, { ...video, id: entryId, videoId: id }));
    assert.equal(intent.searchParams.get('url'), shared);
    assert.equal(intent.searchParams.get('text'), buildVideoShareText(video));
    urls.push(shared);
  }
  assert.notEqual(urls[0], urls[1]);
});

test('clip共有でも不正hex・余分な文字・空白や改行の曲IDを拒否する', () => {
  for (const entryId of [`clip_${'a'.repeat(31)}`, `clip_${'a'.repeat(33)}`, `clip_${'A'.repeat(32)}`, `clip_${'g'.repeat(32)}`, `${firstId}\n`, `${firstId} `, ` ${firstId}`]) {
    assert.equal(readSharedVideoId(`${baseUrl}?v=${encodeURIComponent(entryId)}`), null);
    assert.equal(buildVideoShareUrl(baseUrl, entryId), null);
    assert.equal(buildXShareUrl(baseUrl, { ...video, id: entryId }), null);
  }
});
