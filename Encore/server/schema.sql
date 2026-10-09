-- このアプリ専用の共有データ。既存のテーブルは変更しない。
CREATE TABLE IF NOT EXISTS public.encore_shared_videos (
  video_id text PRIMARY KEY CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (data ?& ARRAY['id', 'title', 'startSeconds', 'endSeconds', 'mode', 'difficulty', 'idol', 'result', 'author']),
  CHECK (data->>'id' = video_id),
  CHECK (length(btrim(data->>'title')) > 0 AND length(btrim(data->>'author')) > 0),
  CHECK (jsonb_typeof(data->'startSeconds') = 'number' AND jsonb_typeof(data->'endSeconds') = 'number'),
  CHECK ((data->>'startSeconds')::numeric >= 0 AND (data->>'endSeconds')::numeric > (data->>'startSeconds')::numeric)
);

CREATE INDEX IF NOT EXISTS encore_shared_videos_created_at_idx ON public.encore_shared_videos (created_at DESC);

-- 生のIPは保存しない。サーバー側でsaltを加えてハッシュ化したキーだけを使う。
CREATE TABLE IF NOT EXISTS public.encore_shared_rate_limits (
  client_hash char(64) PRIMARY KEY CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts integer NOT NULL CHECK (attempts > 0)
);
