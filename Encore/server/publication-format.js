import { normalizeCustomVideos, uniqueIds, videoIdFor } from '../model.js';

export function normalizePublication(value) {
  if (!Array.isArray(value?.videos) || !Array.isArray(value?.withdrawnIds)) {
    throw new Error('公開一覧のJSON形式を確認できません。');
  }
  const videos = normalizeCustomVideos(value.videos);
  const withdrawnIds = uniqueIds(value.withdrawnIds).sort();
  const withdrawn = new Set(withdrawnIds);
  const hasInvalidVideo = video =>
    typeof video?.title !== 'string' || !video.title.trim()
    || typeof video.author !== 'string' || !video.author.trim() || Object.hasOwn(video, 'withdrawnAt');
  if (videos.length !== value.videos.length || withdrawnIds.length !== value.withdrawnIds.length
    || videos.some(video => video.startSeconds === undefined || withdrawn.has(video.id) || withdrawn.has(videoIdFor(video.id, video)))
    || value.videos.some(hasInvalidVideo)) {
    throw new Error('公開一覧に無効な動画情報が含まれています。');
  }
  return { videos, withdrawnIds };
}

export function decodeSnapshot(value) {
  const publication = normalizePublication(value);
  const publishedAt = value.publishedAt;
  if (typeof publishedAt !== 'string' || !Number.isFinite(Date.parse(publishedAt))
    || new Date(publishedAt).toISOString() !== publishedAt) {
    throw new Error('公開一覧の更新日時を確認できません。');
  }
  return { ...publication, publishedAt };
}
