import videoIds from './videos.json';
import { SETTINGS_KEY, isVideoId, uniqueIds, readSaved, normalizeCustomVideos, normalizeSettings, chooseRandom, formatTime, displayTitle } from './model.js';
import { icon, setIcon, mountIcons } from './icons.js';
import { createTapAudio } from './tap-audio.js';
import { createPadInput, PAD_KEYS } from './pad-input.js';
import { createMetadata } from './metadata.js';
import { createEncoreStorage } from './storage.js';
import { getPlaybackRange, getClipPosition, seekTimeForPercent, youtubeVideoOptions } from './clip.js';
import { validateVideoInput, VIDEO_MODES, VIDEO_DIFFICULTIES } from './add-video.js';
import { VIDEO_IDOLS, VIDEO_SONGS } from './registration-options.js';
import { createSharedVideosClient } from './shared-videos.js';

const $ = id => document.getElementById(id);
mountIcons();
let storage;
try { storage = createEncoreStorage(window.localStorage); } catch { /* 保存不可でも利用できる。 */ }
let saveWarningShown = false;
let toastTimer;
function toast(message) {
  // 全画面の選曲中も、お気に入りなどの通知を手前に表示する。
  ($('library-dialog').open ? $('library-dialog') : $('app')).append($('toast'));
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
let sharedVideos = normalizeCustomVideos(readSaved(storage, 'shared_videos', []));
const sharedClient = createSharedVideosClient();
const settings = normalizeSettings(readSaved(storage, SETTINGS_KEY, {}));
const metadata = createMetadata(storage, save);
customVideos.forEach(video => metadata.seed(video.id, video));
sharedVideos.forEach(video => metadata.seed(video.id, video, { replace: true }));
const lastVideo = readSaved(storage, 'aikatsu_last_video_v2', null);
const initialIds = uniqueIds([...sharedVideos.map(video => video.id), ...customVideos.map(video => video.id), ...videoIds, ...favorites, ...history]);
let currentId = initialIds.includes(lastVideo) ? lastVideo : initialIds[0] ?? null;
let panelId = null;
let panelOpener;
let libraryTab = 'all';
let player;
let playerReady = false;
let queuedAutoplay = false;
let playerFailed = false;
let seeking = false;
let lastRecordedId;
let clipEnded = false;
let libraryRenderTimer;
const unplayable = new Set();
const allIds = () => uniqueIds([...sharedVideos.map(video => video.id), ...customVideos.map(video => video.id), ...videoIds, ...favorites, ...history]);
const titleFor = id => metadata.get(id)?.title || `動画 (${id})`;
const rangeFor = id => getPlaybackRange(metadata.get(id), playerReady ? player.getDuration() : 0);
const authorFor = data => [data?.author, data?.authorHandle].filter(Boolean).join('');
function detailsFor(id) {
  const data = metadata.get(id);
  if (!data) return [];
  const fields = [['モード', data.mode], ['難易度', data.difficulty], ['アイドル', data.idol], ['成績', data.result], ['投稿者', authorFor(data)]];
  if (Number.isFinite(data.startSeconds) && Number.isFinite(data.endSeconds) && data.endSeconds > data.startSeconds) {
    fields.push(['楽曲位置', `${formatTime(data.startSeconds)}〜${formatTime(data.endSeconds)}`]);
  }
  return fields.filter(([, value]) => typeof value === 'string' && value.length > 0);
}
function renderDetails(container, id) {
  const fields = detailsFor(id);
  container.replaceChildren();
  container.hidden = fields.length === 0;
  for (const [label, value] of fields) {
    const item = document.createElement('div');
    item.dataset.field = label;
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd'); description.textContent = value;
    item.append(term, description); container.append(item);
  }
}

function updateFavorite(button, id) {
  const active = favorites.includes(id);
  button.classList.toggle('is-favorite', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', `${active ? 'お気に入りから外す' : 'お気に入りに追加'}${button.id ? '' : `：${displayTitle(titleFor(id))}`}`);
}
function updateCurrent() {
  const hasVideo = isVideoId(currentId);
  $('youtube-player').hidden = !hasVideo;
  $('video-empty').hidden = hasVideo;
  $('favorite-current').disabled = !hasVideo;
  $('shuffle').disabled = allIds().length === 0;
  $('replay').disabled = !hasVideo;
  $('youtube-link').hidden = !hasVideo;
  if (!hasVideo) {
    $('current-details').hidden = true;
    $('current-title').textContent = 'アンコールの楽曲は準備中';
    $('current-title').removeAttribute('title');
    $('youtube-link').removeAttribute('href');
    return;
  }
  const title = displayTitle(titleFor(currentId));
  $('current-title').textContent = title;
  $('current-title').title = titleFor(currentId);
  $('youtube-player').title = title;
  $('youtube-link').href = `https://www.youtube.com/watch?v=${currentId}&t=${rangeFor(currentId).start}s`;
  renderDetails($('current-details'), currentId);
  $('duration').textContent = formatTime(rangeFor(currentId).duration);
  updateFavorite($('favorite-current'), currentId);
}
function toggleFavorite(id) {
  if (!isVideoId(id)) return;
  const removing = favorites.includes(id);
  favorites = removing ? favorites.filter(value => value !== id) : [id, ...favorites];
  save('fav_ids', favorites);
  updateCurrent();
  if (panelId === 'library-panel') renderLibrary();
  toast(removing ? 'お気に入りから外しました' : 'お気に入りに追加しました');
}
$('favorite-current').addEventListener('click', () => toggleFavorite(currentId));

const libraryDialog = $('library-dialog');
function closePanel() {
  document.querySelectorAll('.side-panel').forEach(panel => { panel.hidden = true; });
  $('controller').hidden = false;
  $('control-slot').classList.remove('panel-open');
  $('open-library').setAttribute('aria-expanded', 'false');
  $('open-settings').setAttribute('aria-expanded', 'false');
  panelId = null;
  $('app').append($('toast'));
  if (libraryDialog.open) libraryDialog.close();
  document.body.classList.remove('library-open');
  $('app').classList.remove('library-open');
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
  if (id === 'library-panel') { renderLibrary(); hydrateMissingTitles(); refreshSharedVideos(); }
  if (id === 'settings-panel') syncSettings();
  const isLibrary = ['library-panel', 'add-panel'].includes(id);
  document.body.classList.toggle('library-open', isLibrary);
  $('app').classList.toggle('library-open', isLibrary);
  if (isLibrary) {
    // 選曲・動画追加の画面で隠れる動画は再生しない。
    queuedAutoplay = false;
    if (playerReady) player.pauseVideo();
    libraryDialog.setAttribute('aria-labelledby', id === 'library-panel' ? 'library-heading' : 'add-heading');
    if (!libraryDialog.open) libraryDialog.showModal();
  } else if (libraryDialog.open) libraryDialog.close();
  const focusTarget = id === 'library-panel' ? $('video-search') : id === 'add-panel' ? $('add-url') : $(id).querySelector('[data-close]');
  // スマホで自動的にキーボードを開かず、動画の位置も維持する。
  const pointerIsCoarse = matchMedia('(pointer: coarse)').matches;
  (pointerIsCoarse && focusTarget.tagName === 'INPUT' ? $(id).querySelector('[data-close]') : focusTarget).focus({ preventScroll: true });
}
libraryDialog.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
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
  const heading = document.createElement('span'); heading.className = 'video-heading';
  const title = document.createElement('span'); title.className = 'video-title';
  const state = document.createElement('span'); state.className = 'video-state'; state.textContent = '選択中';
  const subtitle = document.createElement('span'); subtitle.className = 'video-subtitle';
  const details = document.createElement('dl'); details.className = 'song-details video-details';
  details.id = `song-details-${id}`;
  select.setAttribute('aria-describedby', details.id);
  heading.append(title, state); words.append(heading, details, subtitle); select.append(image, words);
  select.addEventListener('click', () => selectVideo(id));
  const favorite = document.createElement('button');
  favorite.type = 'button'; favorite.className = 'icon-button'; favorite.innerHTML = icon('star');
  favorite.addEventListener('click', () => toggleFavorite(id));
  row.append(select, favorite);
  const entry = { row, select, title, state, details, subtitle, favorite };
  rows.set(id, entry);
  return entry;
}
function renderLibrary() {
  const ids = libraryTab === 'favorites' ? favorites : libraryTab === 'history' ? history : allIds();
  const query = $('video-search').value.normalize('NFKC').toLocaleLowerCase().trim();
  const matching = ids.filter(id => `${titleFor(id)} ${detailsFor(id).map(([, value]) => value).join(' ')} ${id}`.normalize('NFKC').toLocaleLowerCase().includes(query));
  const visibleIds = new Set(matching);
  for (const [id, entry] of rows) if (!visibleIds.has(id)) entry.row.remove();
  matching.forEach((id, index) => {
    const entry = rowFor(id);
    entry.title.textContent = displayTitle(titleFor(id));
    entry.select.title = titleFor(id);
    entry.select.setAttribute('aria-label', `${displayTitle(titleFor(id))}を再生`);
    renderDetails(entry.details, id);
    entry.state.hidden = id !== currentId;
    entry.select.setAttribute('aria-current', id === currentId ? 'true' : 'false');
    entry.subtitle.textContent = metadata.failed.has(id) ? '動画情報を取得できません' : metadata.get(id) ? '' : 'YouTube';
    entry.subtitle.hidden = !entry.subtitle.textContent;
    entry.row.classList.toggle('is-current', id === currentId);
    updateFavorite(entry.favorite, id);
    // メタデータの更新時も、フォーカスとスクロール位置を保つ。
    const expected = $('video-list').children[index];
    if (expected !== entry.row) $('video-list').insertBefore(entry.row, expected || null);
  });
  $('library-count').textContent = `${matching.length}曲${query ? ` / ${ids.length}曲` : ''}`;
  $('library-empty').hidden = matching.length > 0;
  $('library-empty').textContent = query ? '見つかりませんでした。別のキーワードを試してください。' : libraryTab === 'favorites' ? '星を押して、お気に入りを追加しましょう。' : libraryTab === 'history' ? '動画を再生すると、ここに履歴が残ります。' : 'アンコールの楽曲は準備中です。';
}
function scheduleLibraryRender() {
  clearTimeout(libraryRenderTimer);
  libraryRenderTimer = setTimeout(() => { if (panelId === 'library-panel') renderLibrary(); }, 100);
}
let sharedLoading;
let sharedRevision = 0;
async function refreshSharedVideos() {
  if (sharedLoading) return sharedLoading;
  $('shared-status').textContent = '共有一覧を更新中…';
  $('retry-shared').hidden = true;
  const revision = sharedRevision;
  sharedLoading = (async () => {
    try {
      const videos = await sharedClient.list();
      if (revision !== sharedRevision) { $('shared-status').textContent = ''; return; }
      sharedVideos = videos;
      sharedVideos.forEach(video => metadata.seed(video.id, video, { replace: true }));
      save('shared_videos', sharedVideos, false);
      updateCurrent();
      if (panelId === 'library-panel') renderLibrary();
      $('shared-status').textContent = '';
    } catch {
      $('shared-status').textContent = '共有一覧を取得できません';
      $('retry-shared').hidden = false;
    } finally { sharedLoading = null; }
  })();
  return sharedLoading;
}
$('retry-shared').addEventListener('click', refreshSharedVideos);
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
$('video-search').addEventListener('input', () => { $('library-results').scrollTop = 0; renderLibrary(); });

const addFields = ['url', 'title', 'start', 'end', 'mode', 'difficulty', 'idol', 'result'];
const customChoiceValue = '__custom__';
const customChoiceFields = ['title', 'idol'];
for (const [field, choices] of Object.entries({ mode: VIDEO_MODES, difficulty: VIDEO_DIFFICULTIES, title: VIDEO_SONGS, idol: VIDEO_IDOLS })) {
  for (const value of choices) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    $(`add-${field}`).append(option);
  }
  if (customChoiceFields.includes(field)) {
    const option = document.createElement('option');
    option.value = customChoiceValue;
    option.textContent = '自由入力';
    $(`add-${field}`).append(option);
  }
}
function syncCustomChoice(field) {
  const custom = $(`add-${field}-custom`);
  const active = $(`add-${field}`).value === customChoiceValue;
  custom.hidden = !active;
  custom.required = active;
  return active;
}
function getAddControl(field) {
  return customChoiceFields.includes(field) && $(`add-${field}`).value === customChoiceValue ? $(`add-${field}-custom`) : $(`add-${field}`);
}
for (const field of customChoiceFields) {
  syncCustomChoice(field);
  $(`add-${field}`).addEventListener('change', () => {
    if (syncCustomChoice(field)) $(`add-${field}-custom`).focus();
  });
}
const readAddInput = () => Object.fromEntries(addFields.map(field => [field, getAddControl(field).value]));
const addControls = addFields.flatMap(field => [$(`add-${field}`), $(`add-${field}-custom`)].filter(Boolean));
let addValidationShown = false;
function showAddErrors(errors) {
  for (const field of addFields) {
    const activeControl = getAddControl(field);
    const error = $(`add-${field}-error`);
    for (const input of [$(`add-${field}`), $(`add-${field}-custom`)].filter(Boolean)) {
      const message = input === activeControl ? errors[field] || '' : '';
      input.setCustomValidity(message);
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    error.textContent = errors[field] || '';
    error.hidden = !errors[field];
  }
}
for (const control of addControls) {
  control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
    if (addValidationShown) showAddErrors(validateVideoInput(readAddInput()).errors);
  });
}
$('add-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('add-submit').disabled) return;
  const message = $('add-message');
  message.classList.remove('is-error');
  const input = readAddInput();
  const { video, errors } = validateVideoInput(input);
  addValidationShown = true;
  showAddErrors(errors);
  if (!video) {
    message.textContent = '未入力・入力内容を確認してください。';
    message.classList.add('is-error');
    getAddControl(addFields.find(field => errors[field])).focus();
    return;
  }
  const { id } = video;
  if (sharedVideos.some(item => item.id === id) || videoIds.includes(id)) {
    showAddErrors({ url: 'この動画は登録済みです。選曲一覧から選んでください。' });
    message.textContent = '同じ動画を重複して追加することはできません。';
    message.classList.add('is-error');
    $('add-url').focus();
    return;
  }
  $('add-submit').disabled = true;
  for (const control of addControls) control.disabled = true;
  message.textContent = '投稿者を確認し、共有一覧に登録中…';
  try {
    // 一覧取得中の結果で、登録直後の動画を消さない。
    if (sharedLoading) await sharedLoading;
    const savedVideo = await sharedClient.add(input);
    sharedRevision++;
    sharedVideos = [savedVideo, ...sharedVideos.filter(item => item.id !== id)];
    save('shared_videos', sharedVideos, false);
    metadata.seed(id, savedVideo, { replace: true });
    if (!favorites.includes(id)) { favorites.unshift(id); save('fav_ids', favorites); }
    $('add-form').reset();
    for (const field of customChoiceFields) syncCustomChoice(field);
    addValidationShown = false;
    showAddErrors({});
    message.textContent = '';
    updateCurrent();
    if (panelId === 'library-panel') renderLibrary();
    // 確認中に別画面へ移動した場合は、再生中の曲を切り替えない。
    if (panelId === 'add-panel') selectVideo(id);
    toast('共有一覧と、この端末のお気に入りに追加しました');
  } catch (error) {
    if (error.errors && typeof error.errors === 'object') showAddErrors(error.errors);
    message.textContent = error.name === 'AbortError' || error instanceof TypeError ? '動画情報を取得できませんでした。通信を確認して、もう一度お試しください。' : error.message;
    message.classList.add('is-error');
  } finally {
    $('add-submit').disabled = false;
    for (const control of addControls) control.disabled = false;
  }
});

function iframeUrl(id) {
  const parameters = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', origin: location.origin });
  const options = youtubeVideoOptions(id, metadata.get(id));
  parameters.set('start', String(options.startSeconds));
  if (options.endSeconds !== undefined) parameters.set('end', String(options.endSeconds));
  // シークはアプリ側の楽曲区間に限定する。
  if (options.endSeconds !== undefined) { parameters.set('controls', '0'); parameters.set('disablekb', '1'); }
  return `https://www.youtube.com/embed/${id}?${parameters}`;
}
function setStatus(message) { $('playback-status').textContent = message; }
function finishClip() {
  clipEnded = true;
  player.pauseVideo();
  setIcon($('play-toggle'), 'replay');
  $('play-toggle').setAttribute('aria-label', 'もう一度再生');
  setStatus('楽曲の再生が終了しました');
  $('current-time').textContent = formatTime(rangeFor(currentId).duration);
  $('seek').value = '100';
}
function notice(message, retry = false) {
  $('player-notice-text').textContent = message;
  $('player-notice').hidden = false;
  $('retry-player').hidden = !retry;
}
function selectVideo(id) {
  if (!isVideoId(id)) return;
  currentId = id;
  lastRecordedId = null;
  clipEnded = false;
  playerFailed = false;
  save('aikatsu_last_video_v2', id);
  $('player-notice').hidden = true;
  $('seek').value = '0'; $('current-time').textContent = '0:00'; $('duration').textContent = '0:00';
  setStatus('動画を読み込み中…');
  updateCurrent();
  if (panelId) closePanel();
  if (playerReady) player.loadVideoById(youtubeVideoOptions(id, metadata.get(id)));
  else {
    // APIの準備が終わった際に、最後に選択された動画を再生する。
    queuedAutoplay = true;
    if (!player) {
      $('youtube-player').src = iframeUrl(id);
      preparePlayer();
    }
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
  else if (clipEnded || player.getPlayerState() === 0) {
    clipEnded = false;
    player.loadVideoById(youtubeVideoOptions(currentId, metadata.get(currentId)));
  } else player.playVideo();
});
$('seek').addEventListener('input', () => {
  seeking = true;
  $('current-time').textContent = formatTime(Number($('seek').value) / 100 * rangeFor(currentId).duration);
});
$('seek').addEventListener('change', () => {
  if (playerReady) {
    const target = seekTimeForPercent(metadata.get(currentId), Number($('seek').value), player.getDuration());
    const options = youtubeVideoOptions(currentId, metadata.get(currentId));
    if (options.endSeconds !== undefined) {
      if (target >= options.endSeconds) {
        // 同じ開始・終了秒を渡さず、終端を選んだ時は終了状態にする。
        const range = rangeFor(currentId);
        player.cueVideoById({ ...options, startSeconds: range.end - Math.min(0.01, range.duration / 2) });
        finishClip();
      } else {
        const playing = player.getPlayerState() === 1;
        clipEnded = false;
        const selection = { ...options, startSeconds: target };
        // seekToはendSecondsを解除するため、終了位置も合わせて指定する。
        if (playing) player.loadVideoById(selection);
        else player.cueVideoById(selection);
      }
    } else {
      clipEnded = false;
      player.seekTo(target, true);
    }
  }
  seeking = false;
});
$('seek').addEventListener('blur', () => { seeking = false; });
$('retry-player').addEventListener('click', () => location.reload());
$('replay').addEventListener('click', () => {
  clipEnded = false;
  if (playerReady) player.loadVideoById(youtubeVideoOptions(currentId, metadata.get(currentId)));
  else selectVideo(currentId);
  closePanel();
});

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

updateCurrent();
let playerTimeout;
let playerScriptRequested = false;
function preparePlayer() {
  if (!isVideoId(currentId) || player || playerTimeout) return;
  setStatus('プレーヤーを準備中…');
  $('youtube-player').src = iframeUrl(currentId);
  playerTimeout = setTimeout(() => {
    if (!playerReady) { setStatus('動画内の再生ボタンを押してください'); notice('再生操作の読み込みに時間がかかっています。', true); }
  }, 15000);
  if (window.YT?.Player) createPlayer();
  else if (!playerScriptRequested) {
    playerScriptRequested = true;
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => { clearTimeout(playerTimeout); setStatus('動画内の再生ボタンを押してください'); notice('再生操作を読み込めませんでした。通信を確認してください。', true); };
    document.head.append(script);
  }
}
function onPlayerReady(event) {
  player = event.target;
  playerReady = true;
  clearTimeout(playerTimeout);
  if (queuedAutoplay) { queuedAutoplay = false; player.loadVideoById(youtubeVideoOptions(currentId, metadata.get(currentId))); }
  else player.cueVideoById(youtubeVideoOptions(currentId, metadata.get(currentId)));
  if (libraryDialog.open) player.pauseVideo();
  $('play-toggle').disabled = false; $('mute-toggle').disabled = false;
  applyVideoVolume();
  if (!playerFailed) { $('player-notice').hidden = true; setStatus(''); }
}
function onPlayerStateChange(event) {
  const state = event.data;
  if (state === 0) clipEnded = true;
  if (state === 1) clipEnded = false;
  // 読み込み完了が画面を開いた後になった場合も、裏で再生させない。
  if (libraryDialog.open && (state === 1 || state === 3)) {
    event.target.pauseVideo();
    return;
  }
  const finished = clipEnded || state === 0;
  setIcon($('play-toggle'), state === 1 ? 'pause' : finished ? 'replay' : 'play');
  $('play-toggle').setAttribute('aria-label', state === 1 ? '一時停止' : finished ? 'もう一度再生' : '再生');
  if (playerFailed) return;
  setStatus(state === 1 ? '再生中' : finished ? '楽曲の再生が終了しました' : state === 2 ? '一時停止中' : state === 3 ? '動画を読み込み中…' : '');
  if (state === 1) {
    const range = rangeFor(currentId);
    if (metadata.get(currentId)?.endSeconds && player.getCurrentTime() >= range.end) { finishClip(); return; }
    // 開始はcue/loadで指定済み。キーフレームの時刻差で同じ動画を再ロードしない。
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
  if (!isVideoId(currentId) || player || !window.YT?.Player) return;
  player = new window.YT.Player('youtube-player', {
    playerVars: { controls: metadata.get(currentId)?.endSeconds ? 0 : 1, disablekb: metadata.get(currentId)?.endSeconds ? 1 : 0 },
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
if (currentId) {
  if (!metadata.get(currentId)) metadata.fetch(currentId).then(updateCurrent).catch(() => {});
  preparePlayer();
} else {
  setStatus('楽曲を登録すると、動画に合わせて遊べます');
}
setInterval(() => {
  if (!playerReady) return;
  const position = getClipPosition(metadata.get(currentId), player.getCurrentTime(), player.getDuration());
  $('seek').disabled = !(position.duration > 0) || playerFailed;
  $('duration').textContent = formatTime(position.duration);
  if (!seeking) {
    $('current-time').textContent = formatTime(clipEnded ? position.duration : position.elapsed);
    $('seek').value = clipEnded ? '100' : String(position.percent);
  }
  // seekToでYouTubeのendSecondsが解除されても、楽曲の終端で停止する。
  if (!playerFailed && player.getPlayerState() === 1 && metadata.get(currentId)?.endSeconds) {
    const time = player.getCurrentTime();
    if (time >= position.end) {
      finishClip();
    }
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
refreshSharedVideos();

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
