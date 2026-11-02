'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import TagFilters from './TagFilters';

type ExploreUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  is_following?: boolean;
  is_self?: boolean;
};

type ExploreStory = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  rating: string | null;
  author: ExploreUser | null;
  is_saved?: boolean;
  is_own_story?: boolean;
  tags?: Array<{ name: string; slug: string; category: string | null }>;
};

type ExploreResults = {
  users: ExploreUser[];
  stories: ExploreStory[];
  has_more: boolean;
};

type CurrentUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
};

export default function ExplorarContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const urlQuery = searchParams.get('q') || '';
  const filterQuery = searchParams.toString();

  const [searchValue, setSearchValue] = useState(urlQuery);

  const [results, setResults] = useState<ExploreResults>({
    users: [],
    stories: [],
    has_more: false,
  });

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingResults, setLoadingResults] =
    useState(false);

  const [searchError, setSearchError] =
    useState('');

  const [followLoading, setFollowLoading] =
    useState<Record<string, boolean>>({});

  const [libraryLoading, setLibraryLoading] =
    useState<Record<string, boolean>>({});

  useEffect(() => {
    setSearchValue(urlQuery);
  }, [urlQuery]);

  /*
   * =========================================================
   * USUÁRIO LOGADO
   * =========================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        setLoadingUser(true);

        const response = await fetch(
          '/api/auth/me',
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          if (!cancelled) {
            setCurrentUser(null);
          }

          return;
        }

        const data = await response.json();

        if (!cancelled) {
          setCurrentUser(
            data?.authenticated &&
              data?.user
              ? data.user
              : null
          );
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingUser(false);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * =========================================================
   * BUSCA
   * =========================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function search() {
      try {
        setLoadingResults(true);
        setSearchError('');

        const queryString = filterQuery ? `?${filterQuery}` : '';
        const response = await fetch(`/api/explore${queryString}`, { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok) throw new Error(data?.error || 'Não foi possível realizar a busca.');

        if (!cancelled) {
          setResults({
            users: Array.isArray(data?.users) ? data.users : [],
            stories: Array.isArray(data?.stories) ? data.stories : [],
            has_more: data?.has_more === true,
          });
        }
      } catch (error) {
        console.error('ERRO NA BUSCA DO EXPLORAR:', error);
        if (!cancelled) {
          setResults({ users: [], stories: [], has_more: false });
          setSearchError(error instanceof Error ? error.message : 'Não foi possível realizar a busca.');
        }
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }

    void search();
    return () => { cancelled = true; };
  }, [filterQuery]);

  function updateSearch(value: string) {
    setSearchValue(value);

    const params = new URLSearchParams(
      searchParams.toString()
    );

    params.delete('page');

    if (value.trim()) {
      params.set('q', value);
    } else {
      params.delete('q');
    }

    const queryString = params.toString();

    router.replace(
      queryString
        ? `${pathname}?${queryString}`
        : pathname
    );
  }

  /*
   * =========================================================
   * FOLLOW / UNFOLLOW
   * =========================================================
   */

  async function toggleFollow(
    user: ExploreUser
  ) {
    if (!currentUser) {
      router.push('/login');
      return;
    }

    if (user.is_self) {
      return;
    }

    setFollowLoading((previous) => ({
      ...previous,
      [user.id]: true,
    }));

    try {
      const response = await fetch(
        '/api/follows',
        {
          method: user.is_following
            ? 'DELETE'
            : 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            following_id: user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível atualizar o follow.'
        );
      }

      setResults((previous) => ({
        ...previous,
        users: previous.users.map(
          (item) =>
            item.id === user.id
              ? {
                  ...item,
                  is_following:
                    data.following === true,
                }
              : item
        ),
      }));
    } catch (error) {
      console.error(
        'ERRO AO ALTERAR FOLLOW:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o follow.'
      );
    } finally {
      setFollowLoading((previous) => ({
        ...previous,
        [user.id]: false,
      }));
    }
  }

  /*
   * =========================================================
   * BIBLIOTECA
   * =========================================================
   */

  async function toggleLibrary(
    story: ExploreStory
  ) {
    if (!currentUser) {
      router.push('/login');
      return;
    }

    setLibraryLoading((previous) => ({
      ...previous,
      [story.id]: true,
    }));

    try {
      const response = await fetch(
        '/api/library',
        {
          method: story.is_saved
            ? 'DELETE'
            : 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            story_id: story.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível atualizar sua biblioteca.'
        );
      }

      setResults((previous) => ({
        ...previous,
        stories: previous.stories.map(
          (item) =>
            item.id === story.id
              ? {
                  ...item,
                  is_saved:
                    data.saved === true,
                }
              : item
        ),
      }));
    } catch (error) {
      console.error(
        'ERRO AO ALTERAR BIBLIOTECA:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar sua biblioteca.'
      );
    } finally {
      setLibraryLoading((previous) => ({
        ...previous,
        [story.id]: false,
      }));
    }
  }

  const hasFilters = Boolean(
    urlQuery ||
      searchParams.getAll('includeTag').length ||
      searchParams.getAll('excludeTag').length ||
      searchParams.get('rating') ||
      searchParams.get('status') ||
      searchParams.get('sort')
  );

  const hasSearchResults =
    results.users.length > 0 ||
    results.stories.length > 0;

  const currentPage = Math.max(1, Number(searchParams.get('page') || '1'));

  function changePage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#100b12] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#100b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2"
            aria-label="Ir para o início"
          >
            <CloudLogo />

            <span className="text-xl font-black tracking-[0.18em] text-[#ff78b9] transition group-hover:text-[#ff9bca]">
              NOOKLIE
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            <NavLink
              href="/"
              label="Início"
            />

            <NavLink
              href="/explorar"
              label="Explorar"
              active
            />

            <NavLink
              href="/escrever"
              label="Escrever"
            />

            <NavLink
              href="/fandoms"
              label="Fandoms"
            />

            <NavLink
              href="/noticias"
              label="Notícias"
            />
          </nav>

          {loadingUser ? (
            <div className="ml-auto h-10 w-24 animate-pulse rounded-full bg-white/5" />
          ) : currentUser ? (
            <Link
              href={`/perfil/${encodeURIComponent(
                currentUser.username
              )}`}
              className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10"
            >
              <Avatar
                src={currentUser.avatar_url}
                name={
                  currentUser.display_name ||
                  currentUser.username
                }
                size="small"
              />

              <span className="hidden max-w-28 truncate text-sm font-semibold text-white/70 sm:block">
                {currentUser.display_name ||
                  currentUser.username}
              </span>

              {currentUser.verified && (
                <VerifiedBadge size="small" />
              )}
            </Link>
          ) : (
            <Link
              href="/login"
              className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
            >
              Entrar
            </Link>
          )}
        </div>

        <div className="overflow-x-auto border-t border-white/5 md:hidden">
          <nav className="mx-auto flex min-w-max items-center justify-center gap-1 px-4 py-2">
            <MobileNavLink
              href="/"
              label="Início"
            />

            <MobileNavLink
              href="/explorar"
              label="Explorar"
              active
            />

            <MobileNavLink
              href="/escrever"
              label="Escrever"
            />

            <MobileNavLink
              href="/fandoms"
              label="Fandoms"
            />

            <MobileNavLink
              href="/noticias"
              label="Notícias"
            />
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5">
        <div className="pointer-events-none absolute -left-40 top-0 h-[34rem] w-[34rem] rounded-full bg-[#ff4fa3]/10 blur-3xl" />

        <div className="pointer-events-none absolute -right-40 top-20 h-[32rem] w-[32rem] rounded-full bg-[#ff78b9]/10 blur-3xl" />

        <section className="relative py-16 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
            Descobrir
          </p>

          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[1.05] md:text-6xl">
            Encontre sua próxima{' '}
            <span className="bg-gradient-to-r from-[#ff68ae] to-[#ff9acb] bg-clip-text text-transparent">
              história.
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-white/50 md:text-lg">
            Explore histórias, autores e novos universos para acompanhar.
          </p>

          <div className="mt-9 flex items-center rounded-2xl border border-white/10 bg-[#191219] px-5 py-4 transition focus-within:border-[#ff78b9]/30 focus-within:bg-[#1d141c]">
            <SearchIcon />

            <input
              value={searchValue}
              onChange={(event) =>
                updateSearch(event.target.value)
              }
              placeholder="Pesquisar histórias ou autores..."
              className="ml-3 w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />

            {loadingResults && (
              <div className="ml-3 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-[#ff78b9]" />
            )}
          </div>
        </section>

        <TagFilters currentUser={currentUser} />

        <section className="relative pb-14">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
                Resultados
              </p>

              <h2 className="mt-2 text-3xl font-black">
                {urlQuery ? `Busca por “${urlQuery}”` : 'Histórias para descobrir'}
              </h2>
            </div>

            {searchError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-200">
                {searchError}
              </div>
            ) : loadingResults ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]" />

                <div className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]" />
              </div>
            ) : !hasSearchResults ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center">
                <p className="text-lg font-bold">
                  Nenhum resultado encontrado.
                </p>

                <p className="mt-2 text-sm text-white/40">
                  Tente pesquisar outro username ou título de história.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {results.users.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xl font-bold">
                        Usuários
                      </h3>

                      <span className="text-xs text-white/30">
                        {results.users.length}{' '}
                        {results.users.length === 1
                          ? 'resultado'
                          : 'resultados'}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {results.users.map(
                        (user) => (
                          <div
                            key={user.id}
                            className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/5"
                          >
                            <div className="flex items-center gap-4">
                              <Link
                                href={`/perfil/${encodeURIComponent(
                                  user.username
                                )}`}
                                className="shrink-0"
                              >
                                <Avatar
                                  src={user.avatar_url}
                                  name={
                                    user.display_name ||
                                    user.username
                                  }
                                />
                              </Link>

                              <Link
                                href={`/perfil/${encodeURIComponent(
                                  user.username
                                )}`}
                                className="min-w-0 flex-1"
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className="truncate font-bold transition hover:text-[#ff9bca]">
                                    {user.display_name ||
                                      user.username}
                                  </p>

                                  {user.verified && (
                                    <VerifiedBadge size="small" />
                                  )}
                                </div>

                                <p className="truncate text-sm text-white/35">
                                  @{user.username}
                                </p>
                              </Link>
                            </div>

                            {currentUser &&
                              !user.is_self && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleFollow(user)
                                  }
                                  disabled={
                                    followLoading[user.id]
                                  }
                                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                                    user.is_following
                                      ? 'border border-white/10 bg-white/5 text-white/55 hover:border-red-400/20 hover:bg-red-400/5 hover:text-red-300'
                                      : 'bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] text-[#180d15] hover:-translate-y-0.5 hover:brightness-110'
                                  }`}
                                >
                                  {followLoading[user.id]
                                    ? 'Aguarde...'
                                    : user.is_following
                                    ? 'Seguindo'
                                    : 'Seguir'}
                                </button>
                              )}

                            {!currentUser && (
                              <Link
                                href="/login"
                                className="mt-4 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/50 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                              >
                                Entrar para seguir
                              </Link>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {results.stories.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xl font-bold">
                        Histórias
                      </h3>

                      <span className="text-xs text-white/30">
                        {results.stories.length}{' '}
                        {results.stories.length === 1
                          ? 'resultado'
                          : 'resultados'}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {results.stories.map(
                        (story) => (
                          <article
                            key={story.id}
                            className="group overflow-hidden rounded-2xl border border-white/10 bg-[#171018] transition hover:-translate-y-0.5 hover:border-[#ff78b9]/30"
                          >
                            <div className="flex min-h-36">
                              <Link
                                href={`/historia/${story.id}`}
                                className="w-28 shrink-0 overflow-hidden bg-[#21151e]"
                              >
                                {story.cover_url ? (
                                  <img
                                    src={contentMediaUrl(story.cover_url)}
                                    alt=""
                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex h-full min-h-36 items-center justify-center bg-gradient-to-br from-[#4d203c] to-[#1a1016]">
                                    <CloudLogo small />
                                  </div>
                                )}
                              </Link>

                              <div className="min-w-0 flex-1 p-5">
                                <Link
                                  href={`/historia/${story.id}`}
                                >
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ff78b9]">
                                    História
                                  </p>

                                  <h4 className="mt-2 line-clamp-2 text-lg font-black transition group-hover:text-[#ff9bca]">
                                    {story.title}
                                  </h4>
                                </Link>

                                {story.author && (
                                  <div className="mt-2 flex items-center gap-1.5 text-sm text-white/40">
                                    <span>
                                      por
                                    </span>

                                    <Link
                                      href={`/perfil/${encodeURIComponent(
                                        story.author.username
                                      )}`}
                                      className="text-white/60 hover:text-[#ff9bca]"
                                    >
                                      {story.author.display_name ||
                                        story.author.username}
                                    </Link>

                                    {story.author
                                      .verified && (
                                      <VerifiedBadge size="small" />
                                    )}
                                  </div>
                                )}

                                {story.description && (
                                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/35">
                                    {story.description}
                                  </p>
                                )}

                                {story.tags && story.tags.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {story.tags.slice(0, 5).map((tag) => (
                                      <Link key={tag.slug} href={`/tag/${encodeURIComponent(tag.slug)}`} className="rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/5 px-2.5 py-1 text-[10px] font-medium text-[#ff9bca]/80 transition hover:border-[#ff78b9]/40 hover:text-[#ffb7d5]">
                                        {tag.name}
                                      </Link>
                                    ))}
                                  </div>
                                )}

                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                  {story.rating && (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/40">
                                      {story.rating}
                                    </span>
                                  )}

                                  {story.status && (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/40">
                                      {story.status}
                                    </span>
                                  )}

                                  <div className="ml-auto">
                                    {currentUser ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleLibrary(
                                            story
                                          )
                                        }
                                        disabled={
                                          libraryLoading[
                                            story.id
                                          ]
                                        }
                                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                                          story.is_saved
                                            ? 'border border-[#ff78b9]/30 bg-[#ff78b9]/10 text-[#ff9bca] hover:bg-red-400/10 hover:text-red-300'
                                            : 'border border-white/10 bg-white/5 text-white/45 hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]'
                                        }`}
                                      >
                                        {libraryLoading[
                                          story.id
                                        ]
                                          ? '...'
                                          : story.is_saved
                                          ? 'Na biblioteca'
                                          : 'Adicionar à biblioteca'}
                                      </button>
                                    ) : (
                                      <Link
                                        href="/login"
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/45 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                                      >
                                        Entrar para salvar
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(currentPage > 1 || results.has_more) && (
              <nav aria-label="Paginação das histórias" className="mt-7 flex items-center justify-center gap-3">
                <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage <= 1} className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/65 transition hover:border-[#ff78b9]/40 disabled:cursor-not-allowed disabled:opacity-30">
                  Anterior
                </button>
                <span className="text-xs text-white/40">Página {currentPage}</span>
                <button type="button" onClick={() => changePage(currentPage + 1)} disabled={!results.has_more} className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/65 transition hover:border-[#ff78b9]/40 disabled:cursor-not-allowed disabled:opacity-30">
                  Próxima
                </button>
              </nav>
            )}
          </section>

        <section className="relative mb-20 overflow-hidden rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-r from-[#291522] via-[#21131e] to-[#171018]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#ff78b9]/10 blur-3xl" />

          <div className="relative flex flex-col items-start justify-between gap-8 p-8 md:flex-row md:items-center md:p-12">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
                Nooklie
              </p>

              <h2 className="mt-3 text-3xl font-black md:text-4xl">
                Descubra algo novo.
              </h2>

              <p className="mt-4 leading-7 text-white/50">
                Explore diferentes fandoms e gêneros para encontrar
                histórias que combinam com você.
              </p>
            </div>

            {hasFilters ? (
              <Link
                href="/explorar"
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-7 py-3.5 font-bold transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
              >
                Limpar filtros
              </Link>
            ) : (
              <Link
                href="/fandoms"
                className="shrink-0 rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 font-bold text-[#180d15] transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
              >
                Ver fandoms
              </Link>
            )}
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#0b080d]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-10 text-sm text-white/35">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Sobre
            </Link>

            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Termos
            </Link>

            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Privacidade
            </Link>
          </div>

          <p className="text-white/25">
            De escritor para escritor.
          </p>

          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} Nooklie
          </p>
        </div>
      </footer>
    </main>
  );
}

function Avatar({
  src,
  name,
  size = 'normal',
}: {
  src: string | null;
  name: string;
  size?: 'small' | 'normal';
}) {
  const classes =
    size === 'small'
      ? 'h-7 w-7 text-[10px]'
      : 'h-12 w-12 text-sm';

  if (src) {
    return (
      <img
        src={contentMediaUrl(src)}
        alt=""
        className={`${classes} shrink-0 rounded-full object-cover ring-1 ring-white/10`}
      />
    );
  }

  return (
    <div
      className={`${classes} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff68ae] to-[#ff91c4] font-black text-[#180d15]`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function VerifiedBadge({
  size = 'normal',
}: {
  size?: 'small' | 'normal' | 'large';
}) {
  const sizes = {
    small: {
      wrapper: 'h-4 w-4',
      icon: 10,
    },
    normal: {
      wrapper: 'h-5 w-5',
      icon: 12,
    },
    large: {
      wrapper: 'h-6 w-6',
      icon: 14,
    },
  };

  const current = sizes[size];

  return (
    <span
      className={`inline-flex ${current.wrapper} shrink-0 items-center justify-center rounded-full bg-[#ff78b9] shadow-[0_0_12px_rgba(255,120,185,0.25)]`}
      title="Conta verificada"
      aria-label="Conta verificada"
    >
      <svg
        width={current.icon}
        height={current.icon}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 12.5L9.2 16.5L19 7"
          stroke="#180d15"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function NavLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
        active
          ? 'bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15] shadow-[0_0_20px_rgba(255,120,185,0.15)]'
          : 'text-white/60 hover:bg-gradient-to-r hover:from-[#ff5fab]/15 hover:to-[#ff9bca]/15 hover:text-[#ff9bca]'
      }`}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
        active
          ? 'bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15]'
          : 'text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]'
      }`}
    >
      {label}
    </Link>
  );
}

function CategoryCard({
  title,
  type,
  index,
  active,
  onClick,
}: {
  title: string;
  type: 'Fandom' | 'Gênero';
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const gradients = [
    'from-[#5a2345] to-[#21121d]',
    'from-[#46284f] to-[#171018]',
    'from-[#303e59] to-[#13131b]',
    'from-[#58332f] to-[#1a1015]',
    'from-[#3d4b42] to-[#121714]',
    'from-[#523f62] to-[#17121c]',
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left transition duration-300 hover:-translate-y-0.5 ${
        gradients[index % gradients.length]
      } ${
        active
          ? 'border-[#ff78b9]/50 shadow-[0_0_30px_rgba(255,120,185,0.12)]'
          : 'border-white/10 hover:border-[#ff78b9]/30'
      }`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-white/5 bg-white/5 transition duration-500 group-hover:scale-125" />

      <div className="relative">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-white/35">
          {type}
        </span>

        <h3 className="mt-2 text-lg font-bold transition group-hover:text-[#ff9bca]">
          {title}
        </h3>

        <span className="mt-4 inline-block text-xs text-white/30 transition group-hover:text-white/50">
          {active
            ? 'Selecionado'
            : 'Explorar'}
        </span>
      </div>
    </button>
  );
}

function CloudLogo({
  small = false,
}: {
  small?: boolean;
}) {
  return (
    <svg
      width={small ? 34 : 48}
      height={small ? 24 : 32}
      viewBox="0 0 180 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Logo Nooklie"
    >
      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        fill="#FF78B9"
      />

      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        stroke="#FF9BCB"
        strokeWidth="3"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-white/35"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M16 16L21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
