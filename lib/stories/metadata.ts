export type StoryMetadata = {
  has_content_warnings: boolean;
  fandom: string;
  work_has_ai: boolean;
  cover_has_ai: boolean;
  content_warnings: string;
  accepts_translation: boolean;
};

export const emptyStoryMetadata: StoryMetadata = { has_content_warnings: false, fandom: '', work_has_ai: false, cover_has_ai: false, content_warnings: '', accepts_translation: false };

// A missing field on older clients must not erase a saved declaration.
export function parseStoryMetadata(form: FormData): Partial<StoryMetadata> {
  const result: Partial<StoryMetadata> = {};
  for (const [key, limit] of [['fandom', 200], ['content_warnings', 2000]] as const) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (typeof value !== 'string' || value.length > limit) throw new Error(`O campo ${key === 'fandom' ? 'fandom' : 'avisos'} deve ter no máximo ${limit} caracteres.`);
    result[key] = value.trim();
  }
  for (const key of ['has_content_warnings', 'work_has_ai', 'cover_has_ai', 'accepts_translation'] as const) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (value !== 'true' && value !== 'false') throw new Error('Opção de publicação inválida.');
    result[key] = value === 'true';
  }
  return result;
}
