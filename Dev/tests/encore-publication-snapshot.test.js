import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicationSnapshot } from '../../Encore/server/publication-snapshot.js';

const date = '2026-11-17T04:00:00.000Z';
const video = {
  id: 'fU7y5KElNiw', title: 'あるがまま', author: '投稿者', orientation: 'portrait',
  startSeconds: 110, endSeconds: 288, revision: 'a'.repeat(32),
};
const makePublication = (videos = [video]) => ({ videos, withdrawnIds: ['lTLqkpcqWs8'] });

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
