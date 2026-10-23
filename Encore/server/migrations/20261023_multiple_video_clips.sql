-- 同じYouTube動画の別区間を独立した曲として保存する。既存行は変更しない。
BEGIN;

ALTER TABLE public.encore_shared_videos
  DROP CONSTRAINT IF EXISTS encore_shared_videos_video_id_check,
  DROP CONSTRAINT IF EXISTS encore_shared_videos_entry_id_check,
  DROP CONSTRAINT IF EXISTS encore_shared_videos_source_video_check;

ALTER TABLE public.encore_shared_videos
  ADD CONSTRAINT encore_shared_videos_entry_id_check CHECK (video_id ~ '^([A-Za-z0-9_-]{11}|clip_[0-9a-f]{32})$'),
  ADD CONSTRAINT encore_shared_videos_source_video_check CHECK (
    (video_id ~ '^[A-Za-z0-9_-]{11}$' AND
      (NOT (data ? 'videoId') OR (jsonb_typeof(data->'videoId') = 'string' AND data->>'videoId' = video_id))) OR
    (video_id ~ '^clip_[0-9a-f]{32}$' AND data ? 'videoId' AND
      jsonb_typeof(data->'videoId') = 'string' AND data->>'videoId' ~ '^[A-Za-z0-9_-]{11}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS encore_shared_videos_clip_identity_idx ON public.encore_shared_videos (
  (COALESCE(data->>'videoId', video_id)),
  (COALESCE((data->>'startSeconds')::numeric, 0)),
  (COALESCE((data->>'endSeconds')::numeric, -1))
);

COMMIT;
