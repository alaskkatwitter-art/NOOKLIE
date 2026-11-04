'use client';

import AccountBadge from '@/components/AccountBadge';
import {contentMediaUrl} from '@/lib/security/content-media';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Author = {
  id: string;
  username: string;
  display_name: string | null; verified?: boolean; is_official?: boolean;
  avatar_url: string | null;
};

type Tag = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  category_slug: string | null;
};

type Story = {
  id: string;
  author_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  rating: string | null;
  created_at: string;
  updated_at: string;
  author: Author | null;
};

export default function TagPage() {
  const params = useParams();
  const router = useRouter();

  const slug = params?.slug as string;

  const [tag, setTag] = useState<Tag | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;

    async function loadTag() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          `/api/tags/${encodeURIComponent(slug)}`,
          {
            cache: 'no-store',
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Não foi possível carregar esta tag.'
          );
        }

        setTag(data.tag);
        setStories(data.stories || []);
      } catch (err: any) {
        console.error(err);

        setError(
          err?.message ||
            'Não foi possível carregar esta tag.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadTag();
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#09070a] text-white flex items-center justify-center">
        <div className="text-sm text-gray-400">
          Carregando tag...
        </div>
      </main>
    );
  }

  if (error || !tag) {
    return (
      <main className="min-h-screen bg-[#09070a] text-white">
        <header className="border-b border-white/10 bg-[#0b090c]/95">
          <div className="mx-auto max-w-6xl px-5 py-4">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-xl font-semibold hover:text-pink-300 transition"
            >
              Nooklie
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <h1 className="text-2xl font-semibold">
            Tag não encontrada
          </h1>

          <p className="mt-3 text-sm text-gray-500">
            {error ||
              'Essa tag não existe ou não está disponível.'}
          </p>


        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#09070a] text-white">
      {/* HEADER */}
      <header className="border-b border-white/10 bg-[#0b090c]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-xl font-semibold tracking-tight hover:text-pink-300 transition"
          >
            Nooklie
          </button>


        </div>
      </header>

      {/* CONTEÚDO */}
      <div className="mx-auto max-w-6xl px-5 py-10">
        {/* TÍTULO */}
        <section className="mb-10">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {tag.category && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-400">
                {tag.category}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {tag.name}
          </h1>

          <p className="mt-3 text-sm text-gray-500">
            {stories.length === 0
              ? 'Nenhuma história usa esta tag ainda.'
              : stories.length === 1
              ? '1 história com esta tag'
              : `${stories.length} histórias com esta tag`}
          </p>
        </section>

        {/* HISTÓRIAS */}
        {stories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {stories.map((story) => (
              <button
                key={story.id}
                type="button"
                onClick={() =>
                  router.push(`/historia/${story.id}`)
                }
                className="group text-left overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-pink-400/20 transition"
              >
                <div className="flex min-h-[190px]">
                  {/* CAPA */}
                  <div className="w-[125px] shrink-0 bg-white/[0.03]">
                    {story.cover_url ? (
                      <img
                        src={contentMediaUrl(story.cover_url)}
                        alt={`Capa de ${story.title}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-gray-600">
                        Sem capa
                      </div>
                    )}
                  </div>

                  {/* INFORMAÇÕES */}
                  <div className="min-w-0 flex-1 p-5">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {story.status && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                          {story.status}
                        </span>
                      )}

                      {story.rating && (
                        <span className="rounded-full border border-pink-400/20 bg-pink-500/10 px-2.5 py-1 text-[11px] text-pink-300">
                          {story.rating === 'Livre'
                            ? 'Livre'
                            : `+${story.rating}`}
                        </span>
                      )}
                    </div>

                    <h2 className="line-clamp-2 text-lg font-semibold text-gray-100 group-hover:text-pink-200 transition">
                      {story.title}
                    </h2>

                    {story.author && (
                      <p className="mt-1 text-xs text-gray-500">
                        por{' '}
                        <span className="text-gray-400">
                          {story.author.display_name ||
                            story.author.username}<AccountBadge account={story.author} />
                        </span>
                      </p>
                    )}

                    {story.description && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-400">
                        {story.description}
                      </p>
                    )}

                    <div className="mt-4 text-xs text-pink-300 opacity-0 group-hover:opacity-100 transition">
                      Ver história →
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-sm text-gray-500">
              Ainda não existem histórias usando esta tag.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
