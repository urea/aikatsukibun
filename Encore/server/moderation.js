import { neon } from '@neondatabase/serverless';
import { isVideoId } from '../model.js';

const SOURCE = "COALESCE(data->>'videoId', video_id)";
const HAS_WITHDRAWN_AT = "data ? 'withdrawnAt'";
const LIST = `
  SELECT video_id AS entry_id, ${SOURCE} AS source_id,
         data->>'title' AS title, data->'startSeconds' AS start_seconds,
         data->'endSeconds' AS end_seconds, ${HAS_WITHDRAWN_AT} AS withdrawn,
         data->>'withdrawnAt' AS withdrawn_at
  FROM public.encore_shared_videos`;
const ORDER = "ORDER BY source_id, COALESCE((data->>'startSeconds')::numeric, 0), created_at, video_id";
const FETCH_TIMEOUT_MS = 8000;

export function createModerationStore(connectionString, { sql: injectedSql } = {}) {
  const sql = injectedSql ?? neon(connectionString);
  const fetchOptions = () => ({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const listQuery = sourceId => sourceId === null
    ? [`${LIST} ${ORDER}`, []]
    : [`${LIST} WHERE ${SOURCE} = $1 ${ORDER}`, [sourceId]];

  return {
    async list(sourceId = null) {
      if (sourceId !== null && !isVideoId(sourceId)) throw new TypeError('Invalid source video');
      const [query, values] = listQuery(sourceId);
      return sql.query(query, values, { fetchOptions: fetchOptions() });
    },
    async changeVisibility(action, sourceId, at = new Date()) {
      if (!isVideoId(sourceId) || !['hide', 'restore'].includes(action)) throw new TypeError('Invalid moderation operation');
      const hide = action === 'hide';
      const [query, values] = listQuery(sourceId);
      const [, , , changed, rows] = await sql.transaction(transaction => [
        transaction.query("SET LOCAL lock_timeout = '2s'"),
        transaction.query("SET LOCAL statement_timeout = '5s'"),
        // 公開側の登録と同じ元動画ロックを取り、その後の最新状態を更新する。
        transaction.query('SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))', [sourceId]),
        transaction.query(`UPDATE public.encore_shared_videos
          SET data = ${hide ? "data || jsonb_build_object('withdrawnAt', $2::text)" : "data - 'withdrawnAt'"}
          WHERE ${SOURCE} = $1 AND ${hide ? `NOT (${HAS_WITHDRAWN_AT})` : `(${HAS_WITHDRAWN_AT})`}
          RETURNING video_id`, hide ? [sourceId, at.toISOString()] : [sourceId]),
        transaction.query(query, values),
      ], { isolationLevel: 'ReadCommitted', fetchOptions: fetchOptions() });
      return { changed: changed.length, rows };
    },
  };
}
