import { isEntryId, isVideoCategory, isVideoId, normalizeVideoMetadata, videoIdFor } from '../model.js';
import { createD1Store } from '../server/d1-store.js';
import { createD1ModerationStore } from '../server/d1-moderation.js';
import { publishR2Snapshot } from './publication-r2.js';

const MAX_CALL_BYTES = 16 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const errorCodes = new Set(['withdrawn', 'duplicate_clip']);
const requiredText = ['title', 'mode', 'difficulty', 'idol', 'result', 'author'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isBoolean = value => typeof value === 'boolean';
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;
const isLowerHex = (value, length) => typeof value === 'string' && value.length === length && !/[^0-9a-f]/.test(value);

function isClip(value) {
  if (!isObject(value) || !videoIdFor(value.id, value)) return false;
  const { startSeconds, endSeconds } = value;
  return (startSeconds === null || (Number.isSafeInteger(startSeconds) && startSeconds >= 0))
    && (endSeconds === null || (Number.isSafeInteger(endSeconds) && endSeconds > (startSeconds ?? 0)));
}

function isVideoWrite(value) {
  if (!isClip(value)) return false;
  const metadata = normalizeVideoMetadata(value);
  return requiredText.every(key => metadata[key]?.trim())
    && Object.keys(value).every(key => key === 'id' || (Object.hasOwn(metadata, key) && metadata[key] === value[key]));
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isMiscOptions(value) {
  return isObject(value) && Object.keys(value).every(key => key === 'restoreWithdrawn' && isBoolean(value[key]));
}

function accepts(args, ...validators) {
  return args.length === validators.length && validators.every((validate, index) => validate(args[index]));
}

const storeOperations = {
  listPublication: args => accepts(args),
  publishR2Snapshot: args => accepts(args),
  listVideos: args => accepts(args),
  getVideo: args => accepts(args, isEntryId),
  isWithdrawn: args => accepts(args, isVideoId),
  hasVideo: args => accepts(args, isVideoId),
  hasClip: args => accepts(args, isClip, id => id === null || isEntryId(id)),
  insertVideo: args => accepts(args, isVideoWrite),
  updateVideo: args => accepts(args, isVideoWrite, revision => isLowerHex(revision, 32)),
  consumeRateLimit: args => accepts(args, hash => isLowerHex(hash, 64), isPositiveInteger,
    seconds => isPositiveInteger(seconds) && Number.isSafeInteger(seconds * 1000)),
};

const moderationOperations = {
  list: args => accepts(args, id => id === null || isVideoId(id)),
  listEntry: args => accepts(args, isEntryId),
  changeVisibility: args => accepts(args, action => action === 'hide' || action === 'restore', isVideoId, isIsoDate),
  markMisc: args => accepts(args, isEntryId, isMiscOptions),
  classifyEntry: args => accepts(args, isEntryId, isVideoCategory) || accepts(args, isEntryId, isVideoCategory, isBoolean),
};

function json(status, payload) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function authorized(request, secret) {
  const value = request.headers.get('authorization')?.match(/^Bearer ([\x21-\x7e]{1,256})$/)?.[1];
  if (!value || !secret) return false;
  // HMAC verification compares fixed-size digests in Web Crypto.
  const algorithm = { name: 'HMAC', hash: 'SHA-256' };
  const expected = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', expected, algorithm, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, expected);
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(value));
}

async function readCall(request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { status: 415 };
  if (Number(request.headers.get('content-length')) > MAX_CALL_BYTES) return { status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const bytes = new Uint8Array(MAX_CALL_BYTES);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_CALL_BYTES) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    return { call: JSON.parse(decoder.decode(bytes.subarray(0, size))) };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const admin = path === '/moderation';
    if (!admin && path !== '/store') return json(404, { error: 'not_found' });
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const secret = admin ? env.ENCORE_D1_ADMIN_TOKEN : env.ENCORE_D1_TOKEN;
    if ((admin && secret === env.ENCORE_D1_TOKEN) || !await authorized(request, secret)) {
      return json(401, { error: 'unauthorized' });
    }

    const { status, call } = await readCall(request);
    if (status) return json(status, { error: 'invalid_request' });
    const operations = admin ? moderationOperations : storeOperations;
    if (!isObject(call) || typeof call.method !== 'string' || !Object.hasOwn(operations, call.method)
      || !Array.isArray(call.args) || !operations[call.method](call.args)) {
      return json(400, { error: 'invalid_operation' });
    }

    try {
      const store = admin ? createD1ModerationStore(env.ENCORE_DB) : createD1Store(env.ENCORE_DB);
      if (call.method === 'publishR2Snapshot') {
        if (!env.ENCORE_PUBLICATION) return json(503, { error: 'snapshot_unavailable' });
        return json(200, { result: await publishR2Snapshot(env.ENCORE_PUBLICATION, store.listPublication) });
      }
      const args = call.method === 'changeVisibility'
        ? [call.args[0], call.args[1], new Date(call.args[2])]
        : call.args;
      return json(200, { result: await store[call.method](...args) });
    } catch (error) {
      if (errorCodes.has(error?.code)) return json(409, { code: error.code });
      return json(503, { error: 'unavailable' });
    }
  },
};
