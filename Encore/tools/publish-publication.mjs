import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createNeonStore } from '../server/neon-store.js';
import { createPublicationSnapshot } from '../server/publication-snapshot.js';

const linkedDirectory = fileURLToPath(new URL('../../output/encore-vercel-blob/', import.meta.url));
const linkedEnv = new URL('../../output/encore-vercel-blob/.env.local', import.meta.url);

export async function publishConfiguredPublication(connectionString) {
  let config;
  try { config = parseEnv(await readFile(linkedEnv, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const { BLOB_STORE_ID: storeId, BLOB_READ_WRITE_TOKEN: token } = config;
  if (!storeId && !token) return null;
  const snapshot = createPublicationSnapshot({ storeId, token });
  const store = createNeonStore(connectionString);
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
    const { DATABASE_URL: connectionString } = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
    const result = await publishConfiguredPublication(connectionString);
    if (!result) throw new Error('Missing Vercel Blob configuration');
    const { publication, changed } = result;
    console.log(`公開一覧 ${publication.videos.length}曲｜取り下げ ${publication.withdrawnIds.length}件｜${changed ? '更新' : '一致'}｜${publication.publishedAt}`);
  } catch {
    console.error('公開一覧を更新できませんでした。NeonとVercel Blobの設定・接続状態を確認してください。');
    process.exitCode = 1;
  }
}
