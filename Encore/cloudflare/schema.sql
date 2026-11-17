CREATE TABLE IF NOT EXISTS encore_shared_videos (
  video_id TEXT NOT NULL PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z'),
  revision TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT GENERATED ALWAYS AS (coalesce(json_extract(data, '$.videoId'), video_id)) VIRTUAL,
  clip_start REAL GENERATED ALWAYS AS (coalesce(json_extract(data, '$.startSeconds'), 0)) VIRTUAL,
  clip_end REAL GENERATED ALWAYS AS (coalesce(json_extract(data, '$.endSeconds'), -1)) VIRTUAL,
  withdrawn INTEGER GENERATED ALWAYS AS (json_type(data, '$.withdrawnAt') IS NOT NULL) VIRTUAL,
  CHECK (length(revision) = 32 AND revision NOT GLOB '*[^0-9a-f]*'),
  CHECK (json_extract(data, '$.id') IS video_id),
  CHECK (length(source_id) = 11 AND source_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  CHECK ((length(video_id) = 11 AND source_id = video_id
          AND (json_type(data, '$.videoId') IS NULL OR json_type(data, '$.videoId') = 'text'))
      OR (length(video_id) = 37 AND substr(video_id, 1, 5) = 'clip_'
          AND substr(video_id, 6) NOT GLOB '*[^0-9a-f]*' AND json_type(data, '$.videoId') IS 'text')),
  CHECK (json_type(data, '$.title') IS 'text' AND length(trim(json_extract(data, '$.title'))) > 0),
  CHECK (json_type(data, '$.author') IS 'text' AND length(trim(json_extract(data, '$.author'))) > 0),
  CHECK (json_type(data, '$.mode') IS NOT NULL AND json_type(data, '$.difficulty') IS NOT NULL
     AND json_type(data, '$.idol') IS NOT NULL AND json_type(data, '$.result') IS NOT NULL),
  CHECK (coalesce(json_type(data, '$.startSeconds'), '') IN ('integer', 'real', 'null')
     AND coalesce(json_type(data, '$.endSeconds'), '') IN ('integer', 'real', 'null')),
  CHECK (clip_start >= 0 AND (json_extract(data, '$.endSeconds') IS NULL OR clip_end > clip_start))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS encore_shared_videos_clip_identity_idx
  ON encore_shared_videos (source_id, clip_start, clip_end);
CREATE INDEX IF NOT EXISTS encore_shared_videos_created_at_idx
  ON encore_shared_videos (created_at DESC, video_id ASC);
CREATE INDEX IF NOT EXISTS encore_shared_videos_withdrawn_sources_idx
  ON encore_shared_videos (source_id) WHERE withdrawn = 1;

CREATE TABLE IF NOT EXISTS encore_shared_rate_limits (
  client_hash TEXT NOT NULL PRIMARY KEY CHECK (length(client_hash) = 64 AND client_hash NOT GLOB '*[^0-9a-f]*'),
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
) STRICT;
