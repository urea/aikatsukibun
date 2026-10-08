import { extractVideoId } from './model.js';

export const VIDEO_RESULTS = Object.freeze(['クリア', 'フルコンボ', 'オールパーフェクト']);
export const VIDEO_INPUT_LIMITS = Object.freeze({ url: 2048, title: 200, mode: 100, difficulty: 40, idol: 100, author: 200 });

const labels = { url: 'YouTube URL', title: '楽曲名', start: '開始時刻', end: '終了時刻', mode: 'モード', difficulty: '難易度', idol: 'アイドル', result: '成績', author: '投稿者' };

function readText(source, field, errors) {
  const value = typeof source[field] === 'string' ? source[field].trim() : '';
  if (!value) errors[field] = `${labels[field]}を入力してください。`;
  else if (VIDEO_INPUT_LIMITS[field] && value.length > VIDEO_INPUT_LIMITS[field]) errors[field] = `${labels[field]}は${VIDEO_INPUT_LIMITS[field]}文字以内で入力してください。`;
  return value;
}

function readTime(source, field, errors) {
  const value = readText(source, field, errors);
  if (errors[field]) return null;
  const minutes = /^(\d{1,3}):([0-5]\d)$/.exec(value);
  const hours = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (minutes) return Number(minutes[1]) * 60 + Number(minutes[2]);
  if (hours) return Number(hours[1]) * 3600 + Number(hours[2]) * 60 + Number(hours[3]);
  errors[field] = `${labels[field]}はM:SS（分1〜3桁）またはH:MM:SS（時1〜2桁）で入力してください。秒とH形式の分は00〜59です。`;
  return null;
}

function readVideoId(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return extractVideoId(url.href);
  } catch { return null; }
}

// 入力した楽曲情報を検証し、再生・保存で使う形式に変換する。
export function validateVideoInput(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const values = {};
  for (const field of ['url', 'title', 'mode', 'difficulty', 'idol', 'result', 'author']) values[field] = readText(source, field, errors);
  const startSeconds = readTime(source, 'start', errors);
  const endSeconds = readTime(source, 'end', errors);
  const id = errors.url ? null : readVideoId(values.url);
  if (!errors.url && !id) errors.url = '有効なYouTube動画のURLを入力してください。';
  if (!errors.result && !VIDEO_RESULTS.includes(values.result)) errors.result = '成績はクリア・フルコンボ・オールパーフェクトから選択してください。';
  if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) errors.end = '終了時刻は開始時刻より後にしてください。';
  const video = Object.keys(errors).length ? null : {
    id,
    title: values.title,
    startSeconds,
    endSeconds,
    mode: values.mode,
    difficulty: values.difficulty,
    idol: values.idol,
    result: values.result,
    author: values.author,
  };
  return { video, errors };
}
