'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Chapter = {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  published: boolean;
  publication_status:
    | 'draft'
    | 'scheduled'
    | 'published'
    | 'unpublished';
};

type Story = {
  id: string;
  title: string;
  cover_url: string | null;
};

type ChapterResponse = {
  chapter?: Chapter;
  media?: unknown[];
  error?: string;
};

export default function CapituloPublicadoPage() {
  const params = useParams();
  const router = useRouter();

  const id = params?.id as string;

  const [chapter, setChapter] =
    useState<Chapter | null>(null);

  const [story, setStory] =
    useState<Story | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [copied, setCopied] =
    useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    async function loadPublishedChapter() {
      try {
        setLoading(true);
        setError('');

        const chapterResponse =
          await fetch(
            `/api/chapters/${id}`,
            {
              cache: 'no-store',
            }
          );

        const chapterData =
          (await chapterResponse.json()) as ChapterResponse;

        if (
          !chapterResponse.ok ||
          !chapterData.chapter
        ) {
          throw new Error(
            chapterData.error ||
              'Não foi possível carregar o capítulo.'
          );
        }

        const loadedChapter =
          chapterData.chapter;

        if (cancelled) {
          return;
        }

        setChapter(
          loadedChapter
        );

        /*
         * IMPORTANTE:
         *
         * Não redirecionamos automaticamente
         * para a história caso o status ainda
         * não esteja publicado.
         *
         * Isso evita que a página desapareça
         * durante uma leitura imediatamente
         * após a publicação.
         */
        if (
          loadedChapter.publication_status !==
          'published'
        ) {
          setError(
            'Este capítulo ainda não está publicado.'
          );

          setLoading(false);
          return;
        }

        const storyResponse =
          await fetch(
            `/api/stories/${loadedChapter.story_id}`,
            {
              cache: 'no-store',
            }
          );

        const storyData =
          await storyResponse.json();

        if (cancelled) {
          return;
        }

        if (
          storyResponse.ok &&
          storyData.story
        ) {
          setStory({
            id:
              storyData.story.id,
            title:
              storyData.story.title ||
              'História',
            cover_url:
              storyData.story.cover_url ||
              null,
          });
        } else {
          setStory({
            id:
              loadedChapter.story_id,
            title: 'História',
            cover_url: null,
          });
        }
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        console.error(
          caughtError
        );

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Não foi possível carregar a publicação.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPublishedChapter();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopyLink() {
    if (!chapter) {
      return;
    }

    const url =
      `${window.location.origin}/capitulo/${chapter.id}`;

    try {
      await navigator.clipboard.writeText(
        url
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2200);
    } catch (copyError) {
      console.error(
        copyError
      );

      setError(
        'Não foi possível copiar o link.'
      );
    }
  }

  function handleShareToMural() {
    if (!chapter) {
      return;
    }

    const url =
      `${window.location.origin}/capitulo/${chapter.id}`;

    const shareText =
      `Acabei de publicar o capítulo ${chapter.chapter_number} de "${story?.title || 'minha história'}" no Nooklie.`;

    const muralUrl =
      `/mural?share_url=${encodeURIComponent(
        url
      )}&share_text=${encodeURIComponent(
        shareText
      )}`;

    router.push(
      muralUrl
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b090c] text-white flex items-center justify-center">
        <p className="text-sm text-gray-500">
          Carregando...
        </p>
      </main>
    );
  }

  if (
    error ||
    !chapter
  ) {
    return (
      <main className="min-h-screen bg-[#0b090c] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <p className="text-sm text-red-300">
            {error ||
              'Publicação não encontrada.'}
          </p>


        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b090c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-5 py-12">
        <section className="w-full text-center">
          <div className="mx-auto max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-pink-300/70">
              Publicação concluída
            </p>

            <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
              Parabéns, você postou o capítulo{' '}
              {chapter.chapter_number}!
            </h1>

            <p className="mt-3 text-sm leading-6 text-gray-500">
              {chapter.title}
            </p>
          </div>

          {story?.cover_url ? (
            <div className="mx-auto mt-9 w-36 overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:w-40">
              <div className="aspect-[2/3]">
                <img
                  src={contentMediaUrl(story.cover_url)}
                  alt={`Capa de ${story.title}`}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto mt-9 flex aspect-[2/3] w-36 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-xs text-gray-600 sm:w-40">
              Sem capa
            </div>
          )}

          <div className="mx-auto mt-9 flex w-full max-w-md flex-col gap-3">
            <button
              type="button"
              onClick={
                handleShareToMural
              }
              className="w-full rounded-xl bg-pink-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-pink-400 transition"
            >
              Compartilhar no Mural
            </button>

            <button
              type="button"
              onClick={
                handleCopyLink
              }
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition"
            >
              {copied
                ? 'Link copiado'
                : 'Copiar link'}
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/historia/${chapter.story_id}`
              )
            }
            className="mt-7 text-sm text-gray-500 hover:text-white transition"
          >
            Voltar para a história
          </button>
        </section>
      </div>
    </main>
  );
}
