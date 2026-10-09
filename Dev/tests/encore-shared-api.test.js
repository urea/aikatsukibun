import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedVideosHandler, MAX_JSON_BYTES } from '../../Encore/server/shared-videos.js';
import { createNeonStore } from '../../Encore/server/neon-store.js';

const endpoint = 'https://encore.example/api/videos';
const input = { url: 'https://youtu.be/fYibOFCMpnE', title: 'テスト用の曲', start: '0:00', end: '1:36', mode: 'じゆうにアイカツ！モード', difficulty: '-', idol: 'マイキャラ', result: 'フルコンボ' };
const apiVideo = { id: 'fYibOFCMpnE', title: input.title, startSeconds: 0, endSeconds: 96, mode: input.mode, difficulty: '-', idol: 'マイキャラ', result: 'フルコンボ', author: '実際の投稿者', authorHandle: '@Actual' };
const originHeaders = { 'Content-Type': 'application/json', Origin: 'https://encore.example', Host: 'encore.example', 'x-vercel-forwarded-for': '203.0.113.4' };
const post = (body = input, headers = {}) => new Request(endpoint, { method: 'POST', headers: { ...originHeaders, ...headers }, body: JSON.stringify(body) });
const revisionFor = video => createHash('md5').update(JSON.stringify(video)).digest('hex');
const patch = (body, headers = {}) => new Request(endpoint, { method: 'PATCH', headers: { ...originHeaders, ...headers }, body: JSON.stringify(body) });
const editInput = (video = apiVideo, changes = {}) => ({ ...input, id: video.id, revision: revisionFor(video), ...changes });

function memoryStore() {
  const videos = new Map();
  const rates = new Map();
  return {
    videos, rates, hashes: [],
    async listVideos() { return [...videos.values()]; },
    async hasVideo(id) { return videos.has(id); },
    async getVideo(id) {
      const video = videos.get(id);
      return video ? { ...structuredClone(video), revision: revisionFor(video) } : null;
    },
    async insertVideo(video) {
      if (videos.has(video.id)) return null;
      videos.set(video.id, structuredClone(video));
      return structuredClone(video);
    },
    async updateVideo(video, revision) {
      const existing = videos.get(video.id);
      if (!existing || revisionFor(existing) !== revision) return null;
      const data = { ...existing, ...structuredClone(video) };
      delete data.revision;
      videos.set(video.id, data);
      return { ...structuredClone(data), revision: revisionFor(data) };
    },
    async consumeRateLimit(hash, limit, windowSeconds) {
      this.hashes.push(hash);
      const count = (rates.get(hash) || 0) + 1;
      rates.set(hash, count);
      return { allowed: count <= limit, retryAfter: windowSeconds };
    },
  };
}

function fixture(options = {}) {
  const store = options.store || memoryStore();
  const requests = [];
  const fetchImpl = options.fetchImpl || (async (url, init) => {
    requests.push({ url, init });
    return Response.json({ title: 'YouTubeの動画タイトル', author_name: '実際の投稿者', author_url: 'https://www.youtube.com/@Actual' });
  });
  return { store, requests, handler: createSharedVideosHandler({ store, fetchImpl, rateLimitSalt: 'test-salt', ...options }) };
}

test('GETは別端末でも保存済みの一覧を返し、キャッシュされない', async () => {
  const { store, handler } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  const response = await handler(new Request(endpoint));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { videos: [apiVideo] });
});

test('POSTはサーバー取得の投稿者だけを保存し、201で正規化した区間を返す', async () => {
  const { handler, store, requests } = fixture();
  const response = await handler(post({ ...input, author: '改ざん者', authorHandle: '@Fake', startSeconds: 999, endSeconds: 1000 }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { video: apiVideo });
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://noembed.com/embed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DfYibOFCMpnE');
  assert.ok(requests[0].init.signal instanceof AbortSignal);
  assert.match(store.hashes[0], /^[0-9a-f]{64}$/);
  assert.equal(store.hashes[0].includes('203.0.113.4'), false);
});

test('必須入力・区間の順序・成績やモードの不正値は400で保存前に拒否する', async () => {
  const { handler, store, requests } = fixture();
  for (const [body, field] of [[{ ...input, title: '' }, 'title'], [{ ...input, start: '1:36' }, 'end'], [{ ...input, end: '0:99' }, 'end'], [{ ...input, result: '架空成績' }, 'result'], [{ ...input, mode: '架空モード' }, 'mode'], [{ ...input, url: 'https://evil.test/watch?v=fYibOFCMpnE' }, 'url']]) {
    const response = await handler(post(body));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).errors[field]);
  }
  assert.equal(store.videos.size, 0);
  assert.equal(store.hashes.length, 0);
  assert.equal(requests.length, 0);
});

test('管理済みの2動画とDB登録済み動画はnoembedを呼ばず409にする', async () => {
  const { handler, store, requests } = fixture({ reservedIds: ['lTLqkpcqWs8', 'tJAcDG-eS-Q'] });
  for (const id of ['lTLqkpcqWs8', 'tJAcDG-eS-Q']) {
    const response = await handler(post({ ...input, url: `https://youtu.be/${id}` }));
    assert.equal(response.status, 409);
    assert.ok((await response.json()).errors.url);
  }
  store.videos.set(apiVideo.id, apiVideo);
  assert.equal((await handler(post())).status, 409);
  assert.equal(requests.length, 0);
  assert.equal(store.hashes.length, 0);
});

test('同一動画の並行投稿は1件だけ保存して201と409を返す', async () => {
  const { handler, store } = fixture();
  const responses = await Promise.all([handler(post()), handler(post())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(store.videos.size, 1);
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
});

test('投稿者欠落・非公開動画・非JSONレスポンス・通信失敗は502で保存しない', async () => {
  for (const fetchImpl of [
    async () => Response.json({ title: '動画', author_name: '', author_url: 'https://youtube.com/@Nobody' }),
    async () => Response.json({ error: 'private video with internal diagnostics' }),
    async () => new Response('invalid upstream SECRET', { status: 200 }),
    async () => new Response('upstream SECRET', { status: 503 }),
    async () => { throw new Error('SECRET postgresql://username:password@internal.example'); },
  ]) {
    const { handler, store } = fixture({ fetchImpl });
    const response = await handler(post());
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /動画と投稿者/);
    assert.equal(JSON.stringify(body).includes('SECRET'), false);
    assert.equal(store.videos.size, 0);
  }
});

test('noembedの取得が終了しなくても設定した時間で打ち切って保存しない', async () => {
  let signal;
  const { handler, store } = fixture({ timeoutMs: 10, fetchImpl: async (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  assert.equal((await handler(post())).status, 502);
  assert.equal(signal.aborted, true);
  assert.equal(store.videos.size, 0);
});

test('旧user・channel URLは投稿者URLを保存しハンドルを推測しない', async () => {
  for (const author_url of ['https://www.youtube.com/user/oldname', 'https://www.youtube.com/channel/UC123']) {
    const { handler } = fixture({ fetchImpl: async () => Response.json({ title: '動画', author_name: '実際の投稿者', author_url }) });
    const response = await handler(post());
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.video.author, '実際の投稿者');
    assert.equal(body.video.authorUrl, author_url);
    assert.equal(Object.hasOwn(body.video, 'authorHandle'), false);
  }
});

test('PATCHは保存済みの投稿者URLを保持し、入力からの差し替えを無視する', async () => {
  const existing = { ...apiVideo, authorUrl: 'https://www.youtube.com/channel/UC123' };
  delete existing.authorHandle;
  const { handler, store, requests } = fixture();
  store.videos.set(existing.id, existing);
  const response = await handler(patch(editInput(existing, { title: '修正した曲', authorUrl: 'https://www.youtube.com/user/fake', authorHandle: '@Fake' })));
  assert.equal(response.status, 200);
  const expected = { ...existing, title: '修正した曲' };
  assert.deepEqual(store.videos.get(existing.id), expected);
  assert.deepEqual((await response.json()).video, { ...expected, revision: revisionFor(expected) });
  assert.equal(requests.length, 0);
});

test('DB取得・重複確認・レート制限・保存の障害は詳細を漏らさず503にする', async () => {
  for (const method of ['listVideos', 'hasVideo', 'consumeRateLimit', 'insertVideo']) {
    const store = memoryStore();
    store[method] = async () => { throw new Error('SECRET postgresql://username:password@internal.example'); };
    const { handler, requests } = fixture({ store });
    const response = await handler(method === 'listVideos' ? new Request(endpoint) : post());
    assert.equal(response.status, 503);
    const text = JSON.stringify(await response.json());
    assert.equal(text.includes('SECRET'), false);
    assert.equal(text.includes('postgresql'), false);
    if (method !== 'insertVideo') assert.equal(requests.length, 0);
  }
  const { handler } = fixture({ store: createNeonStore(undefined) });
  assert.equal((await handler(new Request(endpoint))).status, 503);
  assert.equal((await handler(post())).status, 503);
});

test('別Origin・null Origin・Host不一致・cross-siteのPOSTは403にする', async () => {
  const { handler, requests, store } = fixture();
  for (const headers of [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { Host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await handler(post(input, headers))).status, 403);
  }
  assert.equal(requests.length, 0);
  assert.equal(store.hashes.length, 0);
});

test('POSTはJSON Content-Typeを要求し、不正JSONと配列を安全に拒否する', async () => {
  const { handler, requests } = fixture();
  assert.equal((await handler(post(input, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request(endpoint, { method: 'POST', headers: originHeaders, body: '{' }))).status, 400);
  assert.equal((await handler(post([]))).status, 400);
  assert.equal(requests.length, 0);
  const response = await handler(new Request(endpoint, { method: 'DELETE' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST, PATCH');
});

test('16KB制限はContent-Lengthと実バイト数に適用し日本語やストリームも扱う', async () => {
  const { handler, requests } = fixture();
  assert.equal((await handler(post(input, { 'Content-Length': String(MAX_JSON_BYTES + 1) }))).status, 413);
  const oversized = JSON.stringify({ ...input, ignored: 'あ'.repeat(MAX_JSON_BYTES / 3) });
  assert.ok(Buffer.byteLength(oversized) > MAX_JSON_BYTES);
  assert.equal((await handler(new Request(endpoint, { method: 'POST', headers: { ...originHeaders, 'Content-Length': '1' }, body: oversized }))).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_JSON_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  assert.equal((await handler(new Request(endpoint, { method: 'POST', headers: originHeaders, body: stream, duplex: 'half' }))).status, 413);
  assert.equal(requests.length, 0);
});

test('同じ利用者の11回目は永続storeのレート制限でnoembed前に拒否する', async () => {
  const { handler, store, requests } = fixture();
  for (let index = 0; index < 11; index++) {
    const response = await handler(post({ ...input, url: `https://youtu.be/test${String(index).padStart(7, '0')}` }));
    assert.equal(response.status, index < 10 ? 201 : 429);
    if (index === 10) assert.equal(response.headers.get('retry-after'), '60');
  }
  assert.equal(store.videos.size, 10);
  assert.equal(requests.length, 10);
  assert.equal(new Set(store.hashes).size, 1);
  const anotherHandler = fixture({ store }).handler;
  assert.equal((await anotherHandler(post({ ...input, url: 'https://youtu.be/test0000012' }))).status, 429);
});

test('IPハッシュはsaltと正規化されたIPで決まり、生IPはstoreへ渡さない', async () => {
  const first = fixture({ getClientAddress: () => '2001:db8::1' });
  const second = fixture({ getClientAddress: () => '2001:0db8:0:0:0:0:0:1' });
  const third = fixture({ getClientAddress: () => '2001:db8::1', rateLimitSalt: 'other-salt' });
  await Promise.all([first.handler(post()), second.handler(post()), third.handler(post())]);
  assert.equal(first.store.hashes[0], second.store.hashes[0]);
  assert.notEqual(first.store.hashes[0], third.store.hashes[0]);
  assert.match(first.store.hashes[0], /^[0-9a-f]{64}$/);
});

test('Neon storeは専用schemaと一致し、パラメータ化したINSERTで同時重複を防ぐ', async () => {
  const queries = [];
  const sql = { async query(text, values) { queries.push({ text, values }); return /RETURNING video_id/.test(text) ? [{ video_id: apiVideo.id, data: apiVideo }] : []; } };
  const store = createNeonStore(undefined, { sql });
  assert.deepEqual(await store.insertVideo(apiVideo), apiVideo);
  assert.match(queries[0].text, /ON CONFLICT \(video_id\) DO NOTHING/);
  assert.deepEqual(queries[0].values, [apiVideo.id, JSON.stringify(apiVideo)]);
  assert.equal(queries[0].text.includes(apiVideo.author), false);
  assert.equal(await store.hasVideo(apiVideo.id), false);
  assert.deepEqual(await store.listVideos(), []);
  assert.deepEqual(await store.consumeRateLimit('a'.repeat(64), 10, 60), { allowed: false, retryAfter: 60 });
  const rateQuery = queries.at(-1);
  assert.match(rateQuery.text, /ON CONFLICT \(client_hash\) DO UPDATE/);
  assert.match(rateQuery.text, /attempts < \$2::integer/);
  assert.deepEqual(rateQuery.values, ['a'.repeat(64), 10, 60]);
  for (const query of queries) assert.equal(/CREATE TABLE|beatmaps/i.test(query.text), false);
  const schema = readFileSync(new URL('../../Encore/server/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /public\.encore_shared_videos/);
  assert.match(schema, /public\.encore_shared_rate_limits/);
  assert.equal(/beatmaps/i.test(schema), false);
});

test('PATCHは共有動画の情報と区間を更新し、URLと自動取得された投稿者を保持する', async () => {
  const { handler, store, requests } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  const response = await handler(patch(editInput(apiVideo, { title: '修正した楽曲名', start: '0:03', end: '1:35', mode: 'アイカツ！オールスターモード', difficulty: 'とてもむずかしい', idol: '自由入力アイドル', result: 'オールパーフェクト', author: '改ざん者', authorHandle: '@Fake', startSeconds: 999, endSeconds: 1000 })));
  assert.equal(response.status, 200);
  const body = await response.json();
  const expected = { ...apiVideo, title: '修正した楽曲名', startSeconds: 3, endSeconds: 95, mode: 'アイカツ！オールスターモード', difficulty: 'とてもむずかしい', idol: '自由入力アイドル', result: 'オールパーフェクト' };
  assert.deepEqual(store.videos.get(apiVideo.id), expected);
  assert.deepEqual(body.video, { ...expected, revision: revisionFor(expected) });
  assert.notEqual(body.video.revision, revisionFor(apiVideo));
  assert.equal(requests.length, 0);
  assert.equal(store.hashes.length, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('PATCHはURLとIDの不一致、revision欠落、入力不備を保存前に拒否する', async () => {
  const { handler, store, requests } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  for (const [changes, field] of [[{ title: '' }, 'title'], [{ start: '1:36' }, 'end'], [{ mode: '架空モード' }, 'mode'], [{ result: '架空成績' }, 'result'], [{ id: 'invalid' }, 'url'], [{ url: 'https://youtu.be/tJAcDG-eS-Q' }, 'url']]) {
    const response = await handler(patch(editInput(apiVideo, changes)));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).errors[field]);
  }
  for (const revision of [undefined, '', '0'.repeat(31), 'G'.repeat(32)]) assert.equal((await handler(patch(editInput(apiVideo, { revision })))).status, 400);
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
  assert.equal(store.hashes.length, 0);
  assert.equal(requests.length, 0);
});

test('PATCHはcatalog動画・未登録動画を追加せず404、古い情報は409を返す', async () => {
  const { handler, store, requests } = fixture({ reservedIds: ['tJAcDG-eS-Q'] });
  assert.equal((await handler(patch(editInput(apiVideo, { id: 'tJAcDG-eS-Q', url: 'https://youtu.be/tJAcDG-eS-Q' })))).status, 404);
  assert.equal((await handler(patch(editInput()))).status, 404);
  store.videos.set(apiVideo.id, { ...apiVideo, title: 'すでに変更された名前' });
  const stale = await handler(patch(editInput()));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'conflict');
  assert.equal(store.videos.get(apiVideo.id).title, 'すでに変更された名前');
  assert.equal(store.hashes.length, 0);
  assert.equal(requests.length, 0);
});

test('同じrevisionの並行編集は原子的なCASで一方だけ保存し上書きを防ぐ', async () => {
  const store = memoryStore();
  store.videos.set(apiVideo.id, apiVideo);
  const getVideo = store.getVideo.bind(store);
  let readers = 0;
  let release;
  const bothRead = new Promise(resolve => { release = resolve; });
  store.getVideo = async id => {
    const video = await getVideo(id);
    if (++readers === 2) release();
    await bothRead;
    return video;
  };
  const updateVideo = store.updateVideo.bind(store);
  let writes = 0;
  store.updateVideo = async (...args) => { writes++; return updateVideo(...args); };
  const { handler } = fixture({ store });
  const responses = await Promise.all([handler(patch(editInput(apiVideo, { title: '並行編集A' }))), handler(patch(editInput(apiVideo, { title: '並行編集B' })))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(writes, 2);
  const success = await responses.find(response => response.status === 200).json();
  const conflict = await responses.find(response => response.status === 409).json();
  assert.equal(success.video.title, store.videos.get(apiVideo.id).title);
  assert.equal(conflict.code, 'conflict');
});

test('PATCHにも同じOrigin・JSON・サイズ制限を適用しDBアクセス前に拒否する', async () => {
  const { handler, store, requests } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  for (const headers of [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { Host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await handler(patch(editInput(), headers))).status, 403);
  assert.equal((await handler(patch(editInput(), { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request(endpoint, { method: 'PATCH', headers: originHeaders, body: '{' }))).status, 400);
  assert.equal((await handler(patch([]))).status, 400);
  assert.equal((await handler(patch(editInput(), { 'Content-Length': String(MAX_JSON_BYTES + 1) }))).status, 413);
  assert.equal(store.hashes.length, 0);
  assert.equal(requests.length, 0);
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
});

test('PATCHはPOSTと共通のIP頻度制限を使い429では更新しない', async () => {
  const { handler, store } = fixture({ rateLimit: 1 });
  assert.equal((await handler(post())).status, 201);
  const response = await handler(patch(editInput(apiVideo, { title: '制限される更新' })));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(store.hashes[0], store.hashes[1]);
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
});

test('PATCHのDB取得・頻度制限・更新失敗は秘密を漏らさず503にする', async () => {
  for (const method of ['getVideo', 'consumeRateLimit', 'updateVideo']) {
    const store = memoryStore();
    store.videos.set(apiVideo.id, apiVideo);
    store[method] = async () => { throw new Error('SECRET postgresql://username:password@internal.example'); };
    const { handler, requests } = fixture({ store });
    const response = await handler(patch(editInput()));
    assert.equal(response.status, 503);
    const text = JSON.stringify(await response.json());
    assert.equal(text.includes('SECRET'), false);
    assert.equal(text.includes('postgresql'), false);
    assert.equal(requests.length, 0);
  }
});

test('Neon storeは読み込み時にrevisionを付け、JSONのrevisionを保存せず単一UPDATEで競合を防ぐ', async () => {
  const queries = [];
  const revision = 'a'.repeat(32);
  const sql = { async query(text, values) { queries.push({ text, values }); return [{ video_id: apiVideo.id, data: apiVideo, revision }]; } };
  const store = createNeonStore(undefined, { sql });
  const expected = { ...apiVideo, revision };
  assert.deepEqual(await store.listVideos(), [expected]);
  assert.deepEqual(await store.getVideo(apiVideo.id), expected);
  assert.deepEqual(await store.insertVideo(apiVideo), expected);
  assert.deepEqual(await store.updateVideo({ ...apiVideo, revision }, revision), expected);
  for (const query of queries) assert.match(query.text, /md5\(data::text\) AS revision/);
  const update = queries.at(-1);
  assert.match(update.text, /SET data = data \|\| \$2::jsonb/);
  assert.match(update.text, /WHERE video_id = \$1 AND md5\(data::text\) = \$3/);
  assert.deepEqual(update.values, [apiVideo.id, JSON.stringify(apiVideo), revision]);
  assert.equal(update.text.includes(apiVideo.author), false);
  const emptyStore = createNeonStore(undefined, { sql: { async query() { return []; } } });
  assert.equal(await emptyStore.getVideo(apiVideo.id), null);
  assert.equal(await emptyStore.updateVideo(apiVideo, revision), null);
});
