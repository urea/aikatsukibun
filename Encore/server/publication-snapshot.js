import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { normalizeCustomVideos, uniqueIds, videoIdFor } from '../model.js';

const pathname = 'encore-publication.json';
const attempts = 3;
const readTimeoutMs = 8_000;
const publishTimeoutMs = 6_000;

function normalizePublication(value) {
  if (!Array.isArray(value?.videos) || !Array.isArray(value?.withdrawnIds)) {
    throw new Error('公開一覧のJSON形式を確認できません。');
  }
  const videos = normalizeCustomVideos(value.videos);
  const withdrawnIds = uniqueIds(value.withdrawnIds).sort();
  const withdrawn = new Set(withdrawnIds);
  const hasInvalidVideo = video =>
    typeof video?.title !== 'string' || !video.title.trim()
    || typeof video.author !== 'string' || !video.author.trim() || Object.hasOwn(video, 'withdrawnAt');
  if (videos.length !== value.videos.length || withdrawnIds.length !== value.withdrawnIds.length
    || videos.some(video => video.startSeconds === undefined || withdrawn.has(video.id) || withdrawn.has(videoIdFor(video.id, video)))
    || value.videos.some(hasInvalidVideo)) {
    throw new Error('公開一覧に無効な動画情報が含まれています。');
  }
  return { videos, withdrawnIds };
}

function decodeSnapshot(value) {
  const publication = normalizePublication(value);
  const publishedAt = value.publishedAt;
  if (typeof publishedAt !== 'string' || !Number.isFinite(Date.parse(publishedAt))
    || new Date(publishedAt).toISOString() !== publishedAt) {
    throw new Error('公開一覧の更新日時を確認できません。');
  }
  return { ...publication, publishedAt };
}

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
  token, storeId, oidcToken, now = () => new Date(), readBlob = get, writeBlob = put,
  isWriteConflict = error => error instanceof BlobPreconditionFailedError,
} = {}) {
  const options = { access: 'private', token, storeId, oidcToken };

  async function getCurrent(abortSignal) {
    const current = await readBlob(pathname, { ...options, useCache: false, abortSignal });
    if (current === null) return null;
    if (current.statusCode !== 200 || !current.stream || !current.blob?.etag) {
      throw new Error('公開一覧のファイル情報を確認できません。');
    }
    return { etag: current.blob.etag, body: await new Response(current.stream).text() };
  }

  async function read() {
    const current = await getCurrent(AbortSignal.timeout(readTimeoutMs));
    return current ? decodeSnapshot(JSON.parse(current.body)) : null;
  }

  async function publish(loadPublication) {
    const abortSignal = AbortSignal.timeout(publishTimeoutMs);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const current = await getCurrent(abortSignal);
      // 競合した場合も、Blobの更新対象を読んでからDBの最新内容を取得する。
      const latest = normalizePublication(await loadWithinDeadline(loadPublication, abortSignal));
      if (current) {
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
          ...(current ? { ifMatch: current.etag } : {}),
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
