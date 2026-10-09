import { neon } from '@neondatabase/serverless';
import { isVideoId, normalizeVideoMetadata } from '../model.js';

function videoFromRow(row) {
  if (!isVideoId(row?.video_id)) return null;
  const metadata = normalizeVideoMetadata(row.data);
  if (!metadata.title?.trim() || !metadata.author?.trim() || metadata.startSeconds === undefined || metadata.endSeconds === undefined) return null;
  const video = { id: row.video_id, ...metadata };
  if (typeof row.revision === 'string' && /^[0-9a-f]{32}$/.test(row.revision)) video.revision = row.revision;
  return video;
}

export function createNeonStore(connectionString, { sql } = {}) {
  let client = sql;
  const query = (text, values) => {
    if (!client) {
      if (!connectionString) throw new Error('DATABASE_URL is required');
      client = neon(connectionString);
    }
    return client.query(text, values, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
  };
  return {
    async listVideos() {
      const rows = await query('SELECT video_id, data, md5(data::text) AS revision FROM public.encore_shared_videos ORDER BY created_at DESC, video_id ASC', []);
      return rows.map(videoFromRow).filter(Boolean);
    },
    async getVideo(id) {
      const rows = await query('SELECT video_id, data, md5(data::text) AS revision FROM public.encore_shared_videos WHERE video_id = $1', [id]);
      return rows.length ? videoFromRow(rows[0]) : null;
    },
    async hasVideo(id) {
      const rows = await query('SELECT video_id FROM public.encore_shared_videos WHERE video_id = $1', [id]);
      return rows.length > 0;
    },
    async insertVideo(video) {
      const rows = await query('INSERT INTO public.encore_shared_videos (video_id, data) VALUES ($1, $2::jsonb) ON CONFLICT (video_id) DO NOTHING RETURNING video_id, data, md5(data::text) AS revision', [video.id, JSON.stringify(video)]);
      return rows.length ? videoFromRow(rows[0]) : null;
    },
    async updateVideo(video, revision) {
      const data = { ...video };
      delete data.revision;
      const rows = await query('UPDATE public.encore_shared_videos SET data = data || $2::jsonb WHERE video_id = $1 AND md5(data::text) = $3 RETURNING video_id, data, md5(data::text) AS revision', [video.id, JSON.stringify(data), revision]);
      return rows.length ? videoFromRow(rows[0]) : null;
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
