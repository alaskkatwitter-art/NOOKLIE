import { mentionPattern } from './mentions';

const hashtag = /^[\p{L}\p{N}_]{1,64}$/u;

export function normalizeHashtag(value: string) {
  const tag = value.trim().replace(/^#/, '');
  return hashtag.test(tag) ? tag.toLocaleLowerCase('pt-BR') : '';
}

const linkToken = /https?:\/\/[^\s<>]+/;
const hashtagToken = /(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]{1,64}(?![\p{L}\p{N}_])/u;
export const feedTokenPattern = new RegExp(`(${linkToken.source}|${hashtagToken.source}|${mentionPattern.source})`, 'gu');

export function linkedVideoId(value: string, currentOrigin: string) {
  const url = URL.parse(value);
  if (!url || (url.origin !== currentOrigin && url.origin !== 'https://nooklie.vercel.app')) return null;
  return /^\/video\/([0-9a-f-]{36})\/?$/i.exec(url.pathname)?.[1] ?? null;
}
