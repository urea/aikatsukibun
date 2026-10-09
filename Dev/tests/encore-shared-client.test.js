import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedVideosClient } from '../../Encore/shared-videos.js';

const input = {
  url: 'https://www.youtube.com/watch?v=tJAcDG-eS-Q',
  title: '君のEntrance',
  start: '7:31',
  end: '9:57',
  mode: 'アイカツ！オールスターモード',
  difficulty: '-',
  idol: 'マイキャラ',
  result: 'フルコンボ',
};
const video = {
  id: 'tJAcDG-eS-Q',
  title: input.title,
  startSeconds: 451,
  endSeconds: 597,
  mode: input.mode,
  difficulty: input.difficulty,
  idol: input.idol,
  result: input.result,
  author: 'cubewano',
  authorHandle: '@cubewano4',
};
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('共有一覧はGETで取得し、再生に必要な区間と投稿者を保持する', async () => {
  let calls = 0;
  const client = createSharedVideosClient(async (url, options) => {
    calls++;
    assert.equal(url, '/api/videos');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return response({ videos: [video] });
  });
  assert.deepEqual(await client.list(), [video]);
  assert.equal(calls, 1);
});

test('共有一覧の不正なIDや重複を除外し、秘密や余分なレスポンス項目を取り込まない', async () => {
  const client = createSharedVideosClient(async () => response({
    videos: [null, { ...video, id: 'invalid' }, { ...video, privateToken: 'server-only' }, video],
  }));
  assert.deepEqual(await client.list(), [video]);
});

test('公開登録はフォーム情報をPOSTし、自動取得された投稿者情報を結果から受け取る', async () => {
  const client = createSharedVideosClient(async (url, options) => {
    assert.equal(url, '/api/videos');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent, input);
    assert.equal(Object.hasOwn(sent, 'author'), false);
    assert.equal(Object.hasOwn(sent, 'authorHandle'), false);
    return response({ video }, 201);
  });
  assert.deepEqual(await client.add(input), video);
});

test('APIの項目別検証エラーを失わずフォームに返す', async () => {
  const errors = { end: '終了時刻は開始時刻より後にしてください。' };
  const client = createSharedVideosClient(async () => response({ error: '入力内容を確認してください。', errors }, 400));
  await assert.rejects(client.add(input), error => {
    assert.equal(error.message, '入力内容を確認してください。');
    assert.deepEqual(error.errors, errors);
    return true;
  });
});

test('重複登録などAPIが返した説明を保持する', async () => {
  const message = 'この動画は登録済みです。';
  const client = createSharedVideosClient(async () => response({ error: message }, 409));
  await assert.rejects(client.add(input), { message });
});

test('APIに説明がないHTTPエラーは再試行できる日本語で伝える', async () => {
  const client = createSharedVideosClient(async () => response({}, 503));
  await assert.rejects(client.list(), /共有データに接続できませんでした。もう一度お試しください。/);
});

test('ネットワーク失敗・中断・非JSON応答は生の例外を利用者に出さない', async () => {
  const fetchers = [
    async () => { throw new TypeError('Failed to fetch'); },
    async () => { throw new DOMException('aborted', 'AbortError'); },
    async () => new Response('<html>Gateway error</html>', { status: 502 }),
  ];
  for (const fetcher of fetchers) {
    const client = createSharedVideosClient(fetcher);
    for (const operation of [() => client.list(), () => client.add(input)]) {
      await assert.rejects(operation(), /共有データに接続できませんでした。通信を確認して、もう一度お試しください。/);
    }
  }
});

test('HTTP成功でも共有一覧の形式が違う場合は一覧の確認失敗として扱う', async () => {
  for (const body of [null, {}, { videos: 'invalid' }]) {
    const client = createSharedVideosClient(async () => response(body));
    await assert.rejects(client.list(), /共有一覧を読み込めませんでした。もう一度お試しください。/);
  }
});

test('HTTP成功でも投稿者や有効な楽曲区間がない登録結果を受け入れない', async () => {
  const bodies = [
    null,
    {},
    { video: { ...video, author: '' } },
    { video: { ...video, endSeconds: video.startSeconds } },
    { video: { ...video, startSeconds: undefined } },
  ];
  for (const body of bodies) {
    const client = createSharedVideosClient(async () => response(body, 201));
    await assert.rejects(client.add(input), /登録結果を確認できませんでした。一覧を再読み込みしてください。/);
  }
});
