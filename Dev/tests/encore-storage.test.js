import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncoreStorage } from '../../Encore/storage.js';
import { readSaved } from '../../Encore/model.js';

test('同じホストの通常版データをアンコール版に持ち込まず、通常版を変更しない', () => {
  const keys = ['fav_ids', 'hist_ids', 'custom_videos', 'aikatsu_settings_v2', 'aikatsu_last_video_v2', 'aikatsu_video_cache_v2'];
  const data = new Map(keys.map(key => [key, JSON.stringify({ original: key })]));
  const before = new Map(data);
  const storage = createEncoreStorage({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  for (const key of keys) {
    assert.equal(readSaved(storage, key, null), null);
    storage.setItem(key, JSON.stringify({ encore: key }));
    assert.deepEqual(readSaved(storage, key, null), { encore: key });
    assert.equal(data.get(key), before.get(key));
  }
  assert.equal(data.size, keys.length * 2);
});

test('保存が禁止されていてもアンコール版の読み取りに既定値を使える', () => {
  const storage = createEncoreStorage({ getItem: () => { throw new Error('blocked'); } });
  assert.deepEqual(readSaved(storage, 'fav_ids', []), []);
  assert.deepEqual(readSaved(undefined, 'custom_videos', []), []);
});
