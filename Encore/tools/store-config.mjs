import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { usesD1 } from '../server/configured-store.js';

const envFile = new URL('../.env.local', import.meta.url);

export async function readStoreConfig(read = readFile, env = process.env) {
  let local;
  try { local = parseEnv(await read(envFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    local = {};
  }
  const backend = { ENCORE_VIDEO_STORE: env.ENCORE_VIDEO_STORE || local.ENCORE_VIDEO_STORE };
  if (usesD1(backend)) {
    const config = { ...local, ...env, ...backend };
    if (!config.ENCORE_D1_URL) throw new Error('ENCORE_D1_URL is required');
    return config;
  }
  const url = new URL(local.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) {
    throw new Error('Invalid DATABASE_URL');
  }
  return { ...local, ...backend };
}
