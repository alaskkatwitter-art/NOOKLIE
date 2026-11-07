'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Reply = { id: string; post_id: string; content: string };

export default function SavedRepliesPage() {
  const [replies, setReplies] = useState<Reply[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/nook-comments?saved=1', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReplies(data.comments);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  return <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-5 text-white">
    <Link href="/feed" className="text-pink-200">← Feed</Link>
    <h1 className="text-2xl font-bold">Respostas salvas</h1>
    {error && <p role="alert">{error}</p>}
    {!replies && !error && <p role="status">Carregando respostas…</p>}
    {replies?.length === 0 && <p>Você ainda não salvou respostas.</p>}
    {replies?.map(reply => <Link className="block rounded-xl border border-white/15 p-4 hover:border-pink-300/60" key={reply.id} href={`/feed?post=${reply.post_id}&reply=${reply.id}`}>
      <p className="line-clamp-3 break-words">{reply.content || 'Resposta com imagem'}</p>
      <span className="mt-1 block text-sm text-pink-200">Abrir conversa</span>
    </Link>)}
  </main>;
}
