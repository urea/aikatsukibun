import test from 'node:test';
import assert from 'node:assert/strict';
import { createPadInput } from '../../App/pad-input.js';
import { createPadInput as createEncorePadInput, PAD_KEYS as ENCORE_PAD_KEYS } from '../../Encore/pad-input.js';

test('3本の指を同時に使い、1本を離しても残り2色は押されたまま', () => {
  const input = createPadInput();
  input.updatePointer(1, 'red'); input.updatePointer(2, 'green'); input.updatePointer(3, 'yellow');
  assert.deepEqual(input.activeColors(), new Set(['red', 'green', 'yellow']));
  input.endPointer(2);
  assert.deepEqual(input.activeColors(), new Set(['red', 'yellow']));
});
test('同色の2本指とキー入力を個別に保持する', () => {
  const input = createPadInput();
  input.updatePointer(1, 'red'); input.updatePointer(2, 'red');
  assert.equal(input.keyDown('w'), 'red');
  input.endPointer(1); input.endPointer(2);
  assert.deepEqual(input.activeColors(), new Set(['red']));
  input.keyUp('w');
  assert.equal(input.activeColors().size, 0);
});
test('隣の色へ滑らせると1度だけ反応し、他の指に影響しない', () => {
  const input = createPadInput();
  input.updatePointer(1, 'red'); input.updatePointer(2, 'yellow');
  assert.equal(input.updatePointer(1, 'green'), true);
  assert.equal(input.updatePointer(1, 'green'), false);
  assert.deepEqual(input.activeColors(), new Set(['green', 'yellow']));
  assert.equal(input.updatePointer(1, null), false);
  assert.equal(input.hasPointer(1), true);
  assert.deepEqual(input.activeColors(), new Set(['yellow']));
  assert.equal(input.updatePointer(1, 'red'), true);
});
test('キーのリピートを抑え、画面切り替え時に押下状態を解除する', () => {
  const input = createPadInput();
  assert.equal(input.keyDown('a'), 'green');
  assert.equal(input.keyDown('a'), null);
  assert.equal(input.keyDown('d'), 'yellow');
  input.updatePointer(10, 'red'); input.clear();
  assert.equal(input.hasPointer(10), false);
  assert.equal(input.activeColors().size, 0);
  assert.equal(input.keyDown('a'), 'green');
});

const encoreKeyPairs = [['w', 'arrowup', 'red'], ['a', 'arrowleft', 'green'], ['d', 'arrowright', 'yellow']];

test('アンコール版の上・左・右キーは赤・緑・黄に対応し、リピートを抑える', () => {
  const input = createEncorePadInput();
  for (const [, arrow, color] of encoreKeyPairs) {
    assert.equal(ENCORE_PAD_KEYS[arrow], color);
    assert.equal(input.keyDown(arrow), color);
    assert.equal(input.keyDown(arrow), null);
  }
  assert.deepEqual(input.activeColors(), new Set(['red', 'green', 'yellow']));
  assert.equal(input.keyDown('arrowdown'), null);
  for (const [, arrow, color] of encoreKeyPairs) {
    input.keyUp(arrow);
    assert.equal(input.keyDown(arrow), color);
    input.keyUp(arrow);
  }
  assert.equal(input.activeColors().size, 0);
});

test('アンコール版で同じ色の文字キーと方向キーを同時に押し、どちらを先に離しても残りが有効', () => {
  for (const [letter, arrow, color] of encoreKeyPairs) {
    for (const [first, remaining] of [[letter, arrow], [arrow, letter]]) {
      const input = createEncorePadInput();
      assert.equal(input.keyDown(letter), color);
      assert.equal(input.keyDown(arrow), color);
      assert.deepEqual(input.activeColors(), new Set([color]));
      input.keyUp(first);
      assert.deepEqual(input.activeColors(), new Set([color]));
      assert.equal(input.keyDown(remaining), null);
      input.keyUp(remaining);
      assert.equal(input.activeColors().size, 0);
    }
  }
});

test('アンコール版のclearは文字キー・方向キー・ポインターをすべて解除して再入力できる', () => {
  const input = createEncorePadInput();
  for (const [letter, arrow] of encoreKeyPairs) {
    input.keyDown(letter);
    input.keyDown(arrow);
  }
  input.updatePointer(20, 'red');
  input.clear();
  assert.equal(input.hasPointer(20), false);
  assert.equal(input.activeColors().size, 0);
  for (const [letter, arrow, color] of encoreKeyPairs) {
    assert.equal(input.keyDown(letter), color);
    assert.equal(input.keyDown(arrow), color);
  }
  assert.deepEqual(input.activeColors(), new Set(['red', 'green', 'yellow']));
});
