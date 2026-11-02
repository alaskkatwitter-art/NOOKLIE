export const READER_FONTS = [
  { id: 'browser-serif', name: 'Padrão do navegador', family: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' },
  { id: 'lora', name: 'Lora', family: '"Nooklie Reader Lora", Georgia, serif' },
  { id: 'merriweather', name: 'Merriweather', family: '"Nooklie Reader Merriweather", Georgia, serif' },
  { id: 'literata', name: 'Literata', family: '"Nooklie Reader Literata", Georgia, serif' },
  { id: 'newsreader', name: 'Newsreader', family: '"Nooklie Reader Newsreader", Georgia, serif' },
  { id: 'eb-garamond', name: 'EB Garamond', family: '"Nooklie Reader EB Garamond", Georgia, serif' },
  { id: 'source-serif-4', name: 'Source Serif 4', family: '"Nooklie Reader Source Serif 4", Georgia, serif' },
  { id: 'libre-baskerville', name: 'Libre Baskerville', family: '"Nooklie Reader Libre Baskerville", Georgia, serif' },
  { id: 'nunito', name: 'Nunito', family: '"Nooklie Reader Nunito", system-ui, sans-serif' },
  { id: 'dm-sans', name: 'DM Sans', family: 'var(--font-nooklie-body), system-ui, sans-serif' },
  { id: 'lexend', name: 'Lexend', family: '"Nooklie Reader Lexend", system-ui, sans-serif' },
  { id: 'atkinson-hyperlegible', name: 'Atkinson Hyperlegible', family: '"Nooklie Reader Atkinson Hyperlegible", system-ui, sans-serif' },
  { id: 'open-sans', name: 'Open Sans', family: '"Nooklie Reader Open Sans", system-ui, sans-serif' },
] as const;

export type ReaderPreferences = {
  fontId: (typeof READER_FONTS)[number]['id'];
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'dark' | 'light' | 'sepia' | 'system';
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontId: 'browser-serif', fontSize: 18, lineHeight: 32 / 18, margin: 0, theme: 'dark',
};

export function isReaderPreferences(value: unknown): value is ReaderPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !Object.prototype.hasOwnProperty.call(DEFAULT_READER_PREFERENCES, key))) return false;
  return READER_FONTS.some((font) => font.id === item.fontId)
    && typeof item.fontSize === 'number' && Number.isFinite(item.fontSize) && item.fontSize >= 14 && item.fontSize <= 40
    && typeof item.lineHeight === 'number' && Number.isFinite(item.lineHeight) && item.lineHeight >= 1.2 && item.lineHeight <= 2.5
    && typeof item.margin === 'number' && Number.isFinite(item.margin) && item.margin >= 0 && item.margin <= 64
    && typeof item.theme === 'string' && ['dark', 'light', 'sepia', 'system'].includes(item.theme);
}

export function readerStorageKey(userId: string | null) {
  return `nooklie:reader:${userId ? encodeURIComponent(userId) : 'guest'}:v1`;
}

export function readerFontFamily(preferences: ReaderPreferences) {
  return READER_FONTS.find((font) => font.id === preferences.fontId)?.family || READER_FONTS[0].family;
}
