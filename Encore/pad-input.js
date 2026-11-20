import { getControllerLayout } from './controller-layouts.js';

export function keysForLayout(layout) {
  return Object.fromEntries(layout.pads.flatMap(pad => pad.keys.map(key => [key, pad.id])));
}

export const PAD_KEYS = Object.freeze(keysForLayout(getControllerLayout('aikatsu')));

// 指ごとに保持することで、指を離しても別の指やキーの入力を消さない。
export function createPadInput(bindings = PAD_KEYS) {
  const pointers = new Map();
  const keys = new Map();
  return {
    hasKey: key => Object.hasOwn(bindings, key),
    hasPointer: id => pointers.has(id),
    updatePointer(id, color) {
      const changed = pointers.get(id) !== color;
      pointers.set(id, color);
      return changed && color !== null;
    },
    endPointer: id => pointers.delete(id),
    keyDown(key) {
      if (!Object.hasOwn(bindings, key) || keys.has(key)) return null;
      const pad = bindings[key];
      keys.set(key, pad);
      return pad;
    },
    keyUp: key => keys.delete(key),
    activeColors: () => new Set([...pointers.values(), ...keys.values()].filter(Boolean)),
    clear() { pointers.clear(); keys.clear(); }
  };
}
