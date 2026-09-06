import catalog from './catalog.json';
import { isVideoId, readSaved } from './model.js';

export function createMetadata(storage, save) {
  const key = 'aikatsu_video_cache_v2';
  const saved = readSaved(storage, key, {});
  const cache = Object.assign(Object.create(null), catalog);
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id, data] of Object.entries(saved)) {
      if (isVideoId(id) && typeof data?.title === 'string') cache[id] = { title: data.title.slice(0, 500), author: typeof data.author === 'string' ? data.author.slice(0, 200) : '' };
    }
  }
  const pending = new Map();
  const failed = new Set();
  let saveTimer;
  function seed(id, title) { if (!cache[id] && title) cache[id] = { title, author: '' }; }
  async function fetchVideo(id) {
    if (!isVideoId(id)) throw new Error('YouTubeのURLを確認してください。');
    if (cache[id]) return cache[id];
    if (pending.has(id)) return pending.get(id);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('動画情報を取得できませんでした。時間をおいて試してください。');
        const data = await response.json();
        if (typeof data.title !== 'string') throw new Error('動画を確認できませんでした。公開状態とURLを確認してください。');
        cache[id] = { title: data.title.slice(0, 500), author: typeof data.author_name === 'string' ? data.author_name.slice(0, 200) : '' };
        failed.delete(id);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => save(key, cache, false), 300);
        return cache[id];
      } finally { clearTimeout(timeout); pending.delete(id); }
    })();
    pending.set(id, task);
    return task;
  }
  return { get: id => cache[id], seed, fetch: fetchVideo, failed };
}
