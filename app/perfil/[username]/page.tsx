'use client';
import ReadingListImage from '@/components/ReadingListImage';
import { SpotifyCard } from '@/components/SpotifyLink';
import type { SpotifyLink } from '@/lib/spotify/link';
import { PostMentions } from '@/components/PostMention';
import FeedVideo from '@/components/FeedVideo';
import AccountBadge from '@/components/AccountBadge';
import ProfileStats from '@/components/ProfileStats';
import AnimatedProfileImage from '@/components/AnimatedProfileImage';
import type { ProfileAnimation } from '@/lib/profile/animation';
import ProfileBanner from '@/components/ProfileBanner';
import NookPostComposer from '@/components/NookPostComposer';
import Link from 'next/link';
import { useCoverPalette } from '@/lib/profile/use-cover-palette';
import { parseProfileTheme, profileThemeVariables, type ProfileTheme } from '@/lib/profile/themes';
import type { ProfileAvatarPosition, ProfileHeaderLayout } from '@/lib/profile/appearance';
import Republicados from '@/components/Republicados';
import {contentMediaUrl} from '@/lib/security/content-media';
import MuralActions from '@/components/MuralActions';
import {Pin,BookOpen,MessageCircle,Image as ImageIcon,Layers,Info,FileText} from 'lucide-react';
import MessageProfileButton from '@/components/MessageProfileButton';
import LinkedNewsCard from '@/components/LinkedNewsCard';
import LinkedStoryCard from '@/components/LinkedStoryCard';


import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useParams,
  useRouter,
} from 'next/navigation';
import OfficialBadge from '../../components/OfficialBadge';
import ProfileActions from '@/components/ProfileActions';
import AuthorInviteLink from '@/components/AuthorInviteLink';

type User = {
  spotify_link?: SpotifyLink | null;
  pinned_story_id?: string | null;
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  avatar_animation?: ProfileAnimation | null;
  cover_animation?: ProfileAnimation | null;
  header_layout?: ProfileHeaderLayout;
  avatar_position?: ProfileAvatarPosition;
  verified?: boolean;
  is_official?: boolean;
  staff_badges?: { title: string; description: string }[];
};

type Story = {
  story_kind?: 'original' | 'fanfic' | '';
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
  media_type: 'image' | 'gif' | 'video';
  created_at?: string;
};

type NookPost = {
  id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  story_id: string | null;
  news_slug?: string | null;
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
  image_url: string | null;
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
 restricted?:boolean;
 is_self?: boolean;
  user?: User;
  theme?: ProfileTheme | null;
  stories?: Story[];
  posts?: NookPost[];
  reading_lists?: ReadingList[];
  fic_clubs?: FicClub[];
  error?: string;
};

type FollowResponse = {
 requested?:boolean;
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
  | 'about';

const TAB_ORDER: Tab[] = ['stories', 'nook', 'lists', 'about'];

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
    normalized.includ…5336 tokens truncated…   const labels: Record<
                  Tab,
                  string
                > = {
                  stories:
                    'Obras',
                  nook: 'Mural',
                  lists:
                    'Listas',
                  about: 'Sobre',
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
                    aria-pressed={activeTab === tab}
                    className={`rounded-xl px-2 py-3 text-[10px] font-black uppercase tracking-wide transition sm:px-4 sm:text-xs ${
                      activeTab ===
                      tab
                        ? 'profile-themed-action bg-white text-black'
                        : 'profile-themed-text text-white/45 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {tab === 'nook' ? <FileText size={21}/> : tab === 'stories' ? <BookOpen size={21}/> : tab === 'lists' ? <Layers size={21}/> : <Info size={21}/>}
                    <span>{labels[tab]}</span>
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
              width: '100%',
              transform: 'none',
            }}
          >

            {/* HISTÓRIAS */}

            {activeTab === 'stories' && (<section className="profile-tab-panel w-full shrink-0 px-0.5">
              <div className="mx-auto mb-5 flex w-full max-w-2xl flex-wrap gap-2" role="group" aria-label="Filtrar obras no perfil">
                {([['', 'Todas'], ['original', 'Originais'], ['fanfic', 'Fanfics']] as const).map(([kind, label]) => (
                  <button type="button" key={kind} aria-pressed={storyFilter === kind} onClick={() => setStoryFilter(kind)} className="min-h-11 rounded-full border border-pink-300/20 px-4 text-sm font-semibold text-pink-100 aria-pressed:bg-pink-300 aria-pressed:text-[#200f1b]">{label}</button>
                ))}
              </div>
              {pinError && <p role="alert" className="mx-auto mb-4 max-w-2xl text-sm text-rose-200">{pinError}</p>}
              {!stories.some(story => !storyFilter || story.story_kind === storyFilter) ? (
                <EmptyState
                  icon={<BookOpen size={28}/>}
                  title="Nenhuma história ainda"
                  description={storyFilter ? "Nenhuma obra desse tipo foi encontrada neste perfil." : `${getDisplayName(user)} ainda não publicou nenhuma história.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-4">
                  {stories.filter(story => !storyFilter || story.story_kind === storyFilter).sort(
                    (a, b) => Number(b.id === user.pinned_story_id) - Number(a.id === user.pinned_story_id)
                  ).map(story => (
                    <div key={story.id}>
                      {story.id === user.pinned_story_id && <p className="mb-2 text-sm font-semibold text-pink-200">Obra em destaque</p>}
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
                      {isSelf && <button type="button" disabled={pinBusy} className="mt-2 min-h-11 rounded-full border border-pink-300/25 px-4 text-sm font-semibold text-pink-200 disabled:opacity-50" onClick={() => void pinStory(story.id === user.pinned_story_id ? null : story.id)}>{story.id === user.pinned_story_id ? 'Remover destaque' : 'Destacar no perfil'}</button>}
                    </div>
                  ))}
                </div>
              )}
            </section>)}

            {/* MURAL */}

            <section hidden={activeTab !== 'nook'} className="profile-wall profile-tab-panel w-full shrink-0 px-0.5" aria-label="Mural">
              {isSelf && (
                <button type="button" className="profile-wall-compose" onClick={() => setComposerOpen(true)}>
                  <span className="profile-wall-compose-avatar" aria-hidden="true">
                    {user.avatar_url
                      ? <img src={contentMediaUrl(user.avatar_url)} alt="" />
                      : getDisplayName(user).charAt(0).toUpperCase()}
                  </span>
                  <span>Publique alguma coisa no seu mural…</span>
                </button>
              )}
              {posts.length ===
              0 ? (
                <EmptyState
                  icon={<BookOpen size={28}/>}
                  title="Nenhuma publicação ainda"
                  description={`${getDisplayName(user)} ainda não publicou nada no Mural.`}
                />
              ) : (
                <div className="mx-auto w-full max-w-2xl space-y-4">
                  {posts.slice(0, visiblePostCount).map(
                    (post) => (
                      <article
                        key={
                          post.id
                        }
                        className="profile-themed-surface overflow-hidden rounded-3xl border border-white/10 bg-[#151015]"
                      >
                        <div className="p-5 sm:p-6">
                          <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                              <img
                                src={
                                  contentMediaUrl(user.avatar_url)
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
                              <p className="profile-themed-text truncate text-sm font-black text-white">
                                {getDisplayName(
                                  user
                                )}<AccountBadge account={user} />
                              </p>

                              <p className="profile-themed-text text-xs text-white/35">
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
                                <Pin size={15}/>
                              </span>
                            )}
                          </div>

                          {post.story_id && <LinkedStoryCard storyId={post.story_id}/>}<LinkedNewsCard slug={post.news_slug}/>{post.body && (
                            <p className="profile-themed-text mt-5 whitespace-pre-wrap text-sm leading-7 text-white/75">
                              <PostMentions text={post.body} />
                            </p>
                          )}

                          {post.image_url && (
                            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                              <img
                                src={
                                  contentMediaUrl(post.image_url)
                                }
                                alt=""
                                className="nook-post-image"
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
                                    ) => media.media_type === 'video' ? <FeedVideo key={media.id} id={media.id} /> : (
                                      <div
                                        key={
                                          media.id
                                        }
                                        className="min-w-0"
                                      >
                                        <img
                                          src={
                                            contentMediaUrl(media.media_url)
                                          }
                                          alt=""
                                          className="max-h-[340px] w-full object-contain"
                                        />
                                      </div>
                                    )
                                  )}
                              </div>
                            )}
                          <MuralActions postId={post.id}/>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
              {posts.length > visiblePostCount && (
                <button type="button" className="library-filter mx-auto mt-4 block" onClick={() => setVisiblePostCount(count => count + 12)}>
                  Mostrar mais publicações
                </button>
              )}
            </section>

            {/* LISTAS */}

            {activeTab === 'lists' && (<section className="profile-tab-panel w-full shrink-0 px-0.5">
              {isSelf && <Link href="/listas-de-leitura" className="mb-4 inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-pink-200">Organizar minhas listas</Link>}
              {readingLists.length ===
              0 ? (
                <EmptyState
                  icon={<BookOpen size={28}/>}
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
                        className="profile-themed-surface overflow-hidden rounded-lg border border-white/10 bg-[#151015]"
                      >
                        <div className="border-b border-white/10 p-5">
                          <div className="flex items-start gap-4">
                            <ReadingListImage src={list.image_url} className="w-24 sm:w-28" />
                            <div className="min-w-0 flex-1">
                              <h2 className="break-words text-lg font-black">
                                {
                                  list.name
                                }
                              </h2>

                              {list.description && (
                                <p className="profile-themed-text mt-2 text-sm leading-6 text-white/45">
                                  {
                                    list.description
                                  }
                                </p>
                              )}
                            </div>

                            {isSelf && <Link href={'/listas-de-leitura/' + list.id}
                              className="shrink-0 py-2 text-xs font-semibold text-pink-200">Editar</Link>}
                          </div>
                        </div>

                        <div className="divide-y divide-white/[0.06]">
                          {list.items.length ===
                          0 ? (
                            <p className="profile-themed-text p-5 text-sm text-white/30">
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
                                            contentMediaUrl(story.cover_url)
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
                                      <h3 className="profile-themed-text truncate text-sm font-black text-white">
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
            </section>)}

            <section hidden={activeTab !== 'about'} className="profile-tab-panel w-full shrink-0 px-0.5"><div className="profile-about profile-themed-surface"><h2>Sobre {getDisplayName(user)}</h2><p>{user.bio || 'Este usuário ainda não adicionou uma bio.'}</p>{user.staff_badges?.map((badge, index) => <p key={index}><strong>{badge.title}</strong> · {badge.description}</p>)}</div><details className="profile-secondary-section" onToggle={event => setRepostsOpen(event.currentTarget.open)}><summary>Republicados</summary>{repostsOpen && <Republicados profileId={user.id} own={isSelf} active={activeTab === 'about'}/>}</details></section>
          </div>
        </div>
        </>}
      </div>
      <NookPostComposer origin="mural" author={user} open={composerOpen} onClose={() => setComposerOpen(false)} onPublished={() => {
        void fetch('/api/public-profile/' + encodeURIComponent(user.username), { cache: 'no-store' }).then(async response => { if (response.ok) { const data = await response.json(); setPosts(data.posts || []); } }).catch(() => {});
      }}/>
    </main>
  );
}
