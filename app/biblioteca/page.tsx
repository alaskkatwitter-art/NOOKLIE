'use client';

import type { AccountBadgeFlags } from '@/components/AccountBadge';
import { isReadingStatus, readingStatuses, type ReadingStatus } from '@/lib/library/reading-status';
import {contentMediaUrl} from '@/lib/security/content-media';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, LibraryBig } from 'lucide-react';

type CurrentUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

type LibraryItem = {
  story_id: string;
  story_title: string;
  story_description?: string | null;
  story_cover_url?: string | null;
  story_status?: string | null;
  story_rating?: string | null;

  author_username?: string | null;
  author_display_name?: string | null;
  author?: AccountBadgeFlags | null;
  author_avatar_url?: string | null;

  chapter_id?: string | null;
  chapter_title?: string | null;

  progress_percent?: number | null;
  position?: number | null;
  reading_completed?: boolean;
  reading_status?: ReadingStatus | null;
  has_favorite_chapter?: boolean;

  updated_at?: string | null;

  lists?: string[];
};

const libraryFilters = {
  all: 'Todas',
  ...readingStatuses,
  favorites: 'Favoritas',
} as const;

type LibraryFilter = keyof typeof libraryFilters;
type LibraryView = 'grid' | 'shelf';

function inferredReadingStatus(item: LibraryItem): ReadingStatus {
  if (item.reading_completed) return 'completed';
  return item.chapter_id || (item.progress_percent ?? 0) > 0 ? 'reading' : 'unread';
}

function matchesFilter(item: LibraryItem, filter: LibraryFilter, readingDetailsAvailable: boolean) {
  if (filter === 'all') return true;
  if (filter === 'favorites') return readingDetailsAvailable && item.has_favorite_chapter === true;
  return (item.reading_status ?? (readingDetailsAvailable ? inferredReadingStatus(item) : null)) === filter;
}

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

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
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

function RefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
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

function ChevronRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
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

/* =========================================================
   PÁGINA
========================================================= */

export default function BibliotecaPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [items, setItems] =
    useState<LibraryItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');
  const [view, setView] = useState<LibraryView>('grid');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [readingDetailsAvailable, setReadingDetailsAvailable] = useState(true);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const visibleItems = items.filter(item => matchesFilter(item, filter, readingDetailsAvailable));

  async function changeReadingStatus(storyId: string, value: string) {
    if (savingStatus) return;
    setSavingStatus(storyId);
    setStatusError('');
    const status = isReadingStatus(value) ? value : null;
    try {
      const response = await fetch('/api/library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId, reading_status: status }),
      });
      if (!response.ok) throw new Error('Não foi possível salvar o status da história.');
      setItems(previous => previous.map(item => item.story_id === storyId
        ? { ...item, reading_status: status }
        : item));
    } catch {
      setStatusError('Não foi possível salvar o status da história. Tente novamente.');
    } finally {
      setSavingStatus(null);
    }
  }

  function changeView(next: LibraryView) {
    setView(next);
    if (!currentUser) return;
    try {
      localStorage.setItem(`nooklie:library-view:${currentUser.id}`, next);
    } catch {
      // The current view can still be used if browser storage is unavailable.
    }
  }

  /* =======================================================
     USUÁRIO
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

        const data =
          await response.json();

        if (
          response.ok &&
          data.authenticated &&
          data.user
        ) {
          setCurrentUser(data.user);
          try {
            setView(localStorage.getItem(`nooklie:library-view:${data.user.id}`) === 'shelf' ? 'shelf' : 'grid');
          } catch {
            setView('grid');
          }

          return data.user as CurrentUser;
        }

        router.replace('/login');

        return null;
      } catch (error) {
        console.error(
          'Erro ao carregar usuário:',
          error
        );

        router.replace('/login');

        return null;
      }
    }, [router]);

  /* =======================================================
     BIBLIOTECA REAL
  ======================================================= */

  const loadLibrary =
    useCallback(
      async (
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
              '/api/library',
              {
                method: 'GET',
                cache: 'no-store',
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error ||
                'Não foi possível carregar sua biblioteca.'
            );
          }

          const incoming =
            Array.isArray(data?.items)
              ? data.items
              : [];
          setReadingDetailsAvailable(data.reading_details_available !== false);

          setItems(
            incoming.map(
              (item: any): LibraryItem => ({
                story_id:
                  item.story_id,

                story_title:
                  item.story_title ||
                  'Sem título',

                story_description:
                  item.story_description ||
                  null,

                story_cover_url:
                  item.story_cover_url ||
                  null,

                story_status:
                  item.story_status ||
                  null,

                story_rating:
                  item.story_rating ||
                  null,

                author_username:
                  item.author_username ||
                  null,

                author: item.author ?? null,
                author_display_name:
                  item.author_display_name ||
                  null,

                author_avatar_url:
                  item.author_avatar_url ||
                  null,

                chapter_id:
                  item.chapter_id ||
                  null,

                chapter_title:
                  item.chapter_title ||
                  null,

                progress_percent:
                  typeof item.progress_percent ===
                  'number'
                    ? item.progress_percent
                    : item.progress_percent
                    ? Number(
                        item.progress_percent
                      )
                    : 0,

                position:
                  typeof item.position ===
                  'number'
                    ? item.position
                    : item.position
                    ? Number(
                        item.position
                      )
                    : 0,
                reading_completed: item.reading_completed === true,
                reading_status: isReadingStatus(item.reading_status) ? item.reading_status : null,
                has_favorite_chapter: item.has_favorite_chapter === true,

                updated_at:
                  item.updated_at ||
                  null,

                lists:
                  Array.isArray(
                    item.lists
                  )
                    ? item.lists
                    : [],
              })
            )
          );
        } catch (error) {
          console.error(
            'Erro ao carregar biblioteca:',
            error
          );

          setError(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar sua biblioteca.'
          );

          setItems([]);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  /* =======================================================
     INICIALIZAÇÃO
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const user =
        await loadCurrentUser();

      if (
        user &&
        !cancelled
      ) {
        await loadLibrary();
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    loadCurrentUser,
    loadLibrary,
  ]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">
      {/* BACKGROUND */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-180px] h-[500px] w-[500px] rounded-full bg-[#ff4d9d]/[0.08] blur-[130px]" />

        <div className="absolute right-[-180px] top-[25%] h-[500px] w-[500px] rounded-full bg-[#c63dff]/[0.045] blur-[140px]" />

        <div className="absolute bottom-[-200px] left-[35%] h-[450px] w-[450px] rounded-full bg-[#ff78b9]/[0.035] blur-[130px]" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[1180px] px-4 pb-20 pt-5 sm:px-6 lg:px-8 lg:pt-8">

        {/* HEADER */}

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
                Minha biblioteca
              </h1>
            </div>

          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/listas-de-leitura" className="rounded-xl border border-pink-300/25 px-3 py-3 text-center text-xs font-bold text-pink-200">
              Listas de leitura
            </Link>
          <button
            type="button"
            onClick={() =>
              loadLibrary(true)
            }
            disabled={
              loading ||
              refreshing
            }
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-white/45 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9] disabled:opacity-40"
            aria-label="Atualizar biblioteca"
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
          </div>
        </header>

        {/* HERO */}

        <section className="mb-7 overflow-hidden rounded-[30px] border border-[#ff78b9]/10 bg-gradient-to-br from-[#ff78b9]/[0.09] via-[#100c11]/90 to-[#c63dff]/[0.05] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.24)] sm:p-8">

          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff78b9]">
            Seu cantinho de leitura
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Histórias que você
            escolheu guardar.
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40 sm:text-[15px]">
            Encontre aqui as histórias
            que você adicionou à sua
            biblioteca e acompanhe seu
            progresso de leitura.
          </p>

        </section>

        {/* ERRO */}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/15 bg-red-400/[0.05] px-5 py-4">

            <p className="text-sm font-semibold text-red-300">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                loadLibrary()
              }
              className="mt-2 text-xs font-bold text-red-300 underline underline-offset-2"
            >
              Tentar novamente
            </button>

          </div>
        )}

        {/* TÍTULO */}

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">Salvos</p>
            <h2 className="mt-1 text-xl font-black text-white">Sua biblioteca</h2>
          </div>
          <div className="library-view-options" role="group" aria-label="Visualização da biblioteca">
            <button type="button" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><LayoutGrid size={16} aria-hidden="true" /> Grade</button>
            <button type="button" aria-pressed={view === 'shelf'} onClick={() => changeView('shelf')}><LibraryBig size={16} aria-hidden="true" /> Estante</button>
          </div>
        </div>
        {!loading && items.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar histórias salvas">
            {(Object.keys(libraryFilters) as LibraryFilter[]).map(key => (
              <button type="button" key={key} aria-pressed={filter === key} disabled={key === 'favorites' && !readingDetailsAvailable} onClick={() => setFilter(key)} className="library-filter">
                {libraryFilters[key]}
              </button>
            ))}
          </div>
        )}
        {!loading && items.length > 0 && !readingDetailsAvailable && (
          <p role="status" className="mb-4 text-sm text-white/70">O progresso automático está temporariamente indisponível.</p>
        )}

        {statusError && <p role="alert" className="mb-4 text-sm text-rose-300">{statusError}</p>}

        {/* LOADING */}

        {loading ? (

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

            {[1, 2, 3].map(
              (item) => (

                <div
                  key={item}
                  className="animate-pulse overflow-hidden rounded-[26px] border border-white/[0.06] bg-white/[0.025]"
                >

                  <div className="h-[250px] bg-white/[0.04]" />

                  <div className="space-y-3 p-5">

                    <div className="h-5 w-3/4 rounded bg-white/[0.06]" />

                    <div className="h-3 w-1/2 rounded bg-white/[0.04]" />

                    <div className="h-2 w-full rounded-full bg-white/[0.04]" />

                    <div className="h-10 w-full rounded-xl bg-white/[0.04]" />

                  </div>

                </div>

              )
            )}

          </div>

        ) : items.length === 0 ? (

          /* VAZIO */

          <div className="flex min-h-[430px] items-center justify-center rounded-[28px] border border-white/[0.06] bg-white/[0.015]">

            <div className="max-w-md px-6 text-center">

              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] text-[#ff78b9]/50">
                <BookIcon />
              </div>

              <h2 className="mt-6 text-xl font-black text-white">
                Sua biblioteca está vazia.
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/35">
                Quando você adicionar
                uma história à sua biblioteca,
                ela aparecerá aqui.
              </p>

              <Link
                href="/explorar"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ff78b9] px-5 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110"
              >
                Explorar histórias
                <ChevronRightIcon />
              </Link>

            </div>

          </div>

        ) : visibleItems.length === 0 ? (
          <p role="status" className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/75">
            {filter === 'favorites' ? 'Nenhuma obra salva tem um capítulo favoritado.' : 'Nenhuma história salva nesta categoria.'}
          </p>
        ) : (
          <ul className={view === 'shelf' ? 'library-shelves' : 'library-compact-grid'} aria-label="Histórias salvas">
            {visibleItems.map(item => {
              const href = `/historia/${item.story_id}`;
              const status = item.reading_status ?? (readingDetailsAvailable ? inferredReadingStatus(item) : null);
              const onShelf = view === 'shelf';
              return (
                <li key={item.story_id} className="min-w-0">
                  <Link href={href} className={onShelf ? 'library-shelf-book' : 'library-grid-book'}>
                    <div className={onShelf ? 'library-shelf-cover' : 'library-grid-cover'}>
                      {item.story_cover_url
                        ? <img src={contentMediaUrl(item.story_cover_url, 'cover')} alt="" loading="lazy" decoding="async" />
                        : <span className="grid h-full place-items-center text-pink-300" aria-hidden="true"><BookIcon /></span>}
                    </div>
                    <span className={onShelf ? 'library-shelf-title' : 'library-grid-title'}>{item.story_title}</span>
                  </Link>
                  <select
                    className="library-reading-status"
                    aria-label={`Status de leitura de ${item.story_title}`}
                    value={item.reading_status ?? ''}
                    disabled={savingStatus !== null}
                    onChange={event => void changeReadingStatus(item.story_id, event.target.value)}
                  >
                    <option value="">{status && !item.reading_status ? readingStatuses[status] + ' (automático)' : 'Automático'}</option>
                    {Object.entries(readingStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {item.chapter_id && status !== 'completed' && (
                    <Link href={`/capitulo/${item.chapter_id}`} className="library-resume">
                      Continuar · {Math.round(item.progress_percent ?? 0)}%
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </main>
  );
}
