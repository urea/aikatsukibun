// YouTubeの通知にはload/cueの識別子がないため、前の曲の時刻で新しい曲を判定しない。
const EARLY_TOLERANCE = 1;
const LATE_TOLERANCE = 2;
const POSITION_CHANGE = 0.01;
const validTime = value => Number.isFinite(value) && value >= 0;

export function createPlaybackSession({ now = () => performance.now() } = {}) {
  let session;

  function begin(entryId, sourceId, targetTime, previousTime) {
    if (typeof entryId !== 'string' || !entryId || typeof sourceId !== 'string' || !sourceId || !validTime(targetTime)) {
      throw new TypeError('Playback requires an entry, a source video, and a valid target time.');
    }
    const sourceChanged = Boolean(session && session.sourceId !== sourceId);
    session = {
      entryId, sourceId, targetTime, sourceChanged, requestedAt: now(),
      previousTime: validTime(previousTime) ? previousTime : null,
      pending: true, transitionSeen: false, firstArrival: null,
    };
  }

  // nativeはYouTubeの状態変更通知だけに付ける。周期処理の古い状態では切替完了とみなさない。
  function accept(entryId, sourceId, state, currentTime, options = {}) {
    if (!session || session.entryId !== entryId || session.sourceId !== sourceId || !validTime(currentTime)) return false;
    if (!session.pending) return true;
    // 前の曲の終了通知が次の開始位置で届く場合も、切替完了の根拠にしない。
    if (state === 0) return false;
    if (options?.native === true && [-1, 3, 5].includes(state)) session.transitionSeen = true;
    if (![1, 2, 5].includes(state)) return false;

    // 背景タブで開始直後の通知を逃しても、経過時間に応じて正常な再生位置を受け付ける。
    const elapsed = Math.max(0, (now() - session.requestedAt) / 1000);
    const arrived = time => time >= Math.max(0, session.targetTime - EARLY_TOLERANCE)
      && time <= session.targetTime + LATE_TOLERANCE + elapsed;
    if (!arrived(currentTime)) return false;

    const ambiguousPosition = !session.sourceChanged && session.previousTime !== null && arrived(session.previousTime);
    if (ambiguousPosition && !session.transitionSeen) {
      // 再再生や隣接区間では前の時刻と一致しうる。状態変更がなければ実際の進行を待つ。
      if (session.firstArrival === null) {
        session.firstArrival = currentTime;
        return false;
      }
      if (Math.abs(currentTime - session.firstArrival) <= POSITION_CHANGE) return false;
    }
    session.pending = false;
    return true;
  }

  return { begin, accept, get pending() { return Boolean(session?.pending); } };
}
