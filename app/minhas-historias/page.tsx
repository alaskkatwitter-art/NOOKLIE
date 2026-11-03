'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* =========================================================
   TIPOS
========================================================= */

type CurrentUser = {
  id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  theme_color?: string | null;
};

type Story = {
  id: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  status?: string | null;
  genre?: string | null;
  fandom?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  author_id?: string | null;
  chapters_count?: number | null;
  likes_count?: number | null;
  views_count?: number | null;
};

/* =========================================================
   ÍCONES
========================================================= */

function CloudIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.5 18.5H17a4.5 4.5 0 0 0 .72-8.942A6.5 6.5 0 0 0 5.02 10.5H4.5a4 4 0 0 0 0 8h3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 20h4l10.8-10.8a2.83 2.83 0 1 0-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m13.5 6.5 4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 11a8.1 8.1 0 0 0-14.9-3.8L3 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 5v5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 13a8.1 8.1 0 0 0 14.9 3.8L21 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 19v-5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDate(dateString?: string | null) {
  if (!dateString) {
    return '';
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getStoryStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();

  if (
    normalized === 'published' ||
    normalized === 'publicada' ||
    normalized === 'published_story'
  ) {
    return {
      label: 'Publicada',
      className:
        'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300',
    };
  }

  if (
    normalized === 'unpublished' ||
    normalized === 'unpublished_story'
  ) {
    return {
      label: 'Não publicada',
      className:
        'border-white/10 bg-white/[0.04] text-white/45',
    };
  }

  return {
    label: 'Rascunho',
    className:
      'border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]',
  };
}

/* =========================================================
   CARD
========================================================= */

function StoryCard({
  story,
}: {
  story: Story;
}) {
  const status = getStoryStatus(story.status);

  const chapterCount =
    story.chapters_count ?? 0;

  return (
    <article className="group overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#100c11]/90 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[#ff78b9]/20 hover:shadow-[0_20px_70px_rgba(255,120,185,0.06)]">
      <div className="flex flex-col sm:flex-row">
        <Link
          href={`/historia/${story.id}`}
          className="relative block h-[220px] shrink-0 overflow-hidden bg-[#171117] sm:h-[250px] sm:w-[175px]"
        >
          {story.cover_url ? (
            <img
              src={contentMediaUrl(story.cover_url)}
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#ff78b9]/[0.12] via-[#171117] to-[#c63dff]/[0.08] text-[#ff78b9]/40">
              <CloudIcon />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${status.className}`}
                >
                  {status.label}
                </span>

                {story.fandom && (
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[9px] font-bold text-white/35">
                    {story.fandom}
                  </span>
                )}
              </div>

              <Link
                href={`/historia/${story.id}`}
                className="block"
              >
                <h2 className="truncate text-xl font-black tracking-tight text-white transition group-hover:text-[#ff78b9]">
                  {story.title || 'Sem título'}
                </h2>
              </Link>

              {story.genre && (
                <p className="mt-1 text-xs font-semibold text-[#ff78b9]/55">
                  {story.genre}
                </p>
              )}
            </div>

            <Link
              href={`/editar-historia/${story.id}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/35 transition hover:border-[#ff78b9]/25 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9]"
              aria-label={`Editar ${story.title}`}
              title="Editar história"
            >
              <EditIcon />
            </Link>
          </div>

          {story.description && (
            <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/38">
              {story.description}
            </p>
          )}

          <div className="mt-auto pt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/25">
              <span>
                {chapterCount}{' '}
                {chapterCount === 1
                  ? 'capítulo'
                  : 'capítulos'}
              </span>

              {story.likes_count != null && (
                <span>
                  {story.likes_count} curtidas
                </span>
              )}

              {story.views_count != null && (
                <span>
                  {story.views_count} leituras
                </span>
              )}

              {story.updated_at && (
                <span>
                  Atualizada{' '}
                  {formatDate(story.updated_at)}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/historia/${story.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-[#ff78b9] px-4 py-2.5 text-xs font-black text-[#190d16] transition hover:brightness-110"
              >
                Ver história
                <ChevronRightIcon />
              </Link>

              <Link
                href={`/editar-historia/${story.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-xs font-bold text-white/55 transition hover:border-[#ff78b9]/25 hover:text-[#ff78b9]"
              >
                <EditIcon />
                Editar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   PÁGINA
========================================================= */

export default function MinhasHistoriasPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [stories, setStories] =
    useState<Story[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  /* =======================================================
     AUTENTICAÇÃO
  ======================================================= */

  const loadCurrentUser =
    useCallback(async () => {
      try {
        const response = await fetch(
          '/api/auth/me',
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          router.replace('/login');
          return null;
        }

        const data =
          await response.json();

        if (
          !data.authenticated ||
          !data.user
        ) {
          router.replace('/login');
          return null;
        }

        const user =
          data.user as CurrentUser;

        setCurrentUser(user);

        return user;
      } catch (err) {
        console.error(
          'Erro ao carregar usuário:',
          err
        );

        router.replace('/login');

        return null;
      }
    }, [router]);

  /* =======================================================
     HISTÓRIAS

     IMPORTANTE:
     Esta função NÃO depende de currentUser.
     Isso impede o loop de renderização.
  ======================================================= */

  const loadStories =
    useCallback(
      async (
        user: CurrentUser,
        showRefresh = false
      ) => {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError('');

        try {
          const response =
            await fetch(
              '/api/my-stories',
              {
                cache: 'no-store',
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error ||
                'Não foi possível carregar suas histórias.'
            );
          }

          const incoming =
            Array.isArray(data?.stories)
              ? data.stories
              : [];

          const normalized: Story[] =
            incoming
              .map((story: any) => ({
                id:
                  String(
                    story.id || ''
                  ),
                title:
                  story.title ||
                  'Sem título',
                description:
                  story.description ||
                  null,
                cover_url:
                  story.cover_url ||
                  null,
                status:
                  story.status ||
                  null,
                genre:
                  story.genre ||
                  null,
                fandom:
                  story.fandom ||
                  null,
                created_at:
                  story.created_at ||
                  null,
                updated_at:
                  story.updated_at ||
                  null,
                author_id:
                  story.author_id ||
                  null,
                chapters_count:
                  story.chapters_count ??
                  0,
                likes_count:
                  story.likes_count ??
                  null,
                views_count:
                  story.views_count ??
                  null,
              }))
              .filter(
                (story: Story) =>
                  Boolean(story.id)
              );

          /*
           * Segurança extra no cliente:
           * só mostramos histórias cujo author_id
           * corresponde ao usuário autenticado.
           */
          const userStories =
            normalized.filter(
              (story) =>
                story.author_id ===
                user.id
            );

          const uniqueStories =
            Array.from(
              new Map(
                userStories.map(
                  (story) => [
                    story.id,
                    story,
                  ]
                )
              ).values()
            );

          setStories(
            uniqueStories
          );
        } catch (err) {
          console.error(
            'Erro ao carregar histórias:',
            err
          );

          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível carregar suas histórias.'
          );

          setStories([]);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  /* =======================================================
     CARREGAMENTO INICIAL

     RODA UMA ÚNICA VEZ.
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const user =
        await loadCurrentUser();

      if (
        cancelled ||
        !user
      ) {
        return;
      }

      await loadStories(user);
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    loadCurrentUser,
    loadStories,
  ]);

  /* =======================================================
     CONTADORES
  ======================================================= */

  const stats = useMemo(() => {
    const total =
      stories.length;

    const published =
      stories.filter((story) => {
        const status =
          String(
            story.status || ''
          ).toLowerCase();

        return (
          status === 'published' ||
          status === 'publicada' ||
          status === 'published_story'
        );
      }).length;

    const drafts =
      Math.max(
        total - published,
        0
      );

    return {
      total,
      published,
      drafts,
    };
  }, [stories]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-180px] h-[500px] w-[500px] rounded-full bg-[#ff4d9d]/[0.08] blur-[130px]" />

        <div className="absolute right-[-180px] top-[25%] h-[500px] w-[500px] rounded-full bg-[#c63dff]/[0.045] blur-[140px]" />

        <div className="absolute bottom-[-200px] left-[35%] h-[450px] w-[450px] rounded-full bg-[#ff78b9]/[0.035] blur-[130px]" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[1180px] px-4 pb-20 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">


            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]">
              <CloudIcon />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#ff78b9]/70">
                Nooklie
              </p>

              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white sm:text-2xl">
                Minhas histórias
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (currentUser) {
                  loadStories(
                    currentUser,
                    true
                  );
                }
              }}
              disabled={
                loading ||
                refreshing ||
                !currentUser
              }
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-white/45 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9] disabled:opacity-40"
              aria-label="Atualizar histórias"
            >
              <span
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              >
                <RefreshIcon />
              </span>
            </button>

            <Link
              href="/criar"
              className="hidden items-center gap-2 rounded-full bg-[#ff78b9] px-5 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110 sm:inline-flex"
            >
              <PlusIcon />
              Nova história
            </Link>

            <Link
              href="/criar"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff78b9] text-[#190d16] transition hover:brightness-110 sm:hidden"
              aria-label="Nova história"
            >
              <PlusIcon />
            </Link>
          </div>
        </header>

        <section className="mb-7 overflow-hidden rounded-[30px] border border-[#ff78b9]/10 bg-gradient-to-br from-[#ff78b9]/[0.09] via-[#100c11]/90 to-[#c63dff]/[0.05] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.24)] sm:p-8">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff78b9]">
              Seu espaço de escrita
            </p>

            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Tudo o que você está
              escrevendo, em um só lugar.
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40 sm:text-[15px]">
              Gerencie suas histórias,
              continue seus rascunhos e
              acompanhe o que já publicou
              no Nooklie.
            </p>
          </div>
        </section>

        <div className="mb-7 grid grid-cols-3 gap-3">
          <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
              Histórias
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.total}
            </p>
          </div>

          <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
              Publicadas
            </p>

            <p className="mt-2 text-2xl font-black text-[#ff78b9]">
              {stats.published}
            </p>
          </div>

          <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
              Rascunhos
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.drafts}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/15 bg-red-400/[0.05] px-5 py-4">
            <p className="text-sm font-semibold text-red-300">
              {error}
            </p>

            {currentUser && (
              <button
                type="button"
                onClick={() =>
                  loadStories(
                    currentUser
                  )
                }
                className="mt-2 text-xs font-bold text-red-300 underline underline-offset-2"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">
              Biblioteca de escrita
            </p>

            <h2 className="mt-1 text-xl font-black text-white">
              Suas histórias
            </h2>
          </div>

          <Link
            href="/criar"
            className="hidden text-xs font-bold text-white/30 transition hover:text-[#ff78b9] sm:block"
          >
            Criar nova →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3].map(
              (item) => (
                <div
                  key={item}
                  className="animate-pulse overflow-hidden rounded-[26px] border border-white/[0.06] bg-white/[0.025]"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="h-[220px] bg-white/[0.04] sm:h-[250px] sm:w-[175px]" />

                    <div className="flex-1 p-6">
                      <div className="h-3 w-20 rounded bg-white/[0.06]" />

                      <div className="mt-4 h-6 w-3/5 rounded bg-white/[0.06]" />

                      <div className="mt-4 h-3 w-full rounded bg-white/[0.04]" />

                      <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        ) : stories.length === 0 ? (
          <div className="flex min-h-[430px] items-center justify-center rounded-[28px] border border-white/[0.06] bg-white/[0.015]">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] text-[#ff78b9]/50">
                <BookIcon />
              </div>

              <h2 className="mt-6 text-xl font-black text-white">
                Você ainda não tem
                histórias aqui.
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/35">
                Comece uma nova história
                e ela aparecerá nesta
                página para você continuar
                escrevendo quando quiser.
              </p>

              <Link
                href="/criar"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ff78b9] px-5 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110"
              >
                <PlusIcon />
                Criar minha primeira história
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {stories.map(
              (story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                />
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}
