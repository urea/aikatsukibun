import { normalizeCustomVideos } from './model.js';

export function createSharedVideosClient(fetchImpl = fetch) {
  async function request(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl('/api/videos', { ...options, cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(typeof data?.error === 'string' ? data.error : '共有データに接続できませんでした。もう一度お試しください。');
        error.errors = data?.errors;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError) {
        throw new Error('共有データに接続できませんでした。通信を確認して、もう一度お試しください。');
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }
  return {
    async list() {
      const data = await request();
      if (!Array.isArray(data?.videos)) throw new Error('共有一覧を読み込めませんでした。もう一度お試しください。');
      return normalizeCustomVideos(data.videos);
    },
    async add(input) {
      const data = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const [video] = normalizeCustomVideos([data?.video]);
      if (!video?.author || !Number.isSafeInteger(video.endSeconds)) throw new Error('登録結果を確認できませんでした。一覧を再読み込みしてください。');
      return video;
    },
  };
}
