import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getPlaybackRange, getClipPosition, seekTimeForPercent, youtubeVideoOptions } from '../../Encore/clip.js';
import { isVideoId, isEntryId, videoIdFor, formatTime, displayTitle } from '../../Encore/model.js';
import { createPlaybackSession } from '../../Encore/playback-session.js';

const source = readFileSync(new URL('../../Encore/main.js', import.meta.url), 'utf8');
const clip = { startSeconds: 435, endSeconds: 531 };
const id = 'lTLqkpcqWs8';

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `main.jsの処理を取得できる: ${start}`);
  return source.slice(from, to);
}

// 実main.jsのイベント処理・周期処理を、時刻を制御できるYouTube代替とDOM代替で実行する。
// ロードが開始位置の直前を返す状況でも、再生を自分でリセットしないことを確認する。
function playerHarness(data = clip, entryId = id) {
  const commands = [];
  const saved = [];
  const entries = new Map([[entryId, data]]);
  const playbackSession = createPlaybackSession();
  const controls = new Map();
  const $ = name => {
    if (!controls.has(name)) controls.set(name, { value: '0', textContent: '', attributes: new Map(), listeners: new Map(), setAttribute(key, value) { this.attributes.set(key, value); }, removeAttribute(key) { this.attributes.delete(key); }, addEventListener(event, listener) { this.listeners.set(event, listener); } });
    return controls.get(name);
  };
  const player = {
    time: data.startSeconds ?? 0, state: 1, videoId: videoIdFor(entryId, data), duration: 900,
    getCurrentTime() { return this.time; },
    getDuration() { return this.duration; },
    getPlayerState() { return this.state; },
    getVideoData() { return { video_id: this.videoId }; },
    getVolume: () => 70,
    isMuted: () => false,
    loadVideoById(options) { commands.push({ type: 'load', options: { ...options } }); this.state = 3; this.videoId = options.videoId; context.onPlayerStateChange({ data: 3, target: this }); },
    cueVideoById(options) { commands.push({ type: 'cue', options: { ...options } }); this.state = 5; this.time = options.startSeconds; this.videoId = options.videoId; context.onPlayerStateChange({ data: 5, target: this }); },
    pauseVideo() { commands.push({ type: 'pause' }); this.state = 2; },
    playVideo() { commands.push({ type: 'play' }); this.state = 1; },
    seekTo(time, allowSeekAhead) { commands.push({ type: 'seek', time, allowSeekAhead }); this.time = time; },
  };
  let timer;
  const context = vm.createContext({
    $, player, currentId: entryId, playerReady: true, playerFailed: false, queuedAutoplay: false, playerTimeout: undefined,
    clipEnded: false, seeking: false, lastRecordedId: undefined, history: [], panelId: null, libraryTab: 'all', libraryDialog: { open: false },
    metadata: { get: key => entries.get(key) }, settings: { muted: false, videoVolume: 70 }, SETTINGS_KEY: 'test-settings',
    rangeFor: key => getPlaybackRange(entries.get(key), player.duration), getClipPosition, seekTimeForPercent, youtubeVideoOptions, isVideoId, isEntryId, formatTime, displayTitle,
    playbackSession, youtubeIdFor: key => videoIdFor(key, entries.get(key)),
    allIds: () => [...entries.keys()], videoIds: [id], sharedVideos: [], pendingSharedVideoId: null,
    titleFor: key => entries.get(key)?.title || `動画 (${key})`, renderDetails: () => {}, updateFavorite: () => {},
    setIcon: (control, value) => { control.icon = value; }, setStatus: value => { $('status').textContent = value; },
    notice: value => { $('notice').textContent = value; },
    save: (key, value) => saved.push({ key, value: structuredClone(value) }), syncMute: () => {}, syncSettings: () => {}, renderLibrary: () => {}, closePanel: () => {}, applyVideoVolume: () => {}, clearTimeout: () => {},
    setInterval(callback, milliseconds) { assert.equal(milliseconds, 300); timer = callback; },
  });
  const timerStart = source.indexOf('setInterval(() => {');
  const timerEnd = source.indexOf('}, 300);', timerStart) + '}, 300);'.length;
  assert.ok(timerStart >= 0 && timerEnd > timerStart);
  vm.runInContext([
    section('function updateCurrent()', 'function syncEditedRange('),
    section('function finishClip()', 'function notice('),
    section('function selectVideo(', "$('shuffle').addEventListener"),
    section("$('play-toggle').addEventListener('click'", "$('seek').addEventListener('input'"),
    section("$('seek').addEventListener('input'", "$('seek').addEventListener('change'"),
    section("$('seek').addEventListener('change'", "$('seek').addEventListener('blur'"),
    section('function onPlayerReady(', 'function onPlayerStateChange('),
    section('function onPlayerStateChange(', 'function createPlayer()'),
    source.slice(timerStart, timerEnd),
  ].join('\n'), context);
  playbackSession.begin(entryId, player.videoId, player.time);
  playbackSession.accept(entryId, player.videoId, 1, player.time);
  return {
    context, player, commands, saved, $, entries,
    state(time, state = 1) { player.time = time; player.state = state; context.onPlayerStateChange({ data: state, target: player }); },
    tick(time, state = player.state) { player.time = time; player.state = state; timer(); },
    click() { $('play-toggle').listeners.get('click')(); },
    seek(percent, state) { $('seek').value = String(percent); player.state = state; $('seek').listeners.get('change')(); },
  };
}

test('元動画が不明の曲は再生とシークを無効にし、直接イベントを呼んでも旧動画を操作しない', () => {
  const harness = playerHarness();
  harness.tick(480, 2);
  assert.equal(harness.$('seek').disabled, false);
  harness.context.selectVideo(`clip_${'f'.repeat(32)}`);
  assert.equal(harness.$('play-toggle').disabled, true);
  assert.equal(harness.$('seek').disabled, true);
  assert.equal(harness.$('youtube-player').hidden, true);
  assert.match(harness.$('notice').textContent, /楽曲情報を取得できません/);
  harness.click();
  harness.$('seek').listeners.get('input')();
  assert.equal(harness.context.seeking, false);
  harness.context.seeking = true;
  assert.doesNotThrow(() => harness.seek(50, 2));
  assert.equal(harness.context.seeking, false);
  harness.tick(480, 2);
  assert.equal(harness.$('seek').disabled, true);
  assert.deepEqual(harness.commands, []);

  // 前のプレーヤーの準備完了通知が遅れても、無効な操作を再び有効にしない。
  harness.context.onPlayerReady({ target: harness.player });
  assert.equal(harness.$('play-toggle').disabled, true);
  assert.deepEqual(harness.commands, []);

  harness.context.selectVideo(id);
  harness.state(435, 1);
  harness.tick(435, 1);
  assert.equal(harness.$('play-toggle').disabled, false);
  assert.equal(harness.$('seek').disabled, false);
});

test('終了空欄の100%シークも明示終了し、直接ENDEDが届いてもpendingを残さず開始位置から再生できる', () => {
  const entryId = `clip_${'c'.repeat(32)}`;
  for (const [data, key] of [
    [{ startSeconds: null, endSeconds: null }, id],
    [{ startSeconds: 435, endSeconds: null }, id],
    [{ videoId: id, startSeconds: 111, endSeconds: null }, entryId],
  ]) {
    for (const state of [1, 2]) {
      const harness = playerHarness(data, key);
      harness.seek(100, state);
      assert.deepEqual(harness.commands, [{ type: 'cue', options: { videoId: id, startSeconds: 899.99 } }, { type: 'pause' }]);
      assert.equal(harness.context.playbackSession.pending, false);
      assert.equal(harness.context.clipEnded, true);
      harness.state(900, 0);
      harness.tick(900, 0);
      assert.equal(harness.$('seek').value, '100');
      assert.equal(harness.$('current-time').textContent, formatTime(900 - (data.startSeconds ?? 0)));
      assert.equal(harness.$('play-toggle').icon, 'replay');
      assert.equal(harness.context.playbackSession.pending, false);
      harness.click();
      assert.deepEqual(harness.commands.at(-1), { type: 'load', options: { videoId: id, startSeconds: data.startSeconds ?? 0 } });
      harness.state(data.startSeconds ?? 0, 1);
      assert.equal(harness.context.playbackSession.pending, false);
      assert.equal(harness.context.clipEnded, false);
    }
  }
});

test('時刻両空欄は先頭から全体をcueし、実動画の長さでシークする', () => {
  const harness = playerHarness({ startSeconds: null, endSeconds: null });
  harness.context.onPlayerReady({ target: harness.player });
  assert.deepEqual(harness.commands, [{ type: 'cue', options: { videoId: id, startSeconds: 0 } }]);
  harness.seek(50, 2);
  assert.deepEqual(harness.commands.at(-1), { type: 'seek', time: 450, allowSeekAhead: true });
  harness.tick(450, 2);
  assert.equal(harness.$('current-time').textContent, '7:30');
  assert.equal(harness.$('duration').textContent, '15:00');
});

test('同じ元動画の前後区間を切り替えても旧時刻・PLAYING・ENDEDで停止や再ロードをしない', () => {
  const first = `clip_${'1'.repeat(32)}`;
  const second = `clip_${'2'.repeat(32)}`;
  const sourceId = 'XTAE6nTGf3w';
  const harness = playerHarness({ videoId: sourceId, startSeconds: 0, endSeconds: 111 }, first);
  harness.entries.set(second, { videoId: sourceId, startSeconds: 111, endSeconds: 195 });
  harness.context.selectVideo(second);
  harness.state(50, 1);
  harness.state(111, 0);
  harness.tick(50, 1);
  assert.equal(harness.commands.length, 1);
  assert.deepEqual(harness.commands[0], { type: 'load', options: { videoId: sourceId, startSeconds: 111, endSeconds: 195 } });
  assert.deepEqual(harness.context.history, []);
  assert.equal(harness.context.clipEnded, false);
  harness.state(111, 1);
  assert.deepEqual(Array.from(harness.context.history), [second]);
  harness.context.selectVideo(first);
  const count = harness.commands.length;
  harness.state(160, 1);
  harness.state(195, 0);
  harness.tick(160, 1);
  assert.equal(harness.commands.length, count);
  assert.equal(harness.context.clipEnded, false);
  harness.state(0, 1);
  assert.deepEqual(Array.from(harness.context.history), [first, second]);
  harness.state(30, 0);
  assert.equal(harness.context.clipEnded, false);
  harness.state(111, 0);
  assert.equal(harness.context.clipEnded, true);
});

test('終了だけ空欄でも開始位置・相対時刻・開始前シークの補正を保つ', () => {
  const harness = playerHarness({ startSeconds: 435, endSeconds: null });
  harness.context.onPlayerReady({ target: harness.player });
  assert.deepEqual(harness.commands[0], { type: 'cue', options: { videoId: id, startSeconds: 435 } });
  harness.tick(480, 1);
  assert.equal(harness.$('current-time').textContent, '0:45');
  assert.equal(harness.$('duration').textContent, '7:45');
  harness.seek(50, 2);
  assert.deepEqual(harness.commands.at(-1), { type: 'seek', time: 667.5, allowSeekAhead: true });
  harness.tick(667.5, 2);
  harness.state(120, 1);
  assert.deepEqual(harness.commands.at(-1), { type: 'load', options: { videoId: id, startSeconds: 435 } });
});

test('開始だけ空欄は0秒開始し、指定された終了時刻で停止する', () => {
  const harness = playerHarness({ startSeconds: null, endSeconds: 96 });
  harness.context.onPlayerReady({ target: harness.player });
  assert.deepEqual(harness.commands[0], { type: 'cue', options: { videoId: id, startSeconds: 0, endSeconds: 96 } });
  harness.state(96, 1);
  assert.deepEqual(harness.commands.at(-1), { type: 'pause' });
  assert.equal(harness.context.clipEnded, true);
  assert.equal(harness.$('current-time').textContent, '1:36');
});

test('435秒の開始直前を返すキーフレームでも再ロードせず通常の再生進行と履歴を保つ', () => {
  for (const start of [434.8, 434.999, 435]) {
    const harness = playerHarness();
    harness.state(start);
    harness.tick(start);
    for (const time of [435.1, 435.4, 435.7, 436.2]) { harness.state(time); harness.tick(time); }
    assert.deepEqual(harness.commands, [], `開始位置${start}から進行する間、ロード・停止をしない`);
    assert.equal(harness.$('current-time').textContent, '0:01');
    assert.ok(Number(harness.$('seek').value) > 0);
    assert.equal(harness.saved.filter(item => item.key === 'hist_ids').length, 1);
    assert.deepEqual(harness.saved.find(item => item.key === 'hist_ids').value, [id]);
  }
});

test('開始直前のPLAYINGと周期通知が繰り返されてもロードを反復しない', () => {
  const harness = playerHarness();
  for (let index = 0; index < 10; index++) { harness.state(434.8); harness.tick(434.8); }
  assert.deepEqual(harness.commands, []);
  assert.equal(harness.$('current-time').textContent, '0:00');
  assert.equal(harness.$('duration').textContent, '1:36');
});

test('531秒の区間終了は状態通知でも周期処理でも停止し、終了表示を保つ', () => {
  for (const method of ['state', 'tick']) {
    const harness = playerHarness();
    harness[method](531, 1);
    assert.deepEqual(harness.commands, [{ type: 'pause' }]);
    assert.equal(harness.context.clipEnded, true);
    assert.equal(harness.$('current-time').textContent, '1:36');
    assert.equal(harness.$('seek').value, '100');
    assert.equal(harness.$('play-toggle').icon, 'replay');
    harness.tick(531);
    assert.equal(harness.commands.length, 1);
  }
});

test('バッファリング中は開始直前や終了位置でもロード・停止しない', () => {
  const harness = playerHarness();
  for (const time of [0, 434.8, 531]) { harness.state(time, 3); harness.tick(time, 3); }
  assert.deepEqual(harness.commands, []);
  assert.equal(harness.$('status').textContent, '動画を読み込み中…');
});

test('標準操作バーで楽曲開始より前へ移動した再生だけ、区間指定で先頭へ戻す', () => {
  for (const method of ['state', 'tick']) {
    const harness = playerHarness();
    harness[method](120, 1);
    assert.deepEqual(harness.commands, [{ type: 'load', options: { videoId: id, startSeconds: 435, endSeconds: 531 } }]);
    harness.tick(120, 3);
    harness.state(434.8, 1);
    harness.tick(435.2, 1);
    assert.equal(harness.commands.length, 1, 'バッファリングと開始直前の時刻差で再ロードを繰り返さない');
  }
});

test('選曲中の旧動画の時刻では、新しい動画の開始前補正を行わない', () => {
  const harness = playerHarness();
  harness.player.getVideoData = () => ({ video_id: 'tJAcDG-eS-Q' });
  harness.state(120, 1);
  harness.tick(120, 1);
  assert.deepEqual(harness.commands, []);
});

test('終了後に標準操作バーで停止したまま区間内へ戻したら終了表示を解除する', () => {
  for (const method of ['state', 'tick']) {
    const harness = playerHarness();
    harness.state(531, 1);
    assert.equal(harness.context.clipEnded, true);
    harness[method](480, 2);
    harness.tick(480, 2);
    assert.equal(harness.context.clipEnded, false);
    assert.equal(harness.$('current-time').textContent, '0:45');
    assert.notEqual(harness.$('seek').value, '100');
    assert.equal(harness.$('play-toggle').attributes.get('aria-label'), '再生');
    harness.click();
    assert.deepEqual(harness.commands, [{ type: 'pause' }, { type: 'play' }]);
  }
});

test('100%シークの終端直前cueに続くPAUSED通知でも終了状態を維持する', () => {
  const harness = playerHarness();
  harness.seek(100, 2);
  harness.state(530.99, 2);
  harness.tick(530.99, 2);
  assert.equal(harness.context.clipEnded, true);
  assert.equal(harness.$('current-time').textContent, '1:36');
  assert.equal(harness.$('seek').value, '100');
  harness.click();
  assert.deepEqual(harness.commands.at(-1), { type: 'load', options: { videoId: id, startSeconds: 435, endSeconds: 531 } });
});

test('準備時のcue、選曲時のload、自動再生のloadは開始435秒・終了531秒を渡す', () => {
  const expected = { videoId: id, startSeconds: 435, endSeconds: 531 };
  const cue = playerHarness();
  cue.context.onPlayerReady({ target: cue.player });
  assert.deepEqual(cue.commands, [{ type: 'cue', options: expected }]);
  const selection = playerHarness();
  selection.context.selectVideo(id);
  assert.deepEqual(selection.commands, [{ type: 'load', options: expected }]);
  const autoplay = playerHarness();
  autoplay.context.queuedAutoplay = true;
  autoplay.context.onPlayerReady({ target: autoplay.player });
  assert.deepEqual(autoplay.commands, [{ type: 'load', options: expected }]);
});

test('一時停止と再開は同じ動画を維持し、終了後の再生は区間指定で開始する', () => {
  const harness = playerHarness();
  harness.click();
  harness.click();
  assert.deepEqual(harness.commands, [{ type: 'pause' }, { type: 'play' }]);
  harness.state(531, 0);
  harness.click();
  assert.deepEqual(harness.commands.at(-1), { type: 'load', options: { videoId: id, startSeconds: 435, endSeconds: 531 } });
});

test('区間内シークは停止中cue・再生中loadの両方で終了位置を保持する', () => {
  for (const [state, type] of [[2, 'cue'], [1, 'load']]) {
    const harness = playerHarness();
    harness.seek(50, state);
    assert.deepEqual(harness.commands, [{ type, options: { videoId: id, startSeconds: 483, endSeconds: 531 } }]);
  }
});
