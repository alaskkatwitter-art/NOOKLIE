import Link from 'next/link';
import { mentionPattern } from '@/lib/social/mentions';

const mentionTokens = new RegExp(`(https?://[^\\s<>]+|${mentionPattern.source})`, 'gu');

export function PostMention({ token }: { token: string }) {
  return <Link href={'/perfil/' + token.slice(1).toLowerCase()} prefetch={false} className="font-semibold text-pink-200 hover:underline">{token}</Link>;
}

export function PostMentions({ text }: { text: string }) {
  return text.split(mentionTokens).map((token, index) =>
    index % 2 && token.startsWith('@') ? <PostMention key={index} token={token} /> : token
  );
}
