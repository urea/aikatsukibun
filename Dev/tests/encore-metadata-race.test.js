import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../../Encore/model.js';
import { readYouTubeAuthor } from '../../Encore/youtube-author.js';

// ViteのJSON importを使う実装をそのまま検証するため、importだけを注入する。
const source = fs.readFileSync(new URL('../../Encore/metadata.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export function createMetadata', 'function createMetadata');
const catalog = JSON.parse(fs.readFileSync(new URL('../../Encore/catalog.json', import.meta.url), 'utf8'));
const id = 'abcdefghijk';
const firstId = `clip_${'a'.repeat(32)}`;
const secondId = `clip_${'b'.repeat(32)}`;
const sharedVideo = {
  title: '共有された楽曲名', startSeconds: 10, endSeconds: 50,
  mode: 'アイカツ！オールスターモード', difficulty: '-',
  idol: 'マイキャラ', result: 'フルコンボ', author: '新しい投稿者',
  revision: 'a'.repeat(32),
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const oembedResponse = () => ({
  ok: true,
  json: async () => ({ title: '動画全体のタイトル', author_name: 'YouTube投稿者', author_url: 'https://www.youtube.com/@original' }),
});

function fixture(t, fetchImpl, saved = null) {
  const timers = new Set();
  const context = {
    ...model, catalog, readYouTubeAuthor, AbortController, fetch: fetchImpl,
    setTimeout(callback, delay) {
      const timer = setTimeout(callback, delay);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
  };
  const createMetadata = vm.runInNewContext(source + '; createMetadata', context, { filename: 'Encore/metadata.js' });
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  return createMetadata({ getItem: () => saved === null ? null : JSON.stringify(saved) }, () => {});
}

test('YouTube取得中に届いた共有の曲名・区間・モード・投稿者を遅い取得結果で消さない', async t => {
  const pending = deferred();
  const metadata = fixture(t, () => pending.promise);
  const task = metadata.fetch(id);
  metadata.seed(id, sharedVideo, { replace: true });
  pending.resolve(oembedResponse());
  assert.deepEqual(await task, sharedVideo);
  assert.deepEqual(metadata.get(id), sharedVideo);
});

test('取得中に共有情報が届いた場合は、YouTube側の失敗でも共有情報を使える', async t => {
  for (const failure of ['network', 'http', 'payload']) {
    const pending = deferred();
    const metadata = fixture(t, () => pending.promise);
    const task = metadata.fetch(id);
    metadata.failed.add(id);
    metadata.seed(id, sharedVideo, { replace: true });
    if (failure === 'network') pending.reject(new TypeError('Failed to fetch'));
    else if (failure === 'http') pending.resolve({ ok: false });
    else pending.resolve({ ok: true, json: async () => ({ error: 'no video' }) });
    assert.deepEqual(await task, sharedVideo);
    assert.deepEqual(metadata.get(id), sharedVideo);
    assert.equal(metadata.failed.has(id), false);
  }
});

test('共有情報で置き換える時は古い投稿者ハンドルや不要な情報を残さない', async t => {
  const metadata = fixture(t, async () => { throw new Error('unexpected network request'); }, {
    [id]: { title: '端末に保存された古い曲名', author: '古い投稿者', authorHandle: '@stale', startSeconds: 1, endSeconds: 100 },
  });
  metadata.seed(id, sharedVideo, { replace: true });
  assert.deepEqual(metadata.get(id), sharedVideo);
  assert.equal(Object.hasOwn(metadata.get(id), 'authorHandle'), false);
  assert.deepEqual(await metadata.fetch(id), sharedVideo);
});

test('別の動画の共有更新で進行中のYouTube取得を誤って無効化しない', async t => {
  const pending = deferred();
  const metadata = fixture(t, () => pending.promise);
  const task = metadata.fetch(id);
  metadata.seed('jihgfedcbaz', sharedVideo, { replace: true });
  pending.resolve(oembedResponse());
  const result = await task;
  assert.equal(result.title, '動画全体のタイトル');
  assert.equal(result.author, 'YouTube投稿者');
  assert.equal(result.authorHandle, '@original');
  assert.equal(metadata.get(id), result);
});

test('共有情報で救済されていない取得失敗は呼び出し元へ伝える', async t => {
  const error = new TypeError('Failed to fetch');
  const metadata = fixture(t, async () => { throw error; });
  await assert.rejects(metadata.fetch(id), value => value === error);
  assert.equal(metadata.get(id), undefined);
});

test('共有情報がない時は初期カタログを使い、旧YouTubeキャッシュや端末の追加曲名で上書きしない', async t => {
  for (const staticId of Object.keys(catalog)) {
    const metadata = fixture(t, async () => { throw new Error('unexpected network request'); }, {
      [staticId]: { title: '古いキャッシュ', startSeconds: 0, endSeconds: 100, revision: 'b'.repeat(32) },
    });
    metadata.seed(staticId, { title: '端末に残った動画全体のタイトル' });
    assert.deepEqual(metadata.get(staticId), catalog[staticId]);
    assert.deepEqual(await metadata.fetch(staticId, { refresh: true }), catalog[staticId]);
  }
});

test('初期カタログの2動画も共有キャッシュと後続共有更新の曲名・区間・revisionを採用する', async t => {
  for (const staticId of Object.keys(catalog)) {
    const metadata = fixture(t, async () => { throw new Error('unexpected network request'); }, {
      [staticId]: { title: '古いYouTube曲名キャッシュ', authorHandle: '@stale' },
    });
    metadata.seed(staticId, sharedVideo, { replace: true });
    assert.deepEqual(metadata.get(staticId), sharedVideo);
    assert.deepEqual(await metadata.fetch(staticId, { refresh: true }), sharedVideo);
    const updated = { ...sharedVideo, title: '共有で編集した楽曲名', startSeconds: 20, endSeconds: 80, idol: '編集後のアイドル', revision: 'b'.repeat(32) };
    metadata.seed(staticId, updated, { replace: true });
    assert.deepEqual(metadata.get(staticId), updated);
    assert.deepEqual(await metadata.fetch(staticId, { refresh: true }), updated);
    metadata.seed(staticId, { title: '端末に残った古い動画名' });
    assert.deepEqual(metadata.get(staticId), updated);
    assert.equal(Object.hasOwn(metadata.get(staticId), 'authorHandle'), false);
  }
});

test('初期カタログ以外の共有動画もYouTubeの再取得や後から届く端末情報で曲名と区間を失わない', async t => {
  const metadata = fixture(t, async () => { throw new Error('unexpected network request'); });
  metadata.seed(id, sharedVideo, { replace: true });
  assert.deepEqual(await metadata.fetch(id, { refresh: true }), sharedVideo);
  metadata.seed(id, { title: '端末の古い動画名', startSeconds: 1, endSeconds: 100 });
  assert.deepEqual(metadata.get(id), sharedVideo);
});

test('共有の後続更新がYouTube取得中に重なっても最後の共有内容とrevisionを保つ', async t => {
  const pending = deferred();
  const metadata = fixture(t, () => pending.promise);
  const task = metadata.fetch(id, { refresh: true });
  metadata.seed(id, sharedVideo, { replace: true });
  const updated = { ...sharedVideo, title: '後から届いた共有編集', startSeconds: 15, endSeconds: 55, revision: 'c'.repeat(32) };
  metadata.seed(id, updated, { replace: true });
  pending.resolve(oembedResponse());
  assert.deepEqual(await task, updated);
  assert.deepEqual(metadata.get(id), updated);
});

test('共有ではない追加動画は必要に応じてYouTube情報を再取得できる', async t => {
  const metadata = fixture(t, async () => oembedResponse(), { [id]: { title: '古いキャッシュ' } });
  const result = await metadata.fetch(id, { refresh: true });
  assert.equal(result.title, '動画全体のタイトル');
  assert.equal(result.authorHandle, '@original');
});

test('同じ元動画の曲を別のキーで復元し、不正な元動画のキャッシュを使わない', async t => {
  const first = { videoId: id, title: '1曲目', startSeconds: null, endSeconds: 50 };
  const second = { videoId: id, title: '2曲目', startSeconds: 60, endSeconds: null };
  const invalidId = `clip_${'c'.repeat(32)}`;
  const metadata = fixture(t, async () => { throw new Error('unexpected network request'); }, {
    [firstId]: first, [secondId]: second,
    [invalidId]: { title: '元動画不明' },
    [id]: { videoId: 'jihgfedcbaz', title: '旧IDと元動画が不一致' },
  });
  assert.deepEqual(metadata.get(firstId), first);
  assert.deepEqual(metadata.get(secondId), second);
  assert.deepEqual(await metadata.fetch(firstId), first);
  assert.deepEqual(await metadata.fetch(secondId), second);
  assert.equal(metadata.get(invalidId), undefined);
  assert.equal(metadata.get(id), undefined);
});

test('clipのYouTube情報取得は元動画のURLを使い、再取得後も元動画を保持する', async t => {
  const urls = [];
  const metadata = fixture(t, async url => { urls.push(url); return oembedResponse(); }, {
    [firstId]: { videoId: id, title: '以前の情報' },
  });
  for (let index = 0; index < 2; index++) {
    const result = await metadata.fetch(firstId, { refresh: true });
    assert.equal(result.videoId, id);
    assert.equal(result.title, '動画全体のタイトル');
    assert.equal(result.authorHandle, '@original');
  }
  assert.equal(urls.length, 2);
  for (const url of urls) assert.equal(new URL(url).searchParams.get('url'), `https://www.youtube.com/watch?v=${id}`);
});

test('元動画不明のclipと不正な曲IDは外部取得も不正seedの保存もしない', async t => {
  let calls = 0;
  const metadata = fixture(t, async () => { calls++; return oembedResponse(); });
  for (const data of [{ title: '元動画なし' }, { title: '不正な元動画', videoId: firstId }, { title: '不正な元動画', videoId: `${id}\n` }]) metadata.seed(firstId, data, { replace: true });
  metadata.seed(id, { title: '旧ID不一致', videoId: 'jihgfedcbaz' }, { replace: true });
  assert.equal(metadata.get(firstId), undefined);
  assert.equal(metadata.get(id), undefined);
  for (const entryId of [firstId, `${firstId}\n`, `clip_${'A'.repeat(32)}`, `${id}\n`]) await assert.rejects(metadata.fetch(entryId));
  assert.equal(calls, 0);
});

test('同じ元動画でも取得中レースは曲ごとに独立し、共有の最新曲名と区間を保持する', async t => {
  const firstPending = deferred();
  const secondPending = deferred();
  const pending = [firstPending, secondPending];
  const urls = [];
  const metadata = fixture(t, url => { urls.push(url); return pending[urls.length - 1].promise; });
  metadata.seed(firstId, { videoId: id, title: '古い1曲目' });
  metadata.seed(secondId, { videoId: id, title: '古い2曲目' });
  const firstTask = metadata.fetch(firstId, { refresh: true });
  const secondTask = metadata.fetch(secondId, { refresh: true });
  const shared = { ...sharedVideo, videoId: id };
  const updated = { ...shared, title: '共有で編集した1曲目', startSeconds: 20, endSeconds: null, revision: 'd'.repeat(32) };
  metadata.seed(firstId, shared, { replace: true });
  metadata.seed(firstId, updated, { replace: true });
  firstPending.resolve(oembedResponse());
  secondPending.resolve(oembedResponse());
  assert.deepEqual(await firstTask, updated);
  const second = await secondTask;
  assert.equal(second.videoId, id);
  assert.equal(second.title, '動画全体のタイトル');
  assert.equal(metadata.get(secondId), second);
  assert.deepEqual(await metadata.fetch(firstId, { refresh: true }), updated);
  metadata.seed(firstId, { videoId: id, title: '端末の古い曲名' });
  assert.deepEqual(metadata.get(firstId), updated);
  assert.equal(urls.length, 2);
});

test('clipの取得中に共有更新が届けば外部取得が失敗しても元動画と最新の区間を保つ', async t => {
  const pending = deferred();
  const metadata = fixture(t, () => pending.promise, { [firstId]: { videoId: id, title: '古い曲' } });
  const task = metadata.fetch(firstId, { refresh: true });
  const updated = { ...sharedVideo, videoId: id, startSeconds: null, endSeconds: 96 };
  metadata.seed(firstId, updated, { replace: true });
  pending.reject(new TypeError('Failed to fetch'));
  assert.deepEqual(await task, updated);
  assert.deepEqual(metadata.get(firstId), updated);
});
