import catalog from './catalog.json';
import { isVideoId, readSaved, normalizeVideoMetadata } from './model.js';
import { readYouTubeAuthor } from './youtube-author.js';

export function createMetadata(storage, save) {
  const key = 'aikatsu_video_cache_v2';
  const saved = readSaved(storage, key, {});
  const cache = Object.assign(Object.create(null), catalog);
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id, data] of Object.entries(saved)) {
      // 管理済みの楽曲情報は、古いYouTube曲名キャッシュで上書きしない。
      if (!catalog[id] && isVideoId(id) && typeof data?.title === 'string') cache[id] = normalizeVideoMetadata(data);
    }
  }
  const pending = new Map();
  const seedRevisions = new Map();
  const failed = new Set();
  let saveTimer;
  function seed(id, data, { replace = false } = {}) {
    if (!isVideoId(id) || catalog[id]) return;
    const supplied = normalizeVideoMetadata(data);
    if (supplied.title) {
      cache[id] = replace ? supplied : { ...cache[id], ...supplied };
      seedRevisions.set(id, (seedRevisions.get(id) || 0) + 1);
      failed.delete(id);
    }
  }
  async function fetchVideo(id, { refresh = false } = {}) {
    if (!isVideoId(id)) throw new Error('YouTubeのURLを確認してください。');
    if (cache[id] && (!refresh || catalog[id])) return cache[id];
    if (pending.has(id)) return pending.get(id);
    const revision = seedRevisions.get(id);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('動画情報を取得できませんでした。時間をおいて試してください。');
        const data = await response.json();
        if (typeof data.title !== 'string') throw new Error('動画を確認できませんでした。公開状態とURLを確認してください。');
        // 取得中に届いた共有の楽曲情報を、動画全体の情報で消さない。
        if (seedRevisions.get(id) !== revision) return cache[id];
        cache[id] = { title: data.title.slice(0, 500), ...readYouTubeAuthor(data) };
        failed.delete(id);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => save(key, cache, false), 300);
        return cache[id];
      } catch (error) {
        if (seedRevisions.get(id) !== revision) return cache[id];
        throw error;
      } finally { clearTimeout(timeout); pending.delete(id); }
    })();
    pending.set(id, task);
    return task;
  }
  return { get: id => cache[id], seed, fetch: fetchVideo, failed };
}
