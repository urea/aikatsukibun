function validStart(data) {
  const start = data?.startSeconds;
  return Number.isFinite(start) && start >= 0 ? start : null;
}

function validEnd(data, start) {
  const end = data?.endSeconds;
  return start !== null && Number.isFinite(end) && end > start ? end : null;
}

function clamp(value, maximum) {
  const number = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return Math.min(maximum, Math.max(0, number));
}

export function getPlaybackRange(data, videoDuration = 0) {
  const start = validStart(data);
  const end = validEnd(data, start);
  if (end !== null) return { start, end, duration: end - start };
  const duration = Number.isFinite(videoDuration) && videoDuration >= 0 ? videoDuration : 0;
  return { start: 0, end: duration, duration };
}

export function getClipPosition(data, currentTime, videoDuration = 0) {
  const range = getPlaybackRange(data, videoDuration);
  const elapsed = clamp(typeof currentTime === 'number' ? currentTime - range.start : 0, range.duration);
  return { ...range, elapsed, percent: range.duration > 0 ? elapsed / range.duration * 100 : 0 };
}

export function seekTimeForPercent(data, percent, videoDuration = 0) {
  const { start, duration } = getPlaybackRange(data, videoDuration);
  return start + clamp(percent, 100) / 100 * duration;
}

export function youtubeVideoOptions(videoId, data) {
  const start = validStart(data);
  const end = validEnd(data, start);
  const options = { videoId, startSeconds: start ?? 0 };
  if (end !== null) options.endSeconds = end;
  return options;
}
