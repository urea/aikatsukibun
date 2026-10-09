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
const sharedVideo = {
  title: '共有された楽曲名', startSeconds: 10, endSeconds: 50,
  mode: 'アイカツ！オールスターモード', difficulty: '-',
  idol: 'マイキャラ', result: 'フルコンボ', author: '新しい投稿者',
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

test('静的カタログは共有情報や旧キャッシュで上書きせず、再取得もしない', async t => {
  const staticId = Object.keys(catalog)[0];
  const metadata = fixture(t, async () => { throw new Error('unexpected network request'); }, {
    [staticId]: { title: '古いキャッシュ' },
  });
  metadata.seed(staticId, sharedVideo, { replace: true });
  assert.deepEqual(metadata.get(staticId), catalog[staticId]);
  assert.deepEqual(await metadata.fetch(staticId, { refresh: true }), catalog[staticId]);
});
