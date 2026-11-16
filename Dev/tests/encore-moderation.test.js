import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { categoryLabel } from '../../Encore/model.js';
import { createModerationStore } from '../../Encore/server/moderation.js';
import { runModerationCli } from '../../Encore/tools/moderate-videos.mjs';

const sourceId = 'XTAE6nTGf3w';
const clipId = 'clip_0123456789abcdef0123456789abcdef';
const otherSourceId = 'lTLqkpcqWs8';
const legacyRow = { entry_id: sourceId, source_id: sourceId, title: '既存曲', start_seconds: null, end_seconds: null, withdrawn: false, withdrawn_at: null };
const clipRow = { entry_id: clipId, source_id: sourceId, title: '別の区間', start_seconds: 435, end_seconds: 531, withdrawn: true, withdrawn_at: '2026-11-14T03:00:00.000Z' };
const at = new Date('2026-11-15T03:34:56.000Z');
const fakeConnection = 'postgresql://example:secret-marker@example.invalid/encore_db';

function fixture(overrides = {}) {
  const calls = [];
  const outputs = [];
  const errors = [];
  const run = args => runModerationCli(args, {
    async read(path, encoding) {
      calls.push(['read', fileURLToPath(path), encoding]);
      return `# local only\nDATABASE_URL="${fakeConnection}"\n`;
    },
    makeStore(connection) {
      calls.push(['connect', connection]);
      return {
        async list(id) { calls.push(['list', id]); return [legacyRow, clipRow]; },
        async changeVisibility(action, id, when) {
          calls.push(['change', action, id, when]);
          return { changed: 1, rows: [legacyRow, clipRow].map(row => ({ ...row, withdrawn: action === 'hide' })) };
        },
      };
    },
    now: () => at, output: message => outputs.push(message), error: message => errors.push(message),
    ...overrides,
  });
  return { calls, outputs, errors, run };
}

test('管理操作の適用後に公開JSONを更新し、同期失敗を安全に報告する', async () => {
  let publishes = 0;
  const cli = fixture({
    async publish(connection) {
      assert.equal(connection, fakeConnection);
      publishes++;
      if (publishes === 2) throw new Error(fakeConnection);
      return { publication: { publishedAt: at.toISOString() }, changed: true };
    },
  });
  assert.equal(await cli.run(['hide', sourceId]), 0);
  assert.equal(publishes, 0);
  assert.equal(await cli.run(['hide', sourceId, '--apply']), 0);
  assert.equal(publishes, 1);
  assert.match(cli.outputs.join('\n'), /公開一覧 更新/);
  assert.equal(await cli.run(['restore', sourceId, '--apply']), 1);
  assert.equal(publishes, 2);
  assert.match(cli.errors.join('\n'), /DBの操作は完了しました。公開一覧への反映に失敗/);
  assert.doesNotMatch(cli.errors.join('\n'), /secret-marker/);
});

test('a hide or restore preview uses only the explicitly scoped Encore environment and lists its candidates', async () => {
  for (const action of ['hide', 'restore']) {
    const cli = fixture();
    assert.equal(await cli.run([action, `https://youtu.be/${sourceId}?t=435`]), 0);
    assert.deepEqual(cli.calls, [
      ['read', fileURLToPath(new URL('../../Encore/.env.local', import.meta.url)), 'utf8'],
      ['connect', fakeConnection],
      ['list', sourceId],
    ]);
    assert.match(cli.outputs.join('\n'), /プレビュー.*XTAE6nTGf3w.*2曲/);
    assert.match(cli.outputs.join('\n'), /変更予定: 1曲/);
    assert.match(cli.outputs.join('\n'), /12:34:56 \(JST\)/);
    assert.match(cli.outputs.join('\n'), /別の区間｜7:15〜8:51/);
    assert.match(cli.outputs.join('\n'), /非表示 \(2026\/11\/14 12:00:00 \(JST\)\)/);
    assert.match(cli.outputs.join('\n'), new RegExp(`\\b${action} ${sourceId} --apply`));
    assert.doesNotMatch(cli.outputs.join('\n'), /secret-marker/);
    assert.deepEqual(cli.errors, []);
  }
});

test('list can read all sources, and only the exact apply argument calls the write operation', async () => {
  const list = fixture();
  assert.equal(await list.run(['list']), 0);
  assert.deepEqual(list.calls.at(-1), ['list', null]);
  assert.match(list.outputs[0], /全件/);
  assert.doesNotMatch(list.outputs.join('\n'), /変更/);

  for (const action of ['hide', 'restore']) {
    const cli = fixture();
    assert.equal(await cli.run([action, sourceId, '--apply']), 0);
    assert.deepEqual(cli.calls.at(-1), ['change', action, sourceId, at]);
    assert.equal(cli.calls.some(([method]) => method === 'list'), false);
    assert.match(cli.outputs.join('\n'), /変更: 1曲/);
  }
});

test('help and invalid invocation do not read the environment or construct a database store', async () => {
  const cli = fixture();
  assert.equal(await cli.run(['--help']), 0);
  assert.match(cli.outputs[0], /まず --apply を付けずに実行/);
  for (const args of [
    ['hide'], ['restore', clipId], ['hide', sourceId, '--appl'], ['list', sourceId, '--apply'],
    ['hide', sourceId, '--apply', '--apply'], ['hide', '--apply', sourceId], ['delete', sourceId],
    ['hide', fakeConnection, '--apply'], ['hide', sourceId, '--restore-withdrawn'],
    ['misc'], ['misc', `https://youtu.be/${sourceId}`], ['misc', clipId, '--restore-withdrawn', '--restore-withdrawn'],
    ['misc', clipId, '--apply', '--apply'], ['misc', clipId, '--restore'],
    ['classify', clipId, 'encore'], ['classify', clipId, 'unlisted', 'watch'],
    ['classify', clipId, 'other', 'false'], ['classify', clipId, 'misc', 'watch', '--apply', '--apply'],
    ['classify', clipId, 'other', 'watch', '--restore-withdrawn'], ['classify', `https://youtu.be/${sourceId}`, 'other', 'watch'],
  ]) assert.equal(await cli.run(args), 2);
  assert.deepEqual(cli.calls, []);
  assert.doesNotMatch(cli.errors.join('\n'), /secret-marker/);
});

test('the CLI never falls back to another environment or prints connection errors', async () => {
  for (const read of [async () => { throw new Error(fakeConnection); }, async () => 'OTHER_URL=other-secret', async () => 'DATABASE_URL=https://other-secret']) {
    const cli = fixture({ read });
    assert.equal(await cli.run(['list']), 1);
    assert.deepEqual(cli.calls, []);
    assert.match(cli.errors[0], /Encore\/\.env\.local の DATABASE_URL/);
    assert.doesNotMatch(cli.errors.join('\n'), /secret-marker|other-secret/);
  }

  const cli = fixture({ makeStore: () => ({ changeVisibility: () => { throw new Error(fakeConnection); } }) });
  assert.equal(await cli.run(['hide', sourceId, '--apply']), 1);
  assert.match(cli.errors[0], /再実行する前に list/);
  assert.doesNotMatch(cli.errors.join('\n'), /secret-marker/);
});

test('a preview does not let a stored title inject misleading terminal lines or control codes', async () => {
  const cli = fixture({ makeStore: () => ({ list: async () => [{ ...legacyRow, title: '表題\n\u001b[2J\u202e偽の見出し' }] }) });
  assert.equal(await cli.run(['list']), 0);
  assert.match(cli.outputs[1], /表題  \[2J 偽の見出し/);
  assert.doesNotMatch(cli.outputs[1], /[\n\u001b\u202e]/u);
});

test('misc previews a single exact entry and only restores it when explicitly requested', async () => {
  const row = { ...clipRow, category: 'encore', other_withdrawn: true };
  const writes = [];
  const reads = [];
  const cli = fixture({ makeStore: () => ({
    async listEntry(id) { reads.push(id); return [row]; },
    async markMisc(id, options) {
      writes.push([id, options]);
      return options.restoreWithdrawn
        ? { changed: 1, rows: [{ ...row, category: 'misc', withdrawn: false, withdrawn_at: null }] }
        : { changed: 0, rows: [row] };
    },
  }) });
  assert.equal(await cli.run(['misc', clipId]), 0);
  assert.deepEqual(reads, [clipId]);
  assert.deepEqual(writes, []);
  assert.match(cli.outputs.join('\n'), /変更予定: 0曲/);
  assert.match(cli.outputs.join('\n'), /非表示のため変更しません/);
  assert.doesNotMatch(cli.outputs.join('\n'), /反映するには/);
  cli.outputs.length = 0;
  assert.equal(await cli.run(['misc', clipId, '--restore-withdrawn']), 0);
  assert.deepEqual(writes, []);
  assert.match(cli.outputs.join('\n'), /変更予定: 1曲/);
  assert.match(cli.outputs.join('\n'), new RegExp(`misc ${clipId} --restore-withdrawn --apply`));
  assert.equal(await cli.run(['misc', clipId, '--apply']), 0);
  cli.outputs.length = 0;
  assert.equal(await cli.run(['misc', clipId, '--restore-withdrawn', '--apply']), 0);
  assert.deepEqual(writes, [[clipId, { restoreWithdrawn: false }], [clipId, { restoreWithdrawn: true }]]);
  assert.match(cli.outputs.join('\n'), /変更: 1曲/);
  assert.match(cli.outputs.join('\n'), /ほかの非表示曲があるため.*公開一覧には表示されません/);
  assert.match(cli.outputs.join('\n'), /分類: その他の動画/);
  assert.doesNotMatch(cli.outputs.join('\n'), /既存曲/);
});

test('misc accepts legacy IDs and distinguishes already categorized or missing entries', async () => {
  let row = { ...legacyRow, category: 'misc' };
  const cli = fixture({ makeStore: () => ({ listEntry: async id => {
    assert.equal(id, sourceId);
    return row ? [row] : [];
  } }) });
  assert.equal(await cli.run(['misc', sourceId]), 0);
  assert.match(cli.outputs.join('\n'), /変更予定: 0曲/);
  assert.doesNotMatch(cli.outputs.join('\n'), /反映するには/);
  row = null;
  assert.equal(await cli.run(['misc', sourceId]), 0);
  assert.match(cli.outputs.join('\n'), /対象の共有曲は見つかりません/);
});

test('classify previews classification and playability; apply maps watch/playable to booleans and leaves unchanged unset', async () => {
  let row = { ...legacyRow, category: 'encore', playable: null };
  const writes = [];
  const reads = [];
  const cli = fixture({ makeStore: () => ({
    async listEntry(id) { reads.push(id); return [row]; },
    async classifyEntry(id, category, playable) {
      writes.push([id, category, playable]);
      const changed = row.category !== category || (playable !== undefined && row.playable !== playable);
      row = { ...row, category, ...(playable === undefined ? {} : { playable }) };
      return { changed: Number(changed), rows: [row] };
    },
  }) });
  assert.equal(await cli.run(['classify', sourceId, 'other', 'watch']), 0);
  assert.deepEqual(reads, [sourceId]);
  assert.deepEqual(writes, []);
  assert.ok(cli.outputs.includes(`分類: ${categoryLabel('encore')} → ${categoryLabel('other')}｜プレイ可否: 未指定 → 視聴のみ`));
  assert.match(cli.outputs.join('\n'), /変更予定: 1曲/);
  assert.match(cli.outputs.join('\n'), new RegExp(`classify ${sourceId} other watch --apply`));
  for (const [category, mode, playable, changed] of [
    ['other', 'watch', false, 1], ['other', 'watch', false, 0], ['encore', 'unchanged', undefined, 1], ['misc', 'playable', true, 1],
  ]) {
    cli.outputs.length = 0;
    assert.equal(await cli.run(['classify', sourceId, category, mode, '--apply']), 0);
    assert.deepEqual(writes.at(-1), [sourceId, category, playable]);
    assert.match(cli.outputs.join('\n'), new RegExp(`変更: ${changed}曲`));
    if (mode === 'unchanged') assert.match(cli.outputs.join('\n'), /プレイ可否: 視聴のみ/);
  }
});

test('classify previews no change and reports a refused apply for row withdrawal or whole-source suppression', async () => {
  for (const [row, message] of [
    [{ ...clipRow, category: 'encore', playable: true }, /対象曲が非表示/],
    [{ ...clipRow, category: 'encore', playable: true, withdrawn: false, other_withdrawn: true }, /同じ元動画に非表示曲/],
  ]) {
    const cli = fixture({ makeStore: () => ({
      listEntry: async () => [row],
      classifyEntry: async () => ({ changed: 0, rows: [row] }),
    }) });
    assert.equal(await cli.run(['classify', clipId, 'other', 'unchanged']), 0);
    assert.match(cli.outputs.join('\n'), /変更予定: 0曲/);
    assert.match(cli.outputs.join('\n'), /プレイ可否: プレイ可能（維持）/);
    assert.doesNotMatch(cli.outputs.join('\n'), /反映するには/);
    cli.outputs.length = 0;
    assert.equal(await cli.run(['classify', clipId, 'other', 'unchanged', '--apply']), 1);
    assert.match(cli.outputs.join('\n'), /変更: 0曲/);
    assert.match(cli.outputs.join('\n'), message);
  }
});

test('the store lists the legacy id and clips by source and checks presence instead of a truthy marker', async () => {
  const calls = [];
  const sql = {
    async query(text, values, options) { calls.push({ text, values, options }); return [legacyRow, clipRow]; },
    transaction() { assert.fail('listing must not start a write transaction'); },
  };
  const store = createModerationStore(undefined, { sql });
  assert.deepEqual(await store.list(sourceId), [legacyRow, clipRow]);
  assert.match(calls[0].text, /WHERE COALESCE\(data->>'videoId', video_id\) = \$1/);
  assert.match(calls[0].text, /data \? 'withdrawnAt' AS withdrawn/);
  assert.deepEqual(calls[0].values, [sourceId]);
  assert.ok(calls[0].options.fetchOptions.signal instanceof AbortSignal);
  await store.list();
  assert.doesNotMatch(calls[1].text, /WHERE/);
  assert.deepEqual(calls[1].values, []);
  await assert.rejects(store.list(clipId), TypeError);
  assert.equal(calls.length, 2);
});

test('hide and restore place the source lock before writes and mutate only the existing JSON key', async () => {
  const transactions = [];
  const sql = {
    query() { assert.fail('mutations must not issue independent queries outside the transaction'); },
    async transaction(build, options) {
      const tx = { query: (text, values = []) => ({ text, values }) };
      transactions.push({ queries: build(tx), options });
      return [[], [], [], [{ video_id: sourceId }], [legacyRow, clipRow]];
    },
  };
  const store = createModerationStore(undefined, { sql });
  for (const action of ['hide', 'restore']) {
    assert.deepEqual(await store.changeVisibility(action, sourceId, at), { changed: 1, rows: [legacyRow, clipRow] });
    const { queries, options } = transactions.at(-1);
    assert.equal(queries.length, 5);
    assert.match(queries[0].text, /^SET LOCAL lock_timeout/);
    assert.match(queries[1].text, /^SET LOCAL statement_timeout/);
    assert.equal(queries[2].text, 'SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))');
    assert.deepEqual(queries[2].values, [sourceId]);
    assert.match(queries[3].text, /UPDATE public\.encore_shared_videos/);
    assert.match(queries[3].text, /WHERE COALESCE\(data->>'videoId', video_id\) = \$1/);
    if (action === 'hide') {
      assert.match(queries[3].text, /data \|\| jsonb_build_object\('withdrawnAt', \$2::text\)/);
      assert.match(queries[3].text, /AND NOT \(data \? 'withdrawnAt'\)/);
      assert.deepEqual(queries[3].values, [sourceId, at.toISOString()]);
    } else {
      assert.match(queries[3].text, /data - 'withdrawnAt'/);
      assert.match(queries[3].text, /AND \(data \? 'withdrawnAt'\)/);
      assert.deepEqual(queries[3].values, [sourceId]);
    }
    assert.match(queries[4].text, /SELECT .*entry_id/);
    assert.deepEqual(queries[4].values, [sourceId]);
    assert.equal(options.isolationLevel, 'ReadCommitted');
    assert.ok(options.fetchOptions.signal instanceof AbortSignal);
  }
  await assert.rejects(store.changeVisibility('delete', otherSourceId, at), TypeError);
  await assert.rejects(store.changeVisibility('hide', clipId, at), TypeError);
  assert.equal(transactions.length, 2);
});

test('misc uses the source lock but limits the write to the exact entry and requires permission to remove its marker', async () => {
  const reads = [];
  const transactions = [];
  const sql = {
    async query(text, values, options) {
      reads.push({ text, values, options });
      if (text.includes('AS other_withdrawn')) return [{ ...clipRow, category: 'encore', other_withdrawn: true }];
      return values[0] === clipId ? [{ source_id: sourceId }] : [];
    },
    async transaction(build, options) {
      const queries = build({ query: (text, values = []) => ({ text, values }) });
      transactions.push({ queries, options });
      return [[], [], [], [{ video_id: clipId }], [{ ...clipRow, category: 'misc', other_withdrawn: true }]];
    },
  };
  const store = createModerationStore(undefined, { sql });
  assert.equal((await store.listEntry(clipId))[0].entry_id, clipId);
  assert.deepEqual(reads[0].values, [clipId]);
  assert.match(reads[0].text, /WHERE video_id = \$1/);
  assert.match(reads[0].text, /sibling.video_id <> entry.entry_id AND sibling.data \? 'withdrawnAt'/);
  assert.equal(transactions.length, 0);
  for (const restoreWithdrawn of [false, true]) {
    const { changed, rows } = await store.markMisc(clipId, { restoreWithdrawn });
    assert.equal(changed, 1);
    assert.deepEqual(rows.map(row => row.entry_id), [clipId]);
    const { queries, options } = transactions.at(-1);
    assert.deepEqual(reads.at(-1).values, [clipId]);
    assert.match(queries[0].text, /^SET LOCAL lock_timeout/);
    assert.match(queries[1].text, /^SET LOCAL statement_timeout/);
    assert.equal(queries[2].text, 'SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))');
    assert.deepEqual(queries[2].values, [sourceId]);
    assert.match(queries[3].text, /WHERE video_id = \$1 AND COALESCE\(data->>'videoId', video_id\) = \$2/);
    assert.deepEqual(queries[3].values, [clipId, sourceId]);
    assert.match(queries[3].text, /jsonb_build_object\('category', 'misc'\)/);
    assert.match(queries[3].text, /data->>'category' IS DISTINCT FROM 'misc'/);
    if (restoreWithdrawn) {
      assert.match(queries[3].text, /data - 'withdrawnAt'/);
      assert.match(queries[3].text, /OR \(data \? 'withdrawnAt'\)/);
    } else {
      assert.doesNotMatch(queries[3].text, /data - 'withdrawnAt'/);
      assert.match(queries[3].text, /AND NOT \(data \? 'withdrawnAt'\)/);
    }
    assert.deepEqual(queries[4].values, [clipId]);
    assert.ok(options.fetchOptions.signal instanceof AbortSignal);
  }
  assert.deepEqual(await store.markMisc(otherSourceId), { changed: 0, rows: [] });
  await assert.rejects(store.markMisc(clipId, { restoreWithdrawn: 'true' }), TypeError);
  assert.equal(transactions.length, 2);
});

test('classify SQL is idempotent and skips an entry if either it or a sibling is withdrawn under the source lock', async () => {
  const queries = [];
  const transactions = [];
  const active = { ...clipRow, withdrawn: false, category: 'other', playable: false };
  const sql = {
    async query(text, values) {
      queries.push({ text, values });
      return text.includes('AS other_withdrawn') ? [active] : [{ source_id: sourceId }];
    },
    async transaction(build, options) {
      transactions.push({ queries: build({ query: (text, values) => ({ text, values }) }), options });
      return [[], [], [], [], [active]];
    },
  };
  const store = createModerationStore(undefined, { sql });
  assert.equal((await store.listEntry(clipId))[0].playable, false);
  assert.match(queries[0].text, /data->'playable' AS playable/);
  assert.deepEqual(queries[0].values, [clipId]);
  for (const flag of [undefined, false, true]) {
    assert.deepEqual(await store.classifyEntry(clipId, 'other', flag), { changed: 0, rows: [active] });
    const transaction = transactions.at(-1);
    const [lockTimeout, statementTimeout, lock, update, returned] = transaction.queries;
    assert.match(lockTimeout.text, /^SET LOCAL lock_timeout/);
    assert.match(statementTimeout.text, /^SET LOCAL statement_timeout/);
    assert.equal(lock.text, 'SELECT pg_advisory_xact_lock(1162756943, hashtext($1::text))');
    assert.deepEqual(lock.values, [sourceId]);
    assert.match(update.text, /SET data = data \|\| jsonb_build_object\('category', \$3::text/);
    assert.match(update.text, /WHERE video_id = \$1 AND COALESCE\(data->>'videoId', video_id\) = \$2/);
    assert.match(update.text, /AND NOT \(data \? 'withdrawnAt'\)/);
    assert.match(update.text, /AND NOT EXISTS \(\s*SELECT 1 FROM public\.encore_shared_videos sibling\s*WHERE COALESCE\(sibling\.data->>'videoId', sibling\.video_id\) = \$2\s*AND sibling\.video_id <> \$1 AND sibling\.data \? 'withdrawnAt'/);
    assert.match(update.text, /data->>'category' IS DISTINCT FROM \$3::text/);
    if (flag === undefined) {
      assert.doesNotMatch(update.text, /playable/);
      assert.deepEqual(update.values, [clipId, sourceId, 'other']);
    } else {
      assert.match(update.text, /'playable', \$4::boolean/);
      assert.match(update.text, /data->'playable' IS DISTINCT FROM to_jsonb\(\$4::boolean\)/);
      assert.deepEqual(update.values, [clipId, sourceId, 'other', flag]);
    }
    assert.deepEqual(returned.values, [clipId]);
    assert.equal(transaction.options.isolationLevel, 'ReadCommitted');
  }
  await assert.rejects(store.classifyEntry(clipId, 'other', 'false'), TypeError);
  await assert.rejects(store.classifyEntry(clipId, 'unknown', false), TypeError);
  assert.equal(transactions.length, 3);
});
