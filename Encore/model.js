// 保存データとURLの境界処理。保存領域はstorage.jsで通常版と分離する。
export const DEFAULT_VIDEO_ID = null;
export const SETTINGS_KEY = 'aikatsu_settings_v2';
export const DEFAULT_SETTINGS = Object.freeze({ sound: true, soundVolume: 35, videoVolume: 70, muted: false, vibration: true, effects: true, appearance: 'dark' });
export const isVideoId = value => typeof value === 'string' && /^[\w-]{11}$/.test(value);
export const uniqueIds = values => [...new Set(Array.isArray(values) ? values.filter(isVideoId) : [])];

export function extractVideoId(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (isVideoId(value)) return value;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    let id;
    if (['youtu.be', 'www.youtu.be'].includes(host)) id = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] : null;
    }
    return isVideoId(id) ? id : null;
  } catch { return null; }
}

export function readSaved(storage, key, fallback) {
  try { const value = JSON.parse(storage.getItem(key)); return value ?? fallback; }
  catch { return fallback; }
}

export function normalizeCustomVideos(value) {
  const seen = new Set();
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && isVideoId(item.id) && !seen.has(item.id) && seen.add(item.id)).map(item => ({
    id: item.id, ...normalizeVideoMetadata(item),
    title: typeof item.title === 'string' ? item.title.slice(0, 500) : `追加した動画 (${item.id})`,
    ...(typeof item.revision === 'string' && /^[0-9a-f]{32}$/.test(item.revision) ? { revision: item.revision } : {}),
  }));
}

export function normalizeVideoMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data = {};
  const limits = { title: 500, mode: 100, difficulty: 40, idol: 100, author: 200, authorHandle: 200 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof value[key] === 'string') data[key] = value[key].slice(0, limit);
  }
  if (['クリア', 'フルコンボ', 'オールパーフェクト'].includes(value.result)) data.result = value.result;
  if (Number.isSafeInteger(value.startSeconds) && value.startSeconds >= 0 && Number.isSafeInteger(value.endSeconds) && value.endSeconds > value.startSeconds) {
    data.startSeconds = value.startSeconds;
    data.endSeconds = value.endSeconds;
  }
  return data;
}

export function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of ['sound', 'muted', 'vibration', 'effects']) if (typeof source[key] === 'boolean') settings[key] = source[key];
  for (const key of ['soundVolume', 'videoVolume']) if (typeof source[key] === 'number' && Number.isFinite(source[key])) settings[key] = Math.round(Math.max(0, Math.min(100, source[key])));
  if (['dark', 'light', 'system'].includes(source.appearance)) settings.appearance = source.appearance;
  return settings;
}

export function chooseRandom(ids, current, recent = [], random = Math.random) {
  const all = uniqueIds(ids);
  const others = all.filter(id => id !== current);
  const fresh = others.filter(id => !recent.includes(id));
  const candidates = fresh.length ? fresh : others.length ? others : all;
  return candidates.length ? candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))] : null;
}

export function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function displayTitle(title) {
  return title.replace(/^\s*【(?:\d+p|アイカツ[^】]*)】\s*/g, '').replace(/^アイカツ[！!]?\s*[－—-]?\s*/, '').trim() || title;
}
