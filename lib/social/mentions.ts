export const mentionPattern = /(?<![\p{L}\p{N}_@])@[a-zA-Z0-9_]{3,30}(?![\p{L}\p{N}_@])/u;

export function activeMention(text: string, caret: number) {
  const prefix = text.slice(0, caret);
  const match = /(?<![\p{L}\p{N}_@])@([a-zA-Z0-9_]{1,30})$/u.exec(prefix);
  if (!match || /https?:\/\/[^\s<>]*$/i.test(prefix)) return null;
  const end = caret + (text.slice(caret).match(/^[a-zA-Z0-9_]*/)?.[0].length ?? 0);
  return { start: match.index, end, query: match[1].toLowerCase() };
}
