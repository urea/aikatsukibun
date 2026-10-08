// 同じホストで確認しても、通常版の保存データを読み書きしない。
export const STORAGE_PREFIX = 'aikatsu_encore:';
export function createEncoreStorage(storage) {
  return {
    getItem: key => storage.getItem(`${STORAGE_PREFIX}${key}`),
    setItem: (key, value) => storage.setItem(`${STORAGE_PREFIX}${key}`, value)
  };
}
