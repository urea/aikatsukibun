import { displayTitle, isVideoId } from './model.js';
import { VIDEO_DIFFICULTIES } from './add-video.js';

const validVideoId = value => typeof value === 'string' && value.length === 11 && isVideoId(value);

function readUrl(value) {
  if (!(value instanceof URL) && typeof value !== 'string') return null;
  try { return new URL(value); }
  catch { return null; }
}

export function readSharedVideoId(value) {
  const id = readUrl(value)?.searchParams.get('v');
  return validVideoId(id) ? id : null;
}

export function buildVideoShareUrl(baseUrl, id) {
  const url = readUrl(baseUrl);
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || !validVideoId(id)) return null;
  url.search = '';
  url.hash = '';
  url.searchParams.set('v', id);
  return url.href;
}

export function buildVideoShareText(video) {
  if (typeof video?.title !== 'string' || !video.title.trim()) return '';
  const title = displayTitle(video.title).replace(/\s+/gu, ' ').trim();
  const letters = Array.from(title);
  const shortTitle = letters.length > 80 ? `${letters.slice(0, 80).join('')}…` : title;
  const level = VIDEO_DIFFICULTIES.indexOf(video.difficulty);
  const stars = level > 0 ? `☆${level}` : '';
  return `アイカツ！アンコール気分で「${shortTitle}${stars}」を遊んだよ♪`;
}

export function buildXShareUrl(baseUrl, video) {
  const text = buildVideoShareText(video);
  const sharedUrl = buildVideoShareUrl(baseUrl, video?.id);
  if (!text || !sharedUrl) return null;
  const url = new URL('https://x.com/intent/tweet');
  url.searchParams.set('text', text);
  url.searchParams.set('url', sharedUrl);
  return url.href;
}
