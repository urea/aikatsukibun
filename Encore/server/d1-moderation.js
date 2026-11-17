import { isEntryId, isVideoCategory, isVideoId } from '../model.js';

const ROW_COLUMNS = `entry.video_id AS entry_id, entry.source_id,
  entry.data ->> '$.title' AS title, entry.data ->> '$.startSeconds' AS start_seconds,
  entry.data ->> '$.endSeconds' AS end_seconds, entry.withdrawn,
  entry.data ->> '$.withdrawnAt' AS withdrawn_at`;
const OTHER_WITHDRAWN = `EXISTS (
  SELECT 1 FROM encore_shared_videos sibling
  WHERE sibling.source_id = entry.source_id AND sibling.video_id <> entry.video_id AND sibling.withdrawn = 1
)`;
const LIST_ENTRY = `SELECT ${ROW_COLUMNS}, entry.data ->> '$.category' AS category,
  entry.data -> '$.playable' AS playable, ${OTHER_WITHDRAWN} AS other_withdrawn
  FROM encore_shared_videos entry WHERE entry.video_id = ?1`;

function moderationRow(row) {
  const result = { ...row, withdrawn: row.withdrawn === 1 };
  if (Object.hasOwn(row, 'other_withdrawn')) {
    result.other_withdrawn = row.other_withdrawn === 1;
    result.playable = row.playable === null ? null : JSON.parse(row.playable);
  }
  return result;
}

export function createD1ModerationStore(db) {
  const listEntryStatement = entryId => db.prepare(LIST_ENTRY).bind(entryId);

  function listStatement(sourceId) {
    const filter = sourceId === null ? '' : 'WHERE entry.source_id = ?1';
    const statement = db.prepare(`SELECT ${ROW_COLUMNS} FROM encore_shared_videos entry ${filter}
      ORDER BY entry.source_id, entry.clip_start, entry.created_at, entry.video_id`);
    return sourceId === null ? statement : statement.bind(sourceId);
  }

  async function applyChange(change, list) {
    // The write and its result share a D1 transaction, including source-wide visibility checks.
    const [updated, selected] = await db.batch([change, list]);
    return { changed: updated.meta.changes, rows: selected.results.map(moderationRow) };
  }

  return {
    async list(sourceId = null) {
      if (sourceId !== null && !isVideoId(sourceId)) throw new TypeError('Invalid source video');
      return (await listStatement(sourceId).all()).results.map(moderationRow);
    },
    async listEntry(entryId) {
      if (!isEntryId(entryId)) throw new TypeError('Invalid song entry');
      return (await listEntryStatement(entryId).all()).results.map(moderationRow);
    },
    async changeVisibility(action, sourceId, at = new Date()) {
      if (!isVideoId(sourceId) || !['hide', 'restore'].includes(action)) throw new TypeError('Invalid moderation operation');
      const hide = action === 'hide';
      const data = hide ? "json_set(data, '$.withdrawnAt', ?2)" : "json_remove(data, '$.withdrawnAt')";
      const statement = db.prepare(`UPDATE encore_shared_videos
        SET data = ${data}, revision = lower(hex(randomblob(16)))
        WHERE source_id = ?1 AND withdrawn = ${hide ? '0' : '1'}`);
      const change = hide ? statement.bind(sourceId, at.toISOString()) : statement.bind(sourceId);
      return applyChange(change, listStatement(sourceId));
    },
    async markMisc(entryId, { restoreWithdrawn = false } = {}) {
      if (!isEntryId(entryId) || typeof restoreWithdrawn !== 'boolean') throw new TypeError('Invalid song category operation');
      const data = restoreWithdrawn ? "json_remove(data, '$.withdrawnAt')" : 'data';
      const eligible = restoreWithdrawn
        ? "(data ->> '$.category' IS NOT 'misc' OR withdrawn = 1)"
        : "data ->> '$.category' IS NOT 'misc' AND withdrawn = 0";
      const change = db.prepare(`UPDATE encore_shared_videos
        SET data = json_set(${data}, '$.category', 'misc'), revision = lower(hex(randomblob(16)))
        WHERE video_id = ?1 AND ${eligible}`).bind(entryId);
      return applyChange(change, listEntryStatement(entryId));
    },
    async classifyEntry(entryId, category, playable) {
      if (!isEntryId(entryId) || !isVideoCategory(category) || (playable !== undefined && typeof playable !== 'boolean')) {
        throw new TypeError('Invalid song classification');
      }
      const setPlayable = playable !== undefined;
      const patch = setPlayable ? "json_set(data, '$.category', ?2, '$.playable', json(?3))" : "json_set(data, '$.category', ?2)";
      const differentPlayable = setPlayable ? " OR data -> '$.playable' IS NOT ?3" : '';
      const statement = db.prepare(`UPDATE encore_shared_videos AS entry
        SET data = ${patch}, revision = lower(hex(randomblob(16)))
        WHERE video_id = ?1 AND withdrawn = 0 AND NOT ${OTHER_WITHDRAWN}
          AND (data ->> '$.category' IS NOT ?2${differentPlayable})`);
      const change = setPlayable ? statement.bind(entryId, category, JSON.stringify(playable)) : statement.bind(entryId, category);
      return applyChange(change, listEntryStatement(entryId));
    },
  };
}
