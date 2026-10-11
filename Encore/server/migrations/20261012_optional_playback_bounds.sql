-- 空欄は明示的なJSON nullとして保存する。開始nullは先頭、終了nullは動画終端。
-- 既存の動画・時刻・投稿者データには変更を加えない。トランザクション内で実行する。
ALTER TABLE public.encore_shared_videos
  DROP CONSTRAINT IF EXISTS encore_shared_videos_data_check3,
  DROP CONSTRAINT IF EXISTS encore_shared_videos_data_check4,
  DROP CONSTRAINT IF EXISTS encore_shared_videos_bounds_type_check,
  DROP CONSTRAINT IF EXISTS encore_shared_videos_bounds_order_check,
  ADD CONSTRAINT encore_shared_videos_bounds_type_check CHECK (
    jsonb_typeof(data->'startSeconds') IN ('number', 'null') AND jsonb_typeof(data->'endSeconds') IN ('number', 'null')
  ),
  ADD CONSTRAINT encore_shared_videos_bounds_order_check CHECK (
    ((data->>'startSeconds') IS NULL OR (data->>'startSeconds')::numeric >= 0) AND
    ((data->>'endSeconds') IS NULL OR (data->>'endSeconds')::numeric > COALESCE((data->>'startSeconds')::numeric, 0))
  );
