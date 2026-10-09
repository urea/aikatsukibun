const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const safeSegment = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\s/\\?#\u0000-\u001f\u007f]/u.test(value);
const safeHandle = value => typeof value === 'string' && value.startsWith('@') && value.length <= 200 && !value.slice(1).includes('@') && safeSegment(value.slice(1));

// 投稿者URLはYouTubeのチャンネル識別子だけを許可し、固定ホストへ正規化する。
export function normalizeAuthorUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  const input = value.trim();
  if (/[\u0000-\u0020\u007f]/u.test(input)) return '';
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !youtubeHosts.has(url.hostname)) return '';
    const match = /^(?:\/(@[^/]+)|\/channel\/(UC[A-Za-z0-9_-]+)|\/user\/([^/]+))(?:\/videos)?\/?$/u.exec(decodeURIComponent(url.pathname));
    if (!match) return '';
    let path;
    if (match[1] && safeHandle(match[1])) path = `@${encodeURIComponent(match[1].slice(1))}`;
    else if (match[2]) path = `channel/${match[2]}`;
    else if (match[3] && safeSegment(match[3])) path = `user/${encodeURIComponent(match[3])}`;
    else return '';
    return `https://www.youtube.com/${path}`;
  } catch { return ''; }
}

export function getYouTubeAuthorVideosUrl(metadata) {
  try {
    if (safeHandle(metadata?.authorHandle)) return `https://www.youtube.com/@${encodeURIComponent(metadata.authorHandle.slice(1))}/videos`;
    const root = normalizeAuthorUrl(metadata?.authorUrl);
    return root ? `${root}/videos` : '';
  } catch { return ''; }
}

// oEmbedの投稿者名と明示されたチャンネル識別子だけを使い、名前から推測しない。
export function readYouTubeAuthor(data) {
  const result = { author: typeof data?.author_name === 'string' ? data.author_name.trim().slice(0, 200) : '' };
  const root = normalizeAuthorUrl(data?.author_url);
  if (!root) return result;
  const handle = /^\/(@[^/]+)$/u.exec(decodeURIComponent(new URL(root).pathname))?.[1];
  if (handle) result.authorHandle = handle;
  else result.authorUrl = root;
  return result;
}
