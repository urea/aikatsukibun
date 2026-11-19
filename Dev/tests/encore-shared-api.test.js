import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedVideosHandler, MAX_JSON_BYTES } from '../../Encore/server/shared-videos.js';
import { createNeonStore } from '../../Encore/server/neon-store.js';
import { createD1Client } from '../../Encore/server/d1-client.js';
import { SHARED_DAILY_LIMIT } from '../../Encore/model.js';

const endpoint = 'https://encore.example/api/videos';
const browseQuery = '?includeMisc=1&classification=series&view=browse';
const input = { url: 'https://youtu.be/fYibOFCMpnE', title: 'テスト用の曲', start: '0:00', end: '1:36', mode: 'じゆうにアイカツ！モード', difficulty: '-', idol: 'マイキャラ', result: 'フルコンボ' };
const apiVideo = { id: 'fYibOFCMpnE', title: input.title, startSeconds: 0, endSeconds: 96, mode: input.mode, difficulty: '-', idol: 'マイキャラ', result: 'フルコンボ', author: '実際の投稿者', authorHandle: '@Actual' };
const postedVideo = { ...apiVideo, videoId: apiVideo.id };
const originHeaders = { 'Content-Type': 'application/json', Origin: 'https://encore.example', Host: 'encore.example', 'x-vercel-forwarded-for': '203.0.113.4' };
const post = (body = input, headers = {}) => new Request(endpoint, { method: 'POST', headers: { ...originHeaders, ...headers }, body: JSON.stringify(body) });
const revisionFor = video => createHash('md5').update(JSON.stringify(video, Object.keys(video).sort())).digest('hex');
const patch = (body, headers = {}) => new Request(endpoint, { method: 'PATCH', headers: { ...originHeaders, ...headers }, body: JSON.stringify(body) });
const editInput = (video = apiVideo, changes = {}) => ({ ...input, id: video.id, revision: revisionFor(video), ...changes });
const sourceFor = video => video.videoId || video.id;
const clipKey = video => JSON.stringify([sourceFor(video), video.startSeconds ?? 0, video.endSeconds ?? -1]);
const withdrawnAt = '2026-11-15T01:02:03.000Z';

function memoryStore() {
  const videos = new Map();
  const rates = new Map();
  const isWithdrawn = id => [...videos.values()].some(video => sourceFor(video) === id && Object.hasOwn(video, 'withdrawnAt'));
  return {
    videos, rates, hashes: [],
    async listPublication() {
      const publicVideos = [];
      const withdrawnIds = new Set();
      for (const video of videos.values()) {
        if (isWithdrawn(sourceFor(video))) {
          withdrawnIds.add(sourceFor(video)); withdrawnIds.add(video.id);
        } else publicVideos.push(video);
      }
      return { videos: publicVideos, withdrawnIds: [...withdrawnIds] };
    },
    async listVideos() { return (await this.listPublication()).videos; },
    async isWithdrawn(id) { return isWithdrawn(id); },
    async hasVideo(id) { return [...videos.values()].some(video => sourceFor(video) === id); },
    async hasClip(video, excludeId = null) { return [...videos.values()].some(existing => existing.id !== excludeId && clipKey(existing) === clipKey(video)); },
    async getVideo(id) {
      const video = videos.get(id);
      return video && !isWithdrawn(sourceFor(video)) ? { ...structuredClone(video), revision: revisionFor(video) } : null;
    },
    async insertVideo(video) {
      if (isWithdrawn(sourceFor(video))) {
        const error = new Error('withdrawn'); error.code = 'withdrawn'; throw error;
      }
      if (videos.has(video.id) || [...videos.values()].some(existing => clipKey(existing) === clipKey(video))) return null;
      videos.set(video.id, structuredClone(video));
      return structuredClone(video);
    },
    async updateVideo(video, revision) {
      const existing = videos.get(video.id);
      if (!existing || isWithdrawn(sourceFor(existing)) || revisionFor(existing) !== revision) return null;
      const data = { ...existing, ...structuredClone(video) };
      delete data.revision;
      if ([...videos.values()].some(item => item.id !== data.id && clipKey(item) === clipKey(data))) {
        const error = new Error('duplicate'); error.code = 'duplicate_clip'; throw error;
      }
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
  assert.deepEqual(await response.json(), { videos: [apiVideo], withdrawnIds: [] });
});

test('登録サービスの接続状態だけを短時間共有し、停止中も閲覧用JSONを返す', async () => {
  let online = false;
  let lookups = 0;
  const { handler } = fixture({
    reservedIds: [apiVideo.id],
    store: {
      async hasVideo(id) {
        assert.equal(id, apiVideo.id);
        lookups++;
        if (!online) throw new Error('DB unavailable');
        return false;
      },
    },
    snapshot: { read: async () => ({ videos: [apiVideo], withdrawnIds: [] }) },
  });

  const down = await handler(new Request(`${endpoint}?view=status`));
  assert.equal(down.status, 200);
  assert.equal(down.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=60');
  assert.deepEqual(await down.json(), { available: false });
  const browse = await handler(new Request(`${endpoint}${browseQuery}`));
  assert.equal(browse.status, 200);
  assert.deepEqual((await browse.json()).videos, [apiVideo]);
  assert.equal(lookups, 1);

  online = true;
  const recovered = await handler(new Request(`${endpoint}?view=status`));
  assert.deepEqual(await recovered.json(), { available: true });
  assert.equal(lookups, 2);
});

test('Cloudflareの1027だけを日次上限として、状態確認・追加・編集に返す', async () => {
  let workerResponse = () => new Response('error code: 1027', { status: 429 });
  const store = createD1Client('https://worker.example', 'test-token', {
    fetchImpl: async (_url, { headers }) => {
      assert.equal(headers.Accept, 'application/json');
      return workerResponse();
    },
  });
  const { handler, requests } = fixture({ store });
  const statusRequest = () => new Request(`${endpoint}?view=status`);
  assert.deepEqual(await (await handler(statusRequest())).json(), { available: false, code: SHARED_DAILY_LIMIT });
  for (const request of [new Request(endpoint), post(), patch(editInput())]) {
    const failed = await handler(request);
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).code, SHARED_DAILY_LIMIT);
  }
  assert.equal(requests.length, 0);

  workerResponse = () => Response.json({ error_code: 1027 }, { status: 429 });
  assert.deepEqual(await (await handler(statusRequest())).json(), { available: false, code: SHARED_DAILY_LIMIT });
  workerResponse = () => new Response('Too Many Requests', { status: 429 });
  assert.deepEqual(await (await handler(statusRequest())).json(), { available: false });
  workerResponse = () => Response.json({ result: false });
  assert.deepEqual(await (await handler(statusRequest())).json(), { available: true });
});

test('GETはその他の動画を明示指定で含め、通常一覧と取り下げ情報の互換性を保つ', async () => {
  const { store, handler } = fixture();
  const encore = { ...apiVideo, category: 'encore' };
  const misc = { ...apiVideo, id: 'tJAcDG-eS-Q', category: 'misc' };
  const other = { ...apiVideo, id: 'lTLqkpcqWs8', category: 'other' };
  const legacy = { ...apiVideo, id: 'abcdefghijk' };
  const hidden = { ...apiVideo, id: 'zyxwvutsrqp', category: 'misc', withdrawnAt, title: '非公開の曲名' };
  for (const video of [encore, misc, other, legacy, hidden]) store.videos.set(video.id, video);

  for (const suffix of ['', '?includeMisc=0', '?includeMisc=true', '?includeMisc=']) {
    const response = await handler(new Request(`${endpoint}${suffix}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { videos: [encore, other, legacy], withdrawnIds: [hidden.id] });
  }

  const response = await handler(new Request(`${endpoint}?includeMisc=1`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { videos: [encore, misc, other, legacy], withdrawnIds: [hidden.id] });
});

test('シリーズGETは実分類とプレイ可否を返し、旧一覧では従来の分類によるプレイ判定を維持する', async () => {
  const { store, handler } = fixture();
  const unplayableEncore = { ...apiVideo, category: 'encore', playable: false };
  const playableMisc = { ...apiVideo, id: 'tJAcDG-eS-Q', category: 'misc', playable: true };
  const unplayableUncategorized = { ...apiVideo, id: 'abcdefghijk', playable: false };
  const legacyMisc = { ...apiVideo, id: 'lTLqkpcqWs8', category: 'misc' };
  const legacyOther = { ...apiVideo, id: 'test0000001', category: 'other' };
  const hidden = { ...apiVideo, id: 'zyxwvutsrqp', category: 'encore', playable: true, withdrawnAt };
  const publicVideos = [unplayableEncore, playableMisc, unplayableUncategorized, legacyMisc, legacyOther];
  for (const video of [...publicVideos, hidden]) store.videos.set(video.id, video);
  const get = async suffix => {
    const response = await handler(new Request(`${endpoint}${suffix}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };
  const projectedPlayable = { ...playableMisc, category: 'other' };
  assert.deepEqual(await get(''), { videos: [projectedPlayable, legacyOther], withdrawnIds: [hidden.id] });
  assert.deepEqual(await get('?includeMisc=1&classification=unknown'), {
    videos: [{ ...unplayableEncore, category: 'misc' }, projectedPlayable, { ...unplayableUncategorized, category: 'misc' }, legacyMisc, legacyOther],
    withdrawnIds: [hidden.id],
  });
  assert.deepEqual(await get('?classification=series'), { videos: [unplayableEncore, unplayableUncategorized, legacyOther], withdrawnIds: [hidden.id] });
  assert.deepEqual(await get('?includeMisc=1&classification=series'), { videos: publicVideos, withdrawnIds: [hidden.id] });
  assert.deepEqual([...store.videos.values()], [...publicVideos, hidden]);
});

test('正規の閲覧用GETだけが成功時にVercel CDNで60秒キャッシュされる', async () => {
  const { store, handler } = fixture();
  const published = { ...apiVideo, category: 'misc', playable: false };
  store.videos.set(published.id, published);

  for (const query of [browseQuery, '?includeMisc=1&classification=series', `${browseQuery}&other=1`]) {
    const response = await handler(new Request(`${endpoint}${query}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), query === browseQuery ? 'public, s-maxage=300' : null);
    assert.deepEqual(await response.json(), { videos: [published], withdrawnIds: [] });
  }

  store.listPublication = async () => { throw new Error('DB unavailable'); };
  const failed = await handler(new Request(`${endpoint}${browseQuery}`));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.equal(failed.headers.get('vercel-cdn-cache-control'), null);
});

test('公開JSONを設定した閲覧用GETはDB停止中も一覧と公開日時を返し、最新GETは503を返す', async () => {
  const publication = { videos: [{ ...apiVideo, category: 'misc' }], withdrawnIds: ['zyxwvutsrqp'], publishedAt: '2026-11-17T00:00:00.000Z' };
  const store = memoryStore();
  let dbReads = 0;
  store.listPublication = async () => { dbReads++; throw new Error('DB unavailable'); };
  const { handler } = fixture({ store, snapshot: { read: async () => publication } });

  const browse = await handler(new Request(`${endpoint}${browseQuery}`));
  assert.equal(browse.status, 200);
  assert.equal(browse.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=300');
  assert.deepEqual(await browse.json(), publication);
  assert.equal(dbReads, 0);

  const fresh = await handler(new Request(`${endpoint}?includeMisc=1&classification=series`));
  assert.equal(fresh.status, 503);
  assert.equal(fresh.headers.get('cache-control'), 'no-store');
  assert.equal(fresh.headers.get('vercel-cdn-cache-control'), null);
  assert.match((await fresh.json()).error, /共有データを利用できません/);
  assert.equal(dbReads, 1);
});

test('公開JSONが未作成または読めない場合は過去の一覧やDBへ切り替えず503を返す', async () => {
  const store = memoryStore();
  let dbReads = 0;
  store.listPublication = async () => { dbReads++; return { videos: [apiVideo], withdrawnIds: [] }; };
  for (const read of [async () => null, async () => { throw new Error('SECRET'); }]) {
    const { handler } = fixture({ store, snapshot: { read } });
    const response = await handler(new Request(`${endpoint}${browseQuery}`));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), null);
    const body = await response.json();
    assert.match(body.error, /公開一覧を取得できません/);
    assert.doesNotMatch(body.error, /SECRET/);
  }
  assert.equal(dbReads, 0);
});

test('追加と編集に成功すると保存済みの最新一覧を取得して公開JSONを更新する', async () => {
  const published = [];
  const snapshot = { async publish(loadPublication) { published.push(await loadPublication()); } };
  const { store, handler } = fixture({ snapshot });
  const added = await handler(post());
  assert.equal(added.status, 201);
  assert.deepEqual(await added.json(), { video: postedVideo });
  assert.deepEqual(published[0].videos, [postedVideo]);

  const updated = await handler(patch(editInput(store.videos.get(apiVideo.id), { title: '編集後の曲' })));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).publicationUpdated, undefined);
  assert.equal(published[1].videos[0].title, '編集後の曲');

  const rejected = await handler(patch(editInput(postedVideo)));
  assert.equal(rejected.status, 409);
  assert.equal(published.length, 2);
});

test('公開JSONへの反映に失敗しても追加・編集の保存結果を返し、反映失敗を通知する', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const snapshot = { async publish() { throw new Error('SECRET'); } };
  const { store, handler } = fixture({ snapshot });

  const added = await handler(post());
  assert.equal(added.status, 201);
  assert.equal(added.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await added.json(), { video: postedVideo, publicationUpdated: false });

  const updated = await handler(patch(editInput(store.videos.get(apiVideo.id), { title: '保存済みの曲' })));
  assert.equal(updated.status, 200);
  const result = await updated.json();
  assert.equal(result.publicationUpdated, false);
  assert.equal(result.video.title, '保存済みの曲');
  assert.equal(store.videos.get(apiVideo.id).title, '保存済みの曲');
  assert.equal(warnings.mock.callCount(), 2);
  assert.doesNotMatch(JSON.stringify(warnings.mock.calls.map(call => call.arguments)), /SECRET/);
});

test('取り下げた元動画は同じソースの全区間が非公開になり、一覧に識別子だけを返す', async () => {
  const base = { ...apiVideo, title: '非公開の曲名', author: '非公開の投稿者' };
  const firstClip = { ...base, id: `clip_${'a'.repeat(32)}`, videoId: base.id, startSeconds: 96, endSeconds: 180, withdrawnAt };
  const sibling = { ...firstClip, id: `clip_${'b'.repeat(32)}`, startSeconds: 180, endSeconds: 250 };
  delete sibling.withdrawnAt;
  const other = { ...apiVideo, id: 'tJAcDG-eS-Q' };
  const { store, handler, requests } = fixture();
  for (const video of [base, firstClip, sibling, other]) store.videos.set(video.id, video);
  const response = await handler(new Request(endpoint));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { videos: [other], withdrawnIds: [base.id, firstClip.id, sibling.id] });
  assert.doesNotMatch(JSON.stringify(body), /非公開|withdrawnAt/);
  for (const entry of [base, firstClip, sibling]) {
    const denied = await handler(patch(editInput(entry, { title: '変更', withdrawnAt: null })));
    assert.equal(denied.status, 404);
    assert.doesNotMatch(await denied.text(), /非公開|withdrawnAt/);
    assert.deepEqual(store.videos.get(entry.id), entry);
  }
  assert.equal((await handler(patch(editInput(other, { url: 'https://youtu.be/tJAcDG-eS-Q' })))).status, 200);
  assert.equal(requests.length, 0);
});

test('取り下げた元動画は別区間でもPOSTを409にし、他の動画を追加できる', async () => {
  const { store, handler, requests } = fixture();
  const clipId = `clip_${'c'.repeat(32)}`;
  store.videos.set(clipId, { ...apiVideo, id: clipId, videoId: apiVideo.id, withdrawnAt });
  for (const body of [input, { ...input, start: '1:36', end: '3:00' }]) {
    const denied = await handler(post(body));
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).code, 'withdrawn');
  }
  assert.equal(requests.length, 0);
  assert.equal(store.hashes.length, 0);
  assert.equal((await handler(post({ ...input, url: 'https://youtu.be/tJAcDG-eS-Q' }))).status, 201);
  assert.equal(store.videos.size, 2);
});

test('投稿者取得を待つ間に取り下げられた動画も挿入時の再確認で拒否する', async () => {
  const store = memoryStore();
  const clipId = `clip_${'d'.repeat(32)}`;
  store.videos.set(clipId, { ...apiVideo, id: clipId, videoId: apiVideo.id });
  let fetchStarted = false;
  const { handler } = fixture({ store, fetchImpl: async () => {
    fetchStarted = true;
    store.videos.get(clipId).withdrawnAt = withdrawnAt;
    return Response.json({ title: '動画', author_name: '投稿者' });
  } });
  const response = await handler(post({ ...input, start: '1:36', end: '3:00' }));
  assert.equal(fetchStarted, true);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'withdrawn');
  assert.equal(store.videos.size, 1);
});

test('編集用の取得後に取り下げられても更新結果やメタデータを返さない', async () => {
  const { store, handler } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  const getVideo = store.getVideo.bind(store);
  store.getVideo = async id => {
    const existing = await getVideo(id);
    store.videos.set(id, { ...apiVideo, withdrawnAt });
    return existing;
  };
  const response = await handler(patch(editInput(apiVideo, { title: '取り下げ後に変更' })));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'conflict');
  assert.equal('video' in body, false);
  assert.deepEqual(store.videos.get(apiVideo.id), { ...apiVideo, withdrawnAt });
});

test('POSTはサーバー取得の投稿者だけを保存し、201で正規化した区間を返す', async () => {
  const { handler, store, requests } = fixture();
  const response = await handler(post({ ...input, author: '改ざん者', authorHandle: '@Fake', startSeconds: 999, endSeconds: 1000, withdrawnAt }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { video: postedVideo });
  assert.deepEqual(store.videos.get(apiVideo.id), postedVideo);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://noembed.com/embed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DfYibOFCMpnE');
  assert.ok(requests[0].init.signal instanceof AbortSignal);
  assert.match(store.hashes[0], /^[0-9a-f]{64}$/);
  assert.equal(store.hashes[0].includes('203.0.113.4'), false);
});

test('2種類の分類を登録・編集して一覧に反映し、旧版の分類省略による編集でも保持する', async () => {
  for (const [initial, next] of [['encore', 'other'], ['other', 'encore']]) {
    const { handler, store } = fixture();
    const added = await handler(post({ ...input, category: initial }));
    assert.equal(added.status, 201);
    const { video: created } = await added.json();
    assert.deepEqual(created, { ...postedVideo, category: initial });

    const updated = await handler(patch(editInput(created, { category: next })));
    assert.equal(updated.status, 200);
    const { video: changed } = await updated.json();
    assert.equal(changed.category, next);

    const legacyEdit = await handler(patch(editInput(store.videos.get(apiVideo.id), { title: '旧版で曲名を編集' })));
    assert.equal(legacyEdit.status, 200);
    const { video: edited } = await legacyEdit.json();
    assert.equal(edited.category, next);
    assert.equal(edited.title, '旧版で曲名を編集');

    const listed = await fixture({ store }).handler(new Request(endpoint));
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { videos: [{ ...postedVideo, category: next, title: edited.title }], withdrawnIds: [] });
  }
});

test('その他の動画の分類を公開登録・編集でき、旧一覧には表示しない', async () => {
  const { store, handler } = fixture();
  const added = await handler(post({ ...input, category: 'misc' }));
  assert.equal(added.status, 201);
  const { video: created } = await added.json();
  assert.deepEqual(created, { ...postedVideo, category: 'misc' });
  assert.deepEqual(await (await handler(new Request(endpoint))).json(), { videos: [], withdrawnIds: [] });

  const updated = await handler(patch(editInput(created, { category: 'encore' })));
  assert.equal(updated.status, 200);
  const expected = { ...postedVideo, category: 'encore' };
  assert.deepEqual(await (await handler(new Request(endpoint))).json(), { videos: [expected], withdrawnIds: [] });

  const categorized = await handler(patch(editInput(expected, { category: 'misc' })));
  assert.equal(categorized.status, 200);
  const legacyEdit = await handler(patch(editInput(store.videos.get(apiVideo.id), { title: '旧版で曲名を編集' })));
  assert.equal(legacyEdit.status, 200);
  const { video: edited } = await legacyEdit.json();
  assert.equal(edited.category, 'misc');
  assert.deepEqual(await (await handler(new Request(`${endpoint}?includeMisc=1`))).json(), { videos: [{ ...created, title: edited.title }], withdrawnIds: [] });
  assert.deepEqual(await (await handler(new Request(endpoint))).json(), { videos: [], withdrawnIds: [] });
});

test('新規登録・編集ではプレイ可否をシリーズと独立して保存し、旧編集でも保持する', async () => {
  const { store, handler } = fixture();
  const added = await handler(post({ ...input, category: 'encore', playable: 'no' }));
  assert.equal(added.status, 201);
  const { video: created } = await added.json();
  assert.deepEqual(created, { ...postedVideo, category: 'encore', playable: false });
  assert.deepEqual(await (await handler(new Request(endpoint))).json(), { videos: [], withdrawnIds: [] });

  const oldEdit = await handler(patch(editInput(created, { category: 'misc', title: '旧版で名前を修正' })));
  assert.equal(oldEdit.status, 200);
  const { video: oldEdited } = await oldEdit.json();
  assert.equal(oldEdited.category, 'encore');
  assert.equal(oldEdited.playable, false);

  const changed = await handler(patch(editInput(store.videos.get(apiVideo.id), { category: 'misc', playable: 'yes' })));
  assert.equal(changed.status, 200);
  const { video: changedVideo } = await changed.json();
  assert.equal(changedVideo.category, 'misc');
  assert.equal(changedVideo.playable, true);

  const oldEditAgain = await handler(patch(editInput(store.videos.get(apiVideo.id), { category: 'other', title: '再度修正' })));
  assert.equal(oldEditAgain.status, 200);
  const expected = { ...postedVideo, category: 'misc', playable: true, title: '再度修正' };
  assert.deepEqual(store.videos.get(apiVideo.id), expected);
  assert.deepEqual(await (await handler(new Request(`${endpoint}?includeMisc=1&classification=series`))).json(), { videos: [expected], withdrawnIds: [] });
  assert.deepEqual(await (await handler(new Request(endpoint))).json(), { videos: [{ ...expected, category: 'other' }], withdrawnIds: [] });
  for (const request of [post({ ...input, playable: 'unknown' }), patch(editInput(expected, { playable: null }))]) {
    const invalid = await handler(request);
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).errors.playable);
  }
});

test('縦動画の指定を旧編集で保持し、標準を明示した編集で解除する', async () => {
  const { handler, store } = fixture();
  const added = await handler(post({ ...input, category: 'encore', orientation: 'portrait' }));
  assert.equal(added.status, 201);
  assert.equal((await added.json()).video.orientation, 'portrait');

  const oldEdit = await handler(patch(editInput(store.videos.get(apiVideo.id), { category: 'other' })));
  assert.equal(oldEdit.status, 200);
  assert.equal((await oldEdit.json()).video.orientation, 'portrait');

  const reset = await handler(patch(editInput(store.videos.get(apiVideo.id), { orientation: 'standard' })));
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).video.orientation, 'standard');
  const listed = await handler(new Request(`${endpoint}?classification=series`));
  assert.equal((await listed.json()).videos[0].orientation, 'standard');
});

test('旧版の未分類レコードを後から分類でき、空または不正なPOSTとPATCHは保存せず400を返す', async () => {
  const { handler, store, requests } = fixture();
  const legacy = await handler(post());
  assert.equal(legacy.status, 201);
  assert.equal(Object.hasOwn((await legacy.json()).video, 'category'), false);
  for (const category of ['', null, '未分類', ' encore', '__proto__', ['other']]) {
    for (const request of [post({ ...input, category }), patch(editInput(postedVideo, { category }))]) {
      const response = await handler(request);
      assert.equal(response.status, 400);
      assert.match((await response.json()).errors.category, /分類.*選択/);
    }
  }
  assert.deepEqual([...store.videos.values()], [postedVideo]);
  assert.equal(store.hashes.length, 1);
  assert.equal(requests.length, 1);
  const classified = await handler(patch(editInput(postedVideo, { category: 'other' })));
  assert.equal(classified.status, 200);
  assert.equal((await classified.json()).video.category, 'other');
  assert.deepEqual(store.videos.get(apiVideo.id), { ...postedVideo, category: 'other' });
});

test('不明モード「-」でPOST登録した動画を別の一覧取得でもそのまま保持する', async () => {
  const { handler, store } = fixture();
  const expected = { ...postedVideo, mode: '-' };
  const added = await handler(post({ ...input, mode: '-' }));
  assert.equal(added.status, 201);
  assert.deepEqual(await added.json(), { video: expected });
  assert.deepEqual(store.videos.get(apiVideo.id), expected);
  const anotherHandler = fixture({ store }).handler;
  const listed = await anotherHandler(new Request(endpoint));
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { videos: [expected], withdrawnIds: [] });
});

test('既存動画を不明モード「-」へPATCH編集し、投稿者と区間を保全してGETで保持する', async () => {
  const { handler, store, requests } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  const expected = { ...apiVideo, mode: '-' };
  const updated = await handler(patch(editInput(apiVideo, { mode: '-' })));
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { video: { ...expected, revision: revisionFor(expected) } });
  assert.notEqual(revisionFor(expected), revisionFor(apiVideo));
  assert.deepEqual(store.videos.get(apiVideo.id), expected);
  const anotherHandler = fixture({ store }).handler;
  const listed = await anotherHandler(new Request(endpoint));
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { videos: [expected], withdrawnIds: [] });
  assert.equal(requests.length, 0);
});

test('POSTは全体再生と片方省略を明示nullで保存しGETでも保持する', async () => {
  for (const [times, startSeconds, endSeconds] of [[{ start: '', end: '' }, null, null], [{ start: undefined, end: '1:36' }, null, 96], [{ start: '0:05', end: undefined }, 5, null]]) {
    const { handler, store, requests } = fixture();
    const expected = { ...postedVideo, startSeconds, endSeconds };
    const added = await handler(post({ ...input, ...times }));
    assert.equal(added.status, 201);
    assert.deepEqual(await added.json(), { video: expected });
    const listed = await fixture({ store }).handler(new Request(endpoint));
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { videos: [expected], withdrawnIds: [] });
    assert.equal(requests.length, 1);
  }
});

test('PATCHは既存数値区間を全体再生や片方省略へ変更し旧数値を残さない', async () => {
  for (const [times, startSeconds, endSeconds] of [[{ start: '', end: '' }, null, null], [{ start: '', end: '1:36' }, null, 96], [{ start: '0:05', end: '' }, 5, null]]) {
    const { handler, store, requests } = fixture();
    store.videos.set(apiVideo.id, apiVideo);
    const expected = { ...apiVideo, startSeconds, endSeconds };
    const updated = await handler(patch(editInput(apiVideo, times)));
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), { video: { ...expected, revision: revisionFor(expected) } });
    assert.deepEqual(store.videos.get(apiVideo.id), expected);
    const listed = await fixture({ store }).handler(new Request(endpoint));
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { videos: [expected], withdrawnIds: [] });
    assert.equal(requests.length, 0);
  }
});

test('必須入力・区間の順序・成績やモードの不正値は400で保存前に拒否する', async () => {
  const { handler, store, requests } = fixture();
  for (const [body, field] of [[{ ...input, title: '' }, 'title'], [{ ...input, start: '1:36' }, 'end'], [{ ...input, end: '0:99' }, 'end'], [{ ...input, result: '架空成績' }, 'result'], [{ ...input, mode: '架空モード' }, 'mode'], [{ ...input, mode: '' }, 'mode'], [{ ...input, url: 'https://evil.test/watch?v=fYibOFCMpnE' }, 'url']]) {
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
  assert.deepEqual(store.videos.get(apiVideo.id), postedVideo);
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
  for (const method of ['listPublication', 'isWithdrawn', 'hasVideo', 'hasClip', 'consumeRateLimit', 'insertVideo']) {
    const store = memoryStore();
    store[method] = async () => { throw new Error('SECRET postgresql://username:password@internal.example'); };
    const { handler, requests } = fixture({ store });
    const response = await handler(method === 'listPublication' ? new Request(endpoint) : post());
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
  const sql = {
    async query(text, values) { queries.push({ text, values }); return /RETURNING video_id/.test(text) ? [{ video_id: apiVideo.id, data: apiVideo }] : []; },
    async transaction(steps, options) { assert.equal(steps.length, 2); assert.equal(options.isolationLevel, 'ReadCommitted'); return Promise.all(steps); },
  };
  const store = createNeonStore(undefined, { sql });
  assert.deepEqual(await store.insertVideo(apiVideo), apiVideo);
  assert.equal(queries[0].text, 'SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))');
  assert.deepEqual(queries[0].values, [apiVideo.id]);
  assert.match(queries[1].text, /ON CONFLICT DO NOTHING/);
  assert.deepEqual(queries[1].values, [apiVideo.id, JSON.stringify(apiVideo), apiVideo.id]);
  assert.equal(queries[1].text.includes(apiVideo.author), false);
  assert.equal(await store.hasVideo(apiVideo.id), false);
  assert.equal(await store.hasClip(apiVideo), false);
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

test('Neonの公開一覧と編集取得はソース単位で取り下げを判定し、非公開の曲データを返さない', async () => {
  const clipId = `clip_${'e'.repeat(32)}`;
  const clipId2 = `clip_${'f'.repeat(32)}`;
  const queries = [];
  const sql = { async query(text, values) {
    queries.push({ text, values });
    if (text.includes('AS withdrawn_source')) return [
      { video_id: clipId, withdrawn_source: 'XTAE6nTGf3w', data: null, revision: null },
      { video_id: clipId2, withdrawn_source: 'XTAE6nTGf3w', data: null, revision: null },
      { video_id: apiVideo.id, withdrawn_source: null, data: apiVideo, revision: 'a'.repeat(32) },
    ];
    if (text.includes('AS withdrawn')) return [{ withdrawn: values[0] === 'XTAE6nTGf3w' }];
    return [];
  } };
  const store = createNeonStore(undefined, { sql });
  const exposed = { ...apiVideo, revision: 'a'.repeat(32) };
  assert.deepEqual(await store.listPublication(), { videos: [exposed], withdrawnIds: ['XTAE6nTGf3w', clipId, clipId2] });
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /CASE WHEN w\.source_id IS NULL THEN v\.data END AS data/);
  assert.match(queries[0].text, /LEFT JOIN withdrawn_sources w ON w\.source_id = COALESCE\(v\.data->>'videoId', v\.video_id\)/);
  assert.deepEqual(await store.listVideos(), [exposed]);
  assert.equal(await store.isWithdrawn('XTAE6nTGf3w'), true);
  assert.equal(await store.isWithdrawn(apiVideo.id), false);
  assert.equal(await store.getVideo(clipId), null);
  assert.match(queries.at(-1).text, /NOT \(data \? 'withdrawnAt'\) AND NOT EXISTS/);
});

test('Neonの挿入は元動画ロック後の別SQLで取り下げを再確認し、管理属性を保存しない', async () => {
  const candidate = { ...apiVideo, id: `clip_${'1'.repeat(32)}`, videoId: apiVideo.id, withdrawnAt };
  const sql = {
    query(text, values) { return { text, values }; },
    async transaction([lock, insert], options) {
      assert.equal(lock.text, 'SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))');
      assert.deepEqual(lock.values, [candidate.videoId]);
      assert.equal(options.isolationLevel, 'ReadCommitted');
      assert.match(insert.text, /WITH withdrawal AS MATERIALIZED \(SELECT EXISTS[\s\S]+withdrawn\.data \? 'withdrawnAt'\) AS blocked\)/);
      assert.match(insert.text, /SELECT \$1, \$2::jsonb FROM withdrawal WHERE NOT blocked/);
      assert.equal(insert.values[0], candidate.id);
      assert.equal(insert.values[2], candidate.videoId);
      assert.equal('withdrawnAt' in JSON.parse(insert.values[1]), false);
      return [[{}], [{ blocked: true }]];
    },
  };
  const store = createNeonStore(undefined, { sql });
  await assert.rejects(store.insertVideo(candidate), { code: 'withdrawn' });
});

test('PATCHは共有動画の情報と区間を更新し、URLと自動取得された投稿者を保持する', async () => {
  const { handler, store, requests } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  const response = await handler(patch(editInput(apiVideo, { title: '修正した楽曲名', start: '0:03', end: '1:35', mode: 'アイカツ！オールスターモード', difficulty: 'とてもむずかしい', idol: '自由入力アイドル', result: 'オールパーフェクト', author: '改ざん者', authorHandle: '@Fake', startSeconds: 999, endSeconds: 1000, withdrawnAt })));
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
  for (const [changes, field] of [[{ title: '' }, 'title'], [{ start: '1:36' }, 'end'], [{ mode: '架空モード' }, 'mode'], [{ mode: '' }, 'mode'], [{ result: '架空成績' }, 'result'], [{ id: 'invalid' }, 'url'], [{ url: 'https://youtu.be/tJAcDG-eS-Q' }, 'url']]) {
    const response = await handler(patch(editInput(apiVideo, changes)));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).errors[field]);
  }
  for (const revision of [undefined, '', '0'.repeat(31), 'G'.repeat(32)]) assert.equal((await handler(patch(editInput(apiVideo, { revision })))).status, 400);
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
  assert.equal(store.hashes.length, 0);
  assert.equal(requests.length, 0);
});

test('PATCHはDB未登録動画を追加せず404、古い情報は409を返す', async () => {
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

test('DB登録済みの初期2動画はPATCHで編集でき、投稿者を保全して古いrevisionを拒否する', async () => {
  const ids = ['lTLqkpcqWs8', 'tJAcDG-eS-Q'];
  const { handler, store, requests } = fixture({ reservedIds: ids });
  for (const [index, id] of ids.entries()) {
    const existing = { ...apiVideo, id, title: index === 0 ? 'アイドル活動！' : '君のEntrance', author: index === 0 ? 'けやき通りCh.' : 'cubewano', authorHandle: index === 0 ? '@Keyaki_st' : '@cubewano4' };
    store.videos.set(id, existing);
    const body = editInput(existing, { url: `https://youtu.be/${id}`, difficulty: 'とてもむずかしい', author: '改ざん者', authorHandle: '@Fake', authorUrl: 'https://www.youtube.com/user/fake' });
    const response = await handler(patch(body));
    assert.equal(response.status, 200);
    const expected = { ...existing, title: input.title, difficulty: 'とてもむずかしい' };
    assert.deepEqual(store.videos.get(id), expected);
    assert.deepEqual((await response.json()).video, { ...expected, revision: revisionFor(expected) });
    const stale = await handler(patch({ ...body, title: '古い情報による上書き' }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'conflict');
    assert.deepEqual(store.videos.get(id), expected);
    assert.equal((await handler(post({ ...input, url: `https://youtu.be/${id}` }))).status, 409);
  }
  assert.equal(store.videos.size, 2);
  assert.equal(store.hashes.length, 2);
  assert.equal(requests.length, 0);
});

test('予約リストの動画でも同じrevisionの並行編集は原子的なCASで一方だけ保存する', async () => {
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
  const { handler } = fixture({ store, reservedIds: [apiVideo.id] });
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
  const response = await handler(patch(editInput(postedVideo, { title: '制限される更新' })));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(store.hashes[0], store.hashes[1]);
  assert.deepEqual(store.videos.get(apiVideo.id), postedVideo);
});

test('PATCHのDB取得・頻度制限・更新失敗は秘密を漏らさず503にする', async () => {
  for (const method of ['getVideo', 'hasClip', 'consumeRateLimit', 'updateVideo']) {
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
  const sql = {
    async query(text, values) { queries.push({ text, values }); return [{ video_id: apiVideo.id, data: apiVideo, revision }]; },
    async transaction(steps) { return Promise.all(steps); },
  };
  const store = createNeonStore(undefined, { sql });
  const expected = { ...apiVideo, revision };
  assert.deepEqual(await store.listVideos(), [expected]);
  assert.deepEqual(await store.getVideo(apiVideo.id), expected);
  assert.deepEqual(await store.insertVideo(apiVideo), expected);
  assert.deepEqual(await store.updateVideo({ ...apiVideo, revision }, revision), expected);
  for (const query of queries.filter(query => !query.text.includes('pg_advisory_xact_lock'))) assert.match(query.text, /md5\((?:v\.)?data::text\)/);
  const update = queries.at(-1);
  assert.match(update.text, /SET data = data \|\| \$2::jsonb/);
  assert.match(update.text, /WHERE video_id = \$1 AND md5\(data::text\) = \$3/);
  assert.match(update.text, /NOT \(data \? 'withdrawnAt'\)/);
  assert.deepEqual(update.values, [apiVideo.id, JSON.stringify(apiVideo), revision]);
  assert.equal(update.text.includes(apiVideo.author), false);
  const emptyStore = createNeonStore(undefined, { sql: { async query() { return []; } } });
  assert.equal(await emptyStore.getVideo(apiVideo.id), null);
  assert.equal(await emptyStore.updateVideo(apiVideo, revision), null);
});

test('Neon storeは明示nullの境界を正規化して保持しUPDATE JSONで旧数値を置き換える', async () => {
  const revision = 'a'.repeat(32);
  for (const [startSeconds, endSeconds] of [[null, null], [null, 96], [5, null]]) {
    let data = { ...apiVideo };
    const queries = [];
    const sql = { async query(text, values) {
      queries.push({ text, values });
      if (text.startsWith('UPDATE')) data = { ...data, ...JSON.parse(values[1]) };
      return [{ video_id: apiVideo.id, data, revision }];
    } };
    const store = createNeonStore(undefined, { sql });
    const expected = { ...apiVideo, startSeconds, endSeconds };
    assert.deepEqual(await store.updateVideo(expected, revision), { ...expected, revision });
    assert.deepEqual(JSON.parse(queries[0].values[1]), expected);
    assert.deepEqual(await store.getVideo(apiVideo.id), { ...expected, revision });
    assert.deepEqual(await store.listVideos(), [{ ...expected, revision }]);
  }
  for (const [startSeconds, endSeconds] of [[undefined, null], [null, undefined], [null, 0], [-1, null], ['0', null]]) {
    const store = createNeonStore(undefined, { sql: { async query() { return [{ video_id: apiVideo.id, data: { ...apiVideo, startSeconds, endSeconds }, revision }]; } } });
    assert.equal(await store.getVideo(apiVideo.id), null);
    assert.deepEqual(await store.listVideos(), []);
  }
});

test('Neon storeは旧PATCHのJSONマージで既存分類・プレイ可否・動画の向きを保持する', async () => {
  const revision = 'a'.repeat(32);
  let data = { ...apiVideo, category: 'encore', playable: false, orientation: 'portrait' };
  const sql = { async query(text, values) {
    if (text.startsWith('UPDATE')) {
      assert.match(text, /SET data = data \|\| \$2::jsonb/);
      const submitted = JSON.parse(values[1]);
      assert.equal(Object.hasOwn(submitted, 'category'), false);
      assert.equal(Object.hasOwn(submitted, 'playable'), false);
      assert.equal(Object.hasOwn(submitted, 'orientation'), false);
      data = { ...data, ...submitted };
    }
    return [{ video_id: apiVideo.id, data, revision }];
  } };
  const store = createNeonStore(undefined, { sql });
  const expected = { ...apiVideo, title: '旧版で曲名を編集', category: 'encore', playable: false, orientation: 'portrait', revision };
  assert.deepEqual(await store.updateVideo({ ...apiVideo, title: expected.title }, revision), expected);
  assert.deepEqual(await store.listVideos(), [expected]);
});

test('同じ元動画の11区間を独立登録し、最初の旧IDと10個のclip IDをGETで保持する', async () => {
  const videoId = 'XTAE6nTGf3w';
  const { handler, store, requests } = fixture({ rateLimit: 20 });
  const saved = [];
  for (let index = 0; index < 11; index++) {
    const response = await handler(post({ ...input, url: `https://youtu.be/${videoId}`, title: `曲${index + 1}`, start: `${index}:00`, end: `${index + 1}:00`, mode: '-', difficulty: 'とてもむずかしい', result: 'クリア', videoId: 'tJAcDG-eS-Q' }));
    assert.equal(response.status, 201);
    const { video } = await response.json();
    assert.equal(video.videoId, videoId);
    assert.equal(video.title, `曲${index + 1}`);
    assert.equal(video.startSeconds, index * 60);
    assert.equal(video.endSeconds, (index + 1) * 60);
    assert.equal(video.mode, '-');
    assert.equal(video.difficulty, 'とてもむずかしい');
    assert.equal(video.result, 'クリア');
    if (index === 0) assert.equal(video.id, videoId);
    else assert.match(video.id, /^clip_[0-9a-f]{32}$/);
    saved.push(video);
  }
  assert.equal(new Set(saved.map(video => video.id)).size, 11);
  assert.equal(store.videos.size, 11);
  const listed = await fixture({ store }).handler(new Request(endpoint));
  assert.deepEqual((await listed.json()).videos, saved);
  assert.ok(requests.every(request => request.url.includes(videoId)));
});

test('同じ動画の先頭nullと0は同区間として拒否し、異なる終端・開始は許可する', async () => {
  const { handler, store, requests } = fixture();
  assert.equal((await handler(post({ ...input, start: '', end: '' }))).status, 201);
  const duplicate = await handler(post({ ...input, start: '0:00', end: '' }));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'duplicate_clip');
  assert.equal((await handler(post({ ...input, start: '', end: '1:36' }))).status, 201);
  assert.equal((await handler(post({ ...input, start: '1:36', end: '' }))).status, 201);
  assert.equal(store.videos.size, 3);
  assert.equal(requests.length, 3);
});

test('予約動画は未移行時だけ保護し、DBに曲があれば別区間を登録できる', async () => {
  const { handler, store } = fixture({ reservedIds: [apiVideo.id] });
  const different = { ...input, start: '1:36', end: '3:00' };
  assert.equal((await handler(post(different))).status, 409);
  store.videos.set(apiVideo.id, apiVideo);
  const added = await handler(post(different));
  assert.equal(added.status, 201);
  const { video } = await added.json();
  assert.match(video.id, /^clip_[0-9a-f]{32}$/);
  assert.equal(video.videoId, apiVideo.id);
  store.videos.delete(apiVideo.id);
  assert.equal((await handler(post({ ...input, start: '3:00', end: '4:00' }))).status, 201);
  assert.equal((await handler(post(different))).status, 409);
});

test('最初の別区間を並行登録して旧IDが競合しても両区間を失わない', async () => {
  const store = memoryStore();
  store.hasVideo = async () => false;
  const originalInsert = store.insertVideo.bind(store);
  let inserts = 0;
  store.insertVideo = async video => { inserts++; return originalInsert(video); };
  const { handler } = fixture({ store });
  const responses = await Promise.all([handler(post()), handler(post({ ...input, start: '1:36', end: '3:00' }))]);
  assert.deepEqual(responses.map(response => response.status), [201, 201]);
  assert.equal(inserts, 3);
  const videos = [...store.videos.values()];
  assert.equal(videos.length, 2);
  assert.equal(videos.filter(video => video.id === apiVideo.id).length, 1);
  assert.equal(videos.filter(video => /^clip_[0-9a-f]{32}$/.test(video.id)).length, 1);
  assert.ok(videos.every(video => video.videoId === apiVideo.id));
});

test('clipの時刻編集はIDと元動画・作者を維持し、同区間への変更とURL差し替えを拒否する', async () => {
  const clip = { ...apiVideo, id: `clip_${'a'.repeat(32)}`, videoId: apiVideo.id, startSeconds: 96, endSeconds: 180 };
  const { handler, store } = fixture();
  store.videos.set(apiVideo.id, apiVideo);
  store.videos.set(clip.id, clip);
  const changed = await handler(patch(editInput(clip, { start: '3:00', end: '4:30', author: '改ざん者', videoId: 'tJAcDG-eS-Q' })));
  assert.equal(changed.status, 200);
  const { video } = await changed.json();
  const expected = { ...clip, startSeconds: 180, endSeconds: 270 };
  assert.deepEqual(video, { ...expected, revision: revisionFor(expected) });
  assert.deepEqual(store.videos.get(apiVideo.id), apiVideo);
  const duplicate = await handler(patch(editInput(expected, { start: '0:00', end: '1:36' })));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'duplicate_clip');
  const changedUrl = await handler(patch(editInput(expected, { url: 'https://youtu.be/tJAcDG-eS-Q' })));
  assert.equal(changedUrl.status, 400);
  const stale = await handler(patch(editInput(clip)));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'conflict');
  assert.deepEqual(store.videos.get(clip.id), expected);
});

test('PATCHの事前確認後に区間が競合してもunique違反を409へ変換する', async () => {
  const store = memoryStore();
  const clip = { ...apiVideo, id: `clip_${'b'.repeat(32)}`, videoId: apiVideo.id, startSeconds: 96, endSeconds: 180 };
  store.videos.set(apiVideo.id, apiVideo);
  store.videos.set(clip.id, clip);
  store.hasClip = async () => false;
  const { handler } = fixture({ store });
  const response = await handler(patch(editInput(clip, { start: '0:00', end: '1:36' })));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'duplicate_clip');
  assert.deepEqual(store.videos.get(clip.id), clip);
});

test('Neon storeはclip IDと元動画を返し、区間検索はnull/0を同一視し編集対象を除外する', async () => {
  const clip = { ...apiVideo, id: `clip_${'c'.repeat(32)}`, videoId: apiVideo.id };
  const queries = [];
  const sql = { async query(text, values) { queries.push({ text, values }); return [{ video_id: clip.id, data: clip }]; } };
  const store = createNeonStore(undefined, { sql });
  assert.deepEqual(await store.getVideo(clip.id), clip);
  assert.deepEqual(await store.listVideos(), [clip]);
  assert.equal(await store.hasVideo(apiVideo.id), true);
  assert.match(queries.at(-1).text, /COALESCE\(data->>'videoId', video_id\) = \$1/);
  assert.equal(await store.hasClip({ ...clip, startSeconds: null, endSeconds: null }, clip.id), true);
  assert.deepEqual(queries.at(-1).values, [apiVideo.id, 0, -1, clip.id]);
  assert.match(queries.at(-1).text, /video_id <> \$4/);
  for (const data of [{ ...clip, videoId: undefined }, { ...clip, videoId: 'invalid' }, { ...apiVideo, videoId: 'tJAcDG-eS-Q' }]) {
    const invalidStore = createNeonStore(undefined, { sql: { async query() { return [{ video_id: data.id, data }]; } } });
    assert.equal(await invalidStore.getVideo(data.id), null);
  }
  const duplicateStore = createNeonStore(undefined, { sql: { async query() { const error = new Error('SECRET database diagnostics'); error.code = '23505'; throw error; } } });
  await assert.rejects(duplicateStore.updateVideo(clip, 'a'.repeat(32)), error => error.code === 'duplicate_clip' && !error.message.includes('SECRET'));
});

test('複数区間用schemaと冪等移行は旧ID/JSON/created_atを書き換えず区間uniqueを追加する', () => {
  const schema = readFileSync(new URL('../../Encore/server/schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../Encore/server/migrations/20261023_multiple_video_clips.sql', import.meta.url), 'utf8');
  for (const sql of [schema, migration]) {
    assert.match(sql, /clip_\[0-9a-f\]\{32\}/);
    assert.match(sql, /data \? 'videoId'/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS encore_shared_videos_clip_identity_idx/);
    assert.match(sql, /COALESCE\(data->>'videoId', video_id\)/);
    assert.match(sql, /COALESCE\(\(data->>'startSeconds'\)::numeric, 0\)/);
    assert.match(sql, /COALESCE\(\(data->>'endSeconds'\)::numeric, -1\)/);
  }
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS encore_shared_videos_video_id_check/);
  assert.equal(/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\b/i.test(migration), false);
});
