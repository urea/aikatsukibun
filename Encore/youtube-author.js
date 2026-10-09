// oEmbedの投稿者名と、チャンネルURLに明示されたハンドルだけを使う。
export function readYouTubeAuthor(data) {
  const result = { author: typeof data?.author_name === 'string' ? data.author_name.trim().slice(0, 200) : '' };
  try {
    const url = new URL(data.author_url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return result;
    const handle = /^\/(@[^/]+)\/?$/u.exec(decodeURIComponent(url.pathname))?.[1];
    if (handle && handle.length <= 200 && !/\s/u.test(handle)) result.authorHandle = handle;
  } catch { /* URLがない場合や旧形式の場合はチャンネル名だけを表示する。 */ }
  return result;
}
