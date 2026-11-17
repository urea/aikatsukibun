import { isEntryId, isVideoId, videoIdFor } from '../model.js';
import { videoFromRow } from './shared-video-row.js';

const WITHDRAWN_SOURCE = source => `EXISTS (
  SELECT 1 FROM encore_shared_videos w WHERE w.source_id = ${source} AND w.withdrawn = 1
)`;
const OPEN_ENTRY = `SELECT video_id, source_id, data, revision FROM encore_shared_videos v
  WHERE video_id = ?1 AND NOT ${WITHDRAWN_SOURCE('v.source_id')}`;

function decodeVideo(row) {
  return row ? videoFromRow({ ...row, data: JSON.parse(row.data) }) : null;
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createD1Store(db) {
  const prepare = (sql, ...args) => db.prepare(sql).bind(...args);
  const withdrawnQuery = sourceId => prepare(`SELECT ${WITHDRAWN_SOURCE('?1')} AS blocked`, sourceId);

  async function listPublication() {
    const { results } = await db.prepare(`
      WITH withdrawn_sources AS (
        SELECT DISTINCT source_id FROM encore_shared_videos WHERE withdrawn = 1
      )
      SELECT v.video_id, w.source_id AS withdrawn_source,
        CASE WHEN w.source_id IS NULL THEN v.data END AS data,
        CASE WHEN w.source_id IS NULL THEN v.revision END AS revision
      FROM encore_shared_videos v LEFT JOIN withdrawn_sources w ON w.source_id = v.source_id
      ORDER BY v.created_at DESC, v.video_id ASC
    `).all();
    const videos = [];
    const withdrawnIds = new Set();
    for (const row of results) {
      if (isVideoId(row.withdrawn_source)) {
        withdrawnIds.add(row.withdrawn_source);
        if (isEntryId(row.video_id)) withdrawnIds.add(row.video_id);
      } else {
        const video = decodeVideo(row);
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
      return decodeVideo(await prepare(OPEN_ENTRY, id).first());
    },
    async isWithdrawn(id) {
      return Boolean(await withdrawnQuery(id).first('blocked'));
    },
    async hasVideo(id) {
      return Boolean(await prepare('SELECT 1 FROM encore_shared_videos WHERE source_id = ?1 LIMIT 1', id).first());
    },
    async hasClip(video, excludeId = null) {
      return Boolean(await prepare(`SELECT 1 FROM encore_shared_videos
        WHERE source_id = ?1 AND clip_start = ?2 AND clip_end = ?3 AND (?4 IS NULL OR video_id <> ?4) LIMIT 1`,
      videoIdFor(video.id, video), video.startSeconds ?? 0, video.endSeconds ?? -1, excludeId).first());
    },
    async insertVideo(video) {
      const sourceId = videoIdFor(video.id, video);
      const data = { ...video };
      delete data.withdrawnAt;
      const [inserted, status] = await db.batch([
        prepare(`INSERT INTO encore_shared_videos (video_id, data)
          SELECT ?1, ?2 WHERE NOT ${WITHDRAWN_SOURCE('?3')}
          ON CONFLICT DO NOTHING RETURNING video_id, data, revision`, video.id, JSON.stringify(data), sourceId),
        withdrawnQuery(sourceId),
      ]);
      if (status.results[0].blocked) throw storeError('withdrawn', 'Withdrawn source video');
      return decodeVideo(inserted.results[0]);
    },
    async updateVideo(video, revision) {
      const existing = await prepare(OPEN_ENTRY, video.id).first();
      if (existing?.revision !== revision) return null;
      const previous = JSON.parse(existing.data);
      if (Object.hasOwn(video, 'videoId') && video.videoId !== existing.source_id) return null;
      const updates = { ...video };
      delete updates.revision;
      delete updates.withdrawnAt;
      // JSON merge-patch deletes keys set to null. Empty playback bounds must survive as JSON null.
      const data = JSON.stringify({ ...previous, ...updates });
      const unchanged = Number(data === JSON.stringify(previous));
      try {
        return decodeVideo(await prepare(`UPDATE encore_shared_videos AS v SET data = ?2,
          revision = CASE WHEN ?4 = 1 THEN revision ELSE lower(hex(randomblob(16))) END
          WHERE video_id = ?1 AND revision = ?3 AND NOT ${WITHDRAWN_SOURCE('v.source_id')}
          RETURNING video_id, data, revision`, video.id, data, revision, unchanged).first());
      } catch (error) {
        if (/UNIQUE constraint failed/i.test(error?.message ?? '')) {
          throw storeError('duplicate_clip', 'Duplicate playback range');
        }
        throw error;
      }
    },
    async consumeRateLimit(hash, limit, windowSeconds) {
      const now = Date.now();
      const row = await prepare(`INSERT INTO encore_shared_rate_limits (client_hash, window_started_at, attempts)
        VALUES (?1, ?2, 1)
        ON CONFLICT (client_hash) DO UPDATE SET
          attempts = CASE WHEN window_started_at <= ?3 THEN 1 ELSE attempts + 1 END,
          window_started_at = CASE WHEN window_started_at <= ?3 THEN excluded.window_started_at ELSE window_started_at END
        WHERE window_started_at <= ?3 OR attempts < ?4
        RETURNING window_started_at`, hash, now, now - windowSeconds * 1000, limit).first();
      return row
        ? { allowed: true, retryAfter: Math.max(1, Math.ceil((row.window_started_at - now) / 1000 + windowSeconds)) }
        : { allowed: false, retryAfter: windowSeconds };
    },
  };
}
