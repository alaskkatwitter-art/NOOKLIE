export const newsArticleSlugs = ['boas-vindas', 'originais', 'atualizacao-6-novembro-2026'] as const;
export function isNewsArticle(value: unknown): value is typeof newsArticleSlugs[number] {
  return typeof value === 'string' && (newsArticleSlugs as readonly string[]).includes(value);
}
