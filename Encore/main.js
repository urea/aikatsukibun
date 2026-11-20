import videoIds from './videos.json';
import { inject, pageview } from '@vercel/analytics';
import { SETTINGS_KEY, SHARED_BROWSE_CACHE_SECONDS, SHARED_STATUS_CACHE_SECONDS, SHARED_DAILY_LIMIT, VIDEO_CATEGORIES, categoryLabel, isVideoCategory, isPlayableVideo, isVideoId, isEntryId, videoIdFor, uniqueIds, readSaved, normalizeCustomVideos, normalizeSettings, chooseRandom, formatTime, displayTitle } from './model.js';
import { icon, setIcon, mountIcons } from './icons.js';
import { createTapAudio } from './tap-audio.js';
import { createPadInput, keysForLayout } from './pad-input.js';
import './controller-layouts.css';
import { createMetadata } from './metadata.js';
import { createEncoreStorage } from './storage.js';
import { getPlaybackRange, getClipPosition, seekTimeForPercent, youtubeVideoOptions } from './clip.js';
import { validateVideoInput, readVideoIdFromUrl, videoToInput, difficultyLabel, VIDEO_MODES, VIDEO_DIFFICULTIES } from './add-video.js';
import { VIDEO_IDOLS, VIDEO_SONGS } from './registration-options.js';
import { createSharedVideosClient } from './shared-videos.js';
import { getYouTubeAuthorVideosUrl } from './youtube-author.js';
import { readSharedVideoId, buildXShareUrl } from './share.js';
import { normalizeLibrarySort, sortVideoIds } from './library-sort.js';
import { createPlaybackSession } from './playback-session.js';
import { pickAffiliateProduct } from './affiliate-products.js';
import { CONTROLLER_LAYOUTS, getControllerLayout, renderControllerPads } from './controller-layouts.js';

const $ = id => document.getElementById(id);
const playLayout = $('app');
const disclosure = document.querySelector('.affiliate-disclosure');
const playbackControls = document.querySelector('.playback');
const videoBox = document.querySelector('.video-box');
function updatePlayAreaMeasurements() {
  const playbackHeight = playbackControls.getBoundingClientRect().bottom - videoBox.getBoundingClientRect().bottom;
  playLayout.style.setProperty('--playback-height', `${Math.ceil(playbackHeight)}px`);
  playLayout.style.setProperty('--affiliate-disclosure-height', `${Math.ceil(disclosure.getBoundingClientRect().height)}px`);
}
updatePlayAreaMeasurements();
const playAreaObserver = new ResizeObserver(updatePlayAreaMeasurements);
playAreaObserver.observe(disclosure, { box: 'border-box' });
playAreaObserver.observe(playbackControls, { box: 'border-box' });

if (import.meta.env.PROD && location.hostname === 'aikatsu-encore-kibun.vercel.app') {
  inject({ mode: 'production', disableAutoTrack: true });
  pageview({ path: location.pathname });
}
mountIcons();
let storage;
try { storage = createEncoreStorage(window.localStorage); } catch { /* 保存不可でも利用できる。 */ }
let saveWarningShown = false;
let toastTimer;
function toast(message) {
  // ダイアログを開いている間も、通知をその手前に表示する。
  (document.querySelector('.full-screen-dialog[open]') ?? playLayout).append($('toast'));
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
let customVideos = normalizeCustomVideos(readSaved(storage, 'custom_videos', []));
const cachedPublication = readSaved(storage, 'shared_publication', {});
let sharedVideos = normalizeCustomVideos(cachedPublication.videos ?? readSaved(storage, 'shared_videos', []));
let withdrawnIds = new Set(uniqueIds(cachedPublication.withdrawnIds));
let sharedFetchedAt = Number.isFinite(cachedPublication.fetchedAt) ? cachedPublication.fetchedAt : 0;
let sharedLiveUntil = Number.isFinite(cachedPublication.liveUntil) ? cachedPublication.liveUntil : 0;
let sharedPublishedAt = Number.isFinite(cachedPublication.publishedAt) ? cachedPublication.publishedAt : 0;
let sharedLiveSince = Number.isFinite(cachedPublication.liveSince) ? cachedPublication.liveSince : 0;
let sharedLiveFailed = false;
let sharedSyncPending = cachedPublication.syncPending === true;
let publicationReady = false;
const sharedClient = createSharedVideosClient();
const settings = normalizeSettings(readSaved(storage, SETTINGS_KEY, {}));
const metadata = createMetadata(storage, save);
customVideos.forEach(video => metadata.seed(video.id, video));
sharedVideos.forEach(video => metadata.seed(video.id, video, { replace: true }));
const isWithdrawn = id => withdrawnIds.has(id) || withdrawnIds.has(videoIdFor(id, metadata.get(id)));
const publishedIds = () => [...videoIds, ...sharedVideos.map(video => video.id)].filter(id => !isWithdrawn(id));
const savePublication = () => save('shared_publication', { videos: sharedVideos, withdrawnIds: [...withdrawnIds], fetchedAt: sharedFetchedAt, liveUntil: sharedLiveUntil, publishedAt: sharedPublishedAt, liveSince: sharedLiveSince, syncPending: sharedSyncPending }, false);
const lastVideo = readSaved(storage, 'aikatsu_last_video_v2', null);
const allIds = () => uniqueIds([...sharedVideos.map(video => video.id), ...customVideos.map(video => video.id), ...videoIds, ...favorites, ...history]).filter(id => !isWithdrawn(id));
const categoryFor = id => metadata.get(id)?.category ?? 'misc';
const playCandidateIds = () => allIds().filter(id => isPlayableVideo(metadata.get(id)));
const initialIds = playCandidateIds();
const initialSharedIds = publishedIds();
const requestedVideoId = readSharedVideoId(location.href);
let pendingSharedVideoId = requestedVideoId && !initialSharedIds.includes(requestedVideoId) ? requestedVideoId : null;
let currentId = initialSharedIds.includes(requestedVideoId) ? requestedVideoId : pendingSharedVideoId ? null : initialIds.includes(lastVideo) ? lastVideo : initialIds[0] ?? null;
let panelId = null;
let panelVersion = 0;
let panelOpener;
let libraryTab = 'all';
let librarySort = normalizeLibrarySort(readSaved(storage, 'library_sort', 'posted'));
$('video-sort').value = librarySort;
let player;
let playerReady = false;
let queuedAutoplay = false;
let playerRestore = null;
let playerFailed = false;
let seeking = false;
let lastRecordedId;
let clipEnded = false;
let libraryRenderTimer;
const playbackSession = createPlaybackSession();
const unplayable = new Set();
const titleFor = id => metadata.get(id)?.title || `動画 (${id})`;
const youtubeIdFor = id => isWithdrawn(id) ? null : videoIdFor(id, metadata.get(id));
const hasEditableVideo = id => sharedVideos.some(video => video.id === id) || customVideos.some(video => video.id === id);
const rangeFor = id => getPlaybackRange(metadata.get(id), playerReady ? player.getDuration() : 0);
const authorFor = data => [data?.author, data?.authorHandle].filter(Boolean).join('');
function detailsFor(id) {
  const data = metadata.get(id);
  if (!data) return [];
  const fields = [['モード', data.mode], ['難易度', difficultyLabel(data.difficulty)], ['アイドル', data.idol], ['成績', data.result], ['投稿者', authorFor(data)]];
  if (data.startSeconds !== undefined && data.endSeconds !== undefined) {
    fields.push(['楽曲位置', `${data.startSeconds === null ? '先頭' : formatTime(data.startSeconds)}〜${data.endSeconds === null ? '最後' : formatTime(data.endSeconds)}`]);
  }
  if (data.category || (data.startSeconds !== undefined && data.endSeconds !== undefined)) fields.push(['分類', categoryLabel(categoryFor(id))]);
  if (typeof data.playable === 'boolean') fields.push(['ボタン操作', data.playable ? 'プレイ可' : '視聴のみ']);
  return fields.filter(([, value]) => typeof value === 'string' && value.length > 0);
}
function renderDetails(container, id, { authorOnly = false, library = false } = {}) {
  const fields = detailsFor(id).filter(([label]) => authorOnly ? label === '投稿者' : !library || label !== '投稿者');
  container.replaceChildren();
  container.hidden = fields.length === 0;
  for (const [label, value] of fields) {
    const item = document.createElement('div');
    item.dataset.field = label;
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd');
    const authorUrl = label === '投稿者' ? getYouTubeAuthorVideosUrl(metadata.get(id)) : null;
    if (authorUrl) {
      const link = document.createElement('a');
      link.className = 'author-link'; link.href = authorUrl;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${value} ↗`;
      link.setAttribute('aria-label', `${value}のYouTube動画一覧（新しいタブで開く）`);
      description.append(link);
    } else description.textContent = value;
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
  const hasVideo = Boolean(youtubeIdFor(currentId));
  const video = metadata.get(currentId);
  $('app').dataset.videoOrientation = hasVideo && video?.orientation === 'portrait' ? 'portrait' : 'standard';
  $('play-toggle').disabled = !hasVideo || !playerReady;
  $('youtube-player').hidden = !hasVideo;
  $('video-empty').hidden = hasVideo;
  $('favorite-current').disabled = !hasVideo;
  $('shuffle').disabled = allIds().length === 0;
  $('replay').disabled = !hasVideo;
  $('edit-current').hidden = !hasVideo || !hasEditableVideo(currentId);
  $('youtube-link').hidden = !hasVideo;
  $('share-current').disabled = !hasVideo || !video?.title || !publishedIds().includes(currentId);
  if (!hasVideo) {
    $('seek').disabled = true;
    $('current-details').hidden = true;
    $('current-title').textContent = pendingSharedVideoId || currentId ? '楽曲情報を読み込み中…' : 'アンコールの楽曲は準備中';
    $('current-title').removeAttribute('title');
    $('youtube-link').removeAttribute('href');
    return;
  }
  const title = displayTitle(titleFor(currentId));
  $('current-title').textContent = title;
  $('current-title').title = titleFor(currentId);
  $('youtube-player').title = title;
  $('youtube-link').href = `https://www.youtube.com/watch?v=${youtubeIdFor(currentId)}&t=${rangeFor(currentId).start}s`;
  renderDetails($('current-details'), currentId);
  $('duration').textContent = formatTime(rangeFor(currentId).duration);
  updateFavorite($('favorite-current'), currentId);
}
function syncEditedRange(id, previous, video) {
  if (id !== currentId || !previous || (previous.startSeconds === video.startSeconds && previous.endSeconds === video.endSeconds)) return;
  playerRestore = null;
  clipEnded = false;
  $('seek').value = '0'; $('current-time').textContent = '0:00';
  if (playerReady) requestPlayback(youtubeVideoOptions(id, video));
}
function toggleFavorite(id) {
  if (!isEntryId(id) || isWithdrawn(id)) return;
  const removing = favorites.includes(id);
  favorites = removing ? favorites.filter(value => value !== id) : [id, ...favorites];
  save('fav_ids', favorites);
  updateCurrent();
  if (panelId === 'library-panel') renderLibrary();
  toast(removing ? 'お気に入りから外しました' : 'お気に入りに追加しました');
}
$('favorite-current').addEventListener('click', () => toggleFavorite(currentId));

const libraryDialog = $('library-dialog');
const settingsDialog = $('settings-dialog');
let previousAffiliateAsin;
const affiliateBanners = [...document.querySelectorAll('.affiliate-product')].map(link => {
  const image = link.querySelector('img');
  image.addEventListener('error', () => { image.hidden = true; });
  return { link, image, title: link.querySelector('.affiliate-product-title') };
});

function showAffiliateProduct() {
  const product = pickAffiliateProduct(previousAffiliateAsin);
  if (!product) return;
  previousAffiliateAsin = product.asin;
  for (const { link, image, title } of affiliateBanners) {
    link.href = product.url;
    link.title = `${product.title}をAmazonで見る`;
    title.textContent = product.title;
    if (image.src !== product.imageUrl) {
      image.src = product.imageUrl;
      image.hidden = false;
    }
  }
}
showAffiliateProduct();

function closePanel() {
  panelVersion++;
  document.querySelectorAll('.side-panel').forEach(panel => { panel.hidden = true; });
  $('open-library').setAttribute('aria-expanded', 'false');
  $('open-settings').setAttribute('aria-expanded', 'false');
  panelId = null;
  playLayout.append($('toast'));
  if (libraryDialog.open) libraryDialog.close();
  if (settingsDialog.open) settingsDialog.close();
  document.documentElement.classList.remove('dialog-open');
  panelOpener?.focus({ preventScroll: true });
}
function openPanel(id, opener) {
  clearPads();
  if (!panelId) panelOpener = opener || document.activeElement;
  panelId = id;
  panelVersion++;
  const isLibrary = id === 'library-panel' || id === 'add-panel';
  const panel = $(id);
  const dialog = isLibrary ? libraryDialog : settingsDialog;
  const otherDialog = isLibrary ? settingsDialog : libraryDialog;
  document.querySelectorAll('.side-panel').forEach(panel => { panel.hidden = panel.id !== id; });
  $('open-library').setAttribute('aria-expanded', String(isLibrary));
  $('open-settings').setAttribute('aria-expanded', String(!isLibrary));
  if (id === 'library-panel') {
    if (!libraryDialog.open) showAffiliateProduct();
    renderLibrary();
    hydrateMissingTitles();
    refreshSharedVideos();
  }
  if (id === 'settings-panel') syncSettings();
  if (isLibrary) {
    if (id === 'library-panel' || !editingVideo?.local) checkSharedAvailability();
    // 選曲・動画追加の画面で隠れる動画は再生しない。
    queuedAutoplay = false;
    if (playerReady) player.pauseVideo();
  }
  document.documentElement.classList.add('dialog-open');
  if (otherDialog.open) otherDialog.close();
  dialog.setAttribute('aria-labelledby', panel.getAttribute('aria-labelledby'));
  if (!dialog.open) dialog.showModal();
  const closeButton = panel.querySelector('[data-close]');
  const focusTarget = id === 'library-panel' ? $('video-search') : id === 'add-panel' ? $(editingVideo ? 'add-title' : 'add-url') : closeButton;
  // スマホで自動的にキーボードを開かず、動画の位置も維持する。
  const pointerIsCoarse = matchMedia('(pointer: coarse)').matches;
  (pointerIsCoarse && focusTarget.tagName === 'INPUT' ? closeButton : focusTarget).focus({ preventScroll: true });
}
for (const dialog of [libraryDialog, settingsDialog]) {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
}
$('open-library').addEventListener('click', event => openPanel('library-panel', event.currentTarget));
$('open-settings').addEventListener('click', event => openPanel('settings-panel', event.currentTarget));
$('edit-current').addEventListener('click', () => openEditForm(currentId));
$('open-help').addEventListener('click', () => openPanel('help-panel'));
$('open-add').addEventListener('click', openAddForm);
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
  if (youtubeIdFor(id)) image.src = `https://i.ytimg.com/vi/${youtubeIdFor(id)}/mqdefault.jpg`;
  const words = document.createElement('span'); words.className = 'video-words';
  const heading = document.createElement('span'); heading.className = 'video-heading';
  const title = document.createElement('span'); title.className = 'video-title';
  const state = document.createElement('span'); state.className = 'video-state'; state.textContent = '選択中';
  const subtitle = document.createElement('span'); subtitle.className = 'video-subtitle';
  const details = document.createElement('dl'); details.className = 'song-details video-details';
  details.id = `song-details-${id}`;
  const author = document.createElement('dl'); author.className = 'song-details video-details video-author';
  author.id = `song-author-${id}`;
  select.setAttribute('aria-describedby', `${details.id} ${author.id}`);
  heading.append(title, state); words.append(heading, details, subtitle); select.append(image, words);
  select.addEventListener('click', () => selectVideo(id));
  const favorite = document.createElement('button');
  favorite.type = 'button'; favorite.className = 'icon-button'; favorite.innerHTML = icon('star');
  favorite.addEventListener('click', () => toggleFavorite(id));
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'video-edit'; edit.textContent = '編集';
  edit.addEventListener('click', () => openEditForm(id));
  const actions = document.createElement('div'); actions.className = 'video-row-actions';
  actions.append(favorite, edit);
  // 投稿者リンクは再生ボタンの外に置き、リンク操作で選曲されないようにする。
  row.append(select, actions, author);
  const entry = { row, select, image, title, state, details, author, subtitle, favorite, edit };
  rows.set(id, entry);
  return entry;
}
function renderLibrary() {
  const ids = (libraryTab === 'favorites' ? favorites : libraryTab === 'history' ? history : allIds())
    .filter(id => !isWithdrawn(id) && categoryFor(id) === settings.libraryCategory);
  const query = $('video-search').value.normalize('NFKC').toLocaleLowerCase().trim();
  const filtered = query ? ids.filter(id => `${titleFor(id)} ${detailsFor(id).map(([, value]) => value).join(' ')} ${id}`.normalize('NFKC').toLocaleLowerCase().includes(query)) : ids;
  const matching = sortVideoIds(filtered, librarySort, id => metadata.get(id));
  $('video-sort-default').textContent = libraryTab === 'favorites' ? 'お気に入り登録順' : libraryTab === 'history' ? '再生順' : '投稿順';
  const visibleIds = new Set(matching);
  for (const [id, entry] of rows) if (!visibleIds.has(id)) entry.row.remove();
  matching.forEach((id, index) => {
    const entry = rowFor(id);
    const sourceId = youtubeIdFor(id);
    if (sourceId) entry.image.src = `https://i.ytimg.com/vi/${sourceId}/mqdefault.jpg`;
    entry.title.textContent = displayTitle(titleFor(id));
    entry.select.title = titleFor(id);
    entry.select.setAttribute('aria-label', `${displayTitle(titleFor(id))}を再生`);
    renderDetails(entry.details, id, { library: true });
    renderDetails(entry.author, id, { authorOnly: true });
    entry.row.classList.toggle('has-author', !entry.author.hidden);
    entry.state.hidden = id !== currentId;
    entry.select.setAttribute('aria-current', id === currentId ? 'true' : 'false');
    entry.subtitle.textContent = metadata.failed.has(id) ? '動画情報を取得できません' : metadata.get(id) ? '' : 'YouTube';
    entry.subtitle.hidden = !entry.subtitle.textContent;
    entry.row.classList.toggle('is-current', id === currentId);
    updateFavorite(entry.favorite, id);
    entry.edit.hidden = !hasEditableVideo(id);
    entry.edit.setAttribute('aria-label', `${displayTitle(titleFor(id))}の情報を編集`);
    // メタデータの更新時も、フォーカスとスクロール位置を保つ。
    const expected = $('video-list').children[index];
    if (expected !== entry.row) $('video-list').insertBefore(entry.row, expected || null);
  });
  $('library-count').textContent = `${matching.length}曲${query ? ` / ${ids.length}曲` : ''}`;
  $('library-empty').hidden = matching.length > 0;
  $('library-empty').textContent = query ? '見つかりませんでした。別のキーワードを試してください。' : 'この分類に表示できる動画がありません。';
}
function scheduleLibraryRender() {
  clearTimeout(libraryRenderTimer);
  libraryRenderTimer = setTimeout(() => { if (panelId === 'library-panel') renderLibrary(); }, 100);
}
let sharedLoading;
let sharedLoadingLive = false;
let sharedRevision = 0;
let nextSharedRefreshAt = 0;
let sharedAvailable = null;
let sharedErrorCode;
let availabilityCheck;
let availabilityRevision = 0;
let nextAvailabilityCheckAt = 0;
const sharedReuseMs = 20_000;
const availabilityReuseMs = SHARED_STATUS_CACHE_SECONDS * 1000;
// 更新前に始まった一覧取得が後からCDNに入る時間も見込む。
const sharedLiveWindowMs = SHARED_BROWSE_CACHE_SECONDS * 1000 + 10_000;
function renderSharedAvailability() {
  if (sharedAvailable === false) {
    const reason = sharedErrorCode === SHARED_DAILY_LIMIT
      ? 'Cloudflareの1日のリクエスト上限に達したため、'
      : '共有データに接続できないため、';
    $('library-service-error-reason').textContent = reason;
    $('add-service-error-reason').textContent = reason;
  }
  $('library-service-error').hidden = sharedAvailable !== false;
  $('add-service-error').hidden = sharedAvailable !== false || Boolean(editingVideo?.local);
}
function setSharedAvailability(available, code) {
  sharedAvailable = available;
  sharedErrorCode = code;
  availabilityRevision++;
  nextAvailabilityCheckAt = Date.now() + availabilityReuseMs;
  renderSharedAvailability();
}
function checkSharedAvailability() {
  if (availabilityCheck || Date.now() < nextAvailabilityCheckAt) return;
  const revision = availabilityRevision;
  nextAvailabilityCheckAt = Date.now() + availabilityReuseMs;
  availabilityCheck = sharedClient.availability().then(status => {
    if (revision === availabilityRevision && status !== null) setSharedAvailability(status.available, status.code);
  }, error => {
    if (revision === availabilityRevision && error.status === 503) setSharedAvailability(false, error.code);
  }).finally(() => { availabilityCheck = null; });
}
function reconcilePublishedSelection(replaceImplicitVideo) {
  const wasWithdrawn = isWithdrawn(currentId);
  const requested = pendingSharedVideoId;
  if (!wasWithdrawn && !requested && !replaceImplicitVideo) return;
  pendingSharedVideoId = null;
  const candidates = playCandidateIds();
  currentId = requested && publishedIds().includes(requested) ? requested : candidates.includes(lastVideo) ? lastVideo : candidates[0] ?? null;
  if (wasWithdrawn || replaceImplicitVideo) {
    queuedAutoplay = false;
    playerRestore = null;
    clipEnded = false;
    playerFailed = false;
    lastRecordedId = null;
    $('seek').value = '0'; $('seek').disabled = true;
    $('current-time').textContent = '0:00'; $('duration').textContent = '0:00';
    $('player-notice').hidden = true;
    if (!player) {
      clearTimeout(playerTimeout);
      playerTimeout = undefined;
      $('youtube-player').removeAttribute('src');
    }
    if (playerReady) {
      player.pauseVideo();
      if (currentId) requestPlayback(youtubeVideoOptions(currentId, metadata.get(currentId)));
    }
  }
  if (wasWithdrawn || (requested && currentId !== requested)) toast('この曲は共有一覧で利用できません。「選ぶ」から別の曲を選べます。');
}
function showSharedReadStatus(failed = false) {
  const format = time => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time);
  const publicationDate = sharedPublishedAt ? `公開一覧 ${format(sharedPublishedAt)} 時点` : '';
  const cause = sharedLiveFailed ? '最新の共有一覧を取得できません' : failed ? '共有一覧を取得できません' : '';
  let status = publicationDate;
  if (cause) {
    status = cause;
    if (sharedVideos.length || withdrawnIds.size) {
      const when = sharedFetchedAt ? format(sharedFetchedAt) : '日時不明';
      status += publicationDate ? `。${publicationDate}のデータを表示中` : `。保存済みの一覧を表示中（最終取得 ${when}）`;
    }
  }
  if (sharedSyncPending) {
    const warning = '保存済みの変更を公開一覧に反映できていません';
    status = status ? `${status}。${warning}` : warning;
  }
  $('shared-status').textContent = status;
}
async function refreshSharedVideos({ fresh = false } = {}) {
  if (sharedLoading) {
    if (!fresh || sharedLoadingLive) return sharedLoading;
    await sharedLoading;
    return refreshSharedVideos({ fresh });
  }
  const now = Date.now();
  if (!fresh && (now < nextSharedRefreshAt || now < sharedLiveUntil)) return true;
  sharedLoadingLive = fresh;
  $('shared-status').textContent = '共有一覧を更新中…';
  $('retry-shared').disabled = true;
  const revision = sharedRevision;
  sharedLoading = (async () => {
    try {
      const { videos, withdrawnIds: unavailable, publishedAt } = await sharedClient.list({ includeMisc: true, classification: 'series', browse: !fresh });
      if (revision !== sharedRevision) { showSharedReadStatus(); return false; }
      nextSharedRefreshAt = Date.now() + sharedReuseMs;
      // 公開反映前のJSONでは、このタブで確認できた新しい編集内容を戻さない。
      if (!fresh && publishedAt && publishedAt < sharedLiveSince) { showSharedReadStatus(); return true; }
      const previous = metadata.get(currentId);
      const previousId = currentId;
      sharedVideos = videos;
      withdrawnIds = new Set(unavailable);
      sharedFetchedAt = Date.now();
      sharedPublishedAt = publishedAt ?? 0;
      if (publishedAt && publishedAt >= sharedLiveSince) sharedSyncPending = false;
      if (fresh) {
        sharedLiveSince = now;
        sharedLiveUntil = sharedFetchedAt + sharedLiveWindowMs;
        sharedLiveFailed = false;
        setSharedAvailability(true);
      }
      sharedVideos.forEach(video => metadata.seed(video.id, video, { replace: true }));
      savePublication();
      const initialVideo = metadata.get(currentId);
      const replaceImplicitVideo = !publicationReady && !readSharedVideoId(location.href) && initialVideo && !isPlayableVideo(initialVideo);
      publicationReady = true;
      reconcilePublishedSelection(replaceImplicitVideo);
      updateCurrent();
      const currentVideo = videos.find(video => video.id === currentId);
      if (currentVideo && previousId === currentId) syncEditedRange(currentId, previous, currentVideo);
      if (currentId && !player) preparePlayer();
      if (panelId === 'library-panel') renderLibrary();
      if (panelId === 'add-panel') updateAddUrlWarning();
      showSharedReadStatus();
      return true;
    } catch (error) {
      if (fresh) {
        sharedLiveFailed = true;
        if (error.status === 503) setSharedAvailability(false, error.code);
      }
      showSharedReadStatus(true);
      nextSharedRefreshAt = 0;
      if (pendingSharedVideoId) setStatus('共有された曲を取得できません。「選ぶ」から再試行してください。');
      return false;
    } finally {
      sharedLoading = null;
      $('retry-shared').disabled = false;
    }
  })();
  return sharedLoading;
}
$('retry-shared').addEventListener('click', () => refreshSharedVideos({ fresh: true }));
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
$('library-video-filter').value = settings.libraryCategory;
$('library-video-filter').addEventListener('change', event => {
  const filter = event.currentTarget.value;
  if (!isVideoCategory(filter)) return;
  settings.libraryCategory = filter;
  save(SETTINGS_KEY, settings);
  $('library-results').scrollTop = 0;
  renderLibrary();
});
$('video-sort').addEventListener('change', () => {
  librarySort = normalizeLibrarySort($('video-sort').value);
  save('library_sort', librarySort);
  $('library-results').scrollTop = 0;
  renderLibrary();
});

const addFields = ['url', 'category', 'playable', 'title', 'start', 'end', 'mode', 'difficulty', 'idol', 'result', 'orientation'];
const customChoiceValue = '__custom__';
const customChoiceFields = ['title', 'idol'];
for (const [value, label] of Object.entries(VIDEO_CATEGORIES)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  $('add-category').append(option);
}
for (const [field, choices] of Object.entries({ mode: VIDEO_MODES, difficulty: VIDEO_DIFFICULTIES, title: VIDEO_SONGS, idol: VIDEO_IDOLS })) {
  for (const value of choices) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = field === 'difficulty' ? difficultyLabel(value) : value;
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
let editingVideo = null;
let addDraft = null;
let formSaving = false;
let editOpening = false;
let editConflict = false;
function updateAddUrlWarning() {
  const sourceId = editingVideo ? null : readVideoIdFromUrl($('add-url').value);
  const count = sourceId ? uniqueIds(publishedIds()).filter(id => videoIdFor(id, metadata.get(id)) === sourceId).length : 0;
  const message = count ? `このYouTube動画は登録済みです（${count}件）。楽曲位置が異なる場合は追加できます。` : '';
  const warning = $('add-url-warning');
  if (warning.textContent !== message) warning.textContent = message;
}
$('add-url').addEventListener('input', updateAddUrlWarning);
function setAddInput(input = {}) {
  $('add-form').reset();
  for (const field of addFields) {
    const control = $(`add-${field}`);
    const value = input[field] ?? (field === 'orientation' ? 'standard' : '');
    if (customChoiceFields.includes(field) && value && !Array.from(control.options).some(option => option.value === value)) {
      control.value = customChoiceValue;
      $(`add-${field}-custom`).value = value;
    } else control.value = value;
  }
  for (const field of customChoiceFields) syncCustomChoice(field);
  addValidationShown = false;
  showAddErrors({});
}
function syncFormMode() {
  const editing = Boolean(editingVideo);
  const local = editingVideo?.local;
  $('add-heading').textContent = editing ? '動画情報を編集' : '動画を追加';
  $('add-posting-guide').hidden = editing;
  $('add-description').textContent = editing
    ? local ? '開始・終了時刻は任意です。その他の項目は必須です。変更はこのブラウザーだけに反映されます。'
      : '開始・終了時刻は任意です。その他の項目は必須です。変更は共有一覧に保存され、すべての利用者に反映されます。'
    : '開始・終了時刻は任意です。その他の項目は必須です。追加した動画と楽曲情報は公開され、すべての利用者の一覧に表示されます。';
  $('add-url').readOnly = editing;
  $('add-url-hint').textContent = editing ? 'YouTube URLと投稿者は変更できません。' : '共有URL・Shortsにも対応。投稿者は追加時に自動取得します。';
  updateAddUrlWarning();
  $('edit-author').hidden = !editingVideo?.author;
  $('edit-author').textContent = editing ? `投稿者：${authorFor(editingVideo)}` : '';
  $('add-submit-icon').innerHTML = icon(editing ? 'save' : 'plus');
  $('add-submit-label').textContent = editing ? '変更を保存' : '追加して再生';
  const backButton = $('add-panel').querySelector('[data-back]');
  backButton.dataset.back = editingVideo?.returnToPlayer ? 'settings-panel' : 'library-panel';
  backButton.setAttribute('aria-label', editingVideo?.returnToPlayer ? '設定に戻る' : '選曲に戻る');
  $('add-panel').querySelector('[data-close]').setAttribute('aria-label', editing ? '動画編集を閉じて再生画面に戻る' : '動画追加を閉じて再生画面に戻る');
  $('reload-edit').hidden = true;
  $('add-submit').disabled = false;
  editConflict = false;
  $('add-message').textContent = '';
  $('add-message').classList.remove('is-error');
  renderSharedAvailability();
}
function openAddForm() {
  if (formSaving || editOpening) { toast('処理が終わるまでお待ちください'); return; }
  if (editingVideo) {
    editingVideo = null;
    setAddInput(addDraft || {});
    addDraft = null;
  }
  syncFormMode();
  openPanel('add-panel');
}
async function openEditForm(id) {
  if (isWithdrawn(id)) return;
  if (formSaving || editOpening) { toast('処理が終わるまでお待ちください'); return; }
  const returnToPlayer = panelId === 'settings-panel';
  if (!returnToPlayer && panelId !== 'library-panel') return;
  const version = panelVersion;
  editOpening = true;
  try {
    let shared = sharedVideos.find(video => video.id === id);
    if (shared && !shared.revision) {
      if (!await refreshSharedVideos({ fresh: true })) throw new Error('編集用の情報を取得できませんでした。一覧を再読み込みしてください。');
      shared = sharedVideos.find(video => video.id === id);
    }
    // 取得を待つ間に戻る・再生などを選んだ場合は、その画面を維持する。
    if (panelVersion !== version || isWithdrawn(id) || (returnToPlayer && currentId !== id)) return;
    const local = customVideos.find(video => video.id === id);
    const video = shared || (local && { ...metadata.get(id), ...local });
    if (!video || (shared && !shared.revision)) throw new Error('この動画を編集できません。一覧を再読み込みしてください。');
    if (!editingVideo) addDraft = readAddInput();
    editingVideo = { ...video, local: !shared, returnToPlayer };
    setAddInput(videoToInput(video));
    syncFormMode();
    openPanel('add-panel');
  } catch (error) { if (panelVersion === version) toast(error.message); }
  finally { editOpening = false; }
}
$('reload-edit').addEventListener('click', async () => {
  if (!editingVideo || formSaving || editOpening) return;
  const { id, returnToPlayer } = editingVideo;
  const version = panelVersion;
  editOpening = true;
  $('reload-edit').disabled = true;
  try {
    if (!await refreshSharedVideos({ fresh: true })) throw new Error('最新の情報を取得できませんでした。通信を確認して再度お試しください。');
    if (panelVersion !== version) return;
    const video = sharedVideos.find(item => item.id === id);
    if (!video?.revision) throw new Error('動画が見つかりません。一覧に戻って確認してください。');
    editingVideo = { ...video, local: false, returnToPlayer };
    setAddInput(videoToInput(video));
    syncFormMode();
    $('add-message').textContent = '最新の情報を読み込みました。内容を確認してから保存してください。';
  } catch (error) { if (panelVersion === version) $('add-message').textContent = error.message; }
  finally { editOpening = false; $('reload-edit').disabled = false; }
});
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
  if ($('add-submit').disabled || formSaving || editOpening) return;
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
  const editing = editingVideo;
  if (!editing && [...sharedVideos, ...videoIds.map(id => ({ ...metadata.get(id), id }))].some(item => videoIdFor(item.id, item) === id && (item.startSeconds ?? 0) === (video.startSeconds ?? 0) && item.endSeconds === video.endSeconds)) {
    showAddErrors({ url: 'この動画の同じ区間は登録済みです。選曲一覧から選んでください。' });
    message.textContent = '同じ動画・同じ区間を重複して追加することはできません。';
    message.classList.add('is-error');
    $('add-url').focus();
    return;
  }
  $('add-submit').disabled = true;
  formSaving = true;
  for (const control of addControls) control.disabled = true;
  message.textContent = editing ? '変更を保存中…' : '投稿者を確認し、共有一覧に登録中…';
  try {
    // 一覧取得中の結果で、登録直後の動画を消さない。
    if (sharedLoading) await sharedLoading;
    let savedVideo;
    let publicationPending = false;
    if (editing?.local) {
      savedVideo = { ...video, id: editing.id, ...(editing.videoId ? { videoId: editing.videoId } : {}), ...(editing.author ? { author: editing.author } : {}), ...(editing.authorHandle ? { authorHandle: editing.authorHandle } : {}), ...(editing.authorUrl ? { authorUrl: editing.authorUrl } : {}) };
      customVideos = customVideos.map(item => item.id === editing.id ? savedVideo : item);
      save('custom_videos', customVideos);
    } else {
      const saveStartedAt = Date.now();
      const { publicationUpdated, ...saved } = editing ? await sharedClient.update(editing.id, editing.revision, input) : await sharedClient.add(input);
      savedVideo = saved;
      setSharedAvailability(true);
      publicationPending = publicationUpdated === false;
      sharedSyncPending = publicationPending;
      sharedRevision++;
      sharedVideos = editing ? sharedVideos.map(item => item.id === editing.id ? savedVideo : item) : [savedVideo, ...sharedVideos.filter(item => item.id !== savedVideo.id)];
      sharedLiveUntil = Date.now() + sharedLiveWindowMs;
      nextSharedRefreshAt = sharedLiveUntil;
      sharedLiveSince = saveStartedAt;
      savePublication();
      showSharedReadStatus();
    }
    const savedId = savedVideo.id;
    metadata.seed(savedId, savedVideo, { replace: true });
    if (!editing && !favorites.includes(savedId)) { favorites.unshift(savedId); save('fav_ids', favorites); }
    editingVideo = null;
    setAddInput(editing ? addDraft || {} : {});
    addDraft = null;
    syncFormMode();
    updateCurrent();
    if (editing) syncEditedRange(savedId, editing, savedVideo);
    if (panelId === 'library-panel') renderLibrary();
    // 確認中に別画面へ移動した場合は、再生中の曲を切り替えない。
    if (panelId === 'add-panel') {
      if (editing?.returnToPlayer) closePanel();
      else if (editing) openPanel('library-panel');
      else selectVideo(savedId);
    }
    toast(publicationPending
      ? '動画情報を保存しました。公開一覧への反映を確認できませんでした。'
      : editing ? editing.local ? 'このブラウザーの動画情報を更新しました' : '共有一覧の動画情報を更新しました' : '共有一覧と、この端末のお気に入りに追加しました');
  } catch (error) {
    if (error.errors && typeof error.errors === 'object') showAddErrors(error.errors);
    if (error.status === 503) {
      setSharedAvailability(false, error.code);
      message.textContent = '共有一覧への保存結果を確認できませんでした。時間をおいて再度お試しください。';
    } else {
      message.textContent = error.name === 'AbortError' || error instanceof TypeError ? '動画情報を取得できませんでした。通信を確認して、もう一度お試しください。' : error.message;
    }
    message.classList.add('is-error');
    if (editing && error.code === 'conflict') {
      editConflict = true;
      $('reload-edit').hidden = false;
    }
  } finally {
    formSaving = false;
    $('add-submit').disabled = editConflict;
    for (const control of addControls) control.disabled = false;
  }
});

function iframeUrl(id) {
  const parameters = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', controls: settings.youtubeControls ? '1' : '0', origin: location.origin });
  const options = youtubeVideoOptions(id, metadata.get(id));
  parameters.set('start', String(options.startSeconds));
  if (options.endSeconds !== undefined) parameters.set('end', String(options.endSeconds));
  // 区間付き動画ではキー操作をアプリ側で受ける。
  if (options.endSeconds !== undefined) parameters.set('disablekb', '1');
  return `https://www.youtube.com/embed/${options.videoId}?${parameters}`;
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
function requestPlayback(options, playing = false) {
  if (!isVideoId(options.videoId)) return;
  playbackSession.begin(currentId, options.videoId, options.startSeconds, player.getCurrentTime());
  if (playing) player.loadVideoById(options);
  else player.cueVideoById(options);
}
function restoreClipStart(time) {
  // 標準シークで曲の前へ移動した場合だけ戻す。開始直前の微小な時刻差は許容する。
  const data = metadata.get(currentId);
  if (!(data?.startSeconds > 0) || time >= rangeFor(currentId).start - 1 || player.getVideoData()?.video_id !== youtubeIdFor(currentId)) return false;
  requestPlayback(youtubeVideoOptions(currentId, data), true);
  return true;
}
function notice(message, retry = false) {
  $('player-notice-text').textContent = message;
  $('player-notice').hidden = false;
  $('retry-player').hidden = !retry;
}
function selectVideo(id) {
  if (!isEntryId(id) || isWithdrawn(id)) return;
  pendingSharedVideoId = null;
  currentId = id;
  playerRestore = null;
  lastRecordedId = null;
  clipEnded = false;
  playerFailed = false;
  save('aikatsu_last_video_v2', id);
  try {
    const url = new URL(location.href);
    url.searchParams.set('v', id);
    window.history.replaceState(window.history.state, '', url);
  } catch { /* 選曲はURLの更新ができない環境でも使える。 */ }
  $('player-notice').hidden = true;
  $('seek').value = '0'; $('current-time').textContent = '0:00'; $('duration').textContent = '0:00';
  setStatus('動画を読み込み中…');
  updateCurrent();
  if (panelId) closePanel();
  if (!youtubeIdFor(id)) { notice('楽曲情報を取得できません。「選ぶ」から一覧を再読み込みしてください。', true); return; }
  if (playerReady) requestPlayback(youtubeVideoOptions(id, metadata.get(id)), true);
  else {
    // APIの準備が終わった際に、最後に選択された動画を再生する。
    queuedAutoplay = true;
    if (!player) preparePlayer();
  }
  if (!metadata.get(id)) metadata.fetch(id).then(() => { if (id === currentId) updateCurrent(); }).catch(() => {});
}
$('shuffle').addEventListener('click', () => {
  const category = settings.shuffleCategory;
  const candidates = allIds().filter(id =>
    metadata.get(id) && !unplayable.has(id) && (category === 'all' || categoryFor(id) === category)
  );
  const id = chooseRandom(candidates, currentId, history.slice(0, 8));
  if (id) selectVideo(id);
  else toast(category === 'all'
    ? '再生できる候補がありません。「選ぶ」から動画を追加してください。'
    : `${categoryLabel(category)}に再生できる動画がありません。設定の「おまかせの対象」で分類を変更できます。`);
});
$('share-current').addEventListener('click', () => {
  if (!publishedIds().includes(currentId)) return;
  const url = buildXShareUrl(location.href, { ...metadata.get(currentId), id: currentId });
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});
$('play-toggle').addEventListener('click', () => {
  if (!playerReady || !youtubeIdFor(currentId)) return;
  if (player.getPlayerState() === 1) player.pauseVideo();
  else if (clipEnded || player.getPlayerState() === 0) {
    clipEnded = false;
    requestPlayback(youtubeVideoOptions(currentId, metadata.get(currentId)), true);
  } else player.playVideo();
});
$('seek').addEventListener('input', () => {
  if (!playerReady || !youtubeIdFor(currentId)) return;
  seeking = true;
  $('current-time').textContent = formatTime(Number($('seek').value) / 100 * rangeFor(currentId).duration);
});
$('seek').addEventListener('change', () => {
  if (playerReady && youtubeIdFor(currentId)) {
    const target = seekTimeForPercent(metadata.get(currentId), Number($('seek').value), player.getDuration());
    const options = youtubeVideoOptions(currentId, metadata.get(currentId));
    const range = rangeFor(currentId);
    if (range.duration > 0 && target >= range.end) {
      // 動画終端も直前へcueして終了扱いにし、ENDEDだけを待つpendingを残さない。
      requestPlayback({ ...options, startSeconds: range.end - Math.min(0.01, range.duration / 2) });
      finishClip();
    } else if (options.endSeconds !== undefined) {
      const playing = player.getPlayerState() === 1;
      clipEnded = false;
      const selection = { ...options, startSeconds: target };
      // seekToはendSecondsを解除するため、終了位置も合わせて指定する。
      requestPlayback(selection, playing);
    } else {
      clipEnded = false;
      playbackSession.begin(currentId, options.videoId, target, player.getCurrentTime());
      player.seekTo(target, true);
    }
  }
  seeking = false;
});
$('seek').addEventListener('blur', () => { seeking = false; });
$('retry-player').addEventListener('click', () => location.reload());
$('replay').addEventListener('click', () => {
  if (!youtubeIdFor(currentId)) return;
  playerRestore = null;
  clipEnded = false;
  if (playerReady) requestPlayback(youtubeVideoOptions(currentId, metadata.get(currentId)), true);
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
  if (!publicationReady || !youtubeIdFor(currentId) || player || playerTimeout) return;
  setStatus('プレーヤーを準備中…');
  $('youtube-player').src = iframeUrl(currentId);
  playerTimeout = setTimeout(() => {
    if (!playerReady) {
      setStatus(settings.youtubeControls ? '動画内の再生ボタンを押してください' : '再生操作を読み込めませんでした');
      notice('再生操作の読み込みに時間がかかっています。', true);
    }
  }, 15000);
  if (window.YT?.Player) createPlayer();
  else if (!playerScriptRequested) {
    playerScriptRequested = true;
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => {
      clearTimeout(playerTimeout);
      setStatus(settings.youtubeControls ? '動画内の再生ボタンを押してください' : '再生操作を読み込めませんでした');
      notice('再生操作を読み込めませんでした。通信を確認してください。', true);
    };
    document.head.append(script);
  }
}
function reloadPlayerControls() {
  const iframe = $('youtube-player');
  if (!iframe.hasAttribute('src') || !youtubeIdFor(currentId)) return;
  if (playerReady) {
    const state = player.getPlayerState();
    queuedAutoplay = !playerFailed && (state === 1 || state === 3);
    if (!playerFailed && !playbackSession.pending && player.getVideoData()?.video_id === youtubeIdFor(currentId)) {
      const { start, end, duration } = rangeFor(currentId);
      const ended = clipEnded || state === 0;
      const time = player.getCurrentTime();
      const startSeconds = ended && duration > 0
        ? end - Math.min(0.01, duration / 2)
        : Number.isFinite(time) ? Math.max(start, Math.min(time, end || Infinity)) : start;
      playerRestore = { id: currentId, startSeconds, ended };
    }
  }
  // controlsはプレーヤーの読み込み時に指定するため、同じ曲を新しいiframeで開く。
  const replacement = iframe.cloneNode(false);
  replacement.removeAttribute('src');
  const previousPlayer = player;
  player = undefined;
  playerReady = false;
  playerFailed = false;
  seeking = false;
  clearTimeout(playerTimeout);
  playerTimeout = undefined;
  previousPlayer?.destroy();
  iframe.remove();
  videoBox.append(replacement);
  $('seek').disabled = true;
  $('player-notice').hidden = true;
  updateCurrent();
  preparePlayer();
}
function onPlayerReady(event) {
  if (event.target !== player) return;
  playerReady = true;
  clearTimeout(playerTimeout);
  const restore = playerRestore?.id === currentId ? playerRestore : null;
  playerRestore = null;
  const autoplay = queuedAutoplay && !libraryDialog.open && !restore?.ended;
  queuedAutoplay = false;
  const options = youtubeVideoOptions(currentId, metadata.get(currentId));
  if (restore) options.startSeconds = restore.startSeconds;
  if (restore?.ended) clipEnded = true;
  if (libraryDialog.open || !youtubeIdFor(currentId)) player.pauseVideo();
  $('play-toggle').disabled = !youtubeIdFor(currentId); $('mute-toggle').disabled = false;
  applyVideoVolume();
  if (!playerFailed) {
    $('player-notice').hidden = true;
    updatePlayButton(false);
    setStatus(clipEnded ? '楽曲の再生が終了しました' : '');
  }
  requestPlayback(options, autoplay);
}
function onPlayerStateChange(event) {
  if (event.target !== player || !playerReady) return;
  const state = event.data;
  // 読み込み完了が画面を開いた後になった場合も、裏で再生させない。
  if (libraryDialog.open && (state === 1 || state === 3)) {
    event.target.pauseVideo();
    return;
  }
  if (!playbackSession.accept(currentId, event.target.getVideoData()?.video_id, state, event.target.getCurrentTime(), { native: true })) return;
  if (state === 0 && player.getCurrentTime() < Math.min(rangeFor(currentId).end, player.getDuration() || Infinity) - 1) return;
  if (state === 0) clipEnded = true;
  if (state === 1) clipEnded = false;
  if (state === 2 && clipEnded && player.getCurrentTime() < rangeFor(currentId).end - 0.1) clipEnded = false;
  const finished = clipEnded || state === 0;
  updatePlayButton(state === 1);
  if (playerFailed) return;
  setStatus(state === 1 ? '再生中' : finished ? '楽曲の再生が終了しました' : state === 2 ? '一時停止中' : state === 3 ? '動画を読み込み中…' : '');
  if (state === 1) {
    const range = rangeFor(currentId);
    if (metadata.get(currentId)?.endSeconds && player.getCurrentTime() >= range.end) { finishClip(); return; }
    if (restoreClipStart(player.getCurrentTime())) return;
    // 開始はcue/loadで指定済み。キーフレームの時刻差で同じ動画を再ロードしない。
    $('player-notice').hidden = true;
    const playingId = player.getVideoData()?.video_id;
    if (playingId === youtubeIdFor(currentId) && lastRecordedId !== currentId) {
      lastRecordedId = currentId;
      history = [currentId, ...history.filter(id => id !== currentId)].slice(0, 30);
      save('hist_ids', history);
      if (panelId === 'library-panel' && libraryTab === 'history') renderLibrary();
    }
  }
}
function updatePlayButton(playing) {
  setIcon($('play-toggle'), playing ? 'pause' : clipEnded ? 'replay' : 'play');
  $('play-toggle').setAttribute('aria-label', playing ? '一時停止' : clipEnded ? 'もう一度再生' : '再生');
}
function createPlayer() {
  if (!youtubeIdFor(currentId) || player || !window.YT?.Player) return;
  player = new window.YT.Player('youtube-player', {
    events: {
      onReady: onPlayerReady, onStateChange: onPlayerStateChange,
      onError: event => {
        if (event.target !== player) return;
        playerFailed = true;
        unplayable.add(currentId);
        setStatus('この動画を再生できません');
        notice([101, 150].includes(event.data) ? 'この動画は埋め込み再生が許可されていません。別の動画を選ぶか、YouTubeで開いてください。' : event.data === 100 ? '動画が非公開、または削除されています。別の動画を選んでください。' : '動画を読み込めませんでした。別の動画を選ぶか、YouTubeで開いてください。');
      },
      onAutoplayBlocked: event => {
        if (event.target !== player) return;
        updatePlayButton(false);
        setStatus('再生ボタンを押してスタート');
      }
    }
  });
}
window.onYouTubeIframeAPIReady = createPlayer;
if (!currentId && !pendingSharedVideoId) {
  setStatus('楽曲を登録すると、動画に合わせて遊べます');
}
setInterval(() => {
  if (!playerReady) return;
  if (!playbackSession.accept(currentId, player.getVideoData()?.video_id, player.getPlayerState(), player.getCurrentTime())) return;
  const position = getClipPosition(metadata.get(currentId), player.getCurrentTime(), player.getDuration());
  // 停止中の標準シークは状態変更通知が来ない場合もある。
  if (clipEnded && player.getPlayerState() === 2 && player.getCurrentTime() < position.end - 0.1) onPlayerStateChange({ data: 2, target: player });
  $('seek').disabled = !(position.duration > 0) || playerFailed;
  $('duration').textContent = formatTime(position.duration);
  if (!seeking) {
    $('current-time').textContent = formatTime(clipEnded ? position.duration : position.elapsed);
    $('seek').value = clipEnded ? '100' : String(position.percent);
  }
  // seekToでYouTubeのendSecondsが解除されても、楽曲の終端で停止する。
  if (!playerFailed && player.getPlayerState() === 1) {
    const time = player.getCurrentTime();
    if (metadata.get(currentId)?.endSeconds && time >= position.end) {
      finishClip();
    } else restoreClipStart(time);
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
const padLayoutSelect = $('pad-layout');
for (const layout of CONTROLLER_LAYOUTS) padLayoutSelect.add(new Option(layout.label, layout.id));
function syncSettings() {
  $('app').dataset.appearance = settings.appearance;
  $('app').dataset.controlSide = settings.controlSide;
  $('app').classList.toggle('no-effects', !settings.effects || reducedMotion.matches);
  $('sound-enabled').checked = settings.sound;
  $('sound-volume').value = String(settings.soundVolume);
  $('sound-volume').disabled = !settings.sound;
  $('sound-volume-value').value = `${settings.soundVolume}%`;
  $('video-volume').value = String(settings.videoVolume);
  $('video-volume-value').value = `${settings.videoVolume}%`;
  $('youtube-controls').checked = settings.youtubeControls;
  $('vibration-enabled').checked = settings.vibration && vibrationSupported;
  $('vibration-enabled').disabled = !vibrationSupported;
  $('vibration-support').textContent = vibrationSupported ? '' : 'この端末では利用できません';
  $('effects-enabled').checked = settings.effects;
  padLayoutSelect.value = settings.padLayout;
  $('control-side').value = settings.controlSide;
  $('shuffle-category').value = settings.shuffleCategory;
  $('appearance').value = settings.appearance;
}
$('youtube-controls').addEventListener('change', () => {
  settings.youtubeControls = $('youtube-controls').checked;
  save(SETTINGS_KEY, settings);
  reloadPlayerControls();
});
for (const [id, key] of [['sound-enabled', 'sound'], ['vibration-enabled', 'vibration'], ['effects-enabled', 'effects']]) {
  $(id).addEventListener('change', () => { settings[key] = $(id).checked; save(SETTINGS_KEY, settings); syncSettings(); });
}
$('shuffle-category').addEventListener('change', () => {
  settings.shuffleCategory = $('shuffle-category').value;
  save(SETTINGS_KEY, settings);
});
for (const [id, key] of [['sound-volume', 'soundVolume'], ['video-volume', 'videoVolume']]) {
  $(id).addEventListener('input', () => {
    settings[key] = Number($(id).value);
    if (id === 'video-volume') { settings.muted = false; applyVideoVolume(); }
    $(`${id}-value`).value = `${settings[key]}%`;
  });
  $(id).addEventListener('change', () => save(SETTINGS_KEY, settings));
}
$('appearance').addEventListener('change', () => { settings.appearance = $('appearance').value; save(SETTINGS_KEY, settings); syncSettings(); });
padLayoutSelect.addEventListener('change', () => {
  settings.padLayout = padLayoutSelect.value;
  applyPadLayout(settings.padLayout);
  save(SETTINGS_KEY, settings);
});
$('control-side').addEventListener('change', () => { settings.controlSide = $('control-side').value; save(SETTINGS_KEY, settings); syncSettings(); });
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
// 初回は公開状態を確認してから動画を読み込む。通信失敗時は保存済みの状態で再生できる。
refreshSharedVideos().then(() => {
  publicationReady = true;
  if (!currentId || isWithdrawn(currentId)) return;
  if (!metadata.get(currentId)) metadata.fetch(currentId).then(updateCurrent).catch(() => {});
  preparePlayer();
});

const playTap = createTapAudio();
const padArea = document.querySelector('.pad-area');
const keyNames = { ' ': 'Space', arrowup: '↑', arrowleft: '←', arrowright: '→', arrowdown: '↓' };
let padInput;
let controllerLayout;
function applyPadLayout(layoutId) {
  controllerLayout = getControllerLayout(layoutId);
  padInput = createPadInput(keysForLayout(controllerLayout));
  $('sparkles').replaceChildren();
  renderControllerPads(padArea, controllerLayout.id);
  // 設定を閉じた直後から、スペースキーでも新しいパネルを演奏できる。
  if (panelId === 'settings-panel') panelOpener = padArea.querySelector('[data-pad]');
  const guide = controllerLayout.pads.map(pad => {
    const item = document.createElement('span');
    const key = document.createElement('kbd');
    key.textContent = pad.keys.map(value => keyNames[value] ?? value.toUpperCase()).join(' / ');
    item.append(key, pad.label);
    return item;
  });
  $('pad-key-guide').replaceChildren(...guide);
  refreshPads();
}
applyPadLayout(settings.padLayout);
function refreshPads() {
  const active = padInput.activeColors();
  padArea.querySelectorAll('[data-pad]').forEach(button => button.classList.toggle('is-active', active.has(button.dataset.pad)));
}
function clearPads() { padInput.clear(); refreshPads(); }
function tap(padId, point) {
  const control = controllerLayout.pads.find(item => item.id === padId);
  if (!control) return;
  if (settings.sound) playTap(settings.soundVolume, control.sound);
  if (settings.vibration && vibrationSupported) { try { navigator.vibrate(12); } catch { /* 非対応端末では無視する。 */ } }
  if (!settings.effects || reducedMotion.matches) return;
  const pad = $(`btn-${padId}`).querySelector('.pad-symbol').getBoundingClientRect();
  const layer = $('sparkles').getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const spark = document.createElement('span'); spark.className = 'sparkle'; spark.textContent = '✦';
    spark.style.left = `${(point?.x ?? pad.left + pad.width / 2) - layer.left}px`;
    spark.style.top = `${(point?.y ?? pad.top + pad.height / 2) - layer.top}px`;
    const angle = i / 6 * Math.PI * 2 + Math.random() * .4;
    spark.style.setProperty('--dx', `${Math.cos(angle) * pad.width * .5}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * pad.width * .5}px`);
    spark.style.setProperty('--sparkle-color', control.color);
    $('sparkles').append(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
    setTimeout(() => spark.remove(), 650);
  }
}
padArea.addEventListener('pointerdown', event => {
  const button = event.target.closest('[data-pad]');
  if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  button.focus({ preventScroll: true });
  padArea.setPointerCapture(event.pointerId);
  padInput.updatePointer(event.pointerId, button.dataset.pad);
  tap(button.dataset.pad, { x: event.clientX, y: event.clientY });
  refreshPads();
});
padArea.addEventListener('pointermove', event => {
  if (!padInput.hasPointer(event.pointerId)) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pad]');
  const padId = target?.dataset.pad ?? null;
  if (padInput.updatePointer(event.pointerId, padId)) tap(padId, { x: event.clientX, y: event.clientY });
  refreshPads();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  padArea.addEventListener(name, event => { padInput.endPointer(event.pointerId); refreshPads(); });
}
padArea.addEventListener('click', event => {
  const button = event.target.closest('[data-pad]');
  if (!button || event.detail !== 0) return;
  tap(button.dataset.pad); button.classList.add('is-active'); setTimeout(refreshPads, 130);
});
function isEditing(element) { return element instanceof Element && Boolean(element.closest('input, textarea, select, [contenteditable="true"]')); }
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!padInput.hasKey(key) || panelId || event.ctrlKey || event.altKey || event.metaKey || isEditing(event.target)) return;
  // Space/Enter must still activate a focused navigation or playback button.
  if ((key === ' ' || key === 'enter') && event.target.closest?.('a, button:not([data-pad])')) return;
  event.preventDefault();
  if (event.repeat) return;
  const padId = padInput.keyDown(key);
  if (padId) { tap(padId); refreshPads(); }
});
document.addEventListener('keyup', event => { padInput.keyUp(event.key.toLowerCase()); refreshPads(); });
window.addEventListener('blur', clearPads);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearPads(); });
