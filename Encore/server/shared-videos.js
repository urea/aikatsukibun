import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { validateVideoInput, withVideoAuthor } from '../add-video.js';
import { readYouTubeAuthor } from '../youtube-author.js';

export const MAX_JSON_BYTES = 16 * 1024;
const databaseMessage = '共有データを利用できません。時間をおいて、もう一度お試しください。';
const upstreamMessage = '動画と投稿者の情報を取得できませんでした。URLと公開状態を確認し、時間をおいて再度お試しください。';

function json(status, body, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

function duplicate() {
  const message = 'この動画は登録済みです。選曲一覧から選んでください。';
  return json(409, { error: message, errors: { url: message } });
}

function acceptsOrigin(request) {
  try {
    const target = new URL(request.url);
    const host = request.headers.get('host');
    if (host && host.toLowerCase() !== target.host.toLowerCase()) return false;
    const origin = request.headers.get('origin');
    if (origin && (new URL(origin).origin !== origin || origin !== target.origin)) return false;
    return request.headers.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}

async function readJson(request) {
  const length = request.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_JSON_BYTES) return { response: json(413, { error: '送信内容が大きすぎます。16KB以内で送信してください。' }) };
  const reader = request.body?.getReader();
  if (!reader) return { response: json(400, { error: '入力内容をJSONで送信してください。' }) };
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        void reader.cancel().catch(() => {});
        return { response: json(413, { error: '送信内容が大きすぎます。16KB以内で送信してください。' }) };
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return { input: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) };
  } catch {
    return { response: json(400, { error: 'JSONの形式を確認してください。' }) };
  } finally { reader.releaseLock(); }
}

function clientHash(request, getClientAddress, salt) {
  // Vercelのプロキシが設定するIPヘッダー。ローカルではsocket由来の関数を渡す。
  const source = getClientAddress ? getClientAddress(request) : request.headers.get('x-vercel-forwarded-for');
  let address = typeof source === 'string' ? source.split(',')[0].trim() : '';
  if (!isIP(address)) address = 'unidentified';
  else if (isIP(address) === 6) address = new URL(`http://[${address}]/`).hostname;
  return createHash('sha256').update(`${salt}\0${address}`).digest('hex');
}

async function fetchAuthor(id, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const url = `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('upstream response');
        const data = await response.json();
        if (typeof data?.title !== 'string' || !data.title.trim()) throw new Error('unavailable video');
        return readYouTubeAuthor(data);
      })(),
      timeout,
    ]);
  } finally { clearTimeout(timer); }
}

export function createSharedVideosHandler({ store, fetchImpl = globalThis.fetch, reservedIds = [], timeoutMs = 8000, rateLimit = 10, rateWindowSeconds = 60, getClientAddress, rateLimitSalt = 'encore-shared-videos' } = {}) {
  const reserved = new Set(reservedIds);
  return async request => {
    if (request.method === 'GET') {
      try { return json(200, { videos: await store.listVideos() }); }
      catch { return json(503, { error: databaseMessage }); }
    }
    if (request.method !== 'POST') return json(405, { error: 'この操作には対応していません。' }, { Allow: 'GET, POST' });
    if (!acceptsOrigin(request)) return json(403, { error: 'このアプリの画面から追加してください。' });
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json(415, { error: '送信形式はapplication/jsonを指定してください。' });
    const parsed = await readJson(request);
    if (parsed.response) return parsed.response;
    const { video, errors } = validateVideoInput(parsed.input);
    if (!video) return json(400, { error: '未入力・入力内容を確認してください。', errors });
    if (reserved.has(video.id)) return duplicate();
    try {
      if (await store.hasVideo(video.id)) return duplicate();
      const hash = clientHash(request, getClientAddress, rateLimitSalt);
      const rate = await store.consumeRateLimit(hash, rateLimit, rateWindowSeconds);
      if (!rate.allowed) return json(429, { error: '短時間に追加が集中しています。少し待ってから再度お試しください。' }, { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfter || rateWindowSeconds))) });
    } catch { return json(503, { error: databaseMessage }); }
    let savedVideo;
    try { savedVideo = withVideoAuthor(video, await fetchAuthor(video.id, fetchImpl, timeoutMs)); }
    catch { return json(502, { error: upstreamMessage }); }
    try {
      const inserted = await store.insertVideo(savedVideo);
      return inserted ? json(201, { video: inserted }) : duplicate();
    } catch { return json(503, { error: databaseMessage }); }
  };
}
