-- このアプリ専用の共有データ。既存のテーブルは変更しない。
CREATE TABLE IF NOT EXISTS public.encore_shared_videos (
  video_id text PRIMARY KEY CONSTRAINT encore_shared_videos_entry_id_check CHECK (video_id ~ '^([A-Za-z0-9_-]{11}|clip_[0-9a-f]{32})$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (data ?& ARRAY['id', 'title', 'startSeconds', 'endSeconds', 'mode', 'difficulty', 'idol', 'result', 'author']),
  CHECK (data->>'id' = video_id),
  CONSTRAINT encore_shared_videos_source_video_check CHECK (
    (video_id ~ '^[A-Za-z0-9_-]{11}$' AND
      (NOT (data ? 'videoId') OR (jsonb_typeof(data->'videoId') = 'string' AND data->>'videoId' = video_id))) OR
    (video_id ~ '^clip_[0-9a-f]{32}$' AND data ? 'videoId' AND
      jsonb_typeof(data->'videoId') = 'string' AND data->>'videoId' ~ '^[A-Za-z0-9_-]{11}$')
  ),
  CHECK (length(btrim(data->>'title')) > 0 AND length(btrim(data->>'author')) > 0),
  CONSTRAINT encore_shared_videos_bounds_type_check CHECK (
    jsonb_typeof(data->'startSeconds') IN ('number', 'null') AND jsonb_typeof(data->'endSeconds') IN ('number', 'null')
  ),
  CONSTRAINT encore_shared_videos_bounds_order_check CHECK (
    ((data->>'startSeconds') IS NULL OR (data->>'startSeconds')::numeric >= 0) AND
    ((data->>'endSeconds') IS NULL OR (data->>'endSeconds')::numeric > COALESCE((data->>'startSeconds')::numeric, 0))
  )
);

CREATE INDEX IF NOT EXISTS encore_shared_videos_created_at_idx ON public.encore_shared_videos (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS encore_shared_videos_clip_identity_idx ON public.encore_shared_videos (
  (COALESCE(data->>'videoId', video_id)),
  (COALESCE((data->>'startSeconds')::numeric, 0)),
  (COALESCE((data->>'endSeconds')::numeric, -1))
);

-- 生のIPは保存しない。サーバー側でsaltを加えてハッシュ化したキーだけを使う。
CREATE TABLE IF NOT EXISTS public.encore_shared_rate_limits (
  client_hash char(64) PRIMARY KEY CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts integer NOT NULL CHECK (attempts > 0)
);
