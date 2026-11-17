'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type ListDetail = { list: { name: string; description: string }; stories: { id: string; title: string }[] };

export default function ReadingListPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ListDetail>();
  const [removing, setRemoving] = useState(false);
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

  async function removeStory(storyId: string) {
    setRemoving(true);
    setError('');
    try {
      const response = await fetch('/api/reading-lists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: id, storyId }),
      });
      if (!response.ok) throw new Error();
      setDetail(previous => previous && { ...previous, stories: previous.stories.filter(story => story.id !== storyId) });
    } catch {
      setError('Não foi possível retirar a história da lista. Tente novamente.');
    } finally {
      setRemoving(false);
    }
  }

  return <main className="mx-auto min-h-screen max-w-4xl space-y-5 p-5 text-white">
    <Link href="/listas-de-leitura" className="text-pink-200">← Minhas listas</Link>
    {error && <p role="alert">{error}</p>}
    {!detail && !error && <p role="status">Carregando lista…</p>}
    {detail && <>
      <h1 className="text-2xl font-bold">{detail.list.name}</h1>
      {detail.list.description && <p className="break-words text-white/70">{detail.list.description}</p>}
      {detail.stories.length ? <ul className="grid gap-2">{detail.stories.map(story =>
        <li key={story.id} className="flex items-center gap-3 rounded-xl border border-white/15 p-3"><Link href={'/historia/' + story.id} className="min-w-0 flex-1 break-words hover:text-pink-200">{story.title}</Link>
          <button type="button" disabled={removing} aria-label={`Retirar ${story.title} da lista`}
            className="shrink-0 text-sm text-pink-200" onClick={() => void removeStory(story.id)}>Retirar da lista</button>
        </li>
      )}</ul> : <p>Esta lista ainda não tem histórias disponíveis.</p>}
    </>}
  </main>;
}
