'use client';

import { useEffect, useState } from 'react';
import AccountBadge from './AccountBadge';
import { contentMediaUrl } from '@/lib/security/content-media';

type Reply = {
  content: string;
  image_url: string | null;
  author: { username: string; display_name: string | null; avatar_url: string | null; verified?: boolean; is_official?: boolean } | null;
};

export default function QuotedReply({ postId, replyId }: { postId: string; replyId: string }) {
  const [reply, setReply] = useState<Reply | null>();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/nook-comments?' + new URLSearchParams({ post_id: postId, reply_id: replyId }), { cache: 'no-store', signal: controller.signal })
      .then(async response => setReply(response.ok ? (await response.json()).comments?.[0] ?? null : null))
      .catch(() => { if (!controller.signal.aborted) setReply(null); });
    return () => controller.abort();
  }, [postId, replyId]);

  const href = '/feed?' + new URLSearchParams({ post: postId, reply: replyId });
  if (reply === null) return <p className="mt-2 rounded-xl border border-white/10 p-3 text-sm text-white/55">Resposta indisponível.</p>;
  return <a href={href} className="mt-2 block rounded-xl border border-white/15 p-3 hover:border-pink-300/45">
    {reply?.author && <span className="mb-2 flex items-center gap-2 text-sm font-bold">
      {reply.author.avatar_url && <img src={reply.author.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
      {reply.author.display_name || reply.author.username}<AccountBadge account={reply.author} />
      <span className="text-xs font-normal text-white/60">@{reply.author.username}</span>
    </span>}
    {reply?.content && <span className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{reply.content}</span>}
    {reply?.image_url && <img src={contentMediaUrl(reply.image_url, 'feed')} alt="Imagem da resposta nooklada" loading="lazy" className="mt-2 max-h-56 w-full rounded-xl object-contain" />}
    <span className="mt-2 block text-xs text-pink-200">Ver resposta nooklada</span>
  </a>;
}
