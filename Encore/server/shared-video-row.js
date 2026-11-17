import { isEntryId, isVideoId, videoIdFor, normalizeVideoMetadata } from '../model.js';

export function videoFromRow(row) {
  if (row?.data && Object.hasOwn(row.data, 'withdrawnAt')) return null;
  if (!isEntryId(row?.video_id) || !isVideoId(videoIdFor(row.video_id, row.data))) return null;
  const metadata = normalizeVideoMetadata(row.data);
  if (!metadata.title?.trim() || !metadata.author?.trim() || metadata.startSeconds === undefined || metadata.endSeconds === undefined) return null;
  const video = { id: row.video_id, ...metadata };
  if (typeof row.revision === 'string' && /^[0-9a-f]{32}$/.test(row.revision)) video.revision = row.revision;
  return video;
}
