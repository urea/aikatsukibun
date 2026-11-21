import { SHARED_DAILY_LIMIT } from '../model.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const STORE_ERROR_CODES = new Set(['withdrawn', 'duplicate_clip']);

function createCaller(url, token, path, fetchImpl) {
  if (typeof url !== 'string' || !url) throw new Error('ENCORE_D1_URL is required');
  const origin = new URL(url);
  const canUseHttp = origin.protocol === 'http:' && LOOPBACK_HOSTS.has(origin.hostname);
  if ((origin.protocol !== 'https:' && !canUseHttp) || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('ENCORE_D1_URL must be the Worker origin');
  }
  if (typeof token !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(token)) {
    throw new Error('D1 Worker token is required');
  }
  const endpoint = new URL(path, origin).href;
  return async (method, args = []) => {
    let response;
    let body;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ method, args }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      body = await response.text();
    } catch {
      throw new Error('D1 Worker unavailable');
    }
    let payload;
    try { payload = JSON.parse(body); }
    catch { /* Cloudflare can return a plain-text or HTML error page. */ }
    if (response.ok && payload && Object.hasOwn(payload, 'result')) return payload.result;
    const error = new Error('D1 Worker operation failed');
    if (response.status === 409 && STORE_ERROR_CODES.has(payload?.code)) error.code = payload.code;
    if (!response.ok && (Number(payload?.error_code) === 1027 || (!payload && /\berror\s+(?:code:\s*)?1027\b/i.test(body)))) {
      error.code = SHARED_DAILY_LIMIT;
    }
    throw error;
  };
}

export function createD1Client(url, token, { fetchImpl = globalThis.fetch } = {}) {
  const call = createCaller(url, token, '/store', fetchImpl);
  return {
    listPublication: () => call('listPublication'),
    publishR2Snapshot: () => call('publishR2Snapshot'),
    listVideos: () => call('listVideos'),
    getVideo: id => call('getVideo', [id]),
    isWithdrawn: id => call('isWithdrawn', [id]),
    hasVideo: id => call('hasVideo', [id]),
    hasClip: (video, excludeId = null) => call('hasClip', [video, excludeId]),
    insertVideo: video => call('insertVideo', [video]),
    updateVideo: (video, revision) => call('updateVideo', [video, revision]),
    consumeRateLimit: (hash, limit, windowSeconds) => call('consumeRateLimit', [hash, limit, windowSeconds]),
  };
}

export function createD1ModerationClient(url, token, { fetchImpl = globalThis.fetch } = {}) {
  const call = createCaller(url, token, '/moderation', fetchImpl);
  return {
    list: (sourceId = null) => call('list', [sourceId]),
    listEntry: entryId => call('listEntry', [entryId]),
    changeVisibility: (action, sourceId, at = new Date()) => call('changeVisibility', [action, sourceId, at.toISOString()]),
    markMisc: (entryId, options = {}) => call('markMisc', [entryId, options]),
    classifyEntry: (entryId, category, playable) => call('classifyEntry', playable === undefined
      ? [entryId, category]
      : [entryId, category, playable]),
  };
}
