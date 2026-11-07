const hashtag = /^[\p{L}\p{N}_]{1,64}$/u;

export function normalizeHashtag(value: string) {
  const tag = value.trim().replace(/^#/, '');
  return hashtag.test(tag) ? tag.toLocaleLowerCase('pt-BR') : '';
}

export const feedTokenPattern = /(https?:\/\/[^\s<>]+|(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]{1,64}(?![\p{L}\p{N}_]))/gu;

export function linkedVideoId(value: string, currentOrigin: string) {
  const url = URL.parse(value);
  if (!url || (url.origin !== currentOrigin && url.origin !== 'https://nooklie.vercel.app')) return null;
  return /^\/video\/([0-9a-f-]{36})\/?$/i.exec(url.pathname)?.[1] ?? null;
}
