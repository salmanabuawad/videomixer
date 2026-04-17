export type FontSize = 'small' | 'normal' | 'large';

const KEY = 'app-font-size';
let current: FontSize = (localStorage.getItem(KEY) as FontSize) || 'normal';
const listeners = new Set<(fs: FontSize) => void>();

export function getFontSize(): FontSize { return current; }
export function setFontSizeStore(fs: FontSize) {
  current = fs;
  listeners.forEach(fn => fn(fs));
}
export function subscribeFontSize(fn: (fs: FontSize) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
