import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SHARED_BROWSE_CACHE_SECONDS } from '../../Encore/model.js';

const main = readFileSync(new URL('../../Encore/main.js', import.meta.url), 'utf8');
const refreshStart = main.indexOf('function showSharedReadStatus(');
const refreshEnd = main.indexOf("$('retry-shared').addEventListener", refreshStart);
const publication = { videos: [{ id: 'fU7y5KElNiw', title: 'あるがまま' }], withdrawnIds: [] };

function createRefreshHarness(respond) {
  const requests = [];
  const saved = [];
  const availability = [];
  const controls = new Map();
  const $ = id => {
    if (!controls.has(id)) controls.set(id, {});
    return controls.get(id);
  };
  const { promise, resolve } = Promise.withResolvers();
  let now = Date.UTC(2026, 10, 17);
  const context = vm.createContext({
    $,
    Date: { now: () => now },
    sharedClient: { list(options) { requests.push(options.browse); return respond(requests.length, promise); } },
    sharedLoading: null,
    sharedLoadingLive: false,
    sharedRevision: 0,
    sharedVideos: [],
    withdrawnIds: new Set(),
    sharedFetchedAt: 0,
    sharedLiveUntil: 0,
    sharedPublishedAt: 0,
    sharedLiveSince: 0,
    sharedLiveFailed: false,
    sharedSyncPending: false,
    nextSharedRefreshAt: 0,
    sharedReuseMs: 20_000,
    sharedLiveWindowMs: SHARED_BROWSE_CACHE_SECONDS * 1000 + 10_000,
    currentId: null,
    player: null,
    panelId: null,
    pendingSharedVideoId: null,
    publicationReady: true,
    metadata: { get: () => null, seed() {} },
    savePublication() { saved.push(context.sharedVideos); },
    setSharedAvailability(available) { availability.push(available); },
    reconcilePublishedSelection() {},
    updateCurrent() {},
  });
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  vm.runInContext(main.slice(refreshStart, refreshEnd), context);
  return { context, requests, saved, availability, $, resolve, advance: ms => { now += ms; } };
}

test('選曲を短時間で開き直す場合は再利用し、手動更新では最新一覧を取得する', async () => {
  const { context, requests, advance } = createRefreshHarness(async () => publication);
  assert.equal(await context.refreshSharedVideos(), true);
  assert.equal(await context.refreshSharedVideos(), true);
  assert.deepEqual(requests, [true]);
  assert.equal(await context.refreshSharedVideos({ fresh: true }), true);
  advance(21_000);
  assert.equal(await context.refreshSharedVideos(), true);
  advance(SHARED_BROWSE_CACHE_SECONDS * 1000 + 10_000);
  assert.equal(await context.refreshSharedVideos(), true);
  assert.deepEqual(requests, [true, false, true]);
});

test('進行中の閲覧用取得を待った手動更新は、改めて最新一覧を取得する', async () => {
  const { context, requests, resolve } = createRefreshHarness((requestCount, pending) =>
    requestCount === 1 ? pending : Promise.resolve(publication)
  );
  const browse = context.refreshSharedVideos();
  const refresh = context.refreshSharedVideos({ fresh: true });
  assert.deepEqual(requests, [true]);
  resolve(publication);
  assert.equal(await browse, true);
  assert.equal(await refresh, true);
  assert.deepEqual(requests, [true, false]);
});

test('最新一覧の取得に失敗すると保存済み一覧を維持してエラーを表示する', async () => {
  const { context, requests, $, saved } = createRefreshHarness(async requestCount => {
    if (requestCount > 1) throw new Error('Database unavailable');
    return publication;
  });
  assert.equal(await context.refreshSharedVideos(), true);
  assert.equal(await context.refreshSharedVideos({ fresh: true }), false);
  assert.deepEqual(requests, [true, false]);
  assert.deepEqual(context.sharedVideos, publication.videos);
  assert.equal(saved.length, 1);
  assert.match($('shared-status').textContent, /最新の共有一覧を取得できません。保存済みの一覧を表示中（最終取得/);
  assert.equal($('retry-shared').disabled, false);
});

test('公開JSONは登録先の障害表示を解除せず、最新一覧の再取得成功で解除する', async () => {
  const { context, availability, advance } = createRefreshHarness(async requestCount => {
    if (requestCount === 1) throw Object.assign(new Error('Database unavailable'), { status: 503 });
    return publication;
  });
  assert.equal(await context.refreshSharedVideos({ fresh: true }), false);
  advance(21_000);
  assert.equal(await context.refreshSharedVideos(), true);
  assert.deepEqual(availability, [false]);
  assert.equal(await context.refreshSharedVideos({ fresh: true }), true);
  assert.deepEqual(availability, [false, true]);
});

test('最新確認のエラーは公開JSONを読み込んでも表示し、古いJSONで直前の編集を戻さない', async () => {
  const { context, requests, $, advance } = createRefreshHarness(async requestCount => {
    if (requestCount === 1) throw new Error('Database unavailable');
    return { ...publication, publishedAt: Date.UTC(2026, 10, 16) };
  });
  context.sharedVideos = [{ id: publication.videos[0].id, title: '確認済みの編集' }];
  context.sharedFetchedAt = Date.UTC(2026, 10, 17);
  context.sharedLiveSince = context.sharedFetchedAt;
  assert.equal(await context.refreshSharedVideos({ fresh: true }), false);
  assert.equal(await context.refreshSharedVideos(), true);
  assert.deepEqual(requests, [false, true]);
  assert.equal(context.sharedVideos[0].title, '確認済みの編集');
  assert.match($('shared-status').textContent, /^最新の共有一覧を取得できません/);
  advance(75_000);
  context.sharedLiveSince = 0;
  assert.equal(await context.refreshSharedVideos(), true);
  assert.equal(context.sharedVideos[0].title, 'あるがまま');
  assert.match($('shared-status').textContent, /最新の共有一覧を取得できません。公開一覧 .* 時点のデータを表示中/);
});
