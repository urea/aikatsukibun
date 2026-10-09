import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getPlaybackRange, getClipPosition, seekTimeForPercent, youtubeVideoOptions } from '../../Encore/clip.js';
import { isVideoId, formatTime } from '../../Encore/model.js';

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
function playerHarness() {
  const commands = [];
  const saved = [];
  const controls = new Map();
  const $ = name => {
    if (!controls.has(name)) controls.set(name, { value: '0', textContent: '', attributes: new Map(), listeners: new Map(), setAttribute(key, value) { this.attributes.set(key, value); }, addEventListener(event, listener) { this.listeners.set(event, listener); } });
    return controls.get(name);
  };
  const player = {
    time: 435, state: 1,
    getCurrentTime() { return this.time; },
    getDuration: () => 900,
    getPlayerState() { return this.state; },
    getVideoData: () => ({ video_id: id }),
    getVolume: () => 70,
    isMuted: () => false,
    loadVideoById(options) { commands.push({ type: 'load', options: { ...options } }); this.state = 3; },
    cueVideoById(options) { commands.push({ type: 'cue', options: { ...options } }); this.state = 5; },
    pauseVideo() { commands.push({ type: 'pause' }); this.state = 2; },
    playVideo() { commands.push({ type: 'play' }); this.state = 1; },
  };
  let timer;
  const context = vm.createContext({
    $, player, currentId: id, playerReady: true, playerFailed: false, queuedAutoplay: false, playerTimeout: undefined,
    clipEnded: false, seeking: false, lastRecordedId: undefined, history: [], panelId: null, libraryTab: 'all', libraryDialog: { open: false },
    metadata: { get: () => clip }, settings: { muted: false, videoVolume: 70 }, SETTINGS_KEY: 'test-settings',
    rangeFor: () => getPlaybackRange(clip), getClipPosition, seekTimeForPercent, youtubeVideoOptions, isVideoId, formatTime,
    setIcon: (control, value) => { control.icon = value; }, setStatus: value => { $('status').textContent = value; },
    save: (key, value) => saved.push({ key, value: structuredClone(value) }), syncMute: () => {}, syncSettings: () => {}, renderLibrary: () => {}, updateCurrent: () => {}, closePanel: () => {}, applyVideoVolume: () => {}, clearTimeout: () => {},
    setInterval(callback, milliseconds) { assert.equal(milliseconds, 300); timer = callback; },
  });
  const timerStart = source.indexOf('setInterval(() => {');
  const timerEnd = source.indexOf('}, 300);', timerStart) + '}, 300);'.length;
  assert.ok(timerStart >= 0 && timerEnd > timerStart);
  vm.runInContext([
    section('function finishClip()', 'function notice('),
    section('function selectVideo(', "$('shuffle').addEventListener"),
    section("$('play-toggle').addEventListener('click'", "$('seek').addEventListener('input'"),
    section("$('seek').addEventListener('change'", "$('seek').addEventListener('blur'"),
    section('function onPlayerReady(', 'function onPlayerStateChange('),
    section('function onPlayerStateChange(', 'function createPlayer()'),
    source.slice(timerStart, timerEnd),
  ].join('\n'), context);
  return {
    context, player, commands, saved, $,
    state(time, state = 1) { player.time = time; player.state = state; context.onPlayerStateChange({ data: state, target: player }); },
    tick(time, state = player.state) { player.time = time; player.state = state; timer(); },
    click() { $('play-toggle').listeners.get('click')(); },
    seek(percent, state) { $('seek').value = String(percent); player.state = state; $('seek').listeners.get('change')(); },
  };
}

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
