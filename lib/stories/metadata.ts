export const storyKinds = { original: 'Obra original', fanfic: 'Fanfic' } as const;
export const storyFormats = { romance: 'Romance', novela: 'Novela', conto: 'Conto', coletanea: 'Coletânea', poesia: 'Poesia' } as const;

export const chapterKinds = { chapter: 'Capítulo', prologue: 'Prólogo', epilogue: 'Epílogo', extra: 'Extra' } as const;
export type ChapterKind = keyof typeof chapterKinds;
export type SeriesBook = { id: string; title: string; series_volume: number };

export type StoryMetadata = {
  series_name: string;
  series_volume: number | null;
  story_kind: keyof typeof storyKinds | '';
  story_format: keyof typeof storyFormats | '';
  has_content_warnings: boolean;
  fandom: string;
  work_has_ai: boolean;
  cover_has_ai: boolean;
  content_warnings: string;
  accepts_translation: boolean;
  allows_download: boolean;
};

export const emptyStoryMetadata: StoryMetadata = { series_name: '', series_volume: null, story_kind: '', story_format: '', has_content_warnings: false, fandom: '', work_has_ai: false, cover_has_ai: false, content_warnings: '', accepts_translation: false, allows_download: false };

// A missing field on older clients must not erase a saved declaration.
export function parseStoryMetadata(form: FormData): Partial<StoryMetadata> {
  const result: Partial<StoryMetadata> = {};
  for (const [key, limit] of [['fandom', 200], ['content_warnings', 2000]] as const) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (typeof value !== 'string' || value.length > limit) throw new Error(`O campo ${key === 'fandom' ? 'fandom' : 'avisos'} deve ter no máximo ${limit} caracteres.`);
    result[key] = value.trim();
  }
  for (const key of ['has_content_warnings', 'work_has_ai', 'cover_has_ai', 'accepts_translation', 'allows_download'] as const) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (value !== 'true' && value !== 'false') throw new Error('Opção de publicação inválida.');
    result[key] = value === 'true';
  }
  if (form.has('story_kind')) {
    const kind = form.get('story_kind');
    if (kind !== '' && kind !== 'original' && kind !== 'fanfic') throw new Error('Tipo de obra inválido.');
    result.story_kind = kind;
  }
  if (form.has('story_format')) {
    const format = form.get('story_format');
    if (typeof format !== 'string' || (format && !Object.hasOwn(storyFormats, format))) throw new Error('Formato literário inválido.');
    result.story_format = format as StoryMetadata['story_format'];
  }
  if (result.story_kind === 'original') result.fandom = '';
  if (result.story_kind === 'fanfic') result.story_format = '';
  if (form.has('series_name')) {
    const rawName = form.get('series_name');
    const rawVolume = form.get('series_volume');
    if (typeof rawName !== 'string' || rawName.length > 100) throw new Error('O nome da série deve ter até 100 caracteres.');
    const name = rawName.trim().replace(/\s+/g, ' ');
    const volume = Number(rawVolume);
    if (name && (!Number.isInteger(volume) || volume < 1 || volume > 999)) throw new Error('Informe o número do volume, entre 1 e 999.');
    result.series_name = result.story_kind === 'fanfic' ? '' : name;
    result.series_volume = result.series_name ? volume : null;
  }
  return result;
}
