'use client';
import QuotedReply from '@/components/QuotedReply';
import FeedVideo from '@/components/FeedVideo';
import { feedImageTypes, maxFeedUploadBytes } from '@/lib/social/attachments';
import { notificationReturnParam, notificationsPath } from '@/lib/notifications/presentation';
import { feedTokenPattern, linkedVideoId, normalizeHashtag } from '@/lib/social/feed-links';
import AccountBadge from '@/components/AccountBadge';
import RepostActions from '@/components/RepostActions';

import {contentMediaUrl} from '@/lib/security/content-media';
import RepostAttribution from '@/components/RepostAttribution';
import LinkedNewsCard from '@/components/LinkedNewsCard';
import LinkedStoryCard from '@/components/LinkedStoryCard';
import UpcomingUpdatesCalendar, { type CalendarStatus, type UpcomingUpdate } from '@/components/UpcomingUpdatesCalendar';
import {
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { Ellipsis, Trash2 } from 'lucide-react';
import { PostMention } from '@/components/PostMention';
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
  is_official?: boolean;
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
  is_official?: boolean;
};

type FeedSearchUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
  is_official?: boolean;
};

type Media = {
  id: string;
  post_id: string;
  media_url: string;
  media_type: 'image' | 'gif' | 'video';
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
  image_url?: string | null;
  likes: number;
  liked: boolean;
  saved: boolean;
};

type Post = {
  repost?: {id:string;comment:string|null;created_at:string;author:Profile};
  id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  story_id: string | null;
  news_slug?: string | null;
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
  display_name: string | null; verified?: boolean; is_official?: boolean;
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
  })} • ${value.toLocaleTimeString('pt-BR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
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
          loading="lazy"
          src={contentMediaUrl(profile.avatar_url)}
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

  return <section className="feed-stories" aria-label="Stories"><div className="feed-story-strip"><button type="button" onClick={onCreateStory} className="feed-story" aria-label="Criar seu Story"><span className="feed-story-create">+</span><span>Seu Story</span></button>{groupedStories.map(story=><button type="button" key={story.user_id} onClick={()=>onOpen(story)} className="feed-story" aria-label={'Ver Story de @'+story.user.username}><span className="feed-story-ring"><Avatar profile={story.user}/></span><span>@{story.user.username}<AccountBadge account={story.user} /></span></button>)}</div></section>;

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
              }<AccountBadge account={currentStory.user} />
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
                contentMediaUrl(currentStory.media_url)
              }
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <img
              loading="lazy"
              key={currentStory.id}
              src={
                contentMediaUrl(currentStory.media_url)
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
          loading="lazy"
          src={contentMediaUrl(data.thumbnail_url)}
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

  return (
    <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-white/85">
      {body.split(feedTokenPattern).map((piece, index) => {
        if (index % 2 === 0) return piece;
        if (piece.startsWith('@')) return <PostMention key={index} token={piece} />;
        if (piece.startsWith('#')) return <a key={index} href={'/feed?tag=' + encodeURIComponent(normalizeHashtag(piece))} className="font-semibold text-pink-200 hover:underline">{piece}</a>;
        const url = URL.parse(piece);
        if (!url || !['http:', 'https:'].includes(url.protocol)) return piece;
        const origin = typeof window === 'undefined' ? 'https://nooklie.vercel.app' : window.location.origin;
        const videoId = linkedVideoId(piece, origin);
        if (videoId) return <FeedVideo key={index} id={videoId} />;
        if (url.hostname === 'open.spotify.com' && piece.match(SPOTIFY_URL_REGEX)) return <SpotifyPreview key={index} url={piece} />;
        const internal = url.origin === origin || url.origin === 'https://nooklie.vercel.app';
        const replyId = internal && url.pathname === '/feed' ? url.searchParams.get('reply') : null;
        const replyPostId = replyId ? url.searchParams.get('post') : null;
        if (replyId && replyPostId && [replyId, replyPostId].every(id => /^[0-9a-f-]{36}$/i.test(id))) {
          return <QuotedReply key={index} postId={replyPostId} replyId={replyId} />;
        }
        const chapter = internal && url.pathname.startsWith('/capitulo/');
        return <a key={index} href={internal ? url.pathname + url.search + url.hash : url.href}
          target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noreferrer'} className="text-pink-200 underline">
          {chapter ? 'Ler capítulo no Nooklie' : piece}
        </a>;
      })}
    </div>
  );
}

/* =========================================================
   MEDIA
========================================================= */

function PostMedia({
  post,
  expanded,
}: {
  post: Post;
  expanded: boolean;
}) {
  const media =
    getPostMedia(post);

  if (!media.length) {
    return null;
  }

  if (media.length === 1) {
    const item = media[0];
    if (item.media_type === 'video') return <FeedVideo id={item.id} />;

    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <img
          loading="lazy"
          src={contentMediaUrl(item.media_url, expanded ? undefined : 'feed')}
          alt=""
          className="max-h-[360px] w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      {media.map((item) => item.media_type === 'video' ? (
        <FeedVideo key={item.id} id={item.id} />
      ) : (
        <div
          key={item.id}
          className="aspect-[4/3] overflow-hidden bg-black/40"
        >
          <img
            loading="lazy"
            src={contentMediaUrl(item.media_url, expanded ? undefined : 'feed')}
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

function CommentItem({ comment, children, onReply, onChange }: {
  comment: Comment;
  children?: React.ReactNode;
  onReply: (comment: Comment) => void;
  onChange: (comment: Comment) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function toggle(action: 'like' | 'save') {
    const enabled = action === 'like' ? !comment.liked : !comment.saved;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/nook-comments/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action, enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChange(action === 'like' ? { ...comment, liked: enabled, likes: Math.max(0, comment.likes + (enabled ? 1 : -1)) }
        : { ...comment, saved: enabled });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível atualizar a resposta.');
    } finally {
      setPending(false);
    }
  }

  return <article id={'reply-' + comment.id} className="feed-reply scroll-mt-16 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
    <div className="flex gap-3">
      <Avatar profile={comment.author} size="small" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {comment.author ? <Link href={'/perfil/' + encodeURIComponent(comment.author.username)} className="font-bold hover:text-pink-200">
            {comment.author.display_name || comment.author.username}<AccountBadge account={comment.author} />
            <span className="ml-2 text-xs font-normal text-white/60">@{comment.author.username}</span>
          </Link> : <span>Usuário</span>}
          <span className="text-xs text-white/55">{formatPostDateTime(comment.created_at)}</span>
        </div>
        <PostBody body={comment.content} />
        {comment.image_url && <img loading="lazy" src={contentMediaUrl(comment.image_url, 'feed')} alt="Imagem anexada à resposta" className="mt-3 max-h-80 w-full rounded-xl object-contain" />}
        <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-white/70">
          <button type="button" className="min-h-10 hover:text-pink-200" onClick={() => onReply(comment)}>Responder</button>
          <button type="button" className="min-h-10 hover:text-pink-200 aria-pressed:text-pink-300" disabled={pending} aria-pressed={comment.liked} onClick={() => void toggle('like')}>{comment.liked ? 'Curtido' : 'Curtir'}{comment.likes > 0 && ' · ' + comment.likes}</button>
          <a className="inline-flex min-h-10 items-center hover:text-pink-200" href={`/feed?quotePost=${comment.post_id}&quoteReply=${comment.id}`}>Nooklar</a>
          <button type="button" className="min-h-10 hover:text-pink-200 aria-pressed:text-pink-300" disabled={pending} aria-pressed={comment.saved} onClick={() => void toggle('save')}>{comment.saved ? 'Salva' : 'Salvar'}</button>
        </div>
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      </div>
    </div>
    {children}
  </article>;
}

/* =========================================================
   POST CARD
========================================================= */

function FeedPost({
  post,
  onPostUpdated,
  onPostDeleted,
  viewerId,
  expanded=false,
}: {
  post: Post;
  expanded?:boolean;
  viewerId?: string;
  onPostDeleted: (postId: string) => void;
  onPostUpdated: (
    postId: string,
    changes: Partial<Post>
  ) => void;
}) {
  const [
    commentsOpen,
    setCommentsOpen,
  ] = useState(expanded);

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

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function deletePost() {
    if (deleting || !window.confirm('Apagar esta publicação? As respostas e as nookladas dela também serão removidas.')) return;
    setDeleteError('');
    setDeleting(true);
    try {
      const response = await fetch('/api/nook-posts/' + encodeURIComponent(post.id), { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Não foi possível apagar a publicação.');
      }
      onPostDeleted(post.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Não foi possível apagar a publicação.');
      setDeleting(false);
    }
  }

  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentError, setCommentError] = useState('');
  const replyInput = useRef<HTMLTextAreaElement>(null);

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
        setCommentError(error instanceof Error ? error.message : 'Não foi possível carregar as respostas.');
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

  async function submitComment() {
    const content =
      commentText.trim();

    if ((!content && !commentImage) || sendingComment) return;

    setSendingComment(true);
    setCommentError('');
    try {
      const form = new FormData();
      form.set('post_id', post.id);
      form.set('content', content);
      if (replyingTo) form.set('parent_id', replyingTo.id);
      if (commentImage) form.set('image', commentImage);
      const response = await fetch('/api/nook-comments', { method: 'POST', body: form });

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
      setCommentImage(null);
      setReplyingTo(null);
      setCommentsOpen(true);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Não foi possível enviar a resposta.');
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

  const mainComments = commentsByParent.get(null) || [];

  useEffect(() => {
    if (!expanded || !comments.length) return;
    const reply = new URL(window.location.href).searchParams.get('reply');
    if (reply) document.getElementById('reply-' + reply)?.scrollIntoView({ block: 'start' });
  }, [expanded, comments.length]);

  function renderComment(comment: Comment, depth = 0): React.ReactNode {
    const replies = commentsByParent.get(comment.id) || [];
    return <CommentItem key={comment.id} comment={comment}
      onChange={updated => setComments(current => current.map(item => item.id === updated.id ? updated : item))}
      onReply={target => { setReplyingTo(target); replyInput.current?.focus(); }}>
      {replies.length > 0 && <div className={depth < 2 ? 'ml-4 border-l border-pink-200/20 pl-3 sm:ml-6' : ''}>
        {replies.map(reply => renderComment(reply, depth + 1))}
      </div>}
    </CommentItem>;
  }

  return (
    <article className="feed-post" onClick={e=>{if(!expanded && e.target instanceof Element && !e.target.closest('a,button,input,textarea,dialog,video,audio,details,label'))window.dispatchEvent(new CustomEvent('nooklie:open-post',{detail:post.id}));}}>
      {post.repost&&<div className="border-b border-white/10 px-5 py-4"><RepostAttribution author={post.repost.author} comment={post.repost.comment}/></div>}
      <div className="feed-post-content">
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

                  <AccountBadge account={post.author} />
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

              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {expanded ? (
                  <time dateTime={post.created_at} className="text-[10px] text-white/65 sm:text-xs">
                    {formatPostDateTime(post.created_at)}
                  </time>
                ) : (
                  <a
                    href={'/feed?post=' + encodeURIComponent(post.id)}
                    aria-label="Abrir publicação"
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      window.dispatchEvent(new CustomEvent('nooklie:open-post', { detail: post.id }));
                    }}
                    className="text-[10px] text-white/65 hover:text-pink-200 sm:text-xs"
                  >
                    <time dateTime={post.created_at}>{formatPostDateTime(post.created_at)}</time>
                  </a>
                )}
                {viewerId === post.user_id && !post.repost && <details className="relative">
                  <summary aria-label="Opções da publicação" className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-white/65 hover:bg-white/10 hover:text-pink-200 focus-visible:outline-2 focus-visible:outline-pink-300 [&::-webkit-details-marker]:hidden">
                    <Ellipsis aria-hidden="true" className="size-5" />
                  </summary>
                  <div className="absolute right-0 top-full z-20 w-52 rounded-xl border border-pink-200/20 bg-[#221521] p-1 shadow-xl">
                    <button type="button" disabled={deleting} onClick={() => void deletePost()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-200 hover:bg-rose-300/10 disabled:opacity-50">
                      <Trash2 aria-hidden="true" className="size-4 shrink-0" />
                      {deleting ? 'Apagando…' : 'Apagar publicação'}
                    </button>
                  </div>
                </details>}
              </div>
            </div>
          </div>
        </div>

        {deleteError && <p role="alert" className="mt-2 text-sm text-rose-200">{deleteError}</p>}
        <PostBody body={post.body} />{post.story_id && <LinkedStoryCard storyId={post.story_id}/>}<LinkedNewsCard slug={post.news_slug}/>

        <PostMedia post={post} expanded={expanded} />

        <div className="feed-post-actions">
          <button
            type="button"
            onClick={toggleLike}
            aria-label="Curtir publicação"
            aria-pressed={liked}
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
            aria-label="Comentários da publicação"
            aria-expanded={commentsOpen}
            onClick={() => expanded ? replyInput.current?.focus() :
              window.dispatchEvent(new CustomEvent('nooklie:open-post', { detail: post.id }))}
            className="group flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-xl px-3 text-white/45 transition hover:bg-white/[0.04] hover:text-[#ff78b9]"
          >
            <CommentIcon />

            {post.comments_count > 0 && (
              <span className="text-[11px] font-semibold">
                {post.comments_count}
              </span>
            )}
          </button>

          <RepostActions postId={post.id}/>

          <button
            type="button"
            onClick={toggleSave}
            aria-label={post.saved?"Remover dos salvos":"Salvar publicação"}
            aria-pressed={post.saved}
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
        <div className="border-t border-white/10 bg-black/15 px-3 py-5 sm:px-6">
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

          <h2 className="mb-4 text-lg font-bold">Respostas</h2>
          {commentError && <p role="alert" className="mb-2 text-sm text-rose-200">{commentError}</p>}
          <div className="mb-3 flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff78b9]/20 text-xs font-black text-[#ff78b9]">
              N
            </div>

            <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2">
              <textarea
                ref={replyInput}
                aria-label="Escrever resposta"
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
                  (!commentText.trim() && !commentImage) ||
                  sendingComment
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff78b9] text-[#190d16] transition hover:brightness-110 disabled:opacity-30"
              >
                <SendIcon />
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl border border-white/15 px-3 py-2 text-sm text-pink-200">
              Anexar imagem
              <input type="file" className="sr-only" accept={feedImageTypes.join(',')} disabled={sendingComment} onChange={event => {
                const image = event.target.files?.[0];
                if (image && (!feedImageTypes.includes(image.type) || image.size > maxFeedUploadBytes)) {
                  setCommentError('Escolha uma imagem JPG, PNG, WebP ou GIF de até 4 MB.');
                } else if (image) { setCommentImage(image); setCommentError(''); }
                event.target.value = '';
              }} />
            </label>
            {commentImage && <button type="button" disabled={sendingComment} onClick={() => setCommentImage(null)} className="break-all text-sm text-pink-200">{commentImage.name} · Remover</button>}
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
              {mainComments.map(comment => renderComment(comment))}
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
                'Usuário'}<AccountBadge account={currentUser} />
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
                  'Usuário'}<AccountBadge account={currentUser} />
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
  status,
  onRetry,
  onClose,
}: {
  open: boolean;
  updates: UpcomingUpdate[];
  status: CalendarStatus;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      id="feed-updates-calendar"
      aria-label="Calendário de atualizações"
      className="m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-[520px] overflow-y-auto overscroll-contain rounded-[26px] border border-pink-200/20 bg-[#17101b] p-0 text-white backdrop:bg-black/70"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {open && <UpcomingUpdatesCalendar updates={updates} status={status} onRetry={onRetry} onClose={onClose} />}
    </dialog>
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

                        <AccountBadge account={user} />
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
  const detailDialog = useRef<HTMLDialogElement>(null);
  const deletedPostIds = useRef(new Set<string>());
  const [deleteNotice, setDeleteNotice] = useState('');
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [quoteBody, setQuoteBody] = useState('');
  useEffect(() => {
    let controller: AbortController | undefined;
    async function open(id: string) {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setDetailLoading(true);
      setDetailError('');
      setDetailPost(null);
      if (!detailDialog.current?.open) detailDialog.current?.showModal();
      try {
        const response = await fetch('/api/nook-posts/detail?id=' + encodeURIComponent(id), { cache: 'no-store', signal: request.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Publicação indisponível.');
        setDetailPost(data.post);
        const url = new URL(window.location.href);
        url.searchParams.set('post', id);
        window.history.replaceState(null, '', url);
      } catch (error) {
        if (!request.signal.aborted) setDetailError(error instanceof Error ? error.message : 'Não foi possível abrir.');
      } finally {
        if (!request.signal.aborted) setDetailLoading(false);
      }
    }
    const handler = (event: Event) => void open((event as CustomEvent<string>).detail);
    window.addEventListener('nooklie:open-post', handler);
    const url = new URL(window.location.href);
    const tag = normalizeHashtag(url.searchParams.get('tag') || '');
    setActiveTag(tag);
    setTagInput(tag);
    const post = url.searchParams.get('post') || url.hash.match(/^#post-(.+)$/)?.[1];
    if (post) void open(post);
    const quotePost = url.searchParams.get('quotePost');
    const quoteReply = url.searchParams.get('quoteReply');
    if (quotePost && quoteReply && [quotePost, quoteReply].every(value => /^[0-9a-f-]{36}$/i.test(value))) {
      const link = new URL('/feed', url.origin);
      link.searchParams.set('post', quotePost);
      link.searchParams.set('reply', quoteReply);
      setQuoteBody(link.href);
      setComposerOpen(true);
      url.searchParams.delete('quotePost');
      url.searchParams.delete('quoteReply');
      window.history.replaceState(null, '', url);
    }
    return () => { controller?.abort(); window.removeEventListener('nooklie:open-post', handler); };
  }, []);

  const [posts, setPosts] =
    useState<Post[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const feedRequest = useRef<AbortController | null>(null);

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
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>('loading');
  const calendarRequest = useRef<AbortController | null>(null);

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
            '/api/auth/me?summary=1',
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

  const loadFeed = useCallback(async (showRefresh = false, before?: string) => {
    if (activeTag === null || (before && feedRequest.current)) return;
    feedRequest.current?.abort();
    const controller = new AbortController();
    feedRequest.current = controller;
    setLoadingOlder(Boolean(before));
    setRefreshing(showRefresh);
    setLoading(!before && !showRefresh);
    if (!before && !showRefresh) setFeedCursor(null);
    setError('');

    try {
      const params = new URLSearchParams();
      if (activeTag) params.set('tag', activeTag);
      if (before) params.set('before', before);
      const query = params.toString();
      const response = await fetch(query ? '/api/feed?' + query : '/api/feed', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o Feed.');
      if (controller.signal.aborted) return;
      const incoming: Post[] = data.posts || [];
      setPosts(current => {
        const seen = new Set(before ? current.map(post => post.repost?.id || post.id) : []);
        const fresh = incoming.filter(post =>
          !deletedPostIds.current.has(post.id) && !seen.has(post.repost?.id || post.id));
        return before ? [...current, ...fresh] : fresh;
      });
      setFeedCursor(data.next_cursor ?? null);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o Feed.');
      }
    } finally {
      if (feedRequest.current === controller) {
        feedRequest.current = null;
        setLoading(false);
        setRefreshing(false);
        setLoadingOlder(false);
      }
    }
  }, [activeTag]);

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

  const loadUpcomingUpdates = useCallback(async () => {
    calendarRequest.current?.abort();
    const request = new AbortController();
    calendarRequest.current = request;
    setCalendarStatus('loading');
    try {
      const response = await fetch('/api/upcoming-updates', { cache: 'no-store', signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 401) {
        setUpcomingUpdates([]);
        setCalendarStatus('signed-out');
        return;
      }
      if (!response.ok) throw Error('Falha ao carregar o calendário.');
      const data = await response.json();
      if (request.signal.aborted) return;
      setUpcomingUpdates(Array.isArray(data.updates) ? data.updates : []);
      setCalendarStatus('ready');
    } catch {
      if (request.signal.aborted) return;
      setUpcomingUpdates([]);
      setCalendarStatus('error');
    }
  }, []);

  /* =======================================================
     CARREGAMENTO INICIAL
  ======================================================= */

  useEffect(() => {
    loadCurrentUser();
    loadStories();
    loadUpcomingUpdates();
    return () => calendarRequest.current?.abort();
  }, [loadCurrentUser, loadStories, loadUpcomingUpdates]);

  useEffect(() => {
    void loadFeed();
    return () => {
      feedRequest.current?.abort();
      feedRequest.current = null;
    };
  }, [loadFeed]);

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

  useEffect(()=>{const refresh=()=>void loadFeed(true);window.addEventListener('nooklie:reposts-changed',refresh);return()=>window.removeEventListener('nooklie:reposts-changed',refresh);},[loadFeed]);
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

  function removePost(postId: string) {
    deletedPostIds.current.add(postId);
    setPosts(current => current.filter(post => post.id !== postId));
    setDetailPost(current => current?.id === postId ? null : current);
    if (detailDialog.current?.dataset.postId === postId) detailDialog.current.close();
    setDeleteNotice('Publicação apagada.');
  }

  const greetingName =
    currentUser?.username ||
    currentUser?.display_name ||
    'escritor';

  return (
    <main data-social-page="feed" className="feed-page min-h-screen text-white">

      {/* =================================================
          DESKTOP MENU
      ================================================= */}

      <MobileCalendarModal
        open={calendarOpen}
        updates={upcomingUpdates}
        status={calendarStatus}
        onRetry={loadUpcomingUpdates}
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
        <div className="mx-auto max-w-[980px]">
          {/* =================================================
              TOP BAR
          ================================================= */}

          <header className="feed-heading">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-pink-200">Comunidade Nooklie</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Seu Feed</h1>
              <p className="mt-2 text-sm text-white/75">Conversas, histórias e novidades de quem escreve.</p>
            </div>
            <div className="flex shrink-0 gap-1 sm:gap-2">
              <button type="button" aria-label="Pesquisar pessoas" onClick={() => setSearchOpen(true)} className="shell-icon"><SearchIcon /></button>
              <button type="button" aria-label="Atualizar Feed" onClick={() => { loadFeed(true); loadStories(); loadUpcomingUpdates(); }} disabled={refreshing} className="shell-icon"><RefreshIcon /></button>
            </div>
          </header>
          <p role="status" className={deleteNotice ? 'mb-3 text-sm text-pink-200' : 'sr-only'}>{deleteNotice}</p>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form className="flex min-w-0 items-center gap-2" action="/feed">
              <input name="tag" aria-label="Buscar hashtag no feed" maxLength={65} placeholder="# Buscar hashtag" value={tagInput} onChange={event => setTagInput(event.target.value)} className="nook-input min-w-0" />
              <button className="discovery-secondary">Buscar</button>
            </form>
            <Link href="/respostas-salvas" className="text-sm text-pink-200 hover:underline">Respostas salvas</Link>
            {activeTag && <a href="/feed" className="rounded-full border border-pink-300/30 px-3 py-2 text-sm text-pink-200">#{activeTag} · Limpar filtro</a>}
          </div>

          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            aria-haspopup="dialog"
            aria-controls="feed-updates-calendar"
            aria-expanded={calendarOpen}
            className="mb-6 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-[#ff9bca]/25 bg-gradient-to-r from-[#ff78b9]/15 to-[#c798e6]/10 px-4 py-4 text-left transition hover:border-[#ff9bca]/50 hover:bg-[#ff78b9]/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9bca] xl:hidden"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff9bca]/15 text-[#ff9bca]"><CalendarIcon /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#ffd1e7]">Calendário de atualizações</span><span className="mt-1 block text-xs leading-5 text-white/60">Veja os próximos capítulos dos autores que você segue.</span></span>
            {upcomingUpdates.length > 0 && <span aria-label={`${upcomingUpdates.length} atualizações agendadas`} className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-[#ff9bca] px-2 text-xs font-bold text-[#25121e]">{upcomingUpdates.length}</span>}
          </button>

          {/* =================================================
              HERO / BOAS-VINDAS
          ================================================= */}

          {/* =================================================
              STORIES
          ================================================= */}

          <div id="stories" className="scroll-mt-24"><StoriesRow
            stories={stories}
            onOpen={setActiveStory}
            onCreateStory={() =>
              setStoryComposerOpen(true)
            }
          /></div>

          {/* =================================================
              LAYOUT
          ================================================= */}

          <div className="flex items-start justify-center gap-7">
            {/* =================================================
                COLUNA CENTRAL
            ================================================= */}

            <div className="w-full max-w-[680px]">
              {/* CREATE POST */}

              <button type="button" onClick={()=>setComposerOpen(true)} className="feed-compose"><Avatar profile={currentUser}/><span>O que você quer compartilhar?</span><span className="feed-compose-plus" aria-hidden="true">+</span></button>
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

              <h2 className="sr-only">Publicações da comunidade</h2>
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
                <div className="feed-post-list">
                  {posts.map(
                    (post) => (
                      <FeedPost
                        key={post.repost?.id||post.id}
                        post={post}
                        viewerId={currentUser?.id}
                        onPostDeleted={removePost}
                        onPostUpdated={
                          updatePost
                        }
                      />
                    )
                  )}
                </div>
              )}
              {!loading && feedCursor && (
                <button
                  type="button"
                  disabled={loadingOlder || refreshing}
                  onClick={() => void loadFeed(false, feedCursor)}
                  className="mt-5 min-h-11 w-full rounded-full border border-pink-200/20 px-4 font-semibold text-pink-100 disabled:opacity-50"
                >
                  {loadingOlder ? 'Carregando publicações…' : 'Carregar mais publicações'}
                </button>
              )}
            </div>

            {/* =================================================
                LATERAL DIREITA
            ================================================= */}

            <div className="hidden w-[270px] shrink-0 xl:block">
              <div className="sticky top-24 space-y-5">
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
                      href="#stories"
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
                                @{story.user.username}<AccountBadge account={story.user} />
                              </span>
                            </button>
                          )
                        )}
                    </div>
                  )}
                </aside>

                {/* CALENDÁRIO */}

                <aside className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[26px] border border-pink-200/15 bg-[#17101b]">
                  <UpcomingUpdatesCalendar updates={upcomingUpdates} status={calendarStatus} onRetry={loadUpcomingUpdates} />
                </aside>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          NOVA PUBLICAÇÃO
      ===================================================== */}

      <NookPostComposer
        key={quoteBody || 'feed-composer'}
        initialBody={quoteBody}
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setQuoteBody(''); }}
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

      <dialog ref={detailDialog} data-post-id={detailPost?.id} className="nook-dialog feed-detail" aria-labelledby="feed-detail-title" onClose={() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get(notificationReturnParam) === 'notificacoes') {
          window.location.assign(notificationsPath);
          return;
        }
        url.searchParams.delete('post'); url.searchParams.delete('reply'); url.hash = '';
        window.history.replaceState(null, '', url);
      }}>
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#1b121c] p-3">
          <button type="button" onClick={() => detailDialog.current?.close()} className="min-h-11 rounded-full border border-white/15 px-4 text-sm">← Voltar</button>
          <h2 id="feed-detail-title" className="font-bold">Publicação</h2>
        </header>
        {detailLoading&&<p role="status">Carregando publicação…</p>}{detailError&&<p role="alert">{detailError}</p>}{detailPost&&<FeedPost key={detailPost.id} expanded post={detailPost} viewerId={currentUser?.id} onPostDeleted={removePost} onPostUpdated={(id,changes)=>{setDetailPost(old=>old?{...old,...changes}:old);updatePost(id,changes);}}/>}
      </dialog>
    </main>
  );
}
