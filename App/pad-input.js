export const PAD_KEYS = Object.freeze({ w: 'red', a: 'green', d: 'yellow' });

// 指ごとに保持することで、指を離しても別の指やキーの入力を消さない。
export function createPadInput() {
  const pointers = new Map();
  const keys = new Map();
  return {
    hasPointer: id => pointers.has(id),
    updatePointer(id, color) {
      const changed = pointers.get(id) !== color;
      pointers.set(id, color);
      return changed && color !== null;
    },
    endPointer: id => pointers.delete(id),
    keyDown(key) {
      const color = PAD_KEYS[key];
      if (!color || keys.has(key)) return null;
      keys.set(key, color);
      return color;
    },
    keyUp: key => keys.delete(key),
    activeColors: () => new Set([...pointers.values(), ...keys.values()].filter(Boolean)),
    clear() { pointers.clear(); keys.clear(); }
  };
}
