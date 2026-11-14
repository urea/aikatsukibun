import { neon } from '@neondatabase/serverless';
import { isEntryId, isVideoId, videoIdFor, normalizeVideoMetadata } from '../model.js';

const sourceIdSql = alias => `COALESCE(${alias}.data->>'videoId', ${alias}.video_id)`;
const withdrawalSql = source => `EXISTS (SELECT 1 FROM public.encore_shared_videos withdrawn WHERE ${sourceIdSql('withdrawn')} = ${source} AND withdrawn.data ? 'withdrawnAt')`;

function videoFromRow(row) {
  if (row?.data && Object.hasOwn(row.data, 'withdrawnAt')) return null;
  if (!isEntryId(row?.video_id) || !isVideoId(videoIdFor(row.video_id, row.data))) return null;
  const metadata = normalizeVideoMetadata(row.data);
  if (!metadata.title?.trim() || !metadata.author?.trim() || metadata.startSeconds === undefined || metadata.endSeconds === undefined) return null;
  const video = { id: row.video_id, ...metadata };
  if (typeof row.revision === 'string' && /^[0-9a-f]{32}$/.test(row.revision)) video.revision = row.revision;
  return video;
}

export function createNeonStore(connectionString, { sql } = {}) {
  let client = sql;
  const getClient = () => {
    if (!client) {
      if (!connectionString) throw new Error('DATABASE_URL is required');
      client = neon(connectionString);
    }
    return client;
  };
  const query = (text, values) => getClient().query(text, values, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
  async function listPublication() {
    const rows = await query(`
      WITH withdrawn_sources AS (
        SELECT DISTINCT ${sourceIdSql('v')} AS source_id FROM public.encore_shared_videos v WHERE v.data ? 'withdrawnAt'
      )
      SELECT v.video_id, w.source_id AS withdrawn_source,
        CASE WHEN w.source_id IS NULL THEN v.data END AS data,
        CASE WHEN w.source_id IS NULL THEN md5(v.data::text) END AS revision
      FROM public.encore_shared_videos v LEFT JOIN withdrawn_sources w ON w.source_id = ${sourceIdSql('v')}
      ORDER BY v.created_at DESC, v.video_id ASC
    `, []);
    const withdrawnIds = new Set();
    const videos = [];
    for (const row of rows) {
      if (isVideoId(row.withdrawn_source)) {
        withdrawnIds.add(row.withdrawn_source);
        if (isEntryId(row.video_id)) withdrawnIds.add(row.video_id);
      } else {
        const video = videoFromRow(row);
        if (video) videos.push(video);
      }
    }
    return { videos, withdrawnIds: [...withdrawnIds] };
  }
  return {
    listPublication,
    async listVideos() {
      return (await listPublication()).videos;
    },
    async getVideo(id) {
      const rows = await query(`SELECT video_id, data, md5(data::text) AS revision FROM public.encore_shared_videos v WHERE video_id = $1 AND NOT (data ? 'withdrawnAt') AND NOT ${withdrawalSql(sourceIdSql('v'))}`, [id]);
      return rows.length ? videoFromRow(rows[0]) : null;
    },
    async isWithdrawn(id) {
      const [row] = await query(`SELECT ${withdrawalSql('$1')} AS withdrawn`, [id]);
      return row?.withdrawn === true;
    },
    async hasVideo(id) {
      const rows = await query("SELECT video_id FROM public.encore_shared_videos WHERE COALESCE(data->>'videoId', video_id) = $1 LIMIT 1", [id]);
      return rows.length > 0;
    },
    async hasClip(video, excludeId = null) {
      const rows = await query("SELECT video_id FROM public.encore_shared_videos WHERE COALESCE(data->>'videoId', video_id) = $1 AND COALESCE((data->>'startSeconds')::numeric, 0) = $2::numeric AND COALESCE((data->>'endSeconds')::numeric, -1) = $3::numeric AND ($4::text IS NULL OR video_id <> $4) LIMIT 1", [videoIdFor(video.id, video), video.startSeconds ?? 0, video.endSeconds ?? -1, excludeId]);
      return rows.length > 0;
    },
    async insertVideo(video) {
      const sourceId = videoIdFor(video.id, video);
      const data = { ...video };
      delete data.withdrawnAt;
      const db = getClient();
      // 管理ツールと同じ元動画ロック。待機後の新しいスナップショットで取り下げを確認する。
      const [, [row]] = await db.transaction([
        db.query('SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))', [sourceId]),
        db.query(`
          WITH withdrawal AS MATERIALIZED (SELECT ${withdrawalSql('$3')} AS blocked), inserted AS (
            INSERT INTO public.encore_shared_videos (video_id, data)
            SELECT $1, $2::jsonb FROM withdrawal WHERE NOT blocked
            ON CONFLICT DO NOTHING RETURNING video_id, data, md5(data::text) AS revision
          )
          SELECT video_id, data, revision, false AS blocked FROM inserted
          UNION ALL SELECT NULL::text, NULL::jsonb, NULL::text, true FROM withdrawal WHERE blocked
        `, [video.id, JSON.stringify(data), sourceId]),
      ], { isolationLevel: 'ReadCommitted', fetchOptions: { signal: AbortSignal.timeout(8000) } });
      if (row?.blocked) {
        const error = new Error('Withdrawn source video');
        error.code = 'withdrawn';
        throw error;
      }
      return videoFromRow(row);
    },
    async updateVideo(video, revision) {
      const data = { ...video };
      delete data.revision;
      delete data.withdrawnAt;
      try {
        const rows = await query(`UPDATE public.encore_shared_videos v SET data = data || $2::jsonb WHERE video_id = $1 AND md5(data::text) = $3 AND NOT (data ? 'withdrawnAt') AND NOT ${withdrawalSql(sourceIdSql('v'))} RETURNING video_id, data, md5(data::text) AS revision`, [video.id, JSON.stringify(data), revision]);
        return rows.length ? videoFromRow(rows[0]) : null;
      } catch (error) {
        if (error?.code === '23505') {
          const duplicate = new Error('Duplicate playback range');
          duplicate.code = 'duplicate_clip';
          throw duplicate;
        }
        throw error;
      }
    },
    async consumeRateLimit(hash, limit, windowSeconds) {
      const rows = await query(`
        INSERT INTO public.encore_shared_rate_limits (client_hash, window_started_at, attempts)
        VALUES ($1, CURRENT_TIMESTAMP, 1)
        ON CONFLICT (client_hash) DO UPDATE SET
          attempts = CASE WHEN encore_shared_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3::integer) THEN 1 ELSE encore_shared_rate_limits.attempts + 1 END,
          window_started_at = CASE WHEN encore_shared_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3::integer) THEN CURRENT_TIMESTAMP ELSE encore_shared_rate_limits.window_started_at END
        WHERE encore_shared_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $3::integer)
           OR encore_shared_rate_limits.attempts < $2::integer
        RETURNING attempts, EXTRACT(EPOCH FROM (window_started_at + make_interval(secs => $3::integer) - CURRENT_TIMESTAMP)) AS retry_after
      `, [hash, limit, windowSeconds]);
      return rows.length ? { allowed: true, retryAfter: Math.max(1, Math.ceil(Number(rows[0].retry_after))) } : { allowed: false, retryAfter: windowSeconds };
    },
  };
}
