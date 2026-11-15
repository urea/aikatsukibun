import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { categoryLabel, extractVideoId, isEntryId } from '../model.js';
import { createModerationStore } from '../server/moderation.js';

const ENV_FILE = new URL('../.env.local', import.meta.url);
const USAGE = `Encore 共有曲の管理
  node Encore/tools/moderate-videos.mjs list [YouTube ID/URL]
  node Encore/tools/moderate-videos.mjs hide <YouTube ID/URL> [--apply]
  node Encore/tools/moderate-videos.mjs restore <YouTube ID/URL> [--apply]
  node Encore/tools/moderate-videos.mjs misc <曲ID> [--restore-withdrawn] [--apply]

hide / restore / misc はまず --apply を付けずに実行し、対象曲と件数を確認してください。
変更する場合は、同じコマンドに --apply を付けて再実行してください。
misc は指定の曲1件を「その他の動画」に移します。非表示の曲を復元して移す場合は --restore-withdrawn を指定します。
接続先には Encore/.env.local の DATABASE_URL を使います。`;

function parseArgs(args) {
  const [action, target, flag, ...rest] = args;
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(action))) return { help: true };
  if (action === 'misc') {
    const flags = args.slice(2);
    if (!isEntryId(target) || flags.some(value => !['--apply', '--restore-withdrawn'].includes(value)) || new Set(flags).size !== flags.length) return null;
    return { action, entryId: target, apply: flags.includes('--apply'), restoreWithdrawn: flags.includes('--restore-withdrawn') };
  }
  if (!['list', 'hide', 'restore'].includes(action) || rest.length || (flag !== undefined && flag !== '--apply')) return null;
  if (action === 'list' && flag !== undefined) return null;
  const sourceId = target === undefined ? null : extractVideoId(target);
  if (!sourceId && (action !== 'list' || target !== undefined)) return null;
  return { action, sourceId, apply: flag === '--apply' };
}

async function readConnectionString(read = readFile) {
  const connectionString = parseEnv(await read(ENV_FILE, 'utf8')).DATABASE_URL;
  const url = new URL(connectionString);
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) {
    throw new Error('Invalid DATABASE_URL');
  }
  return connectionString;
}

const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Tokyo' });
const datetime = value => `${date.format(value)} (JST)`;
const safeText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu, ' ').trim();
function time(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const milliseconds = typeof value === 'number' ? Math.round(value * 1000) : NaN;
  if (!Number.isSafeInteger(milliseconds) || value < 0) return '不明';
  const whole = Math.floor(milliseconds / 1000);
  const fraction = milliseconds % 1000;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${fraction ? `.${String(fraction).padStart(3, '0')}` : ''}`;
}

function printRows(rows, output) {
  for (const row of rows) {
    const timestamp = typeof row.withdrawn_at === 'string' ? Date.parse(row.withdrawn_at) : NaN;
    const status = row.withdrawn ? `非表示 (${Number.isFinite(timestamp) ? datetime(timestamp) : '日時不明'})` : row.other_withdrawn ? 'アプリ内で非表示' : '公開中';
    const category = Object.hasOwn(row, 'category') ? `｜分類: ${categoryLabel(row.category)}` : '';
    output(`  [${status}] ${safeText(row.title) || '無題'}｜${time(row.start_seconds, '先頭')}〜${time(row.end_seconds, '最後')}｜曲ID: ${safeText(row.entry_id)}｜YouTube: ${safeText(row.source_id)}${category}`);
  }
}

async function runMisc(store, { entryId, apply, restoreWithdrawn }, observedAt, output) {
  const { rows, changed } = apply ? await store.markMisc(entryId, { restoreWithdrawn }) : { rows: await store.listEntry(entryId) };
  const [row] = rows;
  const skipped = row?.withdrawn && !restoreWithdrawn;
  const affected = row && !skipped && (row.category !== 'misc' || row.withdrawn) ? 1 : 0;
  output(`[${datetime(observedAt)}] その他の動画へ移動${restoreWithdrawn ? '（非表示なら指定曲を復元）' : ''}${apply ? '' : 'のプレビュー'}｜曲ID: ${entryId}`);
  output(apply ? `変更: ${changed}曲` : `変更予定: ${affected}曲。データベースは変更していません。`);
  if (!row) output('対象の共有曲は見つかりませんでした。');
  if (skipped) output('対象曲は非表示のため変更しません。復元して移す場合は --restore-withdrawn を指定してください。');
  if (row?.other_withdrawn) output('同じ元動画にほかの非表示曲があるため、指定曲を復元しても公開一覧には表示されません。');
  printRows(rows, output);
  if (!apply && affected) output(`反映するには: node Encore/tools/moderate-videos.mjs misc ${entryId}${restoreWithdrawn ? ' --restore-withdrawn' : ''} --apply`);
}

export async function runModerationCli(args, { read = readFile, makeStore = createModerationStore, now = () => new Date(), output = console.log, error = console.error } = {}) {
  const options = parseArgs(args);
  if (options?.help) { output(USAGE); return 0; }
  if (!options) {
    error('引数を確認してください。list / hide / restore はYouTubeのIDまたはURL、misc は曲IDを指定します。');
    error(USAGE);
    return 2;
  }

  let connectionString;
  try { connectionString = await readConnectionString(read); }
  catch {
    error('Encore/.env.local の DATABASE_URL を読み込めません。有効なNeon接続URLを設定してください。');
    return 1;
  }

  const { action, sourceId, apply } = options;
  const label = action === 'hide' ? '非表示' : action === 'restore' ? '復元' : '一覧';
  try {
    const observedAt = now();
    const store = makeStore(connectionString);
    if (action === 'misc') {
      await runMisc(store, options, observedAt, output);
      return 0;
    }
    const result = apply
      ? await store.changeVisibility(action, sourceId, observedAt)
      : { rows: await store.list(sourceId) };
    const { rows, changed } = result;
    const affected = rows.filter(row => action === 'hide' ? !row.withdrawn : row.withdrawn).length;
    output(`[${datetime(observedAt)}] ${label}${apply || action === 'list' ? '' : 'のプレビュー'}｜YouTube: ${sourceId || '全件'}｜${rows.length}曲`);
    if (apply) output(`変更: ${changed}曲（既存データと再生区間は保持）`);
    else if (action !== 'list') output(`変更予定: ${affected}曲。データベースは変更していません。`);
    if (!rows.length) output('対象の共有曲は見つかりませんでした。');
    printRows(rows, output);
    if (!apply && action !== 'list' && affected) output(`反映するには: node Encore/tools/moderate-videos.mjs ${action} ${sourceId} --apply`);
    return 0;
  } catch {
    error(apply
      ? action === 'misc'
        ? `曲ID ${options.entryId} の反映結果を確認できませんでした。--apply を外して現在の状態を確認してください。`
        : `YouTube ${sourceId} の反映結果を確認できませんでした。再実行する前に list で現在の状態を確認してください。`
      : '共有曲を取得できませんでした。Encoreの接続設定と通信状態を確認してください。');
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await runModerationCli(process.argv.slice(2));
}
