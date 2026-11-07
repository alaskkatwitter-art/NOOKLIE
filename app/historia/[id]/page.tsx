"use client";

import AccountBadge from '@/components/AccountBadge';
import Link from 'next/link';
import { chapterKinds, ChapterKind, SeriesBook, storyFormats, storyKinds } from '@/lib/stories/metadata';
import {contentMediaUrl} from '@/lib/security/content-media';
import StoryReadingActions from '@/components/StoryReadingActions';
import StorySynopsis from '@/components/StorySynopsis';
import { BookOpen } from 'lucide-react';
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

type Chapter = {
  entry_kind?: ChapterKind;
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  published: boolean;
  created_at: string;
};

type Story = {
  series_name?: string;
  series_books?: SeriesBook[];
  story_kind?: keyof typeof storyKinds;
  story_format?: keyof typeof storyFormats;
  has_content_warnings?: boolean; fandom?: string; work_has_ai?: boolean; cover_has_ai?: boolean; content_warnings?: string; accepts_translation?: boolean;
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
  tags: Tag[];
  chapters: Chapter[];
  likes: number;
  liked: boolean;
};

export default function HistoriaPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [story, setStory] = useState<Story | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedReading, setSavedReading] = useState<{ storyId: string; chapterId: string } | null>(null);


  useEffect(() => {
    if (!id) return;

    async function loadStory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/stories/${id}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Não foi possível carregar a história."
          );
        }

        setStory(data.story || data);
      } catch (err) {
        console.error("Erro ao carregar história:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a história."
        );
      } finally {
        setLoading(false);
      }
    }

    loadStory();
    void fetch('/api/discovery/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: id }) }).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          setCurrentUserId(null);
          return;
        }

        const data = await response.json();

        setCurrentUserId(
          data?.user?.id ||
            data?.user_id ||
            data?.id ||
            null
        );
      } catch (err) {
        console.error("Erro ao carregar usuário:", err);
        setCurrentUserId(null);
      }
    }

    loadCurrentUser();
  }, []);


  const publishedChapters = story?.chapters?.filter((chapter) => chapter.published) ?? [];
  const firstChapterId = publishedChapters[0]?.id;

  useEffect(() => {
    if (!currentUserId || !firstChapterId || story?.id !== id) return;

    const controller = new AbortController();
    async function loadSavedReading() {
      try {
        const response = await fetch(`/api/reading-progress?chapter=${firstChapterId}&resume=1`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { chapter_id: chapterId } = await response.json();
        if (!controller.signal.aborted && typeof chapterId === 'string') {
          setSavedReading({ storyId: id, chapterId });
        }
      } catch {
        // The first published chapter stays available if progress cannot be loaded.
      }
    }
    void loadSavedReading();
    return () => controller.abort();
  }, [currentUserId, firstChapterId, id, story?.id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0710] text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-pink-400/20 border-t-pink-400" />

            <p className="text-sm text-white/50">
              Carregando história...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !story) {
    return (
      <main className="min-h-screen bg-[#0b0710] text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mb-4 text-5xl">
              ☁️
            </div>

            <h1 className="mb-2 text-2xl font-semibold">
              História não encontrada
            </h1>

            <p className="mb-6 text-sm text-white/50">
              {error ||
                "Essa história não existe ou não está disponível."}
            </p>


          </div>
        </div>
      </main>
    );
  }

  const isOwner = currentUserId === story.author_id;
  const savedChapter = currentUserId && savedReading?.storyId === story.id
    ? publishedChapters.find((chapter) => chapter.id === savedReading.chapterId)
    : undefined;
  const readingChapterId = savedChapter?.id ?? firstChapterId;
  const chapterCount = `${publishedChapters.length} ${publishedChapters.length === 1 ? 'capítulo' : 'capítulos'}`;
  const workLabels = [
    story.story_kind && storyKinds[story.story_kind],
    story.fandom || story.series_name ||
      story.tags?.find((tag) => tag.category_slug === 'genre')?.name ||
      (story.story_format && storyFormats[story.story_format]),
  ].filter(Boolean).join(' · ');

  return (
    <main className="min-h-screen bg-[#0b0710] text-white">
      <header className="border-b border-white/5 bg-[#0b0710]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xl font-bold tracking-tight text-white transition hover:text-pink-300"
          >
            NOOKLIE
          </button>


        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,#42203a_0%,#211222_42%,#130d18_78%)] p-4 min-[380px]:grid-cols-[6rem_minmax(0,1fr)] sm:p-7 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-9 lg:p-9">
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <div className="col-start-1 row-span-2 row-start-1 flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-[#29172b] shadow-xl lg:rounded-2xl">
              {story.cover_url ? (
                <img
                  src={contentMediaUrl(story.cover_url)}
                  alt={`Capa de ${story.title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-2 text-center text-xs text-pink-100/75">
                  <BookOpen size={24} aria-hidden="true" />
                  <span>Sem capa</span>
                </div>
              )}
            </div>

            {story.author && (
              <Link
                href={`/perfil/${story.author.id}`}
                className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 rounded-xl text-pink-50 hover:text-pink-200 lg:gap-3 lg:border lg:border-white/10 lg:bg-black/20 lg:p-3"
              >
                {story.author.avatar_url ? (
                  <img
                    src={contentMediaUrl(story.author.avatar_url)}
                    alt=""
                    className="size-8 shrink-0 rounded-full object-cover lg:size-10"
                  />
                ) : (
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pink-500/20 text-sm font-semibold text-pink-200 lg:size-10">
                    {story.author.username?.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-white/65">Escrito por</p>
                  <p className="wrap-anywhere text-sm font-semibold">
                    {story.author.display_name || story.author.username}<AccountBadge account={story.author} />
                  </p>
                </div>
              </Link>
            )}
          </div>

          <div className="contents lg:block lg:min-w-0">
            <div className="col-start-2 row-start-1 min-w-0">
              {workLabels && (
                <p className="mb-2 wrap-anywhere text-xs font-semibold text-pink-200 sm:text-sm">{workLabels}</p>
              )}
              <h1 className="wrap-anywhere text-2xl leading-tight font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {story.title}
              </h1>
              <ul aria-label="Detalhes da obra" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/75 sm:text-sm">
                {story.status && (
                  <li className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-200">{story.status}</li>
                )}
                {story.rating && (
                  <li className="rounded-full bg-white/10 px-2.5 py-1" aria-label={`Classificação indicativa: ${story.rating}`}>
                    {/^[0-9]+$/.test(story.rating) ? `${story.rating}+` : story.rating}
                  </li>
                )}
                <li className="px-1">{chapterCount}</li>
              </ul>
            </div>

            <div className="col-span-2 row-start-3 min-w-0 border-t border-white/10 pt-4 lg:mt-6 lg:pt-5">
              <section aria-labelledby="sinopse-obra">
                <h2 id="sinopse-obra" className="mb-2 text-lg font-semibold text-pink-50">Sinopse</h2>
                {story.description?.trim() ? (
                  <StorySynopsis key={story.id} text={story.description} />
                ) : (
                  <p className="text-sm text-white/70">Esta obra ainda não tem sinopse.</p>
                )}
              </section>

              {!!story.tags?.length && (
                <ul aria-label="Tags da obra" className="mt-4 flex flex-wrap gap-2">
                  {story.tags.map((tag) => (
                    <li key={tag.id} className="max-w-full rounded-full border border-pink-300/15 bg-pink-300/5 px-3 py-1 wrap-anywhere text-xs text-pink-100/85">
                      #{tag.name}
                    </li>
                  ))}
                </ul>
              )}

              {(story.has_content_warnings || story.content_warnings) && (
                <section aria-labelledby="avisos-obra" className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-100">
                  <h2 id="avisos-obra" className="font-semibold">Avisos de conteúdo e gatilhos</h2>
                  <p className="mt-2 wrap-anywhere whitespace-pre-wrap">{story.content_warnings || 'O autor sinalizou temas sensíveis sem detalhar os avisos.'}</p>
                </section>
              )}

              {readingChapterId && (
                <div className="mt-5 flex items-start gap-2">
                  <Link
                    href={`/capitulo/${readingChapterId}`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-pink-300 px-5 py-3 text-center text-sm font-bold text-[#291020] transition hover:bg-pink-200 sm:flex-none"
                  >
                    <BookOpen size={18} aria-hidden="true" />
                    {savedChapter ? 'Continuar leitura' : 'Começar a ler'}
                  </Link>
                  <StoryReadingActions storyId={story.id} />
                </div>
              )}

              {isOwner && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/editar-historia/${story.id}`} className="rounded-xl border border-pink-300/25 bg-pink-300/10 px-4 py-2.5 text-sm font-medium text-pink-100 hover:bg-pink-300/20">
                    Editar obra
                  </Link>
                  <Link href={`/historia/${story.id}/novo-capitulo`} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10">
                    Novo capítulo
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <section aria-labelledby="sumario-obra" className="mt-9 sm:mt-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-pink-300/60">
                Sumário
              </p>

              <h2 id="sumario-obra" className="text-2xl font-semibold">
                Capítulos
              </h2>
            </div>

            <span className="text-sm text-white/30">
              {chapterCount}
            </span>
          </div>

          {publishedChapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
              <div className="mb-3 text-4xl">
                📖
              </div>

              <h3 className="mb-2 font-medium text-white/70">
                Ainda não existem capítulos
              </h3>

              <p className="text-sm text-white/30">
                Essa história ainda não possui capítulos publicados.
              </p>

              {isOwner && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/historia/${story.id}/novo-capitulo`
                    )
                  }
                  className="mt-5 rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400"
                >
                  Criar primeiro capítulo
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {publishedChapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/capitulo/${chapter.id}`
                    )
                  }
                  className="group flex w-full items-center justify-between gap-5 rounded-2xl border border-white/5 bg-white/[0.025] px-5 py-5 text-left transition hover:border-pink-400/20 hover:bg-pink-500/[0.04]"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-sm font-semibold text-pink-300">
                      {chapter.chapter_number}
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs text-white/30">
                        {chapter.entry_kind && chapter.entry_kind !== 'chapter' ? chapterKinds[chapter.entry_kind] : `Capítulo ${chapter.chapter_number}`}
                      </p>

                      <h3 className="truncate font-medium text-white/80 transition group-hover:text-pink-300">
                        {chapter.title}
                      </h3>
                    </div>
                  </div>

                  <span className="shrink-0 text-xl text-white/20 transition group-hover:translate-x-1 group-hover:text-pink-300">
                    →
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        {!!story.series_books?.length && (
          <section aria-label="Ordem de leitura da série" className="mt-8 rounded-2xl border border-pink-300/20 bg-gradient-to-br from-[#321729] to-[#171018] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Ordem de leitura</p>
            <h2 className="mt-2 text-xl font-bold">{story.series_name}</h2>
            <ol className="mt-4 space-y-2">
              {story.series_books.map(book => <li key={book.id}>{book.id === story.id ? (
                <span aria-current="page" className="block rounded-xl bg-pink-300/10 p-3 text-pink-100">Volume {book.series_volume} · {book.title}</span>
              ) : (
                <Link href={`/historia/${book.id}`} className="block rounded-xl border border-white/10 p-3 hover:border-pink-300/50">Volume {book.series_volume} · {book.title}</Link>
              )}</li>)}
            </ol>
          </section>
        )}
        <section aria-label="Informações da obra" className="mt-8 space-y-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/75">
          {story.story_kind && <p><strong>Tipo de obra</strong> · {storyKinds[story.story_kind]}{story.story_format && ` · ${storyFormats[story.story_format]}`}</p>}
          {story.fandom && <p><strong>Fandom</strong> · {story.fandom}</p>}
          {story.work_has_ai && <p className="text-pink-200">Esta obra tem IA</p>}
          {story.cover_has_ai && <p className="text-pink-200">Esta capa tem IA</p>}
          <p>{story.accepts_translation ? 'O autor aceita propostas de tradução. Solicite autorização antes de publicar.' : 'Traduções não autorizadas. Consulte o autor antes de traduzir.'}</p>
        </section>
      </section>
    </main>
  );
}
