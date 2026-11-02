'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import NookPostComposer from '@/components/NookPostComposer';
import StoryComposer from '@/components/StoryComposer';

/* =========================================================
   TIPOS
========================================================= */

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
};

type CurrentUser = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
  verified?: boolean;
};

type FeedSearchUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
};

type Media = {
  id: string;
  post_id: string;
  media_url: string;
  media_type: 'image' | 'gif';
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  author: Profile | null;
};

type Post = {
  id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  story_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author: Profile | null;
  media: Media[];
  reaction_counts: Record<string, number>;
  user_reactions: string[];
  comments_count: number;
  saved: boolean;
};

/* =========================================================
   STORIES
========================================================= */

type StoryUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type UserStory = {
  id: string;
  user_id: string;
  media_url: string;
  media_type?: 'image' | 'gif' | 'video';
  thought?: string | null;
  created_at: string;
  expires_at?: string;
  user: StoryUser;
};

const LIKE_REACTION = '❤️';

const SPOTIFY_URL_REGEX =
  /https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+(?:\?[^\s]+)?/g;

/* =========================================================
   ÍCONES
========================================================= */

function CloudIcon({
  className = 'h-5 w-5',
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 19h9a4.5 4.5 0 0 0 .8-8.93A6 6 0 0 0 5.6 8.5 4.25 4.25 0 0 0 7.5 19Z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path
        strokeLinecap="round"
        d="m16 16 4.5 4.5"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.2-.6L4 20l1.5-4A7.5 7.5 0 1 1 20 11.5Z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0 4 4m-4-4L8 8M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
      />
    </svg>
  );
}

function BookmarkIcon({
  filled = false,
}: {
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75Z"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 3 10 14"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 11a8 8 0 0 0-14.7-4.3L4 9"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 13a8 8 0 0 0 14.7 4.3L20 15"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 20v-5h-5"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15 18-6-6 6-6"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 18 6-6-6-6"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        d="M4 7h16M4 12h16M4 17h16"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        d="m6 6 12 12M18 6 6 18"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 21v-6h6v6"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path
        strokeLinecap="round"
        d="M4 21a8 8 0 0 1 16 0"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"
      />
      <path
        strokeLinecap="round"
        d="M5 19h14"
      />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14.5A1.5 1.5 0 0 1 18.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
      />
      <path
        strokeLinecap="round"
        d="M8 4v16M12 8h5M12 12h5M12 16h3"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
      />
      <path
        strokeLinecap="round"
        d="M7 3v4M17 3v4M3 10h18"
      />
    </svg>
  );
}

function BookmarkMenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75Z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 1.8-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V22h-2.55v-.1A1.7 1.7 0 0 0 11.45 20a1.7 1.7 0 0 0-1.88.34l-.06.06-1.8-1.8.06-.06A1.7 1.7 0 0 0 8.1 16.7 1.7 1.7 0 0 0 6.55 15H6.4v-2.55h.15A1.7 1.7 0 0 0 8.1 11.4a1.7 1.7 0 0 0-.34-1.88L7.7 9.46l1.8-1.8.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 12.47 6.5V6h2.55v.5a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.8 1.8-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.05h.06V15h-.06A1.7 1.7 0 0 0 19.4 15Z"
      />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.5A2.5 2.5 0 0 1 4 13.5v-8Z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <path
        strokeLinecap="round"
        d="M3 20a6 6 0 0 1 12 0"
      />
      <path
        strokeLinecap="round"
        d="M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 8l4 4-4 4M18 12H9"
      />
    </svg>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatPostDateTime(date: string) {
  const value = new Date(date);

  return `${value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} • ${value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
}

function getInitial(
  profile: Profile | CurrentUser | StoryUser | FeedSearchUser | null
) {
  if (!profile) {
    return '?';
  }

  return (
    profile.display_name ||
    profile.username ||
    '?'
  )
    .charAt(0)
    .toUpperCase();
}

function getPostMedia(post: Post): Media[] {
  if (post.media?.length) {
    return post.media;
  }

  if (post.image_url) {
    return [
      {
        id: 'legacy',
        post_id: post.id,
        media_url: post.image_url,
        media_type: 'image',
        created_at: post.created_at,
      },
    ];
  }

  return [];
}

/* =========================================================
   AVATAR
========================================================= */

function Avatar({
  profile,
  size = 'normal',
}: {
  profile:
    | Profile
    | CurrentUser
    | StoryUser
    | FeedSearchUser
    | null;
  size?: 'small' | 'normal' | 'large';
}) {
  const sizeClass =
    size === 'small'
      ? 'h-9 w-9'
      : size === 'large'
        ? 'h-16 w-16'
        : 'h-11 w-11';

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ff78b9] font-black text-[#190d16]`}
    >
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        getInitial(profile)
      )}
    </div>
  );
}

/* =========================================================
   SELO DE VERIFICADO
========================================================= */

function VerifiedBadge() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#ff78b9] text-[10px] font-black text-[#190d16]"
      title="Perfil verificado"
      aria-label="Perfil verificado"
    >
      ✓
    </span>
  );
}

/* =========================================================
   STORIES ROW
========================================================= */

function StoriesRow({
  stories,
  onOpen,
  onCreateStory,
}: {
  stories: UserStory[];
  onOpen: (story: UserStory) => void;
  onCreateStory: () => void;
}) {
  const groupedStories = useMemo(() => {
    const map = new Map<string, UserStory>();

    for (const story of stories) {
      if (!map.has(story.user_id)) {
        map.set(story.user_id, story);
      }
    }

    return Array.from(map.values());
  }, [stories]);

  return (
    <section className="mb-7 overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#100c11]/85 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">
            Stories
          </p>

          <h2 className="mt-1 text-sm font-bold text-white">
            O que estão fazendo por aqui
          </h2>
        </div>

        <Link
          href="/stories"
          className="text-[10px] font-bold text-white/30 transition hover:text-[#ff78b9]"
        >
          Ver todos
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={onCreateStory}
          className="group flex w-[72px] shrink-0 flex-col items-center"
        >
          <div className="rounded-full border-2 border-dashed border-[#ff78b9]/35 p-[3px] transition group-hover:border-[#ff78b9]/70">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#ff78b9]/[0.07] transition group-hover:bg-[#ff78b9]/[0.12]">
              <span className="text-3xl font-light leading-none text-[#ff78b9]">
                +
              </span>
            </div>
          </div>

          <p className="mt-2 w-full truncate text-center text-[10px] font-bold text-white/45 transition group-hover:text-[#ff78b9]">
            Seu Story
          </p>
        </button>

        {groupedStories.map((story) => (
          <button
            key={story.user_id}
            type="button"
            onClick={() => onOpen(story)}
            className="group flex w-[72px] shrink-0 flex-col items-center"
          >
            <div className="rounded-full bg-gradient-to-br from-[#ff4d9d] via-[#ff78b9] to-[#c63dff] p-[2px] shadow-[0_0_18px_rgba(255,120,185,0.18)]">
              <div className="rounded-full bg-[#100c11] p-[2px]">
                <Avatar
                  profile={story.user}
                  size="large"
                />
              </div>
            </div>

            <p className="mt-2 w-full truncate text-center text-[10px] font-semibold text-white/55 transition group-hover:text-white">
              @{story.user.username}
            </p>
          </button>
        ))}

        {groupedStories.length === 0 && (
          <div className="flex min-h-[92px] items-center px-2 text-xs text-white/30">
            Seja a primeira pessoa a publicar um Story.
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   STORY VIEWER
========================================================= */

function StoryViewer({
  story,
  stories,
  onSelect,
  onClose,
}: {
  story: UserStory | null;
  stories: UserStory[];
  onSelect: (story: UserStory) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!story) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [story, onClose]);

  if (!story) {
    return null;
  }

  const userStories = stories
    .filter(
      (item) =>
        item.user_id === story.user_id
    )
    .sort(
      (a, b) =>
        new Date(
          a.created_at
        ).getTime() -
        new Date(
          b.created_at
        ).getTime()
    );

  const currentIndex = Math.max(
    0,
    userStories.findIndex(
      (item) =>
        item.id === story.id
    )
  );

  const currentStory =
    userStories[currentIndex] ?? story;

  const goPrevious = () => {
    if (currentIndex > 0) {
      onSelect(
        userStories[
          currentIndex - 1
        ]
      );
    }
  };

  const goNext = () => {
    if (
      currentIndex <
      userStories.length - 1
    ) {
      onSelect(
        userStories[
          currentIndex + 1
        ]
      );
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-[110] flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
        aria-label="Fechar story"
      >
        <CloseIcon />
      </button>

      <div className="relative flex h-[min(820px,92vh)] w-full max-w-[430px] overflow-hidden rounded-[30px] border border-white/10 bg-[#100c11] shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="absolute left-4 right-4 top-4 z-20 flex gap-1.5">
          {userStories.map(
            (item, index) => (
              <div
                key={item.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
              >
                <div
                  className={`h-full rounded-full ${
                    index <= currentIndex
                      ? 'w-full bg-[#ff78b9]'
                      : 'w-0'
                  }`}
                />
              </div>
            )
          )}
        </div>

        <div className="absolute left-4 right-14 top-8 z-20 flex items-center gap-3">
          <Avatar
            profile={
              currentStory.user
            }
            size="small"
          />

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              @
              {
                currentStory.user
                  .username
              }
            </p>

            <p className="text-[10px] text-white/45">
              {new Date(
                currentStory.created_at
              ).toLocaleTimeString(
                'pt-BR',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                }
              )}
            </p>
          </div>
        </div>

        <div className="relative flex h-full w-full items-center justify-center">
          {currentStory.media_type ===
          'video' ? (
            <video
              key={currentStory.id}
              src={
                currentStory.media_url
              }
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <img
              key={currentStory.id}
              src={
                currentStory.media_url
              }
              alt=""
              className="h-full w-full object-contain"
            />
          )}

          <button
            type="button"
            onClick={goPrevious}
            className="absolute inset-y-0 left-0 z-10 w-1/3"
            aria-label="Story anterior"
          />

          <button
            type="button"
            onClick={goNext}
            className="absolute inset-y-0 right-0 z-10 w-1/3"
            aria-label="Próximo story"
          />

          {currentIndex > 0 && (
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-2xl text-white backdrop-blur-sm transition hover:bg-black/50"
              aria-label="Story anterior"
            >
              ‹
            </button>
          )}

          {currentIndex <
            userStories.length -
              1 && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-2xl text-white backdrop-blur-sm transition hover:bg-black/50"
              aria-label="Próximo story"
            >
              ›
            </button>
          )}
        </div>

        {currentStory.thought && (
          <div className="absolute bottom-6 left-5 right-5 z-30">
            <div className="rounded-2xl bg-black/55 px-4 py-3 text-center text-sm text-white backdrop-blur-md">
              {
                currentStory.thought
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PRÓXIMAS ATUALIZAÇÕES
========================================================= */

type ApiUpcomingUpdate = {
  id: string;
  chapter_id: string;
  story_id: string;
  chapter_number: number;
  chapter_title: string;
  story_title: string;
  story_cover_url: string | null;
  scheduled_for: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
};

type UpcomingUpdate = ApiUpcomingUpdate & {
  color: string;
};

const UPDATE_COLORS = [
  '#ff78b9',
  '#b88cff',
  '#7ddcff',
  '#ffd36e',
  '#8ee39a',
  '#ff9c7d',
  '#c7a6ff',
  '#72e0c1',
];

function getAuthorColor(
  authorId: string,
  authorIds: string[]
) {
  const index =
    authorIds.indexOf(authorId);

  if (index === -1) {
    return UPDATE_COLORS[0];
  }

  return UPDATE_COLORS[
    index % UPDATE_COLORS.length
  ];
}

function getCalendarDays(
  year: number,
  month: number
) {
  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const days: (number | null)[] =
    [];

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    days.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    days.push(day);
  }

  return days;
}

function formatScheduledTime(
  date: string
) {
  return new Date(
    date
  ).toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

function UpcomingUpdatesContent({
  updates,
  onClose,
  mobile = false,
}: {
  updates: UpcomingUpdate[];
  onClose?: () => void;
  mobile?: boolean;
}) {
  const now = new Date();

  const [
    calendarDate,
    setCalendarDate,
  ] = useState(
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )
  );

  const year =
    calendarDate.getFullYear();

  const month =
    calendarDate.getMonth();

  const monthName =
    calendarDate.toLocaleDateString(
      'pt-BR',
      {
        month: 'long',
      }
    );

  const calendarDays = useMemo(
    () =>
      getCalendarDays(
        year,
        month
      ),
    [year, month]
  );

  const updatesForMonth =
    useMemo(() => {
      return updates
        .filter((update) => {
          const date = new Date(
            update.scheduled_for
          );

          return (
            date.getFullYear() ===
              year &&
            date.getMonth() === month
          );
        })
        .sort(
          (a, b) =>
            new Date(
              a.scheduled_for
            ).getTime() -
            new Date(
              b.scheduled_for
            ).getTime()
        );
    }, [
      updates,
      year,
      month,
    ]);

  function getUpdatesForDay(
    day: number
  ) {
    return updatesForMonth.filter(
      (update) =>
        new Date(
          update.scheduled_for
        ).getDate() === day
    );
  }

  return (
    <div
      className={
        mobile
          ? 'flex h-full min-h-0 flex-col'
          : ''
      }
    >
      <div className="border-b border-white/[0.06] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CloudIcon className="h-5 w-5 text-[#ff78b9]" />

              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-white">
                Próximas ATTs
              </h2>
            </div>

            <p className="mt-1.5 text-[11px] leading-4 text-white/35">
              Acompanhe as próximas atualizações.
            </p>
          </div>

          {mobile &&
            onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Fechar calendário"
              >
                <CloseIcon />
              </button>
            )}
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setCalendarDate(
                new Date(
                  year,
                  month - 1,
                  1
                )
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.05] hover:text-[#ff78b9]"
          >
            <ChevronLeftIcon />
          </button>

          <p className="text-xs font-black capitalize text-white">
            {monthName}{' '}
            <span className="text-white/35">
              {year}
            </span>
          </p>

          <button
            type="button"
            onClick={() =>
              setCalendarDate(
                new Date(
                  year,
                  month + 1,
                  1
                )
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.05] hover:text-[#ff78b9]"
          >
            <ChevronRightIcon />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {[
            'D',
            'S',
            'T',
            'Q',
            'Q',
            'S',
            'S',
          ].map(
            (
              day,
              index
            ) => (
              <div
                key={`${day}-${index}`}
                className="flex h-7 items-center justify-center text-[9px] font-bold text-white/20"
              >
                {day}
              </div>
            )
          )}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(
            (
              day,
              index
            ) => {
              if (
                day === null
              ) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="h-10"
                  />
                );
              }

              const dayUpdates =
                getUpdatesForDay(
                  day
                );

              const today =
                new Date();

              const isToday =
                today.getFullYear() ===
                  year &&
                today.getMonth() ===
                  month &&
                today.getDate() ===
                  day;

              return (
                <div
                  key={`${year}-${month}-${day}`}
                  className={`relative flex h-10 items-center justify-center rounded-xl text-[10px] ${
                    isToday
                      ? 'bg-[#ff78b9]/[0.09] font-black text-[#ff78b9]'
                      : 'text-white/45'
                  }`}
                >
                  {day}

                  {dayUpdates.length >
                    0 && (
                    <div className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-[2px]">
                      {dayUpdates
                        .slice(
                          0,
                          3
                        )
                        .map(
                          (update) => (
                            <span
                              key={
                                update.id
                              }
                              style={{
                                color:
                                  update.color,
                              }}
                            >
                              <CloudIcon className="h-[7px] w-[9px]" />
                            </span>
                          )
                        )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      <div
        className={`border-t border-white/[0.06] px-4 py-4 ${
          mobile
            ? 'min-h-0 flex-1 overflow-y-auto'
            : ''
        }`}
      >
        <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/20">
          Próximas atualizações
        </p>

        <div className="space-y-3">
          {updatesForMonth.length >
          0 ? (
            updatesForMonth
              .slice(0, 8)
              .map((update) => {
                const date =
                  new Date(
                    update.scheduled_for
                  );

                return (
                  <Link
                    key={update.id}
                    href={`/historia/${update.story_id}`}
                    onClick={onClose}
                    className="group flex items-start gap-2.5 rounded-xl p-1.5 transition hover:bg-white/[0.035]"
                  >
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.035]"
                      style={{
                        color:
                          update.color,
                      }}
                    >
                      <CloudIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[11px] font-bold text-white group-hover:text-[#ff78b9]">
                          @{update.author.username}
                        </p>

                        <span
                          className="shrink-0 text-[9px] font-bold"
                          style={{
                            color:
                              update.color,
                          }}
                        >
                          {date.getDate()}{' '}
                          {date.toLocaleDateString(
                            'pt-BR',
                            {
                              month:
                                'short',
                            }
                          )}
                        </span>
                      </div>

                      <p className="mt-0.5 truncate text-[10px] text-white/45">
                        {update.story_title}
                        {' · '}
                        Cap.{' '}
                        {
                          update.chapter_number
                        }
                      </p>

                      <p className="mt-0.5 text-[9px] text-white/25">
                        {
                          update.chapter_title
                        }{' '}
                        ·{' '}
                        {formatScheduledTime(
                          update.scheduled_for
                        )}
                      </p>
                    </div>
                  </Link>
                );
              })
          ) : (
            <div className="py-5 text-center">
              <CloudIcon className="mx-auto h-9 w-9 text-white/15" />

              <p className="mt-3 text-[10px] text-white/25">
                Nenhuma atualização programada para este mês.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UpcomingUpdatesCard({
  updates,
}: {
  updates: UpcomingUpdate[];
}) {
  return (
    <aside className="hidden w-[270px] shrink-0 xl:block">
      <div className="sticky top-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#100c11]/90 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <UpcomingUpdatesContent
          updates={updates}
        />
      </div>
    </aside>
  );
}

/* =========================================================
   SPOTIFY
========================================================= */

function SpotifyPreview({
  url,
}: {
  url: string;
}) {
  const [data, setData] =
    useState<{
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    } | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response =
          await fetch(
            `/api/spotify/oembed?url=${encodeURIComponent(
              url
            )}`,
            {
              cache: 'no-store',
            }
          );

        if (!response.ok) {
          return;
        }

        const result =
          await response.json();

        if (active) {
          setData(result);
        }
      } catch {
        // preview opcional
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [url]);

  if (!data) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-[#ff9aca] transition hover:bg-white/[0.07]"
      >
        Abrir no Spotify
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 flex overflow-hidden rounded-2xl border border-white/10 bg-[#101010] transition hover:border-[#ff78b9]/40"
    >
      {data.thumbnail_url ? (
        <img
          src={data.thumbnail_url}
          alt=""
          className="h-24 w-24 shrink-0 object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-[#191919] text-xs text-white/40">
          Spotify
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fe36b]">
          Spotify
        </span>

        <p className="mt-1 truncate text-sm font-bold text-white">
          {data.title ||
            'Música no Spotify'}
        </p>

        {data.author_name && (
          <p className="mt-1 truncate text-xs text-white/45">
            {data.author_name}
          </p>
        )}
      </div>
    </a>
  );
}

/* =========================================================
   POST BODY
========================================================= */

function PostBody({
  body,
}: {
  body: string | null;
}) {
  if (!body) {
    return null;
  }

  const pieces =
    body.split(SPOTIFY_URL_REGEX);

  const urls =
    body.match(SPOTIFY_URL_REGEX) || [];

  return (
    <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-white/85">
      {pieces.map(
        (piece, index) => (
          <span key={index}>
            {piece}

            {index <
              pieces.length - 1 &&
              urls[index] && (
                <SpotifyPreview
                  url={urls[index]}
                />
              )}
          </span>
        )
      )}
    </div>
  );
}

/* =========================================================
   MEDIA
========================================================= */

function PostMedia({
  post,
}: {
  post: Post;
}) {
  const media =
    getPostMedia(post);

  if (!media.length) {
    return null;
  }

  if (media.length === 1) {
    const item = media[0];

    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <img
          src={item.media_url}
          alt=""
          className="max-h-[620px] w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      {media.map((item) => (
        <div
          key={item.id}
          className="aspect-square overflow-hidden bg-black/40"
        >
          <img
            src={item.media_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   COMMENTS
========================================================= */

function CommentItem({
  comment,
  replies,
  onReply,
}: {
  comment: Comment;
  replies: Comment[];
  onReply: (
    comment: Comment
  ) => void;
}) {
  return (
    <div>
      <div className="flex gap-3">
        <Avatar
          profile={comment.author}
          size="small"
        />

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-white/[0.045] px-4 py-3">
            <Link
              href={
                comment.author
                  ? `/perfil/${encodeURIComponent(
                      comment.author.username
                    )}`
                  : '#'
              }
              className="text-sm font-bold text-white transition hover:text-[#ff78b9]"
            >
              {comment.author
                ?.display_name ||
                comment.author
                  ?.username ||
                'Usuário'}
            </Link>

            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/75">
              {comment.content}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-3 px-2 text-[11px] text-white/35">
            <span>
              {formatPostDateTime(
                comment.created_at
              )}
            </span>

            <button
              type="button"
              onClick={() =>
                onReply(comment)
              }
              className="font-semibold transition hover:text-[#ff78b9]"
            >
              Responder
            </button>
          </div>

          {replies.length > 0 && (
            <div className="mt-3 space-y-3 border-l border-white/10 pl-4">
              {replies.map(
                (reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    replies={[]}
                    onReply={
                      onReply
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   POST CARD
========================================================= */

function FeedPost({
  post,
  onPostUpdated,
}: {
  post: Post;
  onPostUpdated: (
    postId: string,
    changes: Partial<Post>
  ) => void;
}) {
  const [
    commentsOpen,
    setCommentsOpen,
  ] = useState(false);

  const [
    comments,
    setComments,
  ] = useState<Comment[]>([]);

  const [
    commentsLoading,
    setCommentsLoading,
  ] = useState(false);

  const [
    commentText,
    setCommentText,
  ] = useState('');

  const [
    replyingTo,
    setReplyingTo,
  ] = useState<Comment | null>(null);

  const [
    sendingComment,
    setSendingComment,
  ] = useState(false);

  const [
    liking,
    setLiking,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    shareMessage,
    setShareMessage,
  ] = useState('');

  const liked =
    post.user_reactions.includes(
      LIKE_REACTION
    );

  const likeCount =
    post.reaction_counts[
      LIKE_REACTION
    ] || 0;

  const loadComments =
    useCallback(async () => {
      setCommentsLoading(true);

      try {
        const response =
          await fetch(
            `/api/nook-comments?post_id=${encodeURIComponent(
              post.id
            )}`,
            {
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Não foi possível carregar os comentários.'
          );
        }

        setComments(
          data.comments || []
        );
      } catch (error) {
        console.error(error);
      } finally {
        setCommentsLoading(false);
      }
    }, [post.id]);

  useEffect(() => {
    if (commentsOpen) {
      loadComments();
    }
  }, [
    commentsOpen,
    loadComments,
  ]);

  async function toggleLike() {
    if (liking) {
      return;
    }

    setLiking(true);

    const previousLiked =
      liked;

    const previousCount =
      likeCount;

    onPostUpdated(post.id, {
      user_reactions:
        previousLiked
          ? post.user_reactions.filter(
              (reaction) =>
                reaction !==
                LIKE_REACTION
            )
          : [
              ...post.user_reactions,
              LIKE_REACTION,
            ],
      reaction_counts: {
        ...post.reaction_counts,
        [LIKE_REACTION]:
          Math.max(
            0,
            previousCount +
              (previousLiked
                ? -1
                : 1)
          ),
      },
    });

    try {
      const response =
        await fetch(
          '/api/nook-posts/reactions',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              post_id: post.id,
              emoji:
                LIKE_REACTION,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível alterar a curtida.'
        );
      }

      if (
        typeof data.reacted ===
        'boolean'
      ) {
        onPostUpdated(
          post.id,
          {
            user_reactions:
              data.reacted
                ? Array.from(
                    new Set([
                      ...post.user_reactions,
                      LIKE_REACTION,
                    ])
                  )
                : post.user_reactions.filter(
                    (reaction) =>
                      reaction !==
                      LIKE_REACTION
                  ),
          }
        );
      }
    } catch (error) {
      console.error(error);

      onPostUpdated(post.id, {
        user_reactions:
          previousLiked
            ? [
                ...post.user_reactions,
                LIKE_REACTION,
              ]
            : post.user_reactions.filter(
                (reaction) =>
                  reaction !==
                  LIKE_REACTION
              ),
        reaction_counts: {
          ...post.reaction_counts,
          [LIKE_REACTION]:
            previousCount,
        },
      });
    } finally {
      setLiking(false);
    }
  }

  async function toggleSave() {
    if (saving) {
      return;
    }

    setSaving(true);

    const previousSaved =
      post.saved;

    onPostUpdated(post.id, {
      saved: !previousSaved,
    });

    try {
      const response =
        await fetch(
          '/api/nook-posts/save',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              post_id: post.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível salvar o post.'
        );
      }

      onPostUpdated(post.id, {
        saved:
          Boolean(data.saved),
      });
    } catch (error) {
      console.error(error);

      onPostUpdated(post.id, {
        saved: previousSaved,
      });
    } finally {
      setSaving(false);
    }
  }

  async function sharePost() {
    const url =
      `${window.location.origin}/feed?post=${post.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title:
            post.author?.display_name ||
            post.author?.username ||
            'Post no Nooklie',
          text:
            post.body?.slice(
              0,
              120
            ) ||
            'Confira este post no Nooklie.',
          url,
        });

        setShareMessage(
          'Compartilhado!'
        );
      } else {
        await navigator.clipboard.writeText(
          url
        );

        setShareMessage(
          'Link copiado!'
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name ===
          'AbortError'
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          url
        );

        setShareMessage(
          'Link copiado!'
        );
      } catch {
        setShareMessage(
          'Não foi possível compartilhar.'
        );
      }
    }

    setTimeout(() => {
      setShareMessage('');
    }, 2200);
  }

  async function submitComment() {
    const content =
      commentText.trim();

    if (
      !content ||
      sendingComment
    ) {
      return;
    }

    setSendingComment(true);

    try {
      const response =
        await fetch(
          '/api/nook-comments',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              post_id: post.id,
              content,
              parent_id:
                replyingTo?.id ||
                null,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível comentar.'
        );
      }

      if (data.comment) {
        setComments(
          (current) => [
            ...current,
            data.comment,
          ]
        );

        onPostUpdated(
          post.id,
          {
            comments_count:
              post.comments_count +
              1,
          }
        );
      }

      setCommentText('');
      setReplyingTo(null);
      setCommentsOpen(true);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível comentar.'
      );
    } finally {
      setSendingComment(false);
    }
  }

  const commentsByParent =
    useMemo(() => {
      const map =
        new Map<
          string | null,
          Comment[]
        >();

      for (const comment of comments) {
        const key =
          comment.parent_id;

        if (!map.has(key)) {
          map.set(key, []);
        }

        map
          .get(key)!
          .push(comment);
      }

      return map;
    }, [comments]);

  const mainComments =
    commentsByParent.get(null) || [];

  return (
    <article className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#100c11]/90 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Link
            href={
              post.author
                ? `/perfil/${encodeURIComponent(
                    post.author.username
                  )}`
                : '#'
            }
          >
            <Avatar
              profile={post.author}
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={
                    post.author
                      ? `/perfil/${encodeURIComponent(
                          post.author.username
                        )}`
                      : '#'
                  }
                  className="flex items-center gap-1.5 truncate text-sm font-bold text-white transition hover:text-[#ff78b9]"
                >
                  <span className="truncate">
                    {post.author
                      ?.display_name ||
                      post.author
                        ?.username ||
                      'Usuário'}
                  </span>

                  {post.author?.verified && (
                    <VerifiedBadge />
                  )}
                </Link>

                <Link
                  href={
                    post.author
                      ? `/perfil/${encodeURIComponent(
                          post.author.username
                        )}`
                      : '#'
                  }
                  className="block truncate text-xs text-[#ff78b9]/80 transition hover:text-[#ff78b9]"
                >
                  @{post.author?.username || 'usuario'}
                </Link>
              </div>

              <span className="shrink-0 text-[10px] text-white/30 sm:text-xs">
                {formatPostDateTime(
                  post.created_at
                )}
              </span>
            </div>
          </div>
        </div>

        <PostBody body={post.body} />

        <PostMedia post={post} />

        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={toggleLike}
            disabled={liking}
            className={`group flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-xl px-3 transition active:scale-95 ${
              liked
                ? 'text-[#ff78b9]'
                : 'text-white/45 hover:bg-white/[0.04] hover:text-[#ff78b9]'
            }`}
          >
            <CloudIcon filled={liked} />

            {likeCount > 0 && (
              <span className="text-[11px] font-semibold">
                {likeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setCommentsOpen(
                (value) => !value
              )
            }
            className="group flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-xl px-3 text-white/45 transition hover:bg-white/[0.04] hover:text-[#ff78b9]"
          >
            <CommentIcon />

            {post.comments_count > 0 && (
              <span className="text-[11px] font-semibold">
                {post.comments_count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={sharePost}
            className="group relative flex h-11 min-w-[64px] items-center justify-center rounded-xl px-3 text-white/45 transition hover:bg-white/[0.04] hover:text-[#ff78b9]"
          >
            <ShareIcon />

            {shareMessage && (
              <span className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#ff78b9] px-3 py-1.5 text-[10px] font-bold text-[#190d16]">
                {shareMessage}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleSave}
            disabled={saving}
            className={`group flex h-11 min-w-[64px] items-center justify-center rounded-xl px-3 transition ${
              post.saved
                ? 'text-[#ff78b9]'
                : 'text-white/45 hover:bg-white/[0.04] hover:text-[#ff78b9]'
            }`}
          >
            <BookmarkIcon
              filled={post.saved}
            />
          </button>
        </div>
      </div>

      {commentsOpen && (
        <div className="border-t border-white/[0.06] bg-black/10 px-5 py-5 sm:px-6">
          {replyingTo && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] px-3 py-2">
              <span className="text-xs text-white/50">
                Respondendo a{' '}
                <strong className="text-[#ff78b9]">
                  @{
                    replyingTo.author?.username ||
                    'usuario'
                  }
                </strong>
              </span>

              <button
                type="button"
                onClick={() =>
                  setReplyingTo(null)
                }
                className="text-xs font-bold text-white/40 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          )}

          <div className="mb-5 flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff78b9]/20 text-xs font-black text-[#ff78b9]">
              N
            </div>

            <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2">
              <textarea
                value={commentText}
                onChange={(event) =>
                  setCommentText(
                    event.target.value.slice(
                      0,
                      2000
                    )
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key ===
                      'Enter' &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    submitComment();
                  }
                }}
                placeholder={
                  replyingTo
                    ? 'Escreva sua resposta...'
                    : 'Escreva um comentário...'
                }
                rows={1}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-white/25"
              />

              <button
                type="button"
                onClick={submitComment}
                disabled={
                  !commentText.trim() ||
                  sendingComment
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff78b9] text-[#190d16] transition hover:brightness-110 disabled:opacity-30"
              >
                <SendIcon />
              </button>
            </div>
          </div>

          {commentsLoading ? (
            <div className="py-6 text-center text-xs text-white/30">
              Carregando comentários...
            </div>
          ) : mainComments.length ===
            0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-semibold text-white/45">
                Ainda não há comentários.
              </p>

              <p className="mt-1 text-xs text-white/25">
                Seja a primeira pessoa a comentar.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {mainComments.map(
                (comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    replies={
                      commentsByParent.get(
                        comment.id
                      ) || []
                    }
                    onReply={
                      setReplyingTo
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* =========================================================
   MENU LATERAL DESKTOP
========================================================= */

function SideMenu({
  open,
  currentUser,
  onClose,
  onOpenCalendar,
}: {
  open: boolean;
  currentUser: CurrentUser | null;
  onClose: () => void;
  onOpenCalendar: () => void;
}) {
  return (
    <aside
      className={`fixed left-0 top-0 z-[90] hidden h-screen overflow-hidden border-r border-white/[0.08] bg-[#100c11]/98 shadow-[20px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all duration-300 lg:flex ${
        open
          ? 'w-[285px]'
          : 'pointer-events-none w-0 border-r-0'
      }`}
    >
      <div className="flex min-w-[285px] flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5">
          <Link
            href="/feed"
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]">
              <CloudIcon />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#ff78b9]/70 font-nooklie-logo">
                Nooklie
              </p>

              <p className="mt-0.5 text-xs text-white/40">
                Entre escritores
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Fechar menu"
          >
            <CloseIcon />
          </button>
        </div>

        <Link
          href="/perfil"
          className="mx-4 mt-5 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 transition hover:border-[#ff78b9]/20 hover:bg-white/[0.04]"
        >
          <Avatar
            profile={currentUser}
          />

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {currentUser?.display_name ||
                currentUser?.username ||
                'Usuário'}
            </p>

            <p className="mt-0.5 truncate text-xs text-[#ff78b9]/70">
              @{currentUser?.username ||
                'usuario'}
            </p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-4 pb-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
            Navegação
          </p>

          <div className="space-y-1">
            <Link
              href="/feed"
              className="flex items-center gap-3 rounded-2xl bg-[#ff78b9]/[0.08] px-4 py-3.5 text-sm font-bold text-[#ff78b9]"
            >
              <HomeIcon />
              Início
            </Link>

            <Link
              href="/minhas-historias"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <BookIcon />
              Minhas histórias
            </Link>

            <Link
              href="/biblioteca"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <LibraryIcon />
              Minha biblioteca
            </Link>

            <Link
              href="/listas-de-leitura"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <BookmarkMenuIcon />
              Minhas listas de leitura
            </Link>

            <button
              type="button"
              onClick={onOpenCalendar}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <CalendarIcon />
              Próximas atualizações
            </button>

            <Link
              href="/fandoms"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <UsersIcon />
              Meus fandoms
            </Link>

            <Link
              href="/ler-depois"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <BookmarkMenuIcon />
              Ler depois
            </Link>

            <Link
              href="/chat"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <MessageIcon />
              Chat
            </Link>

            <Link
              href="/clubes"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <UsersIcon />
              Clubes de fic
            </Link>

            <Link
              href="/configuracoes"
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/60 transition hover:bg-[#ff78b9]/[0.07] hover:text-[#ff78b9]"
            >
              <SettingsIcon />
              Configurações
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <Link
            href="/logout"
            className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/35 transition hover:bg-red-400/[0.05] hover:text-red-300"
          >
            <LogoutIcon />
            Sair
          </Link>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   MENU MOBILE
========================================================= */

function MobileDrawer({
  open,
  onClose,
  currentUser,
  onOpenCalendar,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: CurrentUser | null;
  onOpenCalendar: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-[2px] lg:hidden"
        aria-label="Fechar menu"
      />

      <aside className="fixed left-0 top-0 z-[90] flex h-screen w-[84%] max-w-[360px] flex-col overflow-hidden rounded-r-[30px] border-r border-white/[0.08] bg-[#100c11] shadow-[20px_0_80px_rgba(0,0,0,0.45)] lg:hidden">
        <div className="border-b border-white/[0.06] px-5 pb-5 pt-6">
          <div className="flex items-center justify-between">
            <Link
              href="/feed"
              onClick={onClose}
              className="flex items-center gap-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]">
                <CloudIcon />
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#ff78b9]/70 font-nooklie-logo">
                  Nooklie
                </p>

                <p className="mt-0.5 text-xs font-semibold text-white/45">
                  Entre escritores
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.05] hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          <Link
            href="/perfil"
            onClick={onClose}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"
          >
            <Avatar
              profile={currentUser}
            />

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {currentUser?.display_name ||
                  currentUser?.username ||
                  'Usuário'}
              </p>

              <p className="mt-0.5 truncate text-xs text-[#ff78b9]/70">
                @{currentUser?.username ||
                  'usuario'}
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            <Link
              href="/feed"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl bg-[#ff78b9]/[0.08] px-4 py-3.5 text-sm font-bold text-[#ff78b9]"
            >
              <HomeIcon />
              Início
            </Link>

            <Link
              href="/minhas-historias"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <BookIcon />
              Minhas histórias
            </Link>

            <Link
              href="/biblioteca"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <LibraryIcon />
              Minha biblioteca
            </Link>

            <Link
              href="/listas-de-leitura"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <BookmarkMenuIcon />
              Minhas listas de leitura
            </Link>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCalendar();
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-white/65"
            >
              <CalendarIcon />
              Próximas atualizações
            </button>

            <Link
              href="/fandoms"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <UsersIcon />
              Meus fandoms
            </Link>

            <Link
              href="/ler-depois"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <BookmarkMenuIcon />
              Ler depois
            </Link>

            <Link
              href="/chat"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <MessageIcon />
              Chat
            </Link>

            <Link
              href="/clubes"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <UsersIcon />
              Clubes de fic
            </Link>

            <Link
              href="/configuracoes"
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/65"
            >
              <SettingsIcon />
              Configurações
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <Link
            href="/logout"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white/40 hover:text-red-300"
          >
            <LogoutIcon />
            Sair
          </Link>
        </div>
      </aside>
    </>
  );
}

/* =========================================================
   CALENDÁRIO MOBILE
========================================================= */

function MobileCalendarModal({
  open,
  updates,
  onClose,
}: {
  open: boolean;
  updates: UpcomingUpdate[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-3 backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex h-full max-w-[520px] flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#100c11]">
        <UpcomingUpdatesContent
          updates={updates}
          onClose={onClose}
          mobile
        />
      </div>
    </div>
  );
}

/* =========================================================
   BUSCA DE USUÁRIOS
========================================================= */

function FeedSearchModal({
  open,
  query,
  setQuery,
  users,
  loading,
  currentUser,
  followingUsers,
  followLoading,
  onFollow,
  onClose,
}: {
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  users: FeedSearchUser[];
  loading: boolean;
  currentUser: CurrentUser | null;
  followingUsers: Record<string, boolean>;
  followLoading: string | null;
  onFollow: (user: FeedSearchUser) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/75 p-3 pt-[8vh] backdrop-blur-md sm:p-6 sm:pt-[10vh]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Fechar busca"
      />

      <div className="relative z-10 flex max-h-[80vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#100c11] shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="border-b border-white/[0.06] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff78b9]">
                Encontrar pessoas
              </p>

              <h2 className="mt-1 text-xl font-black text-white">
                Quem você quer encontrar?
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Fechar busca"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 focus-within:border-[#ff78b9]/35">
            <SearchIcon />

            <input
              autoFocus
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Escape'
                ) {
                  onClose();
                }
              }}
              placeholder="Nome ou @username"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />

            {query && (
              <button
                type="button"
                onClick={() =>
                  setQuery('')
                }
                className="text-xs font-bold text-white/30 transition hover:text-white"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {!query.trim() ? (
            <div className="flex min-h-[220px] items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] text-[#ff78b9]/60">
                  <SearchIcon />
                </div>

                <p className="mt-4 text-sm font-bold text-white/55">
                  Pesquise por alguém
                </p>

                <p className="mt-1 text-xs leading-5 text-white/25">
                  Digite um nome ou
                  @username para
                  encontrar escritores.
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(
                (item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl p-3"
                  >
                    <div className="h-11 w-11 animate-pulse rounded-full bg-white/[0.06]" />

                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                      <div className="mt-2 h-2 w-20 animate-pulse rounded bg-white/[0.04]" />
                    </div>

                    <div className="h-9 w-20 animate-pulse rounded-full bg-white/[0.05]" />
                  </div>
                )
              )}
            </div>
          ) : users.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.025] text-white/25">
                  <UserIcon />
                </div>

                <p className="mt-4 text-sm font-bold text-white/55">
                  Nenhuma pessoa encontrada.
                </p>

                <p className="mt-1 text-xs leading-5 text-white/25">
                  Tente outro nome ou
                  username.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((user) => {
                const isCurrentUser =
                  currentUser?.id ===
                  user.id;

                const isFollowing =
                  Boolean(
                    followingUsers[
                      user.id
                    ]
                  );

                const isLoading =
                  followLoading ===
                  user.id;

                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/[0.035]"
                  >
                    <Link
                      href={`/perfil/${encodeURIComponent(
                        user.username
                      )}`}
                      onClick={onClose}
                      className="shrink-0"
                    >
                      <Avatar
                        profile={user}
                      />
                    </Link>

                    <Link
                      href={`/perfil/${encodeURIComponent(
                        user.username
                      )}`}
                      onClick={onClose}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-white transition hover:text-[#ff78b9]">
                          {user.display_name ||
                            user.username}
                        </p>

                        {user.verified && (
                          <VerifiedBadge />
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-xs text-[#ff78b9]/65">
                        @{user.username}
                      </p>
                    </Link>

                    {isCurrentUser ? (
                      <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-[10px] font-bold text-white/30">
                        Você
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onFollow(user)
                        }
                        disabled={isLoading}
                        className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black transition ${
                          isFollowing
                            ? 'border border-white/[0.1] bg-white/[0.045] text-white/55 hover:border-red-400/20 hover:bg-red-400/[0.05] hover:text-red-300'
                            : 'bg-[#ff78b9] text-[#190d16] hover:brightness-110'
                        } disabled:cursor-wait disabled:opacity-50`}
                      >
                        {isLoading
                          ? '...'
                          : isFollowing
                            ? 'Seguindo'
                            : 'Seguir'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   FEED PAGE
========================================================= */

export default function FeedPage() {
  const [posts, setPosts] =
    useState<Post[]>([]);

  const [
    currentUser,
    setCurrentUser,
  ] = useState<CurrentUser | null>(
    null
  );

  const [
    stories,
    setStories,
  ] = useState<UserStory[]>([]);

  const [
    activeStory,
    setActiveStory,
  ] = useState<UserStory | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    composerOpen,
    setComposerOpen,
  ] = useState(false);

  const [
    storyComposerOpen,
    setStoryComposerOpen,
  ] = useState(false);

  const [
    upcomingUpdates,
    setUpcomingUpdates,
  ] = useState<
    UpcomingUpdate[]
  >([]);

  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false);

  const [
    calendarOpen,
    setCalendarOpen,
  ] = useState(false);

  /* =======================================================
     BUSCA
  ======================================================= */

  const [
    searchOpen,
    setSearchOpen,
  ] = useState(false);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('');

  const [
    searchUsers,
    setSearchUsers,
  ] = useState<FeedSearchUser[]>([]);

  const [
    searchLoading,
    setSearchLoading,
  ] = useState(false);

  const [
    followLoading,
    setFollowLoading,
  ] = useState<string | null>(null);

  const [
    followingUsers,
    setFollowingUsers,
  ] = useState<
    Record<string, boolean>
  >({});

  /* =======================================================
     USUÁRIO LOGADO
  ======================================================= */

  const loadCurrentUser =
    useCallback(async () => {
      try {
        const response =
          await fetch(
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
          setCurrentUser(
            data.user
          );
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        console.error(
          'Erro ao carregar usuário:',
          error
        );

        setCurrentUser(null);
      }
    }, []);

  /* =======================================================
     BUSCAR USUÁRIOS
  ======================================================= */

  const searchFeedUsers =
    useCallback(
      async (value: string) => {
        const query =
          value.trim();

        if (!query) {
          setSearchUsers([]);
          setSearchLoading(false);
          return;
        }

        setSearchLoading(true);

        try {
          const response =
            await fetch(
              `/api/explore?q=${encodeURIComponent(
                query
              )}`,
              {
                cache: 'no-store',
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                'Não foi possível pesquisar usuários.'
            );
          }

          const users =
            Array.isArray(
              data.users
            )
              ? data.users
              : [];

          setSearchUsers(
            users
          );

          const followingEntries =
            await Promise.all(
              users.map(
                async (
                  user: FeedSearchUser
                ) => {
                  if (
                    currentUser?.id ===
                    user.id
                  ) {
                    return [
                      user.id,
                      false,
                    ] as const;
                  }

                  try {
                    const followResponse =
                      await fetch(
                        `/api/follows?user_id=${encodeURIComponent(
                          user.id
                        )}`,
                        {
                          cache:
                            'no-store',
                        }
                      );

                    if (
                      !followResponse.ok
                    ) {
                      return [
                        user.id,
                        false,
                      ] as const;
                    }

                    const followData =
                      await followResponse.json();

                    const following =
                      Boolean(
                        followData.following ??
                          followData.is_following ??
                          followData.followed
                      );

                    return [
                      user.id,
                      following,
                    ] as const;
                  } catch {
                    return [
                      user.id,
                      false,
                    ] as const;
                  }
                }
              )
            );

          setFollowingUsers(
            (current) => ({
              ...current,
              ...Object.fromEntries(
                followingEntries
              ),
            })
          );
        } catch (error) {
          console.error(
            'Erro ao pesquisar usuários:',
            error
          );

          setSearchUsers([]);
        } finally {
          setSearchLoading(false);
        }
      },
      [currentUser?.id]
    );

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        searchFeedUsers(
          searchQuery
        );
      }, 300);

    return () => {
      window.clearTimeout(
        timeout
      );
    };
  }, [
    searchOpen,
    searchQuery,
    searchFeedUsers,
  ]);

  async function handleFollow(
    user: FeedSearchUser
  ) {
    if (
      !currentUser ||
      currentUser.id === user.id ||
      followLoading === user.id
    ) {
      return;
    }

    const currentlyFollowing =
      Boolean(
        followingUsers[user.id]
      );

    setFollowLoading(
      user.id
    );

    setFollowingUsers(
      (current) => ({
        ...current,
        [user.id]:
          !currentlyFollowing,
      })
    );

    try {
      const response =
        await fetch(
          '/api/follows',
          {
            method:
              currentlyFollowing
                ? 'DELETE'
                : 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              following_id:
                user.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível alterar o seguimento.'
        );
      }

      const following =
        typeof data.following ===
        'boolean'
          ? data.following
          : typeof data.is_following ===
              'boolean'
            ? data.is_following
            : !currentlyFollowing;

      setFollowingUsers(
        (current) => ({
          ...current,
          [user.id]:
            following,
        })
      );
    } catch (error) {
      console.error(
        'Erro ao seguir usuário:',
        error
      );

      setFollowingUsers(
        (current) => ({
          ...current,
          [user.id]:
            currentlyFollowing,
        })
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar o seguimento.'
      );
    } finally {
      setFollowLoading(null);
    }
  }

  /* =======================================================
     FEED
  ======================================================= */

  const loadFeed =
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
              '/api/feed',
              {
                cache: 'no-store',
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                'Não foi possível carregar o Feed.'
            );
          }

          setPosts(
            data.posts || []
          );
        } catch (err) {
          console.error(err);

          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível carregar o Feed.'
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  /* =======================================================
     STORIES
  ======================================================= */

  const loadStories =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            '/api/stories',
            {
              cache: 'no-store',
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        const incomingStories =
          Array.isArray(data)
            ? data
            : data.stories;

        if (
          Array.isArray(
            incomingStories
          )
        ) {
          setStories(
            incomingStories
          );
        }
      } catch {
        // Stories não devem impedir o carregamento do Feed.
      }
    }, []);

  /* =======================================================
     PRÓXIMAS ATUALIZAÇÕES
  ======================================================= */

  const loadUpcomingUpdates =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            '/api/upcoming-updates',
            {
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Não foi possível carregar as próximas atualizações.'
          );
        }

        const rawUpdates: ApiUpcomingUpdate[] =
          data.updates || [];

        const authorIds =
          Array.from(
            new Set(
              rawUpdates.map(
                (update) =>
                  update.author.id
              )
            )
          );

        const coloredUpdates =
          rawUpdates.map(
            (update) => ({
              ...update,
              color:
                getAuthorColor(
                  update.author.id,
                  authorIds
                ),
            })
          );

        setUpcomingUpdates(
          coloredUpdates
        );
      } catch (error) {
        console.error(
          'Erro ao carregar próximas atualizações:',
          error
        );

        setUpcomingUpdates([]);
      }
    }, []);

  /* =======================================================
     CARREGAMENTO INICIAL
  ======================================================= */

  useEffect(() => {
    loadCurrentUser();
    loadFeed();
    loadStories();
    loadUpcomingUpdates();
  }, [
    loadCurrentUser,
    loadFeed,
    loadStories,
    loadUpcomingUpdates,
  ]);

  /* =======================================================
     ATUALIZAÇÃO AO VOLTAR PARA A ABA
  ======================================================= */

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          loadUpcomingUpdates();
          loadStories();
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, [
    loadUpcomingUpdates,
    loadStories,
  ]);

  function updatePost(
    postId: string,
    changes: Partial<Post>
  ) {
    setPosts(
      (current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                ...changes,
              }
            : post
        )
    );
  }

  const greetingName =
    currentUser?.username ||
    currentUser?.display_name ||
    'escritor';

  return (
    <main className="min-h-screen bg-[#080609] text-white">
      {/* =================================================
          BACKGROUND
      ================================================= */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-180px] h-[500px] w-[500px] rounded-full bg-[#ff4d9d]/[0.08] blur-[130px]" />

        <div className="absolute right-[-180px] top-[25%] h-[500px] w-[500px] rounded-full bg-[#c63dff]/[0.045] blur-[140px]" />

        <div className="absolute bottom-[-200px] left-[35%] h-[450px] w-[450px] rounded-full bg-[#ff78b9]/[0.035] blur-[130px]" />
      </div>

      {/* =================================================
          DESKTOP MENU
      ================================================= */}

      <SideMenu
        open={drawerOpen}
        currentUser={currentUser}
        onClose={() =>
          setDrawerOpen(false)
        }
        onOpenCalendar={() =>
          setCalendarOpen(true)
        }
      />

      {/* =================================================
          MOBILE MENU
      ================================================= */}

      <MobileDrawer
        open={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
        currentUser={currentUser}
        onOpenCalendar={() =>
          setCalendarOpen(true)
        }
      />

      {/* =================================================
          MOBILE CALENDAR
      ================================================= */}

      <MobileCalendarModal
        open={calendarOpen}
        updates={upcomingUpdates}
        onClose={() =>
          setCalendarOpen(false)
        }
      />

      {/* =================================================
          STORY VIEWER
      ================================================= */}

      <StoryViewer
        story={activeStory}
        stories={stories}
        onSelect={setActiveStory}
        onClose={() =>
          setActiveStory(null)
        }
      />

      {/* =================================================
          BUSCA
      ================================================= */}

      <FeedSearchModal
        open={searchOpen}
        query={searchQuery}
        setQuery={setSearchQuery}
        users={searchUsers}
        loading={searchLoading}
        currentUser={currentUser}
        followingUsers={followingUsers}
        followLoading={followLoading}
        onFollow={handleFollow}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
          setSearchUsers([]);
        }}
      />

      {/* =================================================
          CONTEÚDO
      ================================================= */}

      <div
        className={`relative min-h-screen w-full px-4 pb-20 pt-4 transition-all duration-300 sm:px-6 lg:px-8 lg:pt-6 ${
          drawerOpen
            ? 'lg:pl-[320px]'
            : ''
        }`}
      >
        <div className="mx-auto max-w-[1380px]">
          {/* =================================================
              TOP BAR
          ================================================= */}

          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setDrawerOpen(
                    (value) => !value
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-white/55 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9]"
                aria-label="Abrir menu"
              >
                <MenuIcon />
              </button>

              <div className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9] sm:flex">
                <CloudIcon />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.28em] text-[#ff78b9]/70 font-nooklie-logo">
                  Nooklie
                </p>

                <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white sm:text-2xl">
                  Oi, {greetingName}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* LUPA */}
              <button
                type="button"
                onClick={() =>
                  setSearchOpen(true)
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-white/45 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9]"
                aria-label="Pesquisar pessoas"
                title="Pesquisar pessoas"
              >
                <SearchIcon />
              </button>

              <Link
                href="/perfil"
                className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] sm:flex"
              >
                <Avatar
                  profile={currentUser}
                  size="small"
                />

                <span className="max-w-[120px] truncate text-xs font-bold text-white/60">
                  @{currentUser?.username ||
                    'usuario'}
                </span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  loadFeed(true);
                  loadStories();
                  loadUpcomingUpdates();
                }}
                disabled={refreshing}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-white/45 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/[0.06] hover:text-[#ff78b9] disabled:opacity-40"
                aria-label="Atualizar"
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

          {/* =================================================
              HERO / BOAS-VINDAS
          ================================================= */}

          <section className="mb-7 overflow-hidden rounded-[30px] border border-[#ff78b9]/10 bg-gradient-to-br from-[#ff78b9]/[0.09] via-[#100c11]/90 to-[#c63dff]/[0.05] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.24)] sm:p-8">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff78b9]">
                Seu espaço
              </p>

              <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Um lugar para escrever,
                ler e encontrar gente
                que entende você.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40 sm:text-[15px]">
                Acompanhe seus escritores,
                descubra histórias novas e
                compartilhe o que está passando
                pela sua cabeça.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setComposerOpen(true)
                  }
                  className="rounded-full bg-[#ff78b9] px-5 py-2.5 text-xs font-black text-[#190d16] transition hover:brightness-110"
                >
                  Escrever no Mural
                </button>

                <Link
                  href="/explorar"
                  className="rounded-full border border-white/10 bg-white/[0.035] px-5 py-2.5 text-xs font-bold text-white/60 transition hover:border-[#ff78b9]/25 hover:text-[#ff78b9]"
                >
                  Explorar histórias
                </Link>
              </div>
            </div>
          </section>

          {/* =================================================
              STORIES
          ================================================= */}

          <StoriesRow
            stories={stories}
            onOpen={setActiveStory}
            onCreateStory={() =>
              setStoryComposerOpen(true)
            }
          />

          {/* =================================================
              LAYOUT
          ================================================= */}

          <div className="flex items-start justify-center gap-7">
            {/* =================================================
                COLUNA CENTRAL
            ================================================= */}

            <div className="w-full max-w-[680px]">
              {/* CREATE POST */}

              <div className="mb-7 w-full">
                <button
                  type="button"
                  onClick={() =>
                    setComposerOpen(true)
                  }
                  className="group w-full overflow-hidden rounded-[26px] border border-[#ff78b9]/15 bg-gradient-to-br from-[#ff78b9]/[0.09] via-white/[0.035] to-[#c63dff]/[0.05] p-5 text-left shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[#ff78b9]/35 hover:shadow-[0_20px_70px_rgba(255,120,185,0.08)] sm:p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-[#ff78b9]/30 bg-[#ff78b9] font-black text-lg text-[#190d16] shadow-[0_0_25px_rgba(255,120,185,0.12)] sm:h-16 sm:w-16">
                        {currentUser?.avatar_url ? (
                          <img
                            src={
                              currentUser.avatar_url
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {getInitial(
                              currentUser
                            )}
                          </div>
                        )}
                      </div>

                      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#100c11] bg-[#ff78b9] text-[#190d16]">
                        +
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-base font-black text-white sm:text-lg">
                        Compartilhe alguma coisa
                      </p>

                      <p className="mt-1 text-sm leading-5 text-white/40">
                        Uma ideia, uma descoberta,
                        uma história...
                      </p>
                    </div>

                    <div className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/45 transition group-hover:border-[#ff78b9]/25 group-hover:bg-[#ff78b9]/[0.08] group-hover:text-[#ff78b9] sm:block">
                      Publicar
                    </div>
                  </div>

                  <div className="mt-5 border-t border-white/[0.07] pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs text-white/25">
                        O que está passando pela sua
                        cabeça?
                      </span>

                      <span className="text-xs font-semibold text-[#ff78b9]/50 transition group-hover:text-[#ff78b9]">
                        Criar publicação →
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {/* ERROR */}

              {error && (
                <div className="mb-6 rounded-2xl border border-red-400/15 bg-red-400/[0.05] px-5 py-4">
                  <p className="text-sm font-semibold text-red-300">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      loadFeed()
                    }
                    className="mt-2 text-xs font-bold text-red-300 underline underline-offset-2"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* MURAL */}

              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">
                    Mural
                  </p>

                  <h2 className="mt-1 text-xl font-black text-white">
                    O que está acontecendo
                  </h2>
                </div>

                <span className="text-[10px] text-white/20">
                  Publicações
                </span>
              </div>

              {loading ? (
                <div className="w-full space-y-5">
                  {[1, 2, 3].map(
                    (item) => (
                      <div
                        key={item}
                        className="animate-pulse rounded-[26px] border border-white/[0.06] bg-white/[0.025] p-6"
                      >
                        <div className="flex gap-3">
                          <div className="h-11 w-11 rounded-full bg-white/[0.06]" />

                          <div className="flex-1">
                            <div className="h-3 w-32 rounded bg-white/[0.06]" />

                            <div className="mt-2 h-2 w-20 rounded bg-white/[0.04]" />
                          </div>
                        </div>

                        <div className="mt-5 h-4 w-4/5 rounded bg-white/[0.05]" />

                        <div className="mt-3 h-4 w-3/5 rounded bg-white/[0.04]" />

                        <div className="mt-5 h-32 rounded-2xl bg-white/[0.04]" />
                      </div>
                    )
                  )}
                </div>
              ) : posts.length === 0 ? (
                <div className="flex min-h-[45vh] items-center justify-center rounded-[26px] border border-white/[0.06] bg-white/[0.015]">
                  <div className="max-w-md px-6 text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] text-[#ff78b9]/50">
                      <CloudIcon />
                    </div>

                    <h2 className="mt-6 text-xl font-black text-white">
                      O Mural está quieto.
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-white/35">
                      Ainda não há publicações por
                      aqui. Quando os escritores
                      começarem a postar, elas
                      aparecerão aqui.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-5">
                  {posts.map(
                    (post) => (
                      <FeedPost
                        key={post.id}
                        post={post}
                        onPostUpdated={
                          updatePost
                        }
                      />
                    )
                  )}
                </div>
              )}
            </div>

            {/* =================================================
                LATERAL DIREITA
            ================================================= */}

            <div className="hidden w-[270px] shrink-0 xl:block">
              <div className="sticky top-6 space-y-5">
                {/* MINI STORIES */}

                <aside className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#100c11]/90 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">
                        Stories
                      </p>

                      <p className="mt-1 text-sm font-black text-white">
                        Quem você segue
                      </p>
                    </div>

                    <Link
                      href="/stories"
                      className="text-[9px] font-bold text-white/25 hover:text-[#ff78b9]"
                    >
                      Ver todos
                    </Link>
                  </div>

                  {stories.length === 0 ? (
                    <p className="py-4 text-center text-[10px] leading-5 text-white/25">
                      Nenhum story novo.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {Array.from(
                        new Map(
                          stories.map(
                            (story) => [
                              story.user_id,
                              story,
                            ]
                          )
                        ).values()
                      )
                        .slice(0, 6)
                        .map(
                          (story) => (
                            <button
                              key={
                                story.user_id
                              }
                              type="button"
                              onClick={() =>
                                setActiveStory(
                                  story
                                )
                              }
                              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.04]"
                            >
                              <div className="rounded-full bg-gradient-to-br from-[#ff4d9d] via-[#ff78b9] to-[#c63dff] p-[2px]">
                                <div className="rounded-full bg-[#100c11] p-[2px]">
                                  <Avatar
                                    profile={
                                      story.user
                                    }
                                    size="small"
                                  />
                                </div>
                              </div>

                              <span className="min-w-0 flex-1 truncate text-xs font-bold text-white/65">
                                @{story.user.username}
                              </span>
                            </button>
                          )
                        )}
                    </div>
                  )}
                </aside>

                {/* CALENDÁRIO */}

                <UpcomingUpdatesCard
                  updates={
                    upcomingUpdates
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          NOVA PUBLICAÇÃO
      ===================================================== */}

      <NookPostComposer
        open={composerOpen}
        onClose={() =>
          setComposerOpen(false)
        }
        onPublished={() => {
          setComposerOpen(false);
          loadFeed(true);
          loadStories();
          loadUpcomingUpdates();
        }}
      />

      {/* =====================================================
          NOVO STORY
      ===================================================== */}

      <StoryComposer
        open={storyComposerOpen}
        onClose={() =>
          setStoryComposerOpen(false)
        }
        onPublished={() => {
          setStoryComposerOpen(false);
          loadStories();
        }}
      />
    </main>
  );
}
