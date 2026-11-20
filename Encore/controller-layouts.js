function pad(id, label, key, keys, sound, color, face = label) {
  return { id, label, key, keys, sound, color, face };
}

const arcadePads = [
  pad('green', '緑ボタン', 'A', ['a', 'arrowleft'], 'tap', '#51e890', '緑'),
  pad('red', '赤ボタン', 'S', ['s', 'w', 'arrowdown', 'arrowup'], 'tap', '#ff7286', '赤'),
  pad('blue', '青ボタン', 'D', ['d', 'arrowright'], 'tap', '#68bbff', '青')
];

export const CONTROLLER_LAYOUTS = [
  { id: 'aikatsu', label: 'アイカツ！', pads: [
    pad('red', '赤・上', 'W', ['w', 'arrowup'], 'tap', 'var(--red)'),
    pad('green', '緑・左', 'A', ['a', 'arrowleft'], 'tap', 'var(--green)'),
    pad('yellow', '黄・右', 'D', ['d', 'arrowright'], 'tap', 'var(--yellow)')
  ] },
  { id: 'taiko', label: '太鼓の達人', pads: [
    pad('rim-left', '左のふち', 'D', ['d'], 'ka', '#5ddae9', 'カッ'),
    pad('don-left', '左の面', 'F', ['f'], 'don', '#ff9a78', 'ドン'),
    pad('don-right', '右の面', 'J', ['j'], 'don', '#ff9a78', 'ドン'),
    pad('rim-right', '右のふち', 'K', ['k'], 'ka', '#5ddae9', 'カッ')
  ] },
  { id: 'konga', label: 'ドンキーコンガ', pads: [
    pad('left', '左のコンガ', 'A', ['a', 'arrowleft'], 'conga-low', '#ffd47c', '左'),
    pad('clap', '手拍子', 'Space', [' ', 'f', 'w', 'arrowup'], 'clap', '#b7eca8'),
    pad('right', '右のコンガ', 'D', ['d', 'arrowright'], 'conga-high', '#ffd47c', '右')
  ] },
  { id: 'loveberry', label: 'オシャレ魔女 ラブ and ベリー', pads: [
    pad('dance', 'タンバリン', 'Space', [' ', 'f'], 'tambourine', '#ffd749', '♪')
  ] },
  { id: 'pripara', label: 'プリパラ', pads: arcadePads },
  { id: 'prichan', label: 'キラッとプリ☆チャン', pads: [
    pad('special', 'キラッとボタン', 'Space', [' ', 'f'], 'chime', '#ffb3ec', 'キラッと'),
    ...arcadePads
  ] },
  { id: 'prettyrhythm', label: 'プリティーリズム', pads: [
    pad('left', '青・左', 'A', ['a', 'arrowleft'], 'tap', '#65c9ff', '青'),
    pad('right', '赤・右', 'D', ['d', 'arrowright'], 'tap', '#ff798a', '赤')
  ] },
  { id: 'shinytv', label: 'アイドルマスター シャイニーTV', pads: [
    pad('left', '左アイコン', 'A', ['a', 'arrowleft'], 'tap', '#66beff', '▶'),
    pad('right', '右アイコン', 'D', ['d', 'arrowright'], 'tap', '#ff9ddf', '◀')
  ] },
  { id: 'rhythmdoctor', label: 'Rhythm Doctor', pads: [
    pad('beat', '拍を打つ', 'Space', [' ', 'f'], 'pulse', '#63f0a6', '心拍')
  ] }
];

export function getControllerLayout(id) {
  return CONTROLLER_LAYOUTS.find(layout => layout.id === id) || CONTROLLER_LAYOUTS[0];
}

function createButton(spec) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tap-pad console-pad';
  button.dataset.pad = spec.id;
  button.id = `btn-${spec.id}`;
  button.setAttribute('aria-label', `${spec.label}（${spec.key}）`);
  const symbol = document.createElement('span');
  symbol.className = 'pad-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'console-pad-name';
  name.textContent = spec.face;
  const key = document.createElement('span');
  key.className = 'console-pad-key';
  key.textContent = spec.key;
  symbol.append(name, key);
  button.append(symbol);
  return button;
}

// Keep the original buttons themselves so returning to Aikatsu restores its exact artwork.
const aikatsuButtons = new WeakMap();

export function renderControllerPads(area, id) {
  const layout = getControllerLayout(id);
  if (!aikatsuButtons.has(area)) {
    aikatsuButtons.set(area, Array.from(area.querySelectorAll('.tap-pad')));
  }
  if (area.dataset.controller === layout.id) return;
  const current = area.dataset.controller || 'aikatsu';
  area.dataset.controller = layout.id;
  if (current === layout.id) return;
  for (const button of area.querySelectorAll('.tap-pad')) button.remove();
  area.append(...(layout.id === 'aikatsu' ? aikatsuButtons.get(area) : layout.pads.map(createButton)));
}
