import { BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import { decodeSnapshot, normalizePublication } from './publication-format.js';

const attempts = 3;
const readTimeoutMs = 8_000;
const publishTimeoutMs = 6_000;

async function loadWithinDeadline(loadPublication, signal) {
  signal.throwIfAborted();
  let onAbort;
  const deadline = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([loadPublication(signal), deadline]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

export function createPublicationSnapshot({
  pathname = 'encore-publication.json',
  token, storeId, oidcToken, now = () => new Date(), readBlob = get, readBlobMetadata = head, writeBlob = put,
  isWriteConflict = error => error instanceof BlobPreconditionFailedError,
} = {}) {
  const options = { access: 'private', token, storeId, oidcToken };

  async function getCurrent(abortSignal) {
    const current = await readBlob(pathname, { ...options, useCache: false, abortSignal });
    if (current === null) return null;
    if (current.statusCode !== 200 || !current.stream || !current.blob?.etag) {
      throw new Error('公開一覧のファイル情報を確認できません。');
    }
    return { etag: current.blob.etag, url: current.blob.url, body: await new Response(current.stream).text() };
  }

  async function read() {
    const current = await getCurrent(AbortSignal.timeout(readTimeoutMs));
    return current ? decodeSnapshot(JSON.parse(current.body)) : null;
  }

  async function publish(loadPublication) {
    const abortSignal = AbortSignal.timeout(publishTimeoutMs);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const current = await getCurrent(abortSignal);
      // GET can return a weak ETag. Conditional writes need the strong storage ETag.
      const etag = current?.etag.startsWith('W/')
        ? (await readBlobMetadata(current.url, { ...options, abortSignal })).etag
        : current?.etag;
      if (current && (!etag || etag.startsWith('W/'))) {
        throw new Error('公開一覧の書き込み用ETagを確認できません。');
      }
      // 競合した場合も、Blobの更新対象を読んでからDBの最新内容を取得する。
      const latest = normalizePublication(await loadWithinDeadline(loadPublication, abortSignal));
      if (current && current.etag.replace(/^W\//, '') === etag) {
        let previous;
        try { previous = decodeSnapshot(JSON.parse(current.body)); }
        catch { /* 壊れた一覧をDBの有効なデータで更新できるようにする。 */ }
        if (previous) {
          const { publishedAt, ...contents } = previous;
          if (JSON.stringify(contents) === JSON.stringify(latest)) return { publication: previous, changed: false };
        }
      }
      const publication = { ...latest, publishedAt: now().toISOString() };
      try {
        abortSignal.throwIfAborted();
        await writeBlob(pathname, JSON.stringify(publication), {
          ...options,
          allowOverwrite: Boolean(current),
          ...(current ? { ifMatch: etag } : {}),
          contentType: 'application/json; charset=utf-8',
          abortSignal,
        });
        return { publication, changed: true };
      } catch (error) {
        if (isWriteConflict(error)) continue;
        // 新規作成が競合した場合、SDKは専用のエラー型を返さない。
        if (!current && !abortSignal.aborted && await getCurrent(abortSignal)) continue;
        throw error;
      }
    }
    throw new Error('公開一覧の更新が競合しました。');
  }

  return { read, publish };
}

export async function publishSnapshots(snapshot, loadPublication, publishMirror) {
  if (!publishMirror) return snapshot.publish(loadPublication);
  if (!snapshot) return publishMirror();
  const [primary, mirror] = await Promise.allSettled([snapshot.publish(loadPublication), publishMirror()]);
  if (primary.status === 'rejected') throw primary.reason;
  if (mirror.status === 'rejected') throw mirror.reason;
  return { publication: primary.value.publication, changed: primary.value.changed || mirror.value.changed };
}
