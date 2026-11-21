import { SHARED_BROWSE_CACHE_SECONDS } from '../model.js';
import { normalizePublication, decodeSnapshot } from '../server/publication-format.js';

const objectKey = 'encore-publication.json';

export async function publishR2Snapshot(bucket, loadPublication, now = () => new Date()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await bucket.get(objectKey);
    let previous;
    if (current) {
      const body = await current.text();
      try { previous = decodeSnapshot(JSON.parse(body)); }
      catch { /* 壊れた一覧をDBの有効なデータで更新する。 */ }
    }

    // 競合でやり直す際も、書き換えるオブジェクトを確認してからDBを読む。
    const latest = normalizePublication(await loadPublication());
    if (previous) {
      const { publishedAt, ...contents } = previous;
      if (JSON.stringify(contents) === JSON.stringify(latest)) {
        return { publication: previous, changed: false };
      }
    }

    const previousTime = previous ? Date.parse(previous.publishedAt) + 1 : 0;
    const publishedAt = new Date(Math.max(now().getTime(), previousTime)).toISOString();
    const publication = { ...latest, publishedAt };
    const stored = await bucket.put(objectKey, JSON.stringify(publication), {
      onlyIf: current ? { etagMatches: current.etag } : new Headers({ 'If-None-Match': '*' }),
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: `public, max-age=0, s-maxage=${SHARED_BROWSE_CACHE_SECONDS}`,
      },
    });
    if (stored) return { publication, changed: true };
  }
  throw new Error('R2の公開一覧の更新が競合しました。');
}
