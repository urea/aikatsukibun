import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoInput, VIDEO_INPUT_LIMITS, VIDEO_RESULTS, VIDEO_MODES, VIDEO_DIFFICULTIES } from '../../Encore/add-video.js';

const input = {
  url: 'https://www.youtube.com/watch?v=tJAcDG-eS-Q',
  title: '君のEntrance',
  start: '7:31',
  end: '9:57',
  mode: 'アイカツ！オールスターモード',
  difficulty: '-',
  idol: 'マイキャラ',
  result: 'フルコンボ',
  author: 'cubewano@cubewano4',
};

test('楽曲区間と必須情報を保存形式に変換する', () => {
  const result = validateVideoInput(input);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.video, {
    id: 'tJAcDG-eS-Q', title: '君のEntrance', startSeconds: 451, endSeconds: 597,
    mode: 'アイカツ！オールスターモード', difficulty: '-', idol: 'マイキャラ', result: 'フルコンボ', author: 'cubewano@cubewano4',
  });
});

test('すべての必須項目で空白や非文字列を拒否し、未完成の動画を返さない', () => {
  for (const field of Object.keys(input)) {
    for (const value of ['', ' \t\n ', null, 0, undefined]) {
      const result = validateVideoInput({ ...input, [field]: value });
      assert.equal(result.video, null, `${field}: ${String(value)}`);
      assert.deepEqual(Object.keys(result.errors), [field]);
    }
  }
  for (const value of [undefined, null, [], 'invalid']) {
    const result = validateVideoInput(value);
    assert.equal(result.video, null);
    assert.equal(Object.keys(result.errors).length, Object.keys(input).length);
  }
});

test('前後の空白だけを除去し、自由入力とHTMLを文字列として保持する', () => {
  const padded = Object.fromEntries(Object.entries(input).map(([field, value]) => [field, `  ${value} \n`]));
  assert.deepEqual(validateVideoInput(padded), validateVideoInput(input));
  const result = validateVideoInput({ ...input, title: '<img src=x onerror=alert(1)>', idol: 'いちご / あかり' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.video.title, '<img src=x onerror=alert(1)>');
  assert.equal(result.video.idol, 'いちご / あかり');
});

test('テキストは上限ちょうどを許容し、超過時は切り捨てずエラーにする', () => {
  for (const field of ['title', 'idol', 'author']) {
    assert.ok(validateVideoInput({ ...input, [field]: 'あ'.repeat(VIDEO_INPUT_LIMITS[field]) }).video);
    const result = validateVideoInput({ ...input, [field]: 'あ'.repeat(VIDEO_INPUT_LIMITS[field] + 1) });
    assert.equal(result.video, null);
    assert.deepEqual(Object.keys(result.errors), [field]);
  }
  const longUrl = `${input.url}&ignored=${'a'.repeat(VIDEO_INPUT_LIMITS.url)}`;
  assert.equal(validateVideoInput({ ...input, url: longUrl }).video, null);
  assert.ok(validateVideoInput({ ...input, url: longUrl }).errors.url);
});

test('0分0秒、時間形式、桁上限の時刻を正しい秒数として扱う', () => {
  for (const [start, end, startSeconds, endSeconds] of [
    ['0:00', '0:01', 0, 1],
    ['00:00', '00:01', 0, 1],
    ['0:00:00', '0:00:01', 0, 1],
    ['1:02:03', '1:04:05', 3723, 3845],
    ['998:59', '999:59', 59939, 59999],
    ['98:59:59', '99:59:59', 356399, 359999],
  ]) {
    const result = validateVideoInput({ ...input, start, end });
    assert.deepEqual(result.errors, {}, `${start}〜${end}`);
    assert.equal(result.video.startSeconds, startSeconds);
    assert.equal(result.video.endSeconds, endSeconds);
  }
});

test('秒60以上、時間形式の分60以上、省略された桁や余分な文字を拒否する', () => {
  for (const value of ['7:60', '7:99', '1:60:00', '1:00:60', '7:1', '1:1:00', '1:00:1', '7', '7.5', '7:31.5', '-1:00', '+1:00', '7 :31', '7:31秒', '７:３１', '1000:00', '100:00:00', '1:00:000']) {
    for (const field of ['start', 'end']) {
      const result = validateVideoInput({ ...input, [field]: value });
      assert.equal(result.video, null, `${field}: ${value}`);
      assert.deepEqual(Object.keys(result.errors), [field]);
    }
  }
});

test('開始と終了が等しい区間と逆転した区間を拒否する', () => {
  for (const end of ['7:31', '7:30', '0:00']) {
    const result = validateVideoInput({ ...input, end });
    assert.equal(result.video, null);
    assert.deepEqual(Object.keys(result.errors), ['end']);
  }
});

test('成績は指定された3種類だけを許容する', () => {
  assert.deepEqual(VIDEO_RESULTS, ['クリア', 'フルコンボ', 'オールパーフェクト']);
  for (const result of VIDEO_RESULTS) assert.equal(validateVideoInput({ ...input, result }).video.result, result);
  for (const result of ['未クリア', 'パーフェクト', '-', 'FULL COMBO']) {
    const checked = validateVideoInput({ ...input, result });
    assert.equal(checked.video, null);
    assert.deepEqual(Object.keys(checked.errors), ['result']);
  }
});

test('モードは指定された4種類だけを許容し、表記をそのまま保存する', () => {
  assert.deepEqual(VIDEO_MODES, ['テレビアニメアイカツ！モード', 'アイカツ！オールスターモード', 'じゆうにアイカツ！モード', 'きかんげんていライブ！モード']);
  for (const mode of VIDEO_MODES) assert.equal(validateVideoInput({ ...input, mode }).video.mode, mode);
  for (const mode of ['追加モード', 'テレビアニメモード', '期間限定ライブ！モード']) {
    const result = validateVideoInput({ ...input, mode });
    assert.equal(result.video, null);
    assert.deepEqual(Object.keys(result.errors), ['mode']);
  }
});

test('難易度は指定された4種類だけを許容し、未選択をエラーにする', () => {
  assert.deepEqual(VIDEO_DIFFICULTIES, ['-', 'かんたん', 'ふつう', 'むずかしい']);
  for (const difficulty of VIDEO_DIFFICULTIES) {
    const result = validateVideoInput({ ...input, difficulty });
    assert.deepEqual(result.errors, {});
    assert.equal(result.video.difficulty, difficulty);
  }
  for (const difficulty of ['★5', '簡単', '普通', '難しい', '未設定']) {
    const result = validateVideoInput({ ...input, difficulty });
    assert.equal(result.video, null);
    assert.deepEqual(Object.keys(result.errors), ['difficulty']);
  }
  assert.equal(validateVideoInput({ ...input, difficulty: '' }).errors.difficulty, '難易度を選択してください。');
});

test('共有URL・Shorts・埋め込みURLから同じYouTube動画を抽出する', () => {
  for (const url of [
    input.url,
    'https://youtu.be/tJAcDG-eS-Q?si=example',
    'https://www.youtube.com/shorts/tJAcDG-eS-Q',
    'https://m.youtube.com/watch?v=tJAcDG-eS-Q&t=451s',
    'https://music.youtube.com/watch?v=tJAcDG-eS-Q',
    'https://www.youtube-nocookie.com/embed/tJAcDG-eS-Q',
    'https://www.youtube.com/live/tJAcDG-eS-Q',
    'youtube.com/watch?v=tJAcDG-eS-Q',
  ]) {
    const result = validateVideoInput({ ...input, url });
    assert.deepEqual(result.errors, {}, url);
    assert.equal(result.video.id, 'tJAcDG-eS-Q');
  }
});

test('外部ホスト・偽装ホスト・資格情報入り・不正IDを動画URLとして拒否する', () => {
  for (const url of [
    'tJAcDG-eS-Q',
    'https://example.com/watch?v=tJAcDG-eS-Q',
    'https://www.youtube.com.evil.test/watch?v=tJAcDG-eS-Q',
    'https://youtube.com@evil.test/watch?v=tJAcDG-eS-Q',
    'https://name:password@youtube.com/watch?v=tJAcDG-eS-Q',
    'https://evil.test/?next=https://youtube.com/watch?v=tJAcDG-eS-Q',
    'ftp://youtube.com/watch?v=tJAcDG-eS-Q',
    'javascript:alert(1)',
    'https://youtube.com/watch?v=short',
    'https://youtube.com/watch?v=tJAcDG-eS-Qx',
    'https://youtube.com/playlist?list=tJAcDG-eS-Q',
  ]) {
    const result = validateVideoInput({ ...input, url });
    assert.equal(result.video, null, url);
    assert.deepEqual(Object.keys(result.errors), ['url']);
  }
});
