import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { neon } from '@neondatabase/serverless';

const VIDEO_ROWS = `
  SELECT video_id, data::text AS data,
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    md5(data::text) AS revision
  FROM public.encore_shared_videos
  ORDER BY video_id COLLATE "C"
`;

const RATE_LIMIT_ROWS = `
  SELECT client_hash::text AS client_hash,
    floor(EXTRACT(EPOCH FROM window_started_at) * 1000)::bigint AS window_started_at,
    attempts
  FROM public.encore_shared_rate_limits
  ORDER BY client_hash COLLATE "C"
`;

const USAGE = `Encore D1試験移行用SQLを出力します。
  node Encore/tools/export-d1-seed.mjs --out <新規SQLファイル>
  node Encore/tools/export-d1-seed.mjs --out <新規SQLファイル> --from-dump <EncoreのバックアップSQL> --pglite <PGliteのESMファイル>

接続は読取専用です。DATABASE_URL または Encore/.env.local の接続設定を使います。
書き出したSQLは共有データを含むため、管理対象外の場所に保管してください。`;

async function readNeon() {
  const connectionString = process.env.DATABASE_URL || parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8')).DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL');
  const db = neon(connectionString);
  return db.transaction(tx => [tx.query(VIDEO_ROWS), tx.query(RATE_LIMIT_ROWS)], {
    isolationLevel: 'RepeatableRead',
    readOnly: true,
    fetchOptions: { signal: AbortSignal.timeout(15_000) },
  });
}

async function readBackup(path, modulePath) {
  const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
  const db = new PGlite();
  try {
    await db.exec(await readFile(path, 'utf8'));
    const videos = await db.query(VIDEO_ROWS);
    const rateLimits = await db.query(RATE_LIMIT_ROWS);
    return [videos.rows, rateLimits.rows];
  } finally {
    await db.close();
  }
}

const quote = value => `'${value.replaceAll("'", "''")}'`;
const hash = value => createHash('sha256').update(value).digest('hex');

function createSeed(videoRows, rateLimitRows) {
  const videos = videoRows.map(({ video_id, data, created_at, revision }) => [video_id, data, created_at, revision]);
  const rateLimits = rateLimitRows.map(({ client_hash, window_started_at, attempts }) => {
    const milliseconds = Number(window_started_at);
    if (!Number.isSafeInteger(milliseconds) || !Number.isSafeInteger(attempts)) throw new Error('Invalid rate limit row');
    return [client_hash, milliseconds, attempts];
  });
  const statements = ['-- Encore D1 移行データ。空のデータベースに適用。'];
  for (const row of videos) {
    statements.push(`INSERT INTO encore_shared_videos (video_id, data, created_at, revision) VALUES (${row.map(quote).join(', ')});`);
  }
  for (const [clientHash, milliseconds, attempts] of rateLimits) {
    statements.push(`INSERT INTO encore_shared_rate_limits (client_hash, window_started_at, attempts) VALUES (${quote(clientHash)}, ${milliseconds}, ${attempts});`);
  }
  const sql = `${statements.join('\n')}\n`;
  return {
    sql,
    summary: {
      videoRows: videos.length,
      withdrawnRows: videos.filter(row => Object.hasOwn(JSON.parse(row[1]), 'withdrawnAt')).length,
      rateLimitRows: rateLimits.length,
      sha256: hash(sql),
      videoRowsSha256: hash(JSON.stringify(videos)),
      rateLimitRowsSha256: hash(JSON.stringify(rateLimits)),
    },
  };
}

async function main() {
  let options;
  try {
    ({ values: options } = parseArgs({ options: {
      out: { type: 'string' },
      'from-dump': { type: 'string' },
      pglite: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    } }));
  } catch {
    console.error(USAGE);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const backup = options['from-dump'];
  if (!options.out || Boolean(backup) !== Boolean(options.pglite)) {
    console.error(USAGE);
    return 2;
  }

  let seed;
  try {
    const rows = backup ? await readBackup(backup, options.pglite) : await readNeon();
    seed = createSeed(...rows);
  } catch {
    console.error(backup ? 'バックアップSQLを読み取れませんでした。' : 'Neonから読取専用でデータを取得できませんでした。');
    return 1;
  }

  try {
    await writeFile(options.out, seed.sql, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    console.error(error.code === 'EEXIST' ? '出力先は既に存在します。新しいファイル名を指定してください。' : 'SQLファイルを作成できませんでした。');
    return 1;
  }
  console.log(JSON.stringify({ source: backup ? 'backup' : 'neon', ...seed.summary }));
  return 0;
}

process.exitCode = await main();
