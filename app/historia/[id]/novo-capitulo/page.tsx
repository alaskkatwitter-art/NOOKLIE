'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function NovoCapituloPage() {
  const params = useParams();
  const router = useRouter();

  const storyId = String(params.id);

  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function createDraft() {
      try {
        setError('');

        const response = await fetch('/api/chapters/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            story_id: storyId,
            title: 'Novo capítulo',
            body: '<p><br></p>',
            author_notes: '',
            publication_status: 'draft',
            scheduled_for: null,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Não foi possível criar o novo capítulo.'
          );
        }

        const chapterId = data?.chapter?.id;

        if (!chapterId) {
          throw new Error(
            'O capítulo foi criado, mas o ID não foi retornado.'
          );
        }

        if (cancelled) {
          return;
        }

        router.replace(
          `/editar-historia/${storyId}?chapter=${chapterId}`
        );
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Não foi possível criar o capítulo.'
        );
      }
    }

    void createDraft();

    return () => {
      cancelled = true;
    };
  }, [router, storyId]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-xl font-semibold">
            Não foi possível criar o capítulo
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-400">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              router.replace(`/historia/${storyId}`)
            }
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Voltar para a obra
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />

        <p className="mt-4 text-sm text-gray-400">
          Preparando o editor...
        </p>
      </div>
    </main>
  );
}
