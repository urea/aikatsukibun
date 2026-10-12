import { displayTitle } from './model.js';
import { VIDEO_DIFFICULTIES } from './add-video.js';

const titleOrder = new Intl.Collator('ja', { numeric: true, sensitivity: 'variant' });

export function normalizeLibrarySort(value) {
  return value === 'song-difficulty' ? value : 'posted';
}

export function sortVideoIds(ids, mode, getMetadata) {
  if (!Array.isArray(ids)) return [];
  if (normalizeLibrarySort(mode) === 'posted') return [...ids];
  return ids.map((id, index) => {
    const data = typeof getMetadata === 'function' ? getMetadata(id) : undefined;
    const title = typeof data?.title === 'string' && data.title.trim() ? displayTitle(data.title).normalize('NFKC').trim() : '';
    const level = VIDEO_DIFFICULTIES.indexOf(data?.difficulty);
    return { id, index, title, level: level > 0 ? level : VIDEO_DIFFICULTIES.length };
  }).sort((left, right) => {
    if (!left.title || !right.title) {
      if (!left.title && !right.title) return left.index - right.index;
      return left.title ? -1 : 1;
    }
    return titleOrder.compare(left.title, right.title) || left.level - right.level || left.index - right.index;
  }).map(({ id }) => id);
}
