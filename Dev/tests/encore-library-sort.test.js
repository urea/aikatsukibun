import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLibrarySort, sortVideoIds } from '../../Encore/library-sort.js';

test('並び替え設定は投稿順が既定で、曲名・難易度順だけを追加で許可する', () => {
  assert.equal(normalizeLibrarySort('song-difficulty'), 'song-difficulty');
  for (const value of ['posted', undefined, null, '', 'unknown', 1, {}, ['song-difficulty']]) assert.equal(normalizeLibrarySort(value), 'posted');
});

test('投稿順は入力順と重複を保持し、メタデータを取得せず配列をコピーする', () => {
  const ids = Object.freeze(['third', 'first', 'second', 'first']);
  const result = sortVideoIds(ids, 'posted', () => { assert.fail('投稿順ではメタデータ不要'); });
  assert.deepEqual(result, ids);
  assert.notEqual(result, ids);
  assert.deepEqual(sortVideoIds(ids, undefined), ids);
  assert.deepEqual(sortVideoIds(ids, 'unknown'), ids);
});

test('日本語の曲名昇順では数字を自然な順序にし自由入力曲名も扱う', () => {
  const ids = ['ten', 'after', 'two', 'first', 'three', 'one'];
  const titles = { ten: 'うた10', after: 'えがおの自由入力曲', two: 'うた2', first: 'あいどる', three: 'うた3', one: 'うた1' };
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty', id => ({ title: titles[id] })), ['first', 'one', 'two', 'three', 'ten', 'after']);
});

test('表示用曲名をNFKC正規化し同じ曲では全5段階を昇順、不明は最後にする', () => {
  const ids = ['unknown', 'five', 'three', 'one', 'two', 'four', 'dash'];
  const difficulties = { unknown: '自由入力の難易度', five: 'とてもむずかしい', three: 'むずかしい', one: 'かんたん', two: 'ふつう', four: 'すごくむずかしい', dash: '-' };
  const metadata = id => ({ title: id === 'one' ? '【720p】アイカツ！ - ＭＹ ＳＴＡＲＷＡＹ' : 'MY STARWAY', difficulty: difficulties[id] });
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty', metadata), ['one', 'two', 'three', 'four', 'five', 'unknown', 'dash']);
});

test('難易度より曲名を優先し、同じ曲・同じ難易度は入力順を保つ', () => {
  const ids = ['beta-easy', 'alpha-second', 'alpha-first', 'alpha-unknown-second', 'alpha-unknown-first'];
  const data = {
    'beta-easy': { title: 'いちご', difficulty: 'かんたん' },
    'alpha-second': { title: 'あかり', difficulty: 'とてもむずかしい' },
    'alpha-first': { title: 'あかり', difficulty: 'とてもむずかしい' },
    'alpha-unknown-second': { title: 'あかり', difficulty: '-' },
    'alpha-unknown-first': { title: 'あかり' },
  };
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty', id => data[id]), ['alpha-second', 'alpha-first', 'alpha-unknown-second', 'alpha-unknown-first', 'beta-easy']);
});

test('曲名が未取得・空欄・不正な動画は末尾で入力順を保つ', () => {
  const ids = ['missing', 'blank', 'known-later', 'invalid', 'known-first', 'spaces'];
  const data = {
    blank: { title: '', difficulty: 'かんたん' },
    'known-later': { title: 'いちご' },
    invalid: { title: 123, difficulty: 'むずかしい' },
    'known-first': { title: 'あかり' },
    spaces: { title: ' \n ', difficulty: 'とてもむずかしい' },
  };
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty', id => data[id]), ['known-first', 'known-later', 'missing', 'blank', 'invalid', 'spaces']);
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty'), ids);
});

test('曲名・難易度順でも元の配列とメタデータを変更しない', () => {
  const ids = Object.freeze(['hard', 'easy', 'free']);
  const data = Object.freeze({
    hard: Object.freeze({ title: 'ＭＹ ＳＴＡＲＷＡＹ', difficulty: 'むずかしい', author: '投稿者' }),
    easy: Object.freeze({ title: 'MY STARWAY', difficulty: 'かんたん' }),
    free: Object.freeze({ title: 'ZZZ（自由入力）', difficulty: '-' }),
  });
  const snapshot = structuredClone(data);
  assert.deepEqual(sortVideoIds(ids, 'song-difficulty', id => data[id]), ['easy', 'hard', 'free']);
  assert.deepEqual(ids, ['hard', 'easy', 'free']);
  assert.deepEqual(data, snapshot);
  assert.deepEqual(sortVideoIds([], 'song-difficulty'), []);
  assert.deepEqual(sortVideoIds(null, 'song-difficulty'), []);
});
