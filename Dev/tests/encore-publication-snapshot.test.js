import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicationSnapshot, publishSnapshots } from '../../Encore/server/publication-snapshot.js';
import { publishR2Snapshot } from '../../Encore/cloudflare/publication-r2.js';
import worker from '../../Encore/cloudflare/worker.js';

const date = '2026-11-17T04:00:00.000Z';
const video = {
  id: 'fU7y5KElNiw', title: 'あるがまま', author: '投稿者', orientation: 'portrait',
  startSeconds: 110, endSeconds: 288, revision: 'a'.repeat(32),
};
const makePublication = (videos = [video]) => ({ videos, withdrawnIds: ['lTLqkpcqWs8'] });

function mockR2() {
  let current = null;
  let version = 0;
  return {
    current: () => current && JSON.parse(current.body),
    get() {
      if (!current) return null;
      const { etag, body } = current;
      return { etag, text: async () => body };
    },
    put(key, body, { onlyIf, httpMetadata }) {
      assert.equal(key, 'encore-publication.json');
      assert.equal(httpMetadata.contentType, 'application/json; charset=utf-8');
      if (current) {
        if (onlyIf.etagMatches !== current.etag) return null;
      } else {
        assert.equal(onlyIf.get('if-none-match'), '*');
      }
      current = { body, etag: String(++version) };
      return current;
    },
  };
}

test('R2の公開一覧には現在の公開項目だけを保存し、同じ内容は再発行しない', async () => {
  const bucket = mockR2();
  const data = makePublication([{ ...video, clientHash: 'private value' }]);
  const first = await publishR2Snapshot(bucket, () => data, () => new Date(date));
  assert.equal(first.changed, true);
  assert.deepEqual(bucket.current(), { ...makePublication(), publishedAt: date });
  assert.deepEqual(await publishR2Snapshot(bucket, () => data), { publication: first.publication, changed: false });
});

test('R2の初回作成と更新の競合で古い動画データを公開しない', async () => {
  for (const existing of [false, true]) {
    const bucket = mockR2();
    if (existing) await publishR2Snapshot(bucket, () => makePublication());
    const stale = makePublication([{ ...video, title: '古いタイトル' }]);
    const fresh = makePublication([{ ...video, title: '取り下げ後の最新版' }]);
    let loads = 0;
    const result = await publishR2Snapshot(bucket, async () => {
      if (++loads !== 1) return fresh;
      await publishR2Snapshot(bucket, () => fresh);
      return stale;
    });
    assert.equal(loads, 2);
    assert.equal(result.changed, false);
    assert.deepEqual(bucket.current().videos, fresh.videos);
  }
});

test('ミラー障害時も既存Blobの公開を完了でき、無効化後はBlobだけで更新できる', async () => {
  let persisted = false;
  const primary = {
    async publish(load) {
      const publication = await load();
      persisted = true;
      return { publication, changed: true };
    },
  };
  const load = () => makePublication();
  const failedMirror = async () => { throw new Error('R2 unavailable'); };
  await assert.rejects(publishSnapshots(primary, load, failedMirror), /R2 unavailable/);
  assert.equal(persisted, true);
  assert.deepEqual(await publishSnapshots(primary, load), { publication: load(), changed: true });
});

test('R2公開のWorker操作は認証が必要で、バインド後は現行D1から公開する', async () => {
  const token = 'store-test-token';
  function request(bearer) {
    return new Request('https://encore.example/store', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'publishR2Snapshot', args: [] }),
    });
  }
  const settings = { ENCORE_D1_TOKEN: token };
  assert.equal((await worker.fetch(request('wrong'), settings)).status, 401);
  assert.equal((await worker.fetch(request(token), settings)).status, 503);

  const bucket = mockR2();
  const db = {
    prepare() {
      return { all: async () => ({ results: [{ video_id: video.id, data: JSON.stringify(video), revision: video.revision }] }) };
    },
  };
  const response = await worker.fetch(request(token), { ...settings, ENCORE_DB: db, ENCORE_PUBLICATION: bucket });
  assert.equal(response.status, 200);
  const { result } = await response.json();
  assert.deepEqual(result.publication, bucket.current());
  assert.deepEqual(result.publication.videos, [video]);
});

class WriteConflict extends Error {}

function mockBlob(initial) {
  let state = initial;
  let version = 1;
  const reads = [];
  const writes = [];
  return {
    reads,
    writes,
    replace(body) {
      version++;
      state = body;
    },
    isWriteConflict: error => error instanceof WriteConflict,
    readBlob(path, options) {
      reads.push({ path, options });
      if (state === null) return null;
      const body = typeof state === 'string' ? state : JSON.stringify(state);
      return { statusCode: 200, blob: { etag: String(version) }, stream: new Response(body).body };
    },
    writeBlob(path, body, options) {
      writes.push({ path, body: JSON.parse(body), options });
      if (!options.allowOverwrite && state !== null) throw new Error('Blob already exists');
      if (options.allowOverwrite && options.ifMatch !== String(version)) throw new WriteConflict();
      state = body;
      version++;
    },
  };
}

test('保存した公開一覧を読み出し、同じ内容なら再アップロードしない', async () => {
  const mock = mockBlob(null);
  const snapshot = createPublicationSnapshot({ ...mock, now: () => new Date(date) });
  assert.equal(await snapshot.read(), null);

  const data = makePublication([{ ...video, clientHash: 'private value' }]);
  const first = await snapshot.publish(() => data);
  assert.equal(first.changed, true);
  assert.deepEqual(first.publication, { ...makePublication(), publishedAt: date });
  assert.deepEqual(await snapshot.read(), first.publication);
  assert.equal(mock.reads[0].path, 'encore-publication.json');
  assert.equal(mock.reads[0].options.access, 'private');
  assert.equal(mock.reads[0].options.useCache, false);
  assert.equal(mock.writes[0].options.allowOverwrite, false);
  assert.equal(mock.writes[0].path, mock.reads[0].path);
  assert.equal((await snapshot.publish(() => data)).changed, false);
  assert.equal(mock.writes.length, 1);
});

test('更新競合では最新状態を取得し直し、古い動画情報で上書きしない', async () => {
  const mock = mockBlob({ ...makePublication(), publishedAt: date });
  const snapshot = createPublicationSnapshot(mock);
  const fresh = makePublication([{ ...video, title: '同時編集後', revision: 'c'.repeat(32) }]);
  const { publication } = await snapshot.publish(() => {
    if (!mock.writes.length) {
      mock.replace({ ...fresh, publishedAt: date });
      return makePublication([{ ...video, title: '古い編集', revision: 'b'.repeat(32) }]);
    }
    return fresh;
  });
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].options.ifMatch, '1');
  assert.equal(publication.videos[0].title, '同時編集後');
  assert.deepEqual(await snapshot.read(), publication);
});

test('初回作成で競合しても、競合相手が書いた最新版を保持する', async () => {
  const mock = mockBlob(null);
  const snapshot = createPublicationSnapshot(mock);
  const fresh = makePublication([]);
  let loads = 0;
  const result = await snapshot.publish(() => {
    if (++loads === 1) {
      mock.replace({ ...fresh, publishedAt: date });
      return makePublication();
    }
    return fresh;
  });
  assert.equal(loads, 2);
  assert.equal(result.changed, false);
  assert.deepEqual(result.publication.videos, []);
});

test('壊れたファイルは読み出し時に報告し、次の公開更新で修復する', async () => {
  const mock = mockBlob('bad json');
  const snapshot = createPublicationSnapshot(mock);
  await assert.rejects(snapshot.read(), SyntaxError);
  assert.equal((await snapshot.publish(() => makePublication())).changed, true);
  assert.equal(mock.writes[0].options.ifMatch, '1');
  assert.deepEqual((await snapshot.read()).videos, [video]);
});

test('取り下げ済みの動画を含む一覧は公開しない', async () => {
  const mock = mockBlob(null);
  const snapshot = createPublicationSnapshot(mock);
  await assert.rejects(snapshot.publish(() => ({ videos: [video], withdrawnIds: [video.id] })), /無効な動画情報/);
  assert.equal(mock.writes.length, 0);
});

test('Blob GETが弱いETagを返す場合はメタデータの強いETagで更新する', async () => {
  const mock = mockBlob({ ...makePublication(), publishedAt: date });
  let metadataReads = 0;
  const snapshot = createPublicationSnapshot({
    ...mock,
    readBlob(path, options) {
      const response = mock.readBlob(path, options);
      return { ...response, blob: { url: 'https://store.example/encore-publication.json', etag: `W/${response.blob.etag}` } };
    },
    readBlobMetadata(url) {
      assert.equal(url, 'https://store.example/encore-publication.json');
      return { etag: String(++metadataReads) };
    },
  });
  const updated = makePublication([{ ...video, title: '編集後' }]);
  assert.equal((await snapshot.publish(() => updated)).changed, true);
  assert.equal(mock.writes[0].options.ifMatch, '1');
  assert.equal((await snapshot.publish(() => updated)).changed, false);
  assert.equal(mock.writes.length, 1);
});
