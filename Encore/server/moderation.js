import { neon } from '@neondatabase/serverless';
import { isEntryId, isVideoCategory, isVideoId } from '../model.js';

const SOURCE = "COALESCE(data->>'videoId', video_id)";
const HAS_WITHDRAWN_AT = "data ? 'withdrawnAt'";
const ROW_COLUMNS = `video_id AS entry_id, ${SOURCE} AS source_id,
         data->>'title' AS title, data->'startSeconds' AS start_seconds,
         data->'endSeconds' AS end_seconds, ${HAS_WITHDRAWN_AT} AS withdrawn,
         data->>'withdrawnAt' AS withdrawn_at`;
const LIST = `SELECT ${ROW_COLUMNS} FROM public.encore_shared_videos`;
const ORDER = "ORDER BY source_id, COALESCE((data->>'startSeconds')::numeric, 0), created_at, video_id";
const LIST_ENTRY = `
  SELECT entry.*, EXISTS (
    SELECT 1 FROM public.encore_shared_videos sibling
    WHERE COALESCE(sibling.data->>'videoId', sibling.video_id) = entry.source_id
      AND sibling.video_id <> entry.entry_id AND sibling.data ? 'withdrawnAt'
  ) AS other_withdrawn
  FROM (
    SELECT ${ROW_COLUMNS}, data->>'category' AS category, data->'playable' AS playable
    FROM public.encore_shared_videos WHERE video_id = $1
  ) entry`;
const FETCH_TIMEOUT_MS = 8000;

export function createModerationStore(connectionString, { sql: injectedSql } = {}) {
  const sql = injectedSql ?? neon(connectionString);
  const fetchOptions = () => ({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const listQuery = sourceId => sourceId === null
    ? [`${LIST} ${ORDER}`, []]
    : [`${LIST} WHERE ${SOURCE} = $1 ${ORDER}`, [sourceId]];
  async function sourceForEntry(entryId) {
    // 曲IDがclip形式なら元動画IDは別に保存されている。ロック取得後に再確認する。
    const [entry] = await sql.query(`SELECT ${SOURCE} AS source_id FROM public.encore_shared_videos WHERE video_id = $1`, [entryId], { fetchOptions: fetchOptions() });
    if (!entry) return null;
    if (!isVideoId(entry.source_id)) throw new TypeError('Invalid source video');
    return entry.source_id;
  }

  async function lockedChange(sourceId, change, changeValues, read, readValues) {
    const [, , , changed, rows] = await sql.transaction(transaction => [
      transaction.query("SET LOCAL lock_timeout = '2s'"),
      transaction.query("SET LOCAL statement_timeout = '5s'"),
      // 公開側の登録と同じ元動画ロックを取り、その後の最新状態を更新する。
      transaction.query('SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))', [sourceId]),
      transaction.query(change, changeValues),
      transaction.query(read, readValues),
    ], { isolationLevel: 'ReadCommitted', fetchOptions: fetchOptions() });
    return { changed: changed.length, rows };
  }

  return {
    async list(sourceId = null) {
      if (sourceId !== null && !isVideoId(sourceId)) throw new TypeError('Invalid source video');
      const [query, values] = listQuery(sourceId);
      return sql.query(query, values, { fetchOptions: fetchOptions() });
    },
    async listEntry(entryId) {
      if (!isEntryId(entryId)) throw new TypeError('Invalid song entry');
      return sql.query(LIST_ENTRY, [entryId], { fetchOptions: fetchOptions() });
    },
    async changeVisibility(action, sourceId, at = new Date()) {
      if (!isVideoId(sourceId) || !['hide', 'restore'].includes(action)) throw new TypeError('Invalid moderation operation');
      const hide = action === 'hide';
      const [query, values] = listQuery(sourceId);
      return lockedChange(sourceId, `UPDATE public.encore_shared_videos
        SET data = ${hide ? "data || jsonb_build_object('withdrawnAt', $2::text)" : "data - 'withdrawnAt'"}
        WHERE ${SOURCE} = $1 AND ${hide ? `NOT (${HAS_WITHDRAWN_AT})` : `(${HAS_WITHDRAWN_AT})`}
        RETURNING video_id`, hide ? [sourceId, at.toISOString()] : [sourceId], query, values);
    },
    async markMisc(entryId, { restoreWithdrawn = false } = {}) {
      if (!isEntryId(entryId) || typeof restoreWithdrawn !== 'boolean') throw new TypeError('Invalid song category operation');
      const sourceId = await sourceForEntry(entryId);
      if (!sourceId) return { changed: 0, rows: [] };
      const data = restoreWithdrawn ? "(data - 'withdrawnAt')" : 'data';
      return lockedChange(sourceId, `UPDATE public.encore_shared_videos
        SET data = ${data} || jsonb_build_object('category', 'misc')
        WHERE video_id = $1 AND ${SOURCE} = $2
          AND (data->>'category' IS DISTINCT FROM 'misc'${restoreWithdrawn ? ` OR (${HAS_WITHDRAWN_AT})` : ''})
          ${restoreWithdrawn ? '' : `AND NOT (${HAS_WITHDRAWN_AT})`}
        RETURNING video_id`, [entryId, sourceId], LIST_ENTRY, [entryId]);
    },
    async classifyEntry(entryId, category, playable) {
      if (!isEntryId(entryId) || !isVideoCategory(category) || (playable !== undefined && typeof playable !== 'boolean')) {
        throw new TypeError('Invalid song classification');
      }
      const sourceId = await sourceForEntry(entryId);
      if (!sourceId) return { changed: 0, rows: [] };
      const setPlayable = playable !== undefined;
      return lockedChange(sourceId, `UPDATE public.encore_shared_videos
        SET data = data || jsonb_build_object('category', $3::text${setPlayable ? ", 'playable', $4::boolean" : ''})
        WHERE video_id = $1 AND ${SOURCE} = $2
          AND NOT (${HAS_WITHDRAWN_AT})
          AND NOT EXISTS (
            SELECT 1 FROM public.encore_shared_videos sibling
            WHERE COALESCE(sibling.data->>'videoId', sibling.video_id) = $2
              AND sibling.video_id <> $1 AND sibling.data ? 'withdrawnAt'
          )
          AND (data->>'category' IS DISTINCT FROM $3::text${setPlayable ? " OR data->'playable' IS DISTINCT FROM to_jsonb($4::boolean)" : ''})
        RETURNING video_id`, setPlayable ? [entryId, sourceId, category, playable] : [entryId, sourceId, category], LIST_ENTRY, [entryId]);
    },
  };
}
