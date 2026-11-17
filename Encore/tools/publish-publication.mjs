import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createConfiguredStore, usesD1 } from '../server/configured-store.js';
import { createPublicationSnapshot } from '../server/publication-snapshot.js';
import { readStoreConfig } from './store-config.mjs';

const linkedDirectory = fileURLToPath(new URL('../../output/encore-vercel-blob/', import.meta.url));
const linkedEnv = new URL('../../output/encore-vercel-blob/.env.local', import.meta.url);

export async function publishConfiguredPublication(database) {
  const config = typeof database === 'string' ? { DATABASE_URL: database } : database;
  const store = createConfiguredStore(config);
  if (usesD1(config)) {
    // The trial must not use the linked production Blob store implicitly.
    const { ENCORE_D1_BLOB_STORE_ID: storeId, ENCORE_D1_BLOB_READ_WRITE_TOKEN: token, ENCORE_D1_BLOB_PATHNAME: pathname } = config;
    if (!token) return null;
    return createPublicationSnapshot({ storeId, token, pathname }).publish(() => store.listPublication());
  }
  let blobConfig;
  try { blobConfig = parseEnv(await readFile(linkedEnv, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const { BLOB_STORE_ID: storeId, BLOB_READ_WRITE_TOKEN: token } = blobConfig;
  if (!storeId && !token) return null;
  const snapshot = createPublicationSnapshot({ storeId, token });
  const callerDirectory = process.cwd();
  try {
    process.chdir(linkedDirectory);
    return await snapshot.publish(() => store.listPublication());
  } finally {
    process.chdir(callerDirectory);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = await publishConfiguredPublication(await readStoreConfig());
    if (!result) throw new Error('Missing Vercel Blob configuration');
    const { publication, changed } = result;
    console.log(`公開一覧 ${publication.videos.length}曲｜取り下げ ${publication.withdrawnIds.length}件｜${changed ? '更新' : '一致'}｜${publication.publishedAt}`);
  } catch {
    console.error('公開一覧を更新できませんでした。共有DBとVercel Blobの設定・接続状態を確認してください。');
    process.exitCode = 1;
  }
}
