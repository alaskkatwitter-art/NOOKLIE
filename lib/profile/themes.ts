export const themeColors = {
  background: 'Fundo',
  surface: 'Cartões',
  text: 'Texto',
  accent: 'Botões',
  border: 'Bordas',
  gradient: 'Segunda cor do degradê',
} as const;

export const themeFonts = { dm: 'DM Sans', outfit: 'Outfit', georgia: 'Georgia' } as const;
type ThemeColor = keyof typeof themeColors;
export type ProfileTheme = Record<ThemeColor, string> & { name: string; font: keyof typeof themeFonts };
export type ProfileThemeCollection = { drafts: ProfileTheme[]; active: ProfileTheme | null; revision: number };
export const emptyProfileThemes: ProfileThemeCollection = { drafts: [], active: null, revision: 0 };
export const maxProfileThemes = 12;

export const profileThemePresets: ProfileTheme[] = [
  { name: 'Nooklie Original', background: '#100b12', surface: '#211523', text: '#fff2f8', accent: '#ff9dcc', border: '#78526b', gradient: '#34182c', font: 'dm' },
  { name: 'Velvet Red', background: '#190b13', surface: '#321320', text: '#fff1ef', accent: '#f29aab', border: '#8c4359', gradient: '#531c33', font: 'georgia' },
  { name: 'Lavender Dream', background: '#161125', surface: '#2b2041', text: '#f8efff', accent: '#d3b8ff', border: '#775b9f', gradient: '#3e2d60', font: 'dm' },
  { name: 'Midnight', background: '#0b1425', surface: '#16253c', text: '#edf5ff', accent: '#a4c7f9', border: '#526c8d', gradient: '#233857', font: 'outfit' },
  { name: 'Forest Tales', background: '#101c19', surface: '#22362c', text: '#f3f8e9', accent: '#c0dda7', border: '#68846c', gradient: '#30483b', font: 'georgia' },
  { name: 'Strawberry Milk', background: '#fff1f5', surface: '#fff9fa', text: '#3a182c', accent: '#96345f', border: '#ba718f', gradient: '#f5c6d8', font: 'outfit' },
];

const colorKeys = Object.keys(themeColors) as ThemeColor[];
const hex = /^#[0-9a-f]{6}$/i;

function luminance(color: string) {
  const channels = [1, 3, 5].map(offset => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function themeContrastIsReadable(theme: ProfileTheme) {
  return [theme.background, theme.surface, theme.gradient].every(color => contrast(theme.text, color) >= 4.5);
}

export function parseProfileTheme(value: unknown): ProfileTheme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== colorKeys.length + 2 ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 48 ||
      typeof input.font !== 'string' || !Object.hasOwn(themeFonts, input.font) ||
      !colorKeys.every(key => typeof input[key] === 'string' && hex.test(input[key]))) return null;

  const theme = {
    ...Object.fromEntries(colorKeys.map(key => [key, String(input[key]).toLowerCase()])),
    name: input.name.trim(),
    font: input.font,
  } as ProfileTheme;
  return themeContrastIsReadable(theme) ? theme : null;
}

export function themeNameKey(name: string) {
  return name.normalize('NFC').trim().toLocaleLowerCase('pt-BR');
}

export function parseProfileThemeCollection(value: unknown): ProfileThemeCollection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.drafts) || input.drafts.length > maxProfileThemes ||
      typeof input.revision !== 'number' || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      input.revision >= 2147483647) return null;
  const drafts = input.drafts.map(parseProfileTheme);
  const active = parseProfileTheme(input.active);
  if (drafts.some(theme => !theme) || (input.active !== null && !active)) return null;
  const themes = drafts as ProfileTheme[];
  if (new Set(themes.map(theme => themeNameKey(theme.name))).size !== themes.length) return null;
  return { drafts: themes, active, revision: input.revision };
}

export function profileThemeVariables(theme: ProfileTheme) {
  const fonts = { dm: 'var(--font-nooklie-body), sans-serif', outfit: 'var(--font-nooklie-heading), sans-serif', georgia: 'Georgia, serif' };
  return {
    '--profile-theme-background': theme.background,
    '--profile-theme-surface': theme.surface,
    '--profile-theme-text': theme.text,
    '--profile-theme-accent': theme.accent,
    '--profile-theme-accent-text': contrast(theme.accent, '#000000') >= contrast(theme.accent, '#ffffff') ? '#000000' : '#ffffff',
    '--profile-theme-border': theme.border,
    '--profile-theme-gradient': theme.gradient,
    '--profile-theme-font': fonts[theme.font],
  };
}
