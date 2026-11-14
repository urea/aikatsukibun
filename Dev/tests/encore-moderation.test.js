import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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
    ['hide', fakeConnection, '--apply'],
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
