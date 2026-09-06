import test from 'node:test';
import assert from 'node:assert/strict';
import { createPadInput } from '../../App/pad-input.js';

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
