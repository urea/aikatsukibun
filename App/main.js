import videoIds from './videos.json';
import { DEFAULT_VIDEO_ID, SETTINGS_KEY, isVideoId, uniqueIds, extractVideoId, readSaved, normalizeCustomVideos, normalizeSettings, chooseRandom, formatTime, displayTitle } from './model.js';
import { icon, setIcon, mountIcons } from './icons.js';
import { createTapAudio } from './tap-audio.js';
import { createPadInput, PAD_KEYS } from './pad-input.js';
import { createMetadata } from './metadata.js';

const $ = id => document.getElementById(id);
mountIcons();
let storage;
try { storage = window.localStorage; } catch { /* 保存不可でも利用できる。 */ }
let saveWarningShown = false;
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}
function save(key, value, warn = true) {
  try { storage.setItem(key, JSON.stringify(value)); }
  catch {
    if (warn && !saveWarningShown) { toast('このブラウザーでは保存できません。変更は今回のみ有効です。'); saveWarningShown = true; }
  }
}

let favorites = uniqueIds(readSaved(storage, 'fav_ids', []));
let history = uniqueIds(readSaved(storage, 'hist_ids', [])).slice(0, 30);
const customVideos = normalizeCustomVideos(readSaved(storage, 'custom_videos', []));
const settings = normalizeSettings(readSaved(storage, SETTINGS_KEY, {}));
const metadata = createMetadata(storage, save);
customVideos.forEach(video => metadata.seed(video.id, video.title));
const lastVideo = readSaved(storage, 'aikatsu_last_video_v2', null);
let currentId = isVideoId(lastVideo) ? lastVideo : DEFAULT_VIDEO_ID;
let panelId = null;
let panelOpener;
let libraryTab = 'all';
let player;
let playerReady = false;
let queuedAutoplay = false;
let playerFailed = false;
let seeking = false;
let lastRecordedId;
let libraryRenderTimer;
const unplayable = new Set();
const allIds = () => uniqueIds([...customVideos.map(video => video.id), ...videoIds, ...favorites, ...history]);
const titleFor = id => metadata.get(id)?.title || `動画 (${id})`;

function updateFavorite(button, id) {
  const active = favorites.includes(id);
  button.classList.toggle('is-favorite', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', `${active ? 'お気に入りから外す' : 'お気に入りに追加'}${button.id ? '' : `：${displayTitle(titleFor(id))}`}`);
}
function updateCurrent() {
  const title = displayTitle(titleFor(currentId));
  $('current-title').textContent = title;
  $('current-title').title = titleFor(currentId);
  $('youtube-player').title = title;
  $('youtube-link').href = `https://www.youtube.com/watch?v=${currentId}`;
  updateFavorite($('favorite-current'), currentId);
}
function toggleFavorite(id) {
  const removing = favorites.includes(id);
  favorites = removing ? favorites.filter(value => value !== id) : [id, ...favorites];
  save('fav_ids', favorites);
  updateCurrent();
  if (panelId === 'library-panel') renderLibrary();
  toast(removing ? 'お気に入りから外しました' : 'お気に入りに追加しました');
}
$('favorite-current').addEventListener('click', () => toggleFavorite(currentId));

function closePanel() {
  document.querySelectorAll('.side-panel').forEach(panel => { panel.hidden = true; });
  $('controller').hidden = false;
  $('control-slot').classList.remove('panel-open');
  $('open-library').setAttribute('aria-expanded', 'false');
  $('open-settings').setAttribute('aria-expanded', 'false');
  panelId = null;
  panelOpener?.focus({ preventScroll: true });
}
function openPanel(id, opener) {
  clearPads();
  if (!panelId) panelOpener = opener || document.activeElement;
  panelId = id;
  document.querySelectorAll('.side-panel').forEach(panel => { panel.hidden = panel.id !== id; });
  $('controller').hidden = true;
  $('control-slot').classList.add('panel-open');
  $('open-library').setAttribute('aria-expanded', String(['library-panel', 'add-panel'].includes(id)));
  $('open-settings').setAttribute('aria-expanded', String(['settings-panel', 'help-panel'].includes(id)));
  if (id === 'library-panel') { renderLibrary(); hydrateMissingTitles(); }
  if (id === 'settings-panel') syncSettings();
  const focusTarget = id === 'library-panel' ? $('video-search') : id === 'add-panel' ? $('add-url') : $(id).querySelector('[data-close]');
  // スマホで自動的にキーボードを開かず、動画の位置も維持する。
  const pointerIsCoarse = matchMedia('(pointer: coarse)').matches;
  (pointerIsCoarse && focusTarget.tagName === 'INPUT' ? $(id).querySelector('[data-close]') : focusTarget).focus({ preventScroll: true });
}
$('open-library').addEventListener('click', event => openPanel('library-panel', event.currentTarget));
$('open-settings').addEventListener('click', event => openPanel('settings-panel', event.currentTarget));
$('open-help').addEventListener('click', () => openPanel('help-panel'));
$('open-add').addEventListener('click', () => { $('add-message').textContent = ''; openPanel('add-panel'); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closePanel));
document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => openPanel(button.dataset.back)));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && panelId) { event.preventDefault(); closePanel(); } });

const rows = new Map();
function rowFor(id) {
  if (rows.has(id)) return rows.get(id);
  const row = document.createElement('li');
  row.className = 'video-row';
  const select = document.createElement('button');
  select.type = 'button'; select.className = 'video-select';
  const image = document.createElement('img');
  image.className = 'video-thumbnail'; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
  image.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const words = document.createElement('span'); words.className = 'video-words';
  const title = document.createElement('span'); title.className = 'video-title';
  const subtitle = document.createElement('span'); subtitle.className = 'video-subtitle';
  words.append(title, subtitle); select.append(image, words);
  select.addEventListener('click', () => selectVideo(id));
  const favorite = document.createElement('button');
  favorite.type = 'button'; favorite.className = 'icon-button'; favorite.innerHTML = icon('star');
  favorite.addEventListener('click', () => toggleFavorite(id));
  row.append(select, favorite);
  const entry = { row, select, title, subtitle, favorite };
  rows.set(id, entry);
  return entry;
}
function renderLibrary() {
  const ids = libraryTab === 'favorites' ? favorites : libraryTab === 'history' ? history : allIds();
  const query = $('video-search').value.normalize('NFKC').toLocaleLowerCase().trim();
  const matching = ids.filter(id => `${titleFor(id)} ${metadata.get(id)?.author || ''} ${id}`.normalize('NFKC').toLocaleLowerCase().includes(query));
  const visibleIds = new Set(matching);
  for (const [id, entry] of rows) if (!visibleIds.has(id)) entry.row.remove();
  matching.forEach((id, index) => {
    const entry = rowFor(id);
    entry.title.textContent = displayTitle(titleFor(id));
    entry.select.title = titleFor(id);
    entry.select.setAttribute('aria-label', `${displayTitle(titleFor(id))}を再生`);
    entry.subtitle.textContent = id === currentId ? '選択中' : metadata.get(id)?.author || (metadata.failed.has(id) ? '動画情報を取得できません' : 'YouTube');
    entry.row.classList.toggle('is-current', id === currentId);
    updateFavorite(entry.favorite, id);
    // メタデータの更新時も、フォーカスとスクロール位置を保つ。
    const expected = $('video-list').children[index];
    if (expected !== entry.row) $('video-list').insertBefore(entry.row, expected || null);
  });
  $('library-count').textContent = `${matching.length}曲${query ? ` / ${ids.length}曲` : ''}`;
  $('library-empty').hidden = matching.length > 0;
  $('library-empty').textContent = query ? '見つかりませんでした。別のキーワードを試してください。' : libraryTab === 'favorites' ? '星を押して、お気に入りを追加しましょう。' : libraryTab === 'history' ? '動画を再生すると、ここに履歴が残ります。' : '動画がありません。';
}
function scheduleLibraryRender() {
  clearTimeout(libraryRenderTimer);
  libraryRenderTimer = setTimeout(() => { if (panelId === 'library-panel') renderLibrary(); }, 100);
}
let hydrating = false;
async function hydrateMissingTitles() {
  if (hydrating) return;
  const missing = allIds().filter(id => !metadata.get(id) && !metadata.failed.has(id));
  if (!missing.length) return;
  hydrating = true;
  $('metadata-status').textContent = '曲名を確認中…';
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length && panelId === 'library-panel') {
      const id = missing[cursor++];
      try { await metadata.fetch(id); } catch { metadata.failed.add(id); }
      if (id === currentId) updateCurrent();
      scheduleLibraryRender();
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker));
  hydrating = false;
  $('metadata-status').textContent = '';
}
function switchTab(tab) {
  libraryTab = tab;
  document.querySelectorAll('[data-library]').forEach(button => {
    const selected = button.dataset.library === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('library-results').setAttribute('aria-labelledby', `tab-${tab}`);
  $('library-results').scrollTop = 0;
  renderLibrary();
}
document.querySelectorAll('[data-library]').forEach(button => {
  button.tabIndex = button.dataset.library === 'all' ? 0 : -1;
  button.addEventListener('click', () => switchTab(button.dataset.library));
  button.addEventListener('keydown', event => {
    const tabs = ['all', 'favorites', 'history'];
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'all' : event.key === 'End' ? 'history' : tabs[(tabs.indexOf(libraryTab) + offset + 3) % 3];
    switchTab(next); $(`tab-${next}`).focus();
  });
});
$('video-search').addEventListener('input', renderLibrary);

$('add-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = extractVideoId($('add-url').value);
  const message = $('add-message');
  message.classList.remove('is-error');
  if (!id) { message.textContent = 'YouTubeの動画URLを入力してください。'; message.classList.add('is-error'); $('add-url').focus(); return; }
  $('add-submit').disabled = true;
  message.textContent = '動画を確認中…';
  try {
    const video = await metadata.fetch(id);
    if (!customVideos.some(item => item.id === id) && !videoIds.includes(id)) {
      customVideos.unshift({ id, title: video.title }); save('custom_videos', customVideos);
    }
    if (!favorites.includes(id)) { favorites.unshift(id); save('fav_ids', favorites); }
    $('add-url').value = ''; message.textContent = '';
    // 確認中に別画面へ移動した場合は、再生中の曲を切り替えない。
    if (panelId === 'add-panel') selectVideo(id);
    toast('お気に入りに追加しました');
  } catch (error) {
    message.textContent = error.name === 'AbortError' || error instanceof TypeError ? '動画情報を取得できませんでした。通信を確認して、もう一度お試しください。' : error.message;
    message.classList.add('is-error');
  } finally { $('add-submit').disabled = false; }
});

function iframeUrl(id) {
  const parameters = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', origin: location.origin });
  return `https://www.youtube.com/embed/${id}?${parameters}`;
}
function setStatus(message) { $('playback-status').textContent = message; }
function notice(message, retry = false) {
  $('player-notice-text').textContent = message;
  $('player-notice').hidden = false;
  $('retry-player').hidden = !retry;
}
function selectVideo(id) {
  if (!isVideoId(id)) return;
  currentId = id;
  lastRecordedId = null;
  playerFailed = false;
  save('aikatsu_last_video_v2', id);
  $('player-notice').hidden = true;
  $('seek').value = '0'; $('current-time').textContent = '0:00'; $('duration').textContent = '0:00';
  setStatus('動画を読み込み中…');
  updateCurrent();
  if (panelId) closePanel();
  if (playerReady) player.loadVideoById(id);
  else {
    // APIの準備が終わった際に、最後に選択された動画を再生する。
    queuedAutoplay = true;
    if (!player) $('youtube-player').src = iframeUrl(id);
  }
  if (!metadata.get(id)) metadata.fetch(id).then(() => { if (id === currentId) updateCurrent(); }).catch(() => {});
}
$('shuffle').addEventListener('click', () => {
  const candidates = allIds().filter(id => metadata.get(id) && !unplayable.has(id));
  const id = chooseRandom(candidates, currentId, history.slice(0, 8));
  if (id) selectVideo(id);
  else toast('再生できる候補がありません。「選ぶ」から動画を追加してください。');
});
$('play-toggle').addEventListener('click', () => {
  if (!playerReady) return;
  if (player.getPlayerState() === 1) player.pauseVideo();
  else player.playVideo();
});
$('seek').addEventListener('input', () => {
  seeking = true;
  $('current-time').textContent = formatTime(Number($('seek').value) / 100 * (playerReady ? player.getDuration() : 0));
});
$('seek').addEventListener('change', () => {
  if (playerReady) player.seekTo(Number($('seek').value) / 100 * player.getDuration(), true);
  seeking = false;
});
$('seek').addEventListener('blur', () => { seeking = false; });
$('retry-player').addEventListener('click', () => location.reload());
$('replay').addEventListener('click', () => { if (playerReady) { player.seekTo(0, true); player.playVideo(); } else selectVideo(currentId); closePanel(); });

function syncMute() {
  setIcon($('mute-toggle'), settings.muted || settings.videoVolume === 0 ? 'mute' : 'volume');
  $('mute-toggle').setAttribute('aria-label', settings.muted ? '動画のミュートを解除' : '動画をミュート');
  $('mute-toggle').setAttribute('aria-pressed', String(settings.muted));
}
function applyVideoVolume() {
  if (playerReady) { player.setVolume(settings.videoVolume); settings.muted ? player.mute() : player.unMute(); }
  syncMute();
}
$('mute-toggle').addEventListener('click', () => { settings.muted = !settings.muted; applyVideoVolume(); save(SETTINGS_KEY, settings); });

$('youtube-player').src = iframeUrl(currentId);
updateCurrent();
if (!metadata.get(currentId)) metadata.fetch(currentId).then(updateCurrent).catch(() => {});
const playerTimeout = setTimeout(() => {
  if (!playerReady) { setStatus('動画内の再生ボタンを押してください'); notice('再生操作の読み込みに時間がかかっています。', true); }
}, 15000);
function onPlayerReady(event) {
  player = event.target;
  playerReady = true;
  clearTimeout(playerTimeout);
  const loadedId = player.getVideoData()?.video_id;
  if (queuedAutoplay) { queuedAutoplay = false; player.loadVideoById(currentId); }
  else if (loadedId !== currentId) player.cueVideoById(currentId);
  $('play-toggle').disabled = false; $('mute-toggle').disabled = false;
  applyVideoVolume();
  if (!playerFailed) { $('player-notice').hidden = true; setStatus('再生して、自由にタップ'); }
}
function onPlayerStateChange(event) {
  const state = event.data;
  setIcon($('play-toggle'), state === 1 ? 'pause' : state === 0 ? 'replay' : 'play');
  $('play-toggle').setAttribute('aria-label', state === 1 ? '一時停止' : state === 0 ? 'もう一度再生' : '再生');
  if (playerFailed) return;
  setStatus(state === 1 ? '再生中' : state === 2 ? '一時停止中' : state === 3 ? '動画を読み込み中…' : state === 0 ? 'もう一度再生できます' : '再生して、自由にタップ');
  if (state === 1) {
    $('player-notice').hidden = true;
    const playingId = player.getVideoData()?.video_id;
    if (playingId === currentId && lastRecordedId !== currentId) {
      lastRecordedId = currentId;
      history = [currentId, ...history.filter(id => id !== currentId)].slice(0, 30);
      save('hist_ids', history);
      if (panelId === 'library-panel' && libraryTab === 'history') renderLibrary();
    }
  }
}
function createPlayer() {
  if (player || !window.YT?.Player) return;
  player = new window.YT.Player('youtube-player', {
    events: {
      onReady: onPlayerReady, onStateChange: onPlayerStateChange,
      onError: event => {
        playerFailed = true;
        unplayable.add(currentId);
        setStatus('この動画を再生できません');
        notice([101, 150].includes(event.data) ? 'この動画は埋め込み再生が許可されていません。別の動画を選ぶか、YouTubeで開いてください。' : event.data === 100 ? '動画が非公開、または削除されています。別の動画を選んでください。' : '動画を読み込めませんでした。別の動画を選ぶか、YouTubeで開いてください。');
      },
      onAutoplayBlocked: () => setStatus('再生ボタンを押してスタート')
    }
  });
}
window.onYouTubeIframeAPIReady = createPlayer;
if (window.YT?.Player) createPlayer();
else {
  const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
  script.onerror = () => { clearTimeout(playerTimeout); setStatus('動画内の再生ボタンを押してください'); notice('再生操作を読み込めませんでした。通信を確認してください。', true); };
  document.head.append(script);
}
setInterval(() => {
  if (!playerReady || document.hidden) return;
  const duration = player.getDuration();
  $('seek').disabled = !(duration > 0) || playerFailed;
  $('duration').textContent = formatTime(duration);
  if (!seeking) {
    const time = player.getCurrentTime();
    $('current-time').textContent = formatTime(time);
    $('seek').value = duration > 0 ? String(time / duration * 100) : '0';
  }
  // YouTube本体で変更した音量も、アプリ側の設定に反映する。
  if (!playerFailed) {
    const muted = player.isMuted();
    const volume = Math.round(player.getVolume());
    if (muted !== settings.muted || volume !== settings.videoVolume) {
      settings.muted = muted; settings.videoVolume = volume;
      save(SETTINGS_KEY, settings, false); syncMute();
      if (panelId === 'settings-panel') syncSettings();
    }
  }
}, 300);

$('fullscreen-toggle').hidden = !document.fullscreenEnabled;
$('fullscreen-toggle').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); }
  catch { toast('この環境では全画面表示を利用できません'); }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  setIcon($('fullscreen-toggle'), active ? 'minimize' : 'maximize');
  $('fullscreen-toggle').setAttribute('aria-label', active ? '全画面表示を終了' : '全画面表示');
});

const vibrationSupported = typeof navigator.vibrate === 'function';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function syncSettings() {
  $('app').dataset.appearance = settings.appearance;
  $('app').classList.toggle('no-effects', !settings.effects || reducedMotion.matches);
  $('sound-enabled').checked = settings.sound;
  $('sound-volume').value = String(settings.soundVolume);
  $('sound-volume').disabled = !settings.sound;
  $('sound-volume-value').value = `${settings.soundVolume}%`;
  $('video-volume').value = String(settings.videoVolume);
  $('video-volume-value').value = `${settings.videoVolume}%`;
  $('vibration-enabled').checked = settings.vibration && vibrationSupported;
  $('vibration-enabled').disabled = !vibrationSupported;
  $('vibration-support').textContent = vibrationSupported ? '' : 'この端末では利用できません';
  $('effects-enabled').checked = settings.effects;
  $('appearance').value = settings.appearance;
}
for (const [id, key] of [['sound-enabled', 'sound'], ['vibration-enabled', 'vibration'], ['effects-enabled', 'effects']]) {
  $(id).addEventListener('change', () => { settings[key] = $(id).checked; save(SETTINGS_KEY, settings); syncSettings(); });
}
for (const [id, key] of [['sound-volume', 'soundVolume'], ['video-volume', 'videoVolume']]) {
  $(id).addEventListener('input', () => {
    settings[key] = Number($(id).value);
    if (id === 'video-volume') { settings.muted = false; applyVideoVolume(); }
    $(`${id}-value`).value = `${settings[key]}%`;
  });
  $(id).addEventListener('change', () => save(SETTINGS_KEY, settings));
}
$('appearance').addEventListener('change', () => { settings.appearance = $('appearance').value; save(SETTINGS_KEY, settings); syncSettings(); });
$('clear-history').addEventListener('click', () => {
  if (!history.length) { toast('再生履歴はありません'); return; }
  if (!window.confirm('このブラウザーの再生履歴をすべて消去しますか？')) return;
  history = []; save('hist_ids', history); toast('再生履歴を消去しました');
});
$('clear-favorites').addEventListener('click', () => {
  if (!favorites.length) { toast('お気に入りはありません'); return; }
  if (!window.confirm('このブラウザーのお気に入りをすべて外しますか？')) return;
  favorites = []; save('fav_ids', favorites); updateCurrent(); toast('お気に入りをすべて外しました');
});
reducedMotion.addEventListener('change', syncSettings);
syncSettings(); syncMute();

const playTap = createTapAudio();
const padInput = createPadInput();
function refreshPads() {
  const active = padInput.activeColors();
  document.querySelectorAll('[data-pad]').forEach(button => button.classList.toggle('is-active', active.has(button.dataset.pad)));
}
function clearPads() { padInput.clear(); refreshPads(); }
function tap(color, point) {
  if (settings.sound) playTap(settings.soundVolume);
  if (settings.vibration && vibrationSupported) { try { navigator.vibrate(12); } catch { /* 非対応端末では無視する。 */ } }
  if (!settings.effects || reducedMotion.matches) return;
  const pad = $(`btn-${color}`).querySelector('.pad-symbol').getBoundingClientRect();
  const layer = $('sparkles').getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const spark = document.createElement('span'); spark.className = 'sparkle'; spark.textContent = '✦';
    spark.style.left = `${(point?.x ?? pad.left + pad.width / 2) - layer.left}px`;
    spark.style.top = `${(point?.y ?? pad.top + pad.height / 2) - layer.top}px`;
    const angle = i / 6 * Math.PI * 2 + Math.random() * .4;
    spark.style.setProperty('--dx', `${Math.cos(angle) * pad.width * .5}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * pad.width * .5}px`);
    spark.style.setProperty('--sparkle-color', `var(--${color})`);
    $('sparkles').append(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
    setTimeout(() => spark.remove(), 650);
  }
}
document.querySelectorAll('[data-pad]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    padInput.updatePointer(event.pointerId, button.dataset.pad);
    tap(button.dataset.pad, { x: event.clientX, y: event.clientY }); refreshPads();
  });
  button.addEventListener('pointermove', event => {
    if (!padInput.hasPointer(event.pointerId)) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pad]');
    const color = target?.dataset.pad ?? null;
    if (padInput.updatePointer(event.pointerId, color)) tap(color, { x: event.clientX, y: event.clientY });
    refreshPads();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, event => { padInput.endPointer(event.pointerId); refreshPads(); });
  button.addEventListener('click', event => {
    if (event.detail !== 0) return;
    tap(button.dataset.pad); button.classList.add('is-active'); setTimeout(refreshPads, 130);
  });
});
function isEditing(element) { return element instanceof Element && Boolean(element.closest('input, textarea, select, [contenteditable="true"]')); }
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!PAD_KEYS[key] || panelId || event.ctrlKey || event.altKey || event.metaKey || isEditing(event.target)) return;
  event.preventDefault();
  if (event.repeat) return;
  const color = padInput.keyDown(key);
  if (color) { tap(color); refreshPads(); }
});
document.addEventListener('keyup', event => { padInput.keyUp(event.key.toLowerCase()); refreshPads(); });
window.addEventListener('blur', clearPads);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearPads(); });
