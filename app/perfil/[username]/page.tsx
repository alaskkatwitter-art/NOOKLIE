'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useParams,
  useRouter,
} from 'next/navigation';
import OfficialBadge from '../../components/OfficialBadge';
import ReportProfileButton from '../../components/ReportProfileButton';

type User = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  verified?: boolean;
  is_official?: boolean;
  staff_badges?: { title: string; description: string }[];
};

type Story = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  rating: string | null;
  created_at: string;
  updated_at: string;

  main_fandom?: string | null;
  fandom?: string | null;
  fandom_name?: string | null;
};

type PostMedia = {
  id: string;
  post_id: string;
  media_url: string;
  media_type:
    | 'image'
    | 'gif';
  created_at?: string;
};

type NookPost = {
  id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  story_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  media?: PostMedia[];
};

type ReadingListItem = {
  id: string;
  list_id: string;
  story_id: string;
  added_at: string;
  story: Story | null;
};

type ReadingList = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  items: ReadingListItem[];
};

type FicClub = {
  id: string;
  story_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  story: Story | null;
};

type ProfileResponse = {
  user?: User;
  stories?: Story[];
  posts?: NookPost[];
  reading_lists?: ReadingList[];
  fic_clubs?: FicClub[];
  error?: string;
};

type FollowResponse = {
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
  is_self?: boolean;
  following?: boolean;
  error?: string;
};

type Tab =
  | 'stories'
  | 'nook'
  | 'lists'
  | 'clubs';

const TAB_ORDER: Tab[] = [
  'stories',
  'nook',
  'lists',
  'clubs',
];

function formatDate(
  value: string
) {
  try {
    return new Date(
      value
    ).toLocaleDateString(
      'pt-BR',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );
  } catch {
    return '';
  }
}

function getDisplayName(
  user: User
) {
  return (
    user.display_name?.trim() ||
    user.username
  );
}

function getFandom(
  story: Story
) {
  return (
    story.main_fandom?.trim() ||
    story.fandom?.trim() ||
    story.fandom_name?.trim() ||
    ''
  );
}

function isOngoing(
  status: string | null
) {
  if (!status) {
    return false;
  }

  const normalized =
    status
      .trim()
      .toLowerCase();

  return (
    normalized.includes(
      'andamento'
    ) ||
    normalized.includes(
      'ongoing'
    )
  );
}

function VerifiedBadge() {
  return (
    <span
      title="Perfil verificado"
      aria-label="Perfil verificado"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ff78b9] text-[#190d16]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5 9.2 17 19 7" />
      </svg>
    </span>
  );
}

function StoryCard({
  story,
  onOpen,
}: {
  story: Story;
  onOpen: () => void;
}) {
  const fandom =
    getFandom(story);

  const ongoing =
    isOngoing(
      story.status
    );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-3xl border border-white/10 bg-[#151015] text-left transition hover:border-[#ff78b9]/30 hover:bg-[#181218]"
    >
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#211a21] sm:h-44 sm:w-28">
          {story.cover_url ? (
            <img
              src={
                story.cover_url
              }
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl text-white/20">
              Livro
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-white sm:text-lg">
            {story.title}
          </h3>

          {story.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/45">
              {
                story.description
              }
            </p>
          )}

          <div className="mt-4 space-y-2 text-xs text-white/40">
            {fandom && (
              <p>
                <span className="font-bold text-white/60">
                  Fandom:
                </span>{' '}
                {fandom}
              </p>
            )}

            {story.rating && (
              <p>
                <span className="font-bold text-white/60">
                  Classificação:
                </span>{' '}
                {story.rating}
              </p>
            )}

            <p>
              <span className="font-bold text-white/60">
                Atualizada:
              </span>{' '}
              {formatDate(
                story.updated_at ||
                  story.created_at
              )}
            </p>
          </div>

          {story.status && (
            <div className="mt-4">
              {ongoing ? (
                <span className="inline-flex rounded-full bg-gradient-to-r from-[#ff78b9] via-[#ff9aca] to-[#b77cff] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#180d15] shadow-[0_0_20px_rgba(255,120,185,0.35)]">
                  {story.status}
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/55">
                  {story.status}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#151015] px-6 py-14 text-center">
      <div className="text-4xl">
        {icon}
      </div>

      <h2 className="mt-4 text-lg font-black">
        {title}
      </h2>

      <p className="mt-2 text-sm text-white/40">
        {description}
      </p>
    </div>
  );
}

export default function PublicProfilePage() {
  const params =
    useParams();

  const router =
    useRouter();

  const usernameParam =
    params?.username;

  const username =
    typeof usernameParam ===
    'string'
      ? usernameParam
      : Array.isArray(
            usernameParam
          )
        ? usernameParam[0]
        : undefined;

  const [user, setUser] =
    useState<User | null>(
      null
    );

  const [stories, setStories] =
    useState<Story[]>([]);

  const [posts, setPosts] =
    useState<NookPost[]>([]);

  const [
    readingLists,
    setReadingLists,
  ] = useState<ReadingList[]>(
    []
  );

  const [
    ficClubs,
    setFicClubs,
  ] = useState<FicClub[]>(
    []
  );

  const [
    activeTab,
    setActiveTab,
  ] = useState<Tab>(
    'stories'
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [
    followersCount,
    setFollowersCount,
  ] = useState(0);

  const [
    followingCount,
    setFollowingCount,
  ] = useState(0);

  const [
    isFollowing,
    setIsFollowing,
  ] = useState(false);

  const [isSelf, setIsSelf] =
    useState(false);

  const [
    followLoading,
    setFollowLoading,
  ] = useState(false);

  const touchStartX =
    useRef<number | null>(
      null
    );

  const activeIndex =
    TAB_ORDER.indexOf(
      activeTab
    );

  useEffect(() => {
    if (!username) {
      setLoading(false);
      setError(
        'Perfil não encontrado.'
      );
      return;
    }

    const safeUsername =
      username;

    async function loadProfile() {
      setLoading(true);
      setError('');

      try {
        const encodedUsername =
          encodeURIComponent(
            safeUsername
          );

        const response =
          await fetch(
            `/api/public-profile/${encodedUsername}`,
            {
              cache: 'no-store',
            }
          );

        const data: ProfileResponse =
          await response.json();

        if (!response.ok) {
          setError(
            data.error ||
              'Perfil não encontrado.'
          );
          return;
        }

        if (!data.user) {
          setError(
            'Perfil não encontrado.'
          );
          return;
        }

        setUser(data.user);

        setStories(
          Array.isArray(
            data.stories
          )
            ? data.stories
            : []
        );

        setPosts(
          Array.isArray(
            data.posts
          )
            ? data.posts
            : []
        );

        setReadingLists(
          Array.isArray(
            data.reading_lists
          )
            ? data.reading_lists
            : []
        );

        setFicClubs(
          Array.isArray(
            data.fic_clubs
          )
            ? data.fic_clubs
            : []
        );

        try {
          const followResponse =
            await fetch(
              `/api/follows?user_id=${encodeURIComponent(
                data.user.id
              )}`,
              {
                cache:
                  'no-store',
              }
            );

          const followData: FollowResponse =
            await followResponse.json();

          if (
            followResponse.ok
          ) {
            setFollowersCount(
              followData.followers_count ??
                0
            );

            setFollowingCount(
              followData.following_count ??
                0
            );

            setIsFollowing(
              !!followData.is_following
            );

            setIsSelf(
              !!followData.is_self
            );
          }
        } catch (
          followError
        ) {
          console.error(
            'Erro ao carregar seguidores:',
            followError
          );
        }
      } catch (err) {
        console.error(
          'Erro ao carregar perfil público:',
          err
        );

        setError(
          'Não foi possível carregar este perfil.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [username]);

  async function handleFollow() {
    if (
      !user ||
      isSelf ||
      followLoading
    ) {
      return;
    }

    setFollowLoading(true);

    try {
      const method =
        isFollowing
          ? 'DELETE'
          : 'POST';

      const response =
        await fetch(
          '/api/follows',
          {
            method,
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify(
              {
                following_id:
                  user.id,
              }
            ),
          }
        );

      const data: FollowResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível atualizar o follow.'
        );
      }

      setIsFollowing(
        data.following ??
          !isFollowing
      );

      setFollowersCount(
        data.followers_count ??
          followersCount
      );

      setFollowingCount(
        data.following_count ??
          followingCount
      );
    } catch (err) {
      console.error(
        'Erro ao atualizar follow:',
        err
      );

      alert(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar o follow.'
      );
    } finally {
      setFollowLoading(
        false
      );
    }
  }

  function goToTab(
    index: number
  ) {
    const safeIndex =
      Math.max(
        0,
        Math.min(
          TAB_ORDER.length - 1,
          index
        )
      );

    setActiveTab(
      TAB_ORDER[safeIndex]
    );
  }

  function handleTouchStart(
    event: React.TouchEvent
  ) {
    touchStartX.current =
      event.touches[0]?.clientX ??
      null;
  }

  function handleTouchEnd(
    event: React.TouchEvent
  ) {
    if (
      touchStartX.current ===
      null
    ) {
      return;
    }

    const endX =
      event.changedTouches[0]
        ?.clientX;

    if (
      typeof endX !==
      'number'
    ) {
      touchStartX.current =
        null;
      return;
    }

    const delta =
      endX -
      touchStartX.current;

    touchStartX.current =
      null;

    if (
      Math.abs(delta) < 60
    ) {
      return;
    }

    if (delta < 0) {
      goToTab(
        activeIndex + 1
      );
    } else {
      goToTab(
        activeIndex - 1
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0d0a0d] text-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#151015]">
            <div className="h-48 animate-pulse bg-white/5" />

            <div className="px-6 pb-7">
              <div className="-mt-14 h-28 w-28 animate-pulse rounded-full border-4 border-[#151015] bg-white/10" />

              <div className="mt-5 h-7 w-48 animate-pulse rounded bg-white/10" />

              <div className="mt-3 h-4 w-32 animate-pulse rounded bg-white/5" />

              <div className="mt-5 h-16 max-w-xl animate-pulse rounded bg-white/5" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0a0d] px-5 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151015] p-8 text-center">
          <div className="text-5xl">
            Livro
          </div>

          <h1 className="mt-5 text-2xl font-black">
            Perfil não encontrado
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/50">
            {error ||
              'Este usuário não existe ou o perfil não está disponível.'}
          </p>

          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="mt-7 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-white/90"
          >
            Voltar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0a0d] text-white">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-8">

        {/* VOLTAR */}

        <button
          type="button"
          onClick={() =>
            router.back()
          }
          className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white/50 transition hover:bg-white/5 hover:text-white"
        >
          <span className="text-lg">
            ←
          </span>

          Voltar
        </button>

        {/* PERFIL */}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#151015] shadow-2xl">
          <div className="relative h-44 overflow-hidden bg-[#241924] sm:h-60">
            {user.cover_url ? (
              <img
                src={
                  user.cover_url
                }
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.06),transparent_35%)]" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#151015] via-transparent to-black/10" />
          </div>

          <div className="relative px-5 pb-7 sm:px-8">
            <div className="-mt-14 flex items-end justify-between gap-4">
              <div>
                {user.avatar_url ? (
                  <img
                    src={
                      user.avatar_url
                    }
                    alt={getDisplayName(
                      user
                    )}
                    className="h-28 w-28 rounded-full border-4 border-[#151015] bg-[#211a21] object-cover shadow-xl sm:h-32 sm:w-32"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-[#151015] bg-[#211a21] text-4xl font-black text-white/40 shadow-xl sm:h-32 sm:w-32">
                    {getDisplayName(
                      user
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
              </div>

              {!isSelf && (
                <button
                  type="button"
                  onClick={
                    handleFollow
                  }
                  disabled={
                    followLoading
                  }
                  className={`mb-2 rounded-2xl px-5 py-2.5 text-sm font-black transition disabled:opacity-50 ${
                    isFollowing
                      ? 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                      : 'bg-[#ff78b9] text-[#190d16] hover:brightness-110'
                  }`}
                >
                  {followLoading
                    ? '...'
                    : isFollowing
                      ? 'Seguindo'
                      : 'Seguir'}
                </button>
              )}

              {isSelf && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      '/perfil'
                    )
                  }
                  className="mb-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Editar perfil
                </button>
              )}
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {getDisplayName(
                    user
                  )}
                </h1>

                {user.is_official ? (
                  <OfficialBadge />
                ) : user.verified ? (
                  <VerifiedBadge />
                ) : null}
              </div>

              <p className="mt-1 text-sm font-semibold text-white/40">
                @{user.username}
              </p>
              {user.staff_badges?.map((badge, index) => (
                <p key={`${badge.title}-${index}`} className="mt-1 text-xs font-medium text-[#ff9aca]">
                  <span className="font-bold">{badge.title}</span>
                  <span className="text-white/45"> · {badge.description}</span>
                </p>
              ))}
              {!isSelf && <ReportProfileButton profileId={user.id} />}

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <span className="text-lg font-black text-white">
                    {followersCount}
                  </span>

                  <span className="ml-2 text-xs font-semibold text-white/40">
                    seguidores
                  </span>
                </div>

                <div>
                  <span className="text-lg font-black text-white">
                    {followingCount}
                  </span>

                  <span className="ml-2 text-xs font-semibold text-white/40">
                    seguindo
                  </span>
                </div>
              </div>

              {user.bio ? (
                <p className="mt-5 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-white/70">
                  {user.bio}
                </p>
              ) : (
                <p className="mt-5 text-sm italic text-white/30">
                  Este usuário ainda não adicionou uma bio.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ABAS */}

        <div className="mt-5 rounded-2xl border border-white/10 bg-[#151015] p-1.5">
          <div className="grid grid-cols-4 gap-1">
            {TAB_ORDER.map(
              (tab) => {
                const labels: Record<
                  Tab,
                  string
                > = {
                  stories:
                    'Histórias',
                  nook: 'Mural',
                  lists:
                    'Listas',
                  clubs:
                    'Clubes',
                };

                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() =>
                      setActiveTab(
                        tab
                      )
                    }
                    className={`rounded-xl px-2 py-3 text-[10px] font-black uppercase tracking-wide transition sm:px-4 sm:text-xs ${
                      activeTab ===
                      tab
                        ? 'bg-white text-black'
                        : 'text-white/45 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {labels[tab]}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* CONTEÚDO COM SWIPE */}

        <div
          className="mt-5 overflow-hidden"
          onTouchStart={
            handleTouchStart
          }
          onTouchEnd={
            handleTouchEnd
          }
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{
              width: '400%',
              transform: `translateX(-${
                activeIndex *
                25
              }%)`,
            }}
          >

            {/* HISTÓRIAS */}

            <section className="w-1/4 shrink-0 px-0.5">
              {stories.length ===
              0 ? (
                <EmptyState
                  icon="📚"
                  title="Nenhuma história ainda"
                  description={`${getDisplayName(user)} ainda não publicou nenhuma história.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-4">
                  {stories.map(
                    (story) => (
                      <StoryCard
                        key={
                          story.id
                        }
                        story={
                          story
                        }
                        onOpen={() =>
                          router.push(
                            `/historia/${story.id}`
                          )
                        }
                      />
                    )
                  )}
                </div>
              )}
            </section>

            {/* MURAL */}

            <section className="w-1/4 shrink-0 px-0.5">
              {posts.length ===
              0 ? (
                <EmptyState
                  icon="📝"
                  title="Nenhuma publicação ainda"
                  description={`${getDisplayName(user)} ainda não publicou nada no Mural.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-4">
                  {posts.map(
                    (post) => (
                      <article
                        key={
                          post.id
                        }
                        className="overflow-hidden rounded-3xl border border-white/10 bg-[#151015]"
                      >
                        <div className="p-5 sm:p-6">
                          <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                              <img
                                src={
                                  user.avatar_url
                                }
                                alt=""
                                className="h-11 w-11 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#241c24] font-black text-white/40">
                                {getDisplayName(
                                  user
                                )
                                  .charAt(
                                    0
                                  )
                                  .toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-white">
                                {getDisplayName(
                                  user
                                )}
                              </p>

                              <p className="text-xs text-white/35">
                                @
                                {
                                  user.username
                                }
                                {' · '}
                                {formatDate(
                                  post.created_at
                                )}
                              </p>
                            </div>

                            {post.pinned && (
                              <span
                                title="Publicação fixada"
                                className="text-sm"
                              >
                                📌
                              </span>
                            )}
                          </div>

                          {post.body && (
                            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/75">
                              {
                                post.body
                              }
                            </p>
                          )}

                          {post.image_url && (
                            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                              <img
                                src={
                                  post.image_url
                                }
                                alt=""
                                className="max-h-[600px] w-full object-cover"
                              />
                            </div>
                          )}

                          {post.media &&
                            post.media.length >
                              0 && (
                              <div
                                className={`mt-5 grid gap-2 ${
                                  post.media
                                    .length ===
                                  1
                                    ? 'grid-cols-1'
                                    : 'grid-cols-2'
                                }`}
                              >
                                {post.media
                                  .slice(
                                    0,
                                    4
                                  )
                                  .map(
                                    (
                                      media
                                    ) => (
                                      <div
                                        key={
                                          media.id
                                        }
                                        className="overflow-hidden rounded-2xl border border-white/10 bg-black"
                                      >
                                        <img
                                          src={
                                            media.media_url
                                          }
                                          alt=""
                                          className="max-h-[500px] min-h-[180px] w-full object-cover"
                                        />
                                      </div>
                                    )
                                  )}
                              </div>
                            )}
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>

            {/* LISTAS */}

            <section className="w-1/4 shrink-0 px-0.5">
              {readingLists.length ===
              0 ? (
                <EmptyState
                  icon="🔖"
                  title="Nenhuma lista pública"
                  description={`${getDisplayName(user)} ainda não deixou nenhuma lista de leitura pública.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-5">
                  {readingLists.map(
                    (list) => (
                      <article
                        key={
                          list.id
                        }
                        className="overflow-hidden rounded-3xl border border-white/10 bg-[#151015]"
                      >
                        <div className="border-b border-white/10 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h2 className="text-lg font-black">
                                {
                                  list.name
                                }
                              </h2>

                              {list.description && (
                                <p className="mt-2 text-sm leading-6 text-white/45">
                                  {
                                    list.description
                                  }
                                </p>
                              )}
                            </div>

                            <span className="shrink-0 rounded-full bg-[#ff78b9]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#ff9aca]">
                              Pública
                            </span>
                          </div>
                        </div>

                        <div className="divide-y divide-white/[0.06]">
                          {list.items.length ===
                          0 ? (
                            <p className="p-5 text-sm text-white/30">
                              Esta lista ainda está vazia.
                            </p>
                          ) : (
                            list.items.map(
                              (
                                item
                              ) => {
                                const story =
                                  item.story;

                                if (
                                  !story
                                ) {
                                  return null;
                                }

                                return (
                                  <button
                                    type="button"
                                    key={
                                      item.id
                                    }
                                    onClick={() =>
                                      router.push(
                                        `/historia/${story.id}`
                                      )
                                    }
                                    className="flex w-full gap-4 p-4 text-left transition hover:bg-white/[0.03]"
                                  >
                                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-[#211a21]">
                                      {story.cover_url ? (
                                        <img
                                          src={
                                            story.cover_url
                                          }
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-xl text-white/20">
                                          Livro
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <h3 className="truncate text-sm font-black text-white">
                                        {
                                          story.title
                                        }
                                      </h3>

                                      {story.description && (
                                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/40">
                                          {
                                            story.description
                                          }
                                        </p>
                                      )}

                                      <p className="mt-2 text-[10px] text-white/25">
                                        {formatDate(
                                          item.added_at
                                        )}
                                      </p>
                                    </div>
                                  </button>
                                );
                              }
                            )
                          )}
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>

            {/* CLUBES */}

            <section className="w-1/4 shrink-0 px-0.5">
              {ficClubs.length ===
              0 ? (
                <EmptyState
                  icon="💬"
                  title="Nenhum clube ainda"
                  description={`${getDisplayName(user)} ainda não participa de nenhum Clube de FIC.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-4">
                  {ficClubs.map(
                    (club) => (
                      <article
                        key={
                          club.id
                        }
                        className="overflow-hidden rounded-3xl border border-white/10 bg-[#151015]"
                      >
                        <div className="p-5 sm:p-6">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff78b9]/20 to-[#b77cff]/20 text-xl">
                              💬
                            </div>

                            <div className="min-w-0 flex-1">
                              <h2 className="text-lg font-black">
                                {
                                  club.name
                                }
                              </h2>

                              <p className="mt-1 text-xs text-[#ff78b9]/70">
                                Clube de FIC
                              </p>
                            </div>

                            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black text-white/45">
                              {
                                club.member_count
                              }{' '}
                              {club.member_count ===
                              1
                                ? 'membro'
                                : 'membros'}
                            </span>
                          </div>

                          {club.description && (
                            <p className="mt-5 text-sm leading-6 text-white/50">
                              {
                                club.description
                              }
                            </p>
                          )}

                          {club.story && (
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/historia/${club.story!.id}`
                                )
                              }
                              className="mt-5 flex w-full gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-[#ff78b9]/25 hover:bg-[#ff78b9]/[0.04]"
                            >
                              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-xl bg-[#211a21]">
                                {club.story
                                  .cover_url ? (
                                  <img
                                    src={
                                      club
                                        .story
                                        .cover_url
                                    }
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-lg text-white/20">
                                    Livro
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#ff78b9]/70">
                                  Conversando sobre
                                </p>

                                <p className="mt-1 truncate text-sm font-black text-white">
                                  {
                                    club
                                      .story
                                      .title
                                  }
                                </p>

                                {club.story
                                  .description && (
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/35">
                                    {
                                      club
                                        .story
                                        .description
                                    }
                                  </p>
                                )}
                              </div>
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
