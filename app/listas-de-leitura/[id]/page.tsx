'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type ListDetail = { list: { name: string; description: string }; stories: { id: string; title: string }[] };

export default function ReadingListPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ListDetail>();
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/reading-lists?id=' + encodeURIComponent(id), { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setDetail(result);
      }).catch(failure => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [id]);

  return <main className="mx-auto min-h-screen max-w-4xl space-y-5 p-5 text-white">
    <Link href="/listas-de-leitura" className="text-pink-200">← Minhas listas</Link>
    {error && <p role="alert">{error}</p>}
    {!detail && !error && <p role="status">Carregando lista…</p>}
    {detail && <>
      <h1 className="text-2xl font-bold">{detail.list.name}</h1>
      {detail.list.description && <p className="break-words text-white/70">{detail.list.description}</p>}
      {detail.stories.length ? <ul className="grid gap-2">{detail.stories.map(story =>
        <li key={story.id}><Link href={'/historia/' + story.id} className="block rounded-xl border border-white/15 p-3 hover:border-pink-300/60">{story.title}</Link></li>
      )}</ul> : <p>Esta lista ainda não tem histórias disponíveis.</p>}
    </>}
  </main>;
}
