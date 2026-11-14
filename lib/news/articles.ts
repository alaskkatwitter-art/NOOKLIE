export const newsArticleSlugs = ['boas-vindas', 'originais', 'atualizacao-6-novembro-2026', 'doacoes-e-novidades', 'nooklie-de-volta'] as const;
export function isNewsArticle(value: unknown): value is typeof newsArticleSlugs[number] {
  return typeof value === 'string' && (newsArticleSlugs as readonly string[]).includes(value);
}

export const newsArticles = {
  'boas-vindas': { title: 'Boas-vindas ao Nooklie', description: 'Conheça os recursos e encontre seu próximo cantinho de leitura.' },
  'originais': { title: 'Um espaço para suas histórias originais', description: 'Conheça as opções para publicar e descobrir obras originais.' },
  'atualizacao-6-novembro-2026': { title: 'Novidades e correções do Nooklie', description: 'Personalização, capítulos, comentários e melhorias sugeridas pela comunidade.' },
  'doacoes-e-novidades': { title: 'Doação voluntária e novidades da ouvidoria', description: 'Conheça a meta mensal do Nooklie e veja o que mudou nas menções, nas notificações e na edição pelo celular.' },
  'nooklie-de-volta': { title: 'O Nooklie está de volta', description: 'Entenda por que o site ficou fora do ar, conheça o novo endereço e veja o que mudou para quem lê, escreve e participa da comunidade.' },
} satisfies Record<typeof newsArticleSlugs[number], {title:string;description:string}>;
