'use client';
import { PostMentions } from '@/components/PostMention';
import FeedVideo from '@/components/FeedVideo';
import AccountBadge from '@/components/AccountBadge';
import ImageCropDialog from '@/components/ImageCropDialog';
import ProfileStats from '@/components/ProfileStats';
import ProfileBanner from '@/components/ProfileBanner';
import ProfileAppearanceEditor from '@/components/ProfileAppearanceEditor';
import ProfileThemeEditor from '@/components/ProfileThemeEditor';
import { parseProfileThemeCollection, profileThemeVariables, type ProfileThemeCollection } from '@/lib/profile/themes';
import type { ProfileAvatarPosition, ProfileHeaderLayout } from '@/lib/profile/appearance';
import Republicados from '@/components/Republicados';

import { Cloud, MessageCircle, BookOpen, Image as ImageIcon, Pin, Music2 } from 'lucide-react';
import {contentMediaUrl} from '@/lib/security/content-media';
import LinkedNewsCard from '@/components/LinkedNewsCard';
import LinkedStoryCard from '@/components/LinkedStoryCard';
import React, {
  ChangeEvent,
  CSSProperties,
  TouchEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type User = {
  id: string;
  username: string;
  display_name: string | null; verified?: boolean; is_official?: boolean;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
  header_layout?: ProfileHeaderLayout;
  avatar_position?: ProfileAvatarPosition;
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
  fandom?: string | null;
  main_fandom?: string | null;
  fandom_name?: string | null;
};

type SocialStory = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'gif' | 'video';
  created_at: string;
  expires_at: string;
  thought?: string | null;
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

type NookComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    username: string;
    display_name: string | null; verified?: boolean; is_official?: boolean;
    avatar_url: string | null;
  } | null;
};

type ReactionSummary = {
  counts: Record<string, number>;
  user_reactions: string[];
  comments_count: number;
};

type SpotifyPreviewData = {
  title: string;
  thumbnail_url?: string | null;
  author_name?: string | null;
  provider_name?: string | null;
};

type ReadingListItem = {
  id: string;
  story_id: string;
  added_at: string;
  story?: Story | null;
};

type ReadingList = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  items?: ReadingListItem[];
};

type FicClub = {
  id: string;
  story_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  story?: Story | null;
};

type ProfileTab =
  | 'stories'
  | 'nook'
  | 'lists'
  | 'clubs';

const TAB_ORDER: ProfileTab[] = [
  'stories',
  'nook',
  'lists',
  'clubs',
];

const REACTIONS = [
  '❤️',
  '😂',
  '😭',
  '😱',
  '👀',
  '🔥',
];

const MAX_MEDIA = 4;
const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const ACCEPTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const SPOTIFY_URL_REGEX =
  /https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+(?:\?[^\s]+)?/g;

const PRIVATE_THEME_STORAGE_PREFIX =
  'nooklie-profile-theme:';

const PRIVATE_THEME_MIGRATED_PREFIX =
  'nooklie-profile-theme-migrated:';

const DEFAULT_PROFILE_THEME =
  '#ff78b9';

const PROFILE_THEME_OPTIONS = [
  '#ff78b9',
  '#ff9aca',
  '#b77cff',
  '#7c8cff',
  '#62c8ff',
  '#61d6a4',
  '#9be15d',
  '#ffd166',
  '#ff8a65',
  '#e53935',
  '#ffffff',
];

function SpotifyPreview({
  url,
}: {
  url: string;
}) {
  const [preview, setPreview] =
    useState<SpotifyPreviewData | null>(
      null
    );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/spotify-preview?url=${encodeURIComponent(
            url
          )}`
        );

        if (!response.ok) return;

        const data =
          await response.json();

        if (!cancelled && data.preview) {
          setPreview(data.preview);
        }
      } catch {
        // ignore
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block rounded-2xl border border-white/10 bg-[#191219] px-4 py-3 text-xs font-semibold text-[#ff78b9] transition hover:border-[#ff78b9]/30"
      >
        <Music2 className="inline" size={16}/> Ouvir no Spotify
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 flex overflow-hidden rounded-2xl border border-white/10 bg-[#191219] transition hover:border-white/20"
    >
      {preview.thumbnail_url && (
        <img
          src={contentMediaUrl(preview.thumbnail_url)}
          alt=""
          className="h-20 w-20 shrink-0 object-cover"
        />
      )}

      <div className="min-w-0 p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-green-300/60">
          Spotify
        </p>

        <p className="mt-1 truncate text-sm font-bold text-white">
          {preview.title}
        </p>

        {preview.author_name && (
          <p className="mt-1 truncate text-xs text-white/35">
            {preview.author_name}
          </p>
        )}
      </div>
    </a>
  );
}

function renderPostBody(
  body: string
) {
  const parts = body.split(
    SPOTIFY_URL_REGEX
  );

  const urls =
    body.match(SPOTIFY_URL_REGEX) || [];

  return (
    <div className="whitespace-pre-wrap text-sm leading-7 text-white/70">
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          <PostMentions text={part} />

          {index < urls.length && (
            <SpotifyPreview
              url={urls[index]}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function emptyReactionCounts() {
  return REACTIONS.reduce(
    (result, emoji) => {
      result[emoji] = 0;
      return result;
    },
    {} as Record<string, number>
  );
}

export default function PerfilPage() {
  const router = useRouter();

  const avatarInputRef =
    useRef<HTMLInputElement | null>(null);

  const coverInputRef =
    useRef<HTMLInputElement | null>(null);

  const mediaInputRef =
    useRef<HTMLInputElement | null>(null);

  const tabsContainerRef =
    useRef<HTMLDivElement | null>(null);

  const swipeStartX =
    useRef<number | null>(null);

  const [user, setUser] =
    useState<User | null>(null);
  const [themes, setThemes] = useState<ProfileThemeCollection | null>();

  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    fetch('/api/profile/themes', { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok ? parseProfileThemeCollection(await response.json()) : null)
      .then(value => { if (!controller.signal.aborted) setThemes(value); })
      .catch(() => { if (!controller.signal.aborted) setThemes(null); });
    return () => controller.abort();
  }, [user?.id]);

  const [stories, setStories] =
    useState<Story[]>([]);

  const [socialStories, setSocialStories] =
    useState<SocialStory[]>([]);

  const [nookPosts, setNookPosts] =
    useState<NookPost[]>([]);

  const [readingLists, setReadingLists] =
    useState<ReadingList[]>([]);

  const [ficClubs, setFicClubs] =
    useState<FicClub[]>([]);

  const [activeTab, setActiveTab] =
    useState<ProfileTab>('stories');

  const [loading, setLoading] =
    useState(true);

  const [loadingStories, setLoadingStories] =
    useState(true);

  const [loadingNook, setLoadingNook] =
    useState(true);

  const [loadingLists, setLoadingLists] =
    useState(true);

  const [loadingClubs, setLoadingClubs] =
    useState(true);

  const [editing, setEditing] =
    useState(false);

  const [editDisplayName, setEditDisplayName] =
    useState('');
  const [editHeaderLayout, setEditHeaderLayout] = useState<ProfileHeaderLayout>('classic');
  const [editAvatarPosition, setEditAvatarPosition] = useState<ProfileAvatarPosition>('left');

  const [bio, setBio] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [crop, setCrop] = useState<{source: File | string; kind: 'avatar' | 'cover'} | null>(null);
  const [customColor, setCustomColor] = useState('#e53935');
  const [profileTheme, setProfileTheme] =
    useState(DEFAULT_PROFILE_THEME);

  const [savingTheme, setSavingTheme] =
    useState(false);

  const [showThemePicker, setShowThemePicker] =
    useState(false);

  const [newPost, setNewPost] =
    useState('');

  const [selectedStoryId, setSelectedStoryId] =
    useState('');

  const [creatingPost, setCreatingPost] =
    useState(false);

  const [mediaFiles, setMediaFiles] =
    useState<File[]>([]);

  const [mediaPreviews, setMediaPreviews] =
    useState<string[]>([]);

  const [editingNookPostId, setEditingNookPostId] =
    useState<string | null>(null);

  const [editNookBody, setEditNookBody] =
    useState('');

  const [editNookStoryId, setEditNookStoryId] =
    useState('');

  const [savingNookPost, setSavingNookPost] =
    useState(false);

  const [deletingNookPostId, setDeletingNookPostId] =
    useState<string | null>(null);

  const [menuOpenPostId, setMenuOpenPostId] =
    useState<string | null>(null);

  const [reactionData, setReactionData] =
    useState<Record<string, ReactionSummary>>(
      {}
    );

  const [commentsByPost, setCommentsByPost] =
    useState<Record<string, NookComment[]>>(
      {}
    );

  const [commentsOpen, setCommentsOpen] =
    useState<Record<string, boolean>>({});

  const [loadingComments, setLoadingComments] =
    useState<Record<string, boolean>>({});

  const [commentDrafts, setCommentDrafts] =
    useState<Record<string, string>>({});

  const [replyDrafts, setReplyDrafts] =
    useState<Record<string, string>>({});

  const [replyingTo, setReplyingTo] =
    useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] =
    useState<string | null>(null);

  const [editingCommentBody, setEditingCommentBody] =
    useState('');

  const [savingComment, setSavingComment] =
    useState(false);

  const [deletingCommentId, setDeletingCommentId] =
    useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] =
    useState(false);

  const [uploadingCover, setUploadingCover] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    loadStories();
    loadSocialStories();
    loadNookPosts();
    loadListsAndClubs();
  }, [user?.id]);

  async function loadUser() {
    try {
      const response = await fetch(
        '/api/auth/me',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        router.push('/login');
        return;
      }

      const data =
        await response.json();

      if (!data.user) {
        router.push('/login');
        return;
      }

      setUser(data.user);

      setEditDisplayName(
        data.user.display_name ||
          ''
      );

      setBio(
        data.user.bio ||
          ''
      );

      const themeStorageKey =
        `${PRIVATE_THEME_STORAGE_PREFIX}${data.user.id}`;
      const themeMigratedKey =
        `${PRIVATE_THEME_MIGRATED_PREFIX}${data.user.id}`;
      const privateTheme =
        localStorage.getItem(themeStorageKey);
      const themeWasMigrated =
        localStorage.getItem(themeMigratedKey) === 'true';
      const savedTheme =
        typeof data.user.theme_color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(data.user.theme_color)
          ? data.user.theme_color
          : DEFAULT_PROFILE_THEME;

      if (
        !themeWasMigrated &&
        privateTheme &&
        /^#[0-9a-f]{6}$/i.test(privateTheme)
      ) {
        setProfileTheme(privateTheme);

        try {
          const themeResponse = await fetch(
            '/api/profile/update',
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                theme_color: privateTheme,
              }),
            }
          );

          if (themeResponse.ok) {
            localStorage.setItem(themeMigratedKey, 'true');
          }
        } catch {
          // Keep the saved local color visible and retry the sync next time.
        }
      } else {
        setProfileTheme(savedTheme);
        localStorage.setItem(themeStorageKey, savedTheme);
        localStorage.setItem(themeMigratedKey, 'true');
      }
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  async function loadStories() {
    setLoadingStories(true);

    try {
      const response = await fetch(
        '/api/profile/stories',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        setStories([]);
        return;
      }

      const data =
        await response.json();

      setStories(
        Array.isArray(data.stories)
          ? data.stories
          : []
      );
    } catch {
      setStories([]);
    } finally {
      setLoadingStories(false);
    }
  }

  async function loadSocialStories() {
    try {
      const response = await fetch(
        '/api/stories',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        setSocialStories([]);
        return;
      }

      const data =
        await response.json();

      setSocialStories(
        Array.isArray(data.stories)
          ? data.stories
          : []
      );
    } catch {
      setSocialStories([]);
    }
  }

  async function loadNookPosts() {
    setLoadingNook(true);

    try {
      const response = await fetch(
        '/api/nook-posts',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        setNookPosts([]);
        return;
      }

      const data =
        await response.json();

      const posts =
        Array.isArray(data.posts)
          ? sortNookPosts(data.posts)
          : [];

      setNookPosts(posts);

      const summaries: Record<
        string,
        ReactionSummary
      > = {};

      await Promise.all(
        posts.map(async (post) => {
          try {
            const reactionResponse =
              await fetch(
                `/api/nook-posts/reactions?post_id=${encodeURIComponent(
                  post.id
                )}`,
                {
                  cache: 'no-store',
                }
              );

            if (!reactionResponse.ok)
              return;

            const reaction =
              await reactionResponse.json();

            summaries[post.id] =
              reaction.summary || {
                counts:
                  emptyReactionCounts(),
                user_reactions: [],
                comments_count: 0,
              };
          } catch {
            // ignore
          }
        })
      );

      setReactionData(summaries);
    } catch {
      setNookPosts([]);
    } finally {
      setLoadingNook(false);
    }
  }

  async function loadListsAndClubs() {
    if (!user) return;

    setLoadingLists(true);
    setLoadingClubs(true);

    try {
      const response = await fetch(
        `/api/public-profile/${encodeURIComponent(
          user.username
        )}`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        setReadingLists([]);
        setFicClubs([]);
        return;
      }

      const data =
        await response.json();

      setReadingLists(
        Array.isArray(data.reading_lists)
          ? data.reading_lists
          : Array.isArray(data.readingLists)
            ? data.readingLists
            : []
      );

      setFicClubs(
        Array.isArray(data.fic_clubs)
          ? data.fic_clubs
          : Array.isArray(data.ficClubs)
            ? data.ficClubs
            : []
      );
    } catch {
      setReadingLists([]);
      setFicClubs([]);
    } finally {
      setLoadingLists(false);
      setLoadingClubs(false);
    }
  }

  function changeTab(tab: ProfileTab) {
    setActiveTab(tab);
  }

  function handleTabSwipeStart(
    event: TouchEvent<HTMLDivElement>
  ) {
    swipeStartX.current =
      event.touches[0]?.clientX ?? null;
  }

  function handleTabSwipeEnd(
    event: TouchEvent<HTMLDivElement>
  ) {
    if (
      swipeStartX.current === null
    ) {
      return;
    }

    const endX =
      event.changedTouches[0]?.clientX ??
      null;

    if (endX === null) {
      swipeStartX.current = null;
      return;
    }

    const distance =
      endX - swipeStartX.current;

    swipeStartX.current = null;

    if (Math.abs(distance) < 50) {
      return;
    }

    const currentIndex =
      TAB_ORDER.indexOf(activeTab);

    if (
      distance < 0 &&
      currentIndex <
        TAB_ORDER.length - 1
    ) {
      changeTab(
        TAB_ORDER[currentIndex + 1]
      );
    } else if (
      distance > 0 &&
      currentIndex > 0
    ) {
      changeTab(
        TAB_ORDER[currentIndex - 1]
      );
    }
  }

  function openEditor() {
    if (!user) return;

    setEditDisplayName(
      user.display_name || ''
    );

    setBio(user.bio || '');
    setEditHeaderLayout(user.header_layout ?? 'classic');
    setEditAvatarPosition(user.avatar_position ?? 'left');
    setError('');
    setSuccess('');
    setCustomColor(profileTheme);
    setEditing(true);
  }

  function closeEditor() {
    if (saving) return;

    setEditing(false);
    setError('');
    setSuccess('');
  }

  async function handleSave() {
    if (saving || !user) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        '/api/profile/update',
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            display_name:
              editDisplayName,
            bio,
            header_layout: editHeaderLayout !== (user.header_layout ?? 'classic') ? editHeaderLayout : undefined,
            avatar_position: editAvatarPosition !== (user.avatar_position ?? 'left') ? editAvatarPosition : undefined,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível salvar as alterações.'
        );
        return;
      }

      setUser(current => current ? { ...current, ...data.user } : current);

      setSuccess(
        'Perfil atualizado com sucesso.'
      );

      setTimeout(() => {
        setEditing(false);
        setSuccess('');
      }, 900);
    } catch {
      setError(
        'Não foi possível salvar as alterações. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleThemeChange(
    color: string
  ) {
    if (
      !user ||
      savingTheme ||
      !/^#[0-9a-f]{6}$/i.test(color)
    ) return;

    const previousTheme = profileTheme;
    setSavingTheme(true);
    setProfileTheme(color);
    setShowThemePicker(false);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        '/api/profile/update',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            theme_color: color,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.user) {
        setProfileTheme(previousTheme);
        setError(
          data.error ||
            'Não foi possível salvar a cor do perfil. Tente novamente.'
        );
        return;
      }

      setUser(current => current ? { ...current, ...data.user } : current);
      localStorage.setItem(
        `${PRIVATE_THEME_STORAGE_PREFIX}${user.id}`,
        color
      );
      localStorage.setItem(
        `${PRIVATE_THEME_MIGRATED_PREFIX}${user.id}`,
        'true'
      );
      setSuccess('A cor do perfil foi salva.');

      setTimeout(() => {
        setSuccess('');
      }, 2500);
    } catch {
      setProfileTheme(previousTheme);
      setError(
        'Não foi possível salvar a cor do perfil. Tente novamente.'
      );
    } finally {
      setSavingTheme(false);
    }
  }

  function openAvatarPicker() {
    if (uploadingAvatar) return;

    setError('');
    setSuccess('');

    avatarInputRef.current?.click();
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setCrop({ source: file, kind: 'avatar' });
    event.target.value = '';
  }

  async function saveCroppedImage(file: File) {
    if (!crop) return;
    const kind = crop.kind;
    const setUploading = kind === 'avatar' ? setUploadingAvatar : setUploadingCover;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/profile/' + kind, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a imagem.');
      setUser(current => current ? { ...current, [kind + '_url']: data[kind + '_url'] } : current);
      setSuccess(kind === 'avatar' ? 'Foto de perfil atualizada.' : 'Capa atualizada.');
      setCrop(null);
    } finally { setUploading(false); }
  }

  function openCoverPicker() {
    if (uploadingCover) return;

    setError('');
    setSuccess('');

    coverInputRef.current?.click();
  }

  function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setCrop({ source: file, kind: 'cover' });
    event.target.value = '';
  }

  function handleMediaSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selected =
      Array.from(
        event.target.files || []
      );

    if (!selected.length)
      return;

    setError('');

    setMediaFiles(
      (current) => {
        const availableSlots =
          MAX_MEDIA -
          current.length;

        if (availableSlots <= 0) {
          setError(
            'Você pode adicionar no máximo 4 imagens ou GIFs por post.'
          );

          return current;
        }

        const validFiles: File[] =
          [];

        for (const file of selected) {
          if (
            !ACCEPTED_MEDIA_TYPES.includes(
              file.type
            )
          ) {
            setError(
              'Use apenas JPG, PNG, WEBP ou GIF.'
            );
            continue;
          }

          if (
            file.size >
            MAX_FILE_SIZE
          ) {
            setError(
              'Cada imagem pode ter no máximo 10 MB.'
            );
            continue;
          }

          validFiles.push(file);
        }

        if (
          validFiles.length >
          availableSlots
        ) {
          setError(
            'Você pode adicionar no máximo 4 imagens ou GIFs por post.'
          );
        }

        return [
          ...current,
          ...validFiles.slice(
            0,
            availableSlots
          ),
        ];
      }
    );

    if (
      mediaInputRef.current
    ) {
      mediaInputRef.current.value =
        '';
    }
  }

  function removeMedia(
    index: number
  ) {
    setMediaFiles(
      (current) =>
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index
        )
    );
  }

  useEffect(() => {
    const urls =
      mediaFiles.map((file) =>
        URL.createObjectURL(file)
      );

    setMediaPreviews(urls);

    return () => {
      urls.forEach((url) =>
        URL.revokeObjectURL(url)
      );
    };
  }, [mediaFiles]);

  async function uploadPostMedia(
    postId: string
  ) {
    const uploaded: PostMedia[] =
      [];

    for (const file of mediaFiles) {
      const formData =
        new FormData();

      formData.append(
        'file',
        file
      );

      formData.append(
        'post_id',
        postId
      );

      const response = await fetch(
        '/api/nook-posts/media',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível enviar uma das mídias.'
        );
      }

      if (data.media) {
        uploaded.push(
          data.media
        );
      }
    }

    return uploaded;
  }

  async function handleCreateNookPost() {
    const text =
      newPost.trim();

    if (
      !text &&
      mediaFiles.length === 0
    ) {
      setError(
        'Escreva alguma coisa ou adicione uma imagem/GIF.'
      );
      return;
    }

    if (text.length > 5000) {
      setError(
        'O post pode ter no máximo 5000 caracteres.'
      );
      return;
    }

    setCreatingPost(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        '/api/nook-posts',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            body: text,
            image_url: null,
            story_id:
              selectedStoryId ||
              null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível publicar o post.'
        );
        return;
      }

      let createdPost =
        data.post as NookPost;

      if (mediaFiles.length > 0) {
        try {
          const uploaded =
            await uploadPostMedia(
              createdPost.id
            );

          createdPost = {
            ...createdPost,
            media: uploaded,
          };
        } catch (mediaError) {
          console.error(
            'Erro ao enviar mídias:',
            mediaError
          );

          setError(
            'O post foi criado, mas não foi possível enviar todas as mídias.'
          );
        }
      }

      setNookPosts(
        (currentPosts) =>
          sortNookPosts([
            createdPost,
            ...currentPosts,
          ])
      );

      setReactionData(
        (current) => ({
          ...current,
          [createdPost.id]: {
            counts:
              emptyReactionCounts(),
            user_reactions: [],
            comments_count: 0,
          },
        })
      );

      setNewPost('');
      setSelectedStoryId('');
      setMediaFiles([]);
      setMediaPreviews([]);

      setSuccess(
        'Post publicado no seu Nook!'
      );

      setTimeout(() => {
        setSuccess('');
        setError('');
      }, 2500);
    } catch (error) {
      console.error(error);

      setError(
        'Não foi possível publicar o post. Tente novamente.'
      );
    } finally {
      setCreatingPost(false);
    }
  }

  function getStoryTitle(
    storyId: string | null
  ) {
    if (!storyId) return null;

    const story = stories.find(
      (item) =>
        item.id === storyId
    );

    return story?.title || null;
  }

  function startEditNookPost(
    post: NookPost
  ) {
    setEditingNookPostId(
      post.id
    );

    setEditNookBody(
      post.body
    );

    setEditNookStoryId(
      post.story_id || ''
    );

    setMenuOpenPostId(null);
    setError('');
    setSuccess('');
  }

  function cancelEditNookPost() {
    if (savingNookPost) return;

    setEditingNookPostId(null);
    setEditNookBody('');
    setEditNookStoryId('');
  }

  async function handleSaveNookPostEdit() {
    if (!editingNookPostId)
      return;

    const post = nookPosts.find(
      (item) =>
        item.id ===
        editingNookPostId
    );

    const text =
      editNookBody.trim();

    if (
      !text &&
      !post?.image_url &&
      !post?.media?.length
    ) {
      setError(
        'O post não pode ficar vazio.'
      );
      return;
    }

    if (text.length > 5000) {
      setError(
        'O post pode ter no máximo 5000 caracteres.'
      );
      return;
    }

    setSavingNookPost(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `/api/nook-posts/${editingNookPostId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            body: text,
            story_id:
              editNookStoryId ||
              null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível editar o post.'
        );
        return;
      }

      if (data.post) {
        setNookPosts(
          (currentPosts) =>
            sortNookPosts(
              currentPosts.map(
                (currentPost) =>
                  currentPost.id ===
                  data.post.id
                    ? {
                        ...data.post,
                        media:
                          currentPost.media,
                      }
                    : currentPost
              )
            )
        );
      }

      setEditingNookPostId(null);
      setEditNookBody('');
      setEditNookStoryId('');

      setSuccess(
        'Post atualizado com sucesso.'
      );

      setTimeout(() => {
        setSuccess('');
      }, 2000);
    } catch {
      setError(
        'Não foi possível editar o post. Tente novamente.'
      );
    } finally {
      setSavingNookPost(false);
    }
  }

  async function handleTogglePinNookPost(
    post: NookPost
  ) {
    setMenuOpenPostId(null);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `/api/nook-posts/${post.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            pinned: !post.pinned,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível alterar o post.'
        );
        return;
      }

      if (data.post) {
        setNookPosts(
          (currentPosts) =>
            sortNookPosts(
              currentPosts.map(
                (currentPost) =>
                  currentPost.id ===
                  data.post.id
                    ? {
                        ...data.post,
                        media:
                          currentPost.media,
                      }
                    : currentPost
              )
            )
        );
      }

      setSuccess(
        post.pinned
          ? 'Post desafixado.'
          : 'Post fixado no seu Nook.'
      );

      setTimeout(() => {
        setSuccess('');
      }, 2000);
    } catch {
      setError(
        'Não foi possível alterar o post. Tente novamente.'
      );
    }
  }

  async function handleDeleteNookPost(
    postId: string
  ) {
    setMenuOpenPostId(null);
    setDeletingNookPostId(postId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `/api/nook-posts/${postId}`,
        {
          method: 'DELETE',
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível excluir o post.'
        );
        return;
      }

      setNookPosts(
        (currentPosts) =>
          currentPosts.filter(
            (post) =>
              post.id !== postId
          )
      );

      setReactionData(
        (current) => {
          const copy = {
            ...current,
          };

          delete copy[postId];

          return copy;
        }
      );

      setCommentsByPost(
        (current) => {
          const copy = {
            ...current,
          };

          delete copy[postId];

          return copy;
        }
      );

      setSuccess(
        'Post excluído com sucesso.'
      );

      setTimeout(() => {
        setSuccess('');
      }, 2000);
    } catch {
      setError(
        'Não foi possível excluir o post. Tente novamente.'
      );
    } finally {
      setDeletingNookPostId(null);
    }
  }

  function getPostMedia(
    post: NookPost
  ) {
    if (
      post.media &&
      post.media.length > 0
    ) {
      return [...post.media]
        .sort((a, b) => {
          if (
            !a.created_at ||
            !b.created_at
          ) {
            return 0;
          }

          return (
            new Date(
              a.created_at
            ).getTime() -
            new Date(
              b.created_at
            ).getTime()
          );
        })
        .slice(0, MAX_MEDIA);
    }

    if (post.image_url) {
      return [
        {
          id: `legacy-${post.id}`,
          post_id: post.id,
          media_url:
            post.image_url,
          media_type:
            'image' as const,
        },
      ];
    }

    return [];
  }

  function renderPostMedia(
    post: NookPost
  ) {
    const media =
      getPostMedia(post);

    if (!media.length) {
      return null;
    }

    const count = Math.min(
      media.length,
      MAX_MEDIA
    );

    return (
      <div
        className={`mt-4 overflow-hidden rounded-2xl ${
          count === 1
            ? ''
            : 'grid grid-cols-2 gap-1'
        }`}
      >
        {media.map(
          (item, index) => item.media_type === 'video' ? <FeedVideo key={item.id} id={item.id} /> : (
            <div
              key={item.id}
              className={`relative overflow-hidden bg-[#191219] ${
                count === 1
                  ? 'max-h-[340px]'
                  : count === 3 &&
                      index === 0
                    ? 'row-span-2 aspect-square'
                    : 'aspect-square'
              }`}
            >
              <img
                src={contentMediaUrl(item.media_url)}
                alt=""
                className="max-h-[340px] w-full object-contain"
                loading="lazy"
              />
            </div>
          )
        )}
      </div>
    );
  }

  async function handleReaction(
    postId: string,
    emoji: string
  ) {
    try {
      const response = await fetch(
        '/api/nook-posts/reactions',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            emoji,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível reagir ao post.'
        );
        return;
      }

      const refreshed = await fetch('/api/nook-posts/reactions?post_id='+encodeURIComponent(postId), {cache:'no-store'});
      const summary = refreshed.ok ? (await refreshed.json()).summary : null;
      if (summary) {
        setReactionData(
          (current) => ({
            ...current,
            [postId]:
              summary,
          })
        );
      }
    } catch {
      setError(
        'Não foi possível reagir ao post.'
      );
    }
  }

  async function loadComments(
    postId: string
  ) {
    setLoadingComments(
      (current) => ({
        ...current,
        [postId]: true,
      })
    );

    try {
      const response = await fetch(
        `/api/nook-posts/comments?post_id=${encodeURIComponent(
          postId
        )}`,
        {
          cache: 'no-store',
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível carregar os comentários.'
        );
        return;
      }

      const comments =
        Array.isArray(data.comments)
          ? data.comments
          : [];

      setCommentsByPost(
        (current) => ({
          ...current,
          [postId]: comments,
        })
      );

      setReactionData(
        (current) => ({
          ...current,
          [postId]: {
            ...(current[postId] || {
              counts:
                emptyReactionCounts(),
              user_reactions: [],
              comments_count: 0,
            }),
            comments_count:
              comments.length,
          },
        })
      );
    } catch {
      setError(
        'Não foi possível carregar os comentários.'
      );
    } finally {
      setLoadingComments(
        (current) => ({
          ...current,
          [postId]: false,
        })
      );
    }
  }

  function toggleComments(
    postId: string
  ) {
    const opening =
      !commentsOpen[postId];

    setCommentsOpen(
      (current) => ({
        ...current,
        [postId]: opening,
      })
    );

    if (
      opening &&
      !commentsByPost[postId]
    ) {
      loadComments(postId);
    }
  }

  async function handleCreateComment(
    postId: string,
    parentId?: string
  ) {
    const content = (
      parentId
        ? replyDrafts[parentId] || ''
        : commentDrafts[postId] || ''
    ).trim();

    if (!content) return;

    setSavingComment(true);
    setError('');

    try {
      const response = await fetch(
        '/api/nook-posts/comments',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            content,
            parent_id:
              parentId || null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível enviar o comentário.'
        );
        return;
      }

      if (parentId) {
        setReplyDrafts(
          (current) => ({
            ...current,
            [parentId]: '',
          })
        );

        setReplyingTo(null);
      } else {
        setCommentDrafts(
          (current) => ({
            ...current,
            [postId]: '',
          })
        );
      }

      await loadComments(postId);
    } catch {
      setError(
        'Não foi possível enviar o comentário.'
      );
    } finally {
      setSavingComment(false);
    }
  }

  function startEditComment(
    comment: NookComment
  ) {
    setEditingCommentId(
      comment.id
    );

    setEditingCommentBody(
      comment.content
    );

    setError('');
  }

  function cancelEditComment() {
    if (savingComment) return;

    setEditingCommentId(null);
    setEditingCommentBody('');
  }

  async function handleSaveComment() {
    if (!editingCommentId)
      return;

    const content =
      editingCommentBody.trim();

    if (!content) {
      setError(
        'O comentário não pode ficar vazio.'
      );
      return;
    }

    setSavingComment(true);
    setError('');

    try {
      const response = await fetch(
        `/api/nook-posts/comments/${editingCommentId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            content,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível editar o comentário.'
        );
        return;
      }

      const updated =
        data.comment;

      if (updated) {
        setCommentsByPost(
          (current) => {
            const copy = {
              ...current,
            };

            const list =
              copy[updated.post_id] ||
              [];

            copy[updated.post_id] =
              list.map(
                (comment) =>
                  comment.id ===
                  updated.id
                    ? {
                        ...comment,
                        ...updated,
                      }
                    : comment
              );

            return copy;
          }
        );
      }

      setEditingCommentId(null);
      setEditingCommentBody('');
    } catch {
      setError(
        'Não foi possível editar o comentário.'
      );
    } finally {
      setSavingComment(false);
    }
  }

  async function handleDeleteComment(
    comment: NookComment
  ) {
    setDeletingCommentId(
      comment.id
    );
    setError('');

    try {
      const response = await fetch(
        `/api/nook-posts/comments/${comment.id}`,
        {
          method: 'DELETE',
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível excluir o comentário.'
        );
        return;
      }

      await loadComments(
        comment.post_id
      );
    } catch {
      setError(
        'Não foi possível excluir o comentário.'
      );
    } finally {
      setDeletingCommentId(null);
    }
  }

  function sortNookPosts(
    posts: NookPost[]
  ) {
    return [...posts].sort(
      (a, b) => {
        if (
          a.pinned &&
          !b.pinned
        ) {
          return -1;
        }

        if (
          !a.pinned &&
          b.pinned
        ) {
          return 1;
        }

        return (
          new Date(
            b.created_at
          ).getTime() -
          new Date(
            a.created_at
          ).getTime()
        );
      }
    );
  }

  function renderComment(
    comment: NookComment,
    allComments: NookComment[],
    depth = 0
  ): ReactNode {
    const replies =
      allComments.filter(
        (item) =>
          item.parent_id ===
          comment.id
      );

    const isOwn =
      comment.author_id ===
      user?.id;

    const author =
      comment.author;

    const authorName =
      author?.display_name ||
      author?.username ||
      'Escritor';

    const isEditing =
      editingCommentId ===
      comment.id;

    return (
      <div
        key={comment.id}
        className={
          depth > 0
            ? 'ml-5 border-l border-white/5 pl-4 sm:ml-8'
            : ''
        }
      >
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ff78b9] text-xs font-black text-[#180d15]">
            {author?.avatar_url ? (
              <img
                src={
                  contentMediaUrl(author.avatar_url)
                }
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              authorName
                .charAt(0)
                .toUpperCase()
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-[#191219] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-white/80">
                  {authorName}<AccountBadge account={author} />
                </span>

                {isOwn &&
                  !isEditing && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          startEditComment(
                            comment
                          )
                        }
                        className="text-[10px] font-semibold text-white/30 transition hover:text-[#ff78b9]"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteComment(
                            comment
                          )
                        }
                        disabled={
                          deletingCommentId ===
                          comment.id
                        }
                        className="text-[10px] font-semibold text-red-300/50 transition hover:text-red-300 disabled:opacity-30"
                      >
                        {deletingCommentId ===
                        comment.id
                          ? '...'
                          : 'Excluir'}
                      </button>
                    </div>
                  )}
              </div>

              {isEditing ? (
                <div className="mt-3">
                  <textarea
                    value={
                      editingCommentBody
                    }
                    onChange={(
                      event
                    ) =>
                      setEditingCommentBody(
                        event.target
                          .value
                      )
                    }
                    maxLength={2000}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/10 bg-[#100b12] px-3 py-2 text-xs leading-6 text-white outline-none focus:border-[#ff78b9]/50"
                  />

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={
                        cancelEditComment
                      }
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/40"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={
                        handleSaveComment
                      }
                      disabled={
                        savingComment
                      }
                      className="rounded-full bg-[#ff78b9] px-3 py-1.5 text-[10px] font-bold text-[#180d15] disabled:opacity-40"
                    >
                      {savingComment
                        ? 'Salvando...'
                        : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-white/65">
                  {comment.content}
                </p>
              )}
            </div>

            {!isEditing && (
              <div className="mt-1.5 flex items-center gap-4 px-2">
                <span className="text-[10px] text-white/20">
                  {formatDate(
                    comment.created_at
                  )}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setReplyingTo(
                      replyingTo ===
                        comment.id
                        ? null
                        : comment.id
                    )
                  }
                  className="text-[10px] font-semibold text-white/30 transition hover:text-[#ff78b9]"
                >
                  Responder
                </button>
              </div>
            )}

            {replyingTo ===
              comment.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={
                    replyDrafts[
                      comment.id
                    ] || ''
                  }
                  onChange={(event) =>
                    setReplyDrafts(
                      (current) => ({
                        ...current,
                        [comment.id]:
                          event.target
                            .value,
                      })
                    )
                  }
                  maxLength={2000}
                  placeholder={`Responder ${authorName}...`}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#191219] px-4 py-2 text-xs text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/50"
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      'Enter'
                    ) {
                      handleCreateComment(
                        comment.post_id,
                        comment.id
                      );
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    handleCreateComment(
                      comment.post_id,
                      comment.id
                    )
                  }
                  disabled={
                    savingComment ||
                    !(
                      replyDrafts[
                        comment.id
                      ] || ''
                    ).trim()
                  }
                  className="rounded-full bg-[#ff78b9] px-4 py-2 text-[10px] font-bold text-[#180d15] disabled:opacity-30"
                >
                  Enviar
                </button>
              </div>
            )}

            {replies.length > 0 && (
              <div className="mt-3 space-y-3">
                {replies.map(
                  (reply) =>
                    renderComment(
                      reply,
                      allComments,
                      Math.min(
                        depth + 1,
                        4
                      )
                    )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#100b12] text-white">
        <p className="text-sm text-white/40">
          Carregando perfil...
        </p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const displayName =
    user.display_name ||
    user.username;

  const hasActiveSocialStories =
    socialStories.some(
      (story) =>
        story.user_id === user.id &&
        new Date(
          story.expires_at
        ).getTime() > Date.now()
    );

  const mainFandom = (
    story: Story
  ) =>
    story.main_fandom ||
    story.fandom ||
    story.fandom_name ||
    'Fandom não informado';

  const activeTabIndex =
    TAB_ORDER.indexOf(activeTab);

  return (
    <main
      data-social-page="profile"
      data-profile-theme={themes?.active ? '' : undefined}
      style={themes?.active ? profileThemeVariables(themes.active) as CSSProperties : undefined}
      className="profile-content-manager min-h-screen bg-[#100b12] text-white"
      onClick={() => {
        if (menuOpenPostId) {
          setMenuOpenPostId(null);
        }

        if (showThemePicker) {
          setShowThemePicker(false);
        }
      }}
    >
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8">
        <header className="content-manager-heading"><Link href={'/perfil/' + encodeURIComponent(user.username)}>Voltar ao perfil</Link><h1>Gerenciar conteúdo</h1></header>
        <section
          className="profile-themed-surface overflow-hidden rounded-3xl border border-white/10 bg-[#151015]"
          data-profile-layout={user.header_layout ?? 'classic'}
          data-avatar-position={user.avatar_position ?? 'left'}
          style={{
            boxShadow: `0 0 80px ${profileTheme}10`,
          }}
        >
          <ProfileBanner cover={user.cover_url} accent={profileTheme} />

          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleCoverChange}
            className="hidden"
          />

          <div className="relative px-5 pb-7 sm:px-7 md:px-10 md:pb-8">
            <div className="profile-header-row--owner -mt-12 flex flex-col gap-4 sm:-mt-14 md:flex-row md:items-end">
              <div className="profile-header-avatar relative shrink-0">
                <div
                  className={`rounded-full p-[3px] transition ${
                    hasActiveSocialStories
                      ? 'animate-[pulse_2.5s_ease-in-out_infinite]'
                      : ''
                  }`}
                  style={
                    hasActiveSocialStories
                      ? {
                          background:
                            'linear-gradient(135deg, #ff78b9, #ff4f9a, #ffb3d8, #ff78b9)',
                        }
                      : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();

                      if (
                        hasActiveSocialStories
                      ) {
                        router.push(
                          '/stories'
                        );
                      } else {
                        return;
                      }
                    }}
                    disabled={
                      uploadingAvatar
                    }
                    className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-[#191219] bg-[#ff78b9] text-3xl font-black text-[#180d15] sm:h-28 sm:w-28 sm:text-4xl"
                  >
                    {user.avatar_url ? (
                      <img
                        src={
                          contentMediaUrl(user.avatar_url)
                        }
                        alt={`Foto de perfil de ${displayName}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      user.username
                        .charAt(0)
                        .toUpperCase()
                    )}

                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                      {hasActiveSocialStories
                        ? 'Ver Stories'
                        : uploadingAvatar
                          ? 'Enviando...'
                          : 'Foto do perfil'}
                    </span>
                  </button>
                </div>

                {hasActiveSocialStories && (
                  <div
                    className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-[#180d15]"
                    style={{
                      background:
                        'linear-gradient(135deg, #ff78b9, #ffb3d8)',
                    }}
                  >
                    Story
                  </div>
                )}
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />

              <div className="min-w-0 pb-1">
                <h1 className="break-words text-2xl font-black sm:text-3xl">
                  {displayName}<AccountBadge account={user} size="normal" />
                </h1>
                {!!user.staff_badges?.length && (
                  <span title="Integrante oficial da equipe" aria-label="Integrante oficial da equipe" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff78b9] text-xs font-black text-[#190d16]">✦</span>
                )}

                <p
                  className="profile-themed-text mt-1 text-sm"
                  style={themes?.active ? undefined : { color: profileTheme }}
                >
                  @{user.username}
                </p>
                {user.staff_badges?.map((badge, index) => (
                  <p key={`${badge.title}-${index}`} className="mt-1 text-xs font-medium text-[#ff9aca]">
                    <span className="font-bold">{badge.title}</span>
                    <span className="text-white/45"> · {badge.description}</span>
                  </p>
                ))}
              </div>

              <div className="relative flex flex-col gap-2 md:ml-auto md:shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openEditor}
                    className="profile-themed-action rounded-full px-6 py-3 text-sm font-bold text-[#180d15] transition hover:brightness-110"
                    style={themes?.active ? undefined : {
                      backgroundColor:
                        profileTheme,
                    }}
                  >
                    Editar perfil
                  </button>
                </div>


              </div>
            </div>

            <div className="mt-6 max-w-2xl">
              <p className="profile-themed-text text-sm leading-7 text-white/50">
                {user.bio ||
                  'Ainda não há uma bio por aqui.'}
              </p>
            </div>

            {error && (
              <div className="mt-5 max-w-2xl rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-5 max-w-2xl rounded-2xl border border-green-400/20 bg-green-400/5 px-4 py-3 text-sm text-green-300">
                {success}
              </div>
            )}

            <ProfileStats profileId={user.id} stories={stories.length}/>
          </div>
        </section>

        {/* ABAS */}

        <section className="mt-6">
          <div className="profile-themed-surface grid grid-cols-4 rounded-xl border-b border-white/10">
            {(
              [
                ['stories', 'HISTÓRIAS'],
                ['nook', 'MURAL'],
                ['lists', 'LISTAS DE LEITURAS'],
                ['clubs', 'REPUBLICADOS'],
              ] as [ProfileTab, string][]
            ).map(
              ([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() =>
                    changeTab(tab)
                  }
                  className={`profile-themed-text relative min-w-0 py-4 text-[9px] font-black uppercase tracking-[0.04em] transition sm:text-xs sm:tracking-[0.06em] ${
                    activeTab === tab
                      ? 'text-[#ff78b9]'
                      : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  <span className="block truncate px-1">
                    {label}
                  </span>

                  {activeTab === tab && (
                    <span
                      className="profile-theme-tab-marker absolute bottom-[-1px] left-0 h-0.5 w-full rounded-full"
                      style={themes?.active ? undefined : {
                        backgroundColor:
                          profileTheme,
                      }}
                    />
                  )}
                </button>
              )
            )}
          </div>

          <div
            ref={tabsContainerRef}
            className="mt-6 overflow-hidden"
            onTouchStart={
              handleTabSwipeStart
            }
            onTouchEnd={
              handleTabSwipeEnd
            }
          >
            <div
              className="flex w-[400%] transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(-${
                  activeTabIndex * 25
                }%)`,
              }}
            >
              {/* HISTÓRIAS */}

              <div className="w-1/4 shrink-0">
                <div className="mx-auto mb-5 max-w-3xl">
                  <h2 className="text-xl font-black sm:text-2xl">
                    Histórias de{' '}
                    {displayName}
                  </h2>

                  <p className="mt-1 text-sm text-white/40">
                    As histórias criadas por este autor.
                  </p>
                </div>

                {loadingStories ? (
                  <div className="profile-themed-surface mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#191219] px-6 py-14 text-center">
                    <p className="text-sm text-white/35">
                      Carregando histórias...
                    </p>
                  </div>
                ) : stories.length ===
                  0 ? (
                  <div className="mx-auto max-w-3xl rounded-3xl border border-dashed border-white/10 bg-[#191219] px-6 py-14 text-center">
                    <p className="text-sm text-white/35">
                      Você ainda não criou nenhuma história.
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-3xl space-y-3">
                    {stories.map(
                      (story) => {
                        const status =
                          story.status
                            ?.trim() || '';

                        const isOngoing =
                          status
                            .toLowerCase()
                            .includes(
                              'andamento'
                            );

                        return (
                          <button
                            key={story.id}
                            type="button"
                            onClick={() =>
                              router.push(
                                `/historia/${story.id}`
                              )
                            }
                            className="profile-themed-surface group flex w-full overflow-hidden rounded-2xl border border-white/10 bg-[#191219] text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#1d151d]"
                          >
                            <div className="relative h-36 w-24 shrink-0 overflow-hidden bg-[#241722] sm:h-40 sm:w-28 md:h-44 md:w-32">
                              {story.cover_url ? (
                                <img
                                  src={
                                    contentMediaUrl(story.cover_url)
                                  }
                                  alt={`Capa de ${story.title}`}
                                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                />
                              ) : (
                                <div
                                  className="flex h-full w-full items-center justify-center p-3 text-center"
                                  style={{
                                    background: `linear-gradient(145deg, ${profileTheme}45, #241322)`,
                                  }}
                                >
                                  <span
                                    className="text-xs font-black sm:text-sm"
                                    style={{
                                      color:
                                        profileTheme,
                                    }}
                                  >
                                    {
                                      story.title
                                    }
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1 p-4 sm:p-5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <h3 className="profile-themed-text line-clamp-2 text-base font-black text-white sm:text-lg">
                                  {
                                    story.title
                                  }
                                </h3>

                                {isOngoing && (
                                  <span
                                    className="w-fit shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#180d15] shadow-lg sm:text-[10px]"
                                    style={{
                                      background:
                                        'linear-gradient(135deg, #ff4f9a, #ff78b9, #ffb3d8)',
                                      boxShadow:
                                        '0 0 18px rgba(255,120,185,0.28)',
                                    }}
                                  >
                                    EM ANDAMENTO
                                  </span>
                                )}

                                {!isOngoing &&
                                  status && (
                                    <span className="w-fit shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-white/45">
                                      {
                                        status
                                      }
                                    </span>
                                  )}
                              </div>

                              <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/45 sm:text-sm sm:leading-6">
                                {story.description ||
                                  'Esta história ainda não possui uma sinopse.'}
                              </p>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span
                                  className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
                                  style={{
                                    borderColor:
                                      `${profileTheme}30`,
                                    backgroundColor:
                                      `${profileTheme}08`,
                                    color:
                                      profileTheme,
                                  }}
                                >
                                  {mainFandom(
                                    story
                                  )}
                                </span>

                                {story.rating && (
                                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-white/40">
                                    {
                                      story.rating
                                    }
                                  </span>
                                )}
                              </div>

                              <div className="mt-3 text-[10px] text-white/25">
                                Atualizada em{' '}
                                {formatDate(
                                  story.updated_at ||
                                    story.created_at
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              {/* MURAL */}

              <div className="w-1/4 shrink-0">
                <section className="mx-auto w-full max-w-2xl">
                  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#191219]">
                    <div className="relative p-4 sm:p-5">
                      <div className="mb-5">
                        <h2 className="text-xl font-black sm:text-2xl">
                          Mural
                        </h2>

                        <p className="mt-1 text-sm text-white/40">
                          Um cantinho para compartilhar seus pensamentos como escritor.
                        </p>
                      </div>

                      <div className="rounded-3xl border border-[#ff78b9]/25 bg-gradient-to-br from-[#291522] to-[#100b12] p-4 sm:p-5">
                        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-[#ff9bca]">Converse com seus leitores</p><h3 className="mt-2 text-xl font-bold">Escreva um novo aviso</h3><p className="mt-2 text-sm leading-6 text-white/60">Uma atualização, uma pausa ou uma ideia: esse espaço é seu.</p></div>
                        <div className="mb-4 flex flex-wrap gap-2">{[['Novo capítulo', 'Novo capítulo disponível!\n\n'], ['Aviso de pausa', 'Uma pausa na escrita\n\n']].map(([label, text]) => <button key={label} type="button" onClick={() => setNewPost(current => (current + (current ? '\n\n' : '') + text).slice(0, 5000))} className="min-h-11 rounded-full border border-[#ff78b9]/25 px-4 text-sm text-[#ffb9da] hover:bg-[#ff78b9]/10">{label}</button>)}</div>
                        <textarea
                          value={newPost}
                          onChange={(event) =>
                            setNewPost(
                              event.target
                                .value
                            )
                          }
                          maxLength={5000}
                          rows={10}
                          aria-label="Texto do novo aviso"
                          placeholder="Comece pelo que seus leitores precisam saber…"
                          className="w-full resize-y rounded-xl border border-white/10 bg-[#100b12] p-4 text-base leading-8 text-white outline-none placeholder:text-white/20"
                        />

                        {mediaPreviews.length >
                          0 && (
                          <div
                            className={`mt-4 grid gap-2 ${
                              mediaPreviews.length ===
                              1
                                ? 'grid-cols-1'
                                : 'grid-cols-2'
                            }`}
                          >
                            {mediaPreviews.map(
                              (
                                preview,
                                index
                              ) => (
                                <div
                                  key={
                                    preview
                                  }
                                  className="group relative aspect-square overflow-hidden rounded-2xl bg-[#191219]"
                                >
                                  <img
                                    src={
                                      contentMediaUrl(preview)
                                    }
                                    alt={`Prévia ${
                                      index + 1
                                    }`}
                                    className="h-full w-full object-cover"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeMedia(
                                        index
                                      )
                                    }
                                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-lg text-white transition hover:bg-black"
                                  >
                                    ×
                                  </button>

                                  <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white">
                                    {index +
                                      1}{' '}
                                    / 4
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        <div className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                mediaInputRef.current?.click()
                              }
                              disabled={
                                mediaFiles.length >=
                                MAX_MEDIA
                              }
                              className="shrink-0 rounded-full border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/50 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ImageIcon className="inline" size={17}/>{' '}
                              {mediaFiles.length
                                ? `${mediaFiles.length}/4`
                                : 'Imagem/GIF'}
                            </button>

                            <input
                              ref={
                                mediaInputRef
                              }
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              multiple
                              onChange={
                                handleMediaSelection
                              }
                              className="hidden"
                            />

                            <select
                              value={
                                selectedStoryId
                              }
                              onChange={(event) =>
                                setSelectedStoryId(
                                  event.target
                                    .value
                                )
                              }
                              className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#191219] px-4 py-2.5 text-xs font-semibold text-white/60 outline-none transition focus:border-white/20"
                            >
                              <option value="">
                                Vincular uma história
                              </option>

                              {stories.map(
                                (story) => (
                                  <option
                                    key={
                                      story.id
                                    }
                                    value={
                                      story.id
                                    }
                                  >
                                    {
                                      story.title
                                    }
                                  </option>
                                )
                              )}
                            </select>

                            <span className="shrink-0 text-xs text-white/60">
                              {newPost.length}/5000
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={
                              handleCreateNookPost
                            }
                            disabled={
                              creatingPost ||
                              (!newPost.trim() &&
                                mediaFiles.length ===
                                  0)
                            }
                            className="rounded-full px-6 py-2.5 text-sm font-bold text-[#180d15] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              backgroundColor:
                                profileTheme,
                            }}
                          >
                            {creatingPost
                              ? 'Publicando...'
                              : 'Publicar'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-6">
                        {loadingNook ? (
                          <div className="rounded-3xl border border-white/5 bg-[#100b12] px-6 py-12 text-center">
                            <p className="text-sm text-white/30">
                              Carregando seu Mural...
                            </p>
                          </div>
                        ) : nookPosts.length ===
                          0 ? (
                          <div className="rounded-3xl border border-dashed border-white/10 bg-[#100b12] px-6 py-12 text-center">
                            <p className="text-sm font-semibold text-white/50">
                              Seu Mural ainda está vazio.
                            </p>

                            <p className="mt-1 text-xs text-white/25">
                              Escreva alguma coisa acima para começar.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {nookPosts.map(
                              (post) => {
                                const storyTitle =
                                  getStoryTitle(
                                    post.story_id
                                  );

                                const isEditing =
                                  editingNookPostId ===
                                  post.id;

                                const isDeleting =
                                  deletingNookPostId ===
                                  post.id;

                                const social =
                                  reactionData[
                                    post.id
                                  ] || {
                                    counts:
                                      emptyReactionCounts(),
                                    user_reactions:
                                      [],
                                    comments_count:
                                      0,
                                  };

                                const comments =
                                  commentsByPost[
                                    post.id
                                  ] || [];

                                const topLevelComments =
                                  comments.filter(
                                    (comment) =>
                                      !comment.parent_id
                                  );

                                return (
                                  <article
                                    key={
                                      post.id
                                    }
                                    className="relative rounded-3xl border border-white/5 bg-[#100b12] p-4 transition hover:border-white/10 sm:p-5"
                                  >
                                    <div className="mb-4 flex items-center gap-3 pr-10">
                                      <div
                                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-black text-[#180d15]"
                                        style={{
                                          backgroundColor:
                                            profileTheme,
                                        }}
                                      >
                                        {user.avatar_url ? (
                                          <img
                                            src={
                                              contentMediaUrl(user.avatar_url)
                                            }
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          user.username
                                            .charAt(
                                              0
                                            )
                                            .toUpperCase()
                                        )}
                                      </div>

                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-white/85">
                                          {user.display_name ||
                                            user.username}<AccountBadge account={user} />
                                        </p>

                                        <p
                                          className="truncate text-xs"
                                          style={{
                                            color:
                                              profileTheme,
                                          }}
                                        >
                                          @{user.username}
                                        </p>
                                      </div>
                                    </div>

                                    {post.pinned && (
                                      <div
                                        className="mb-3 text-xs font-bold"
                                        style={{
                                          color:
                                            profileTheme,
                                        }}
                                      >
                                        <Pin className="inline" size={14}/> Post fixado
                                      </div>
                                    )}

                                    {!isEditing && (
                                      <div
                                        className="absolute right-3 top-3 sm:right-4 sm:top-4"
                                        onClick={(
                                          event
                                        ) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setMenuOpenPostId(
                                              menuOpenPostId ===
                                                post.id
                                                ? null
                                                : post.id
                                            )
                                          }
                                          className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white/35 transition hover:bg-white/5 hover:text-white"
                                        >
                                          ⋯
                                        </button>

                                        {menuOpenPostId ===
                                          post.id && (
                                          <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#191219] p-1.5 shadow-2xl">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleTogglePinNookPost(
                                                  post
                                                )
                                              }
                                              className="block w-full rounded-xl px-4 py-2.5 text-left text-xs font-semibold text-white/65 transition hover:bg-white/5 hover:text-white"
                                            >
                                              {post.pinned
                                                ? 'Desafixar post'
                                                : 'Fixar post'}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                startEditNookPost(
                                                  post
                                                )
                                              }
                                              className="block w-full rounded-xl px-4 py-2.5 text-left text-xs font-semibold text-white/65 transition hover:bg-white/5 hover:text-white"
                                            >
                                              Editar
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteNookPost(
                                                  post.id
                                                )
                                              }
                                              disabled={
                                                isDeleting
                                              }
                                              className="block w-full rounded-xl px-4 py-2.5 text-left text-xs font-semibold text-red-300 transition hover:bg-red-400/5 disabled:opacity-40"
                                            >
                                              {isDeleting
                                                ? 'Excluindo...'
                                                : 'Excluir'}
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {isEditing ? (
                                      <div>
                                        <textarea
                                          value={
                                            editNookBody
                                          }
                                          onChange={(
                                            event
                                          ) =>
                                            setEditNookBody(
                                              event
                                                .target
                                                .value
                                            )
                                          }
                                          maxLength={5000}
                                          rows={6}
                                          className="w-full resize-none rounded-2xl border border-white/10 bg-[#191219] px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-white/20"
                                        />

                                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                                          <select
                                            value={
                                              editNookStoryId
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              setEditNookStoryId(
                                                event
                                                  .target
                                                  .value
                                              )
                                            }
                                            className="flex-1 rounded-full border border-white/10 bg-[#191219] px-4 py-2.5 text-xs font-semibold text-white/60 outline-none transition focus:border-white/20"
                                          >
                                            <option value="">
                                              Sem história vinculada
                                            </option>

                                            {stories.map(
                                              (story) => (
                                                <option
                                                  key={
                                                    story.id
                                                  }
                                                  value={
                                                    story.id
                                                  }
                                                >
                                                  {
                                                    story.title
                                                  }
                                                </option>
                                              )
                                            )}
                                          </select>

                                          <span className="text-xs text-white/25">
                                            {
                                              editNookBody.length
                                            }
                                            /5000
                                          </span>
                                        </div>

                                        {renderPostMedia(
                                          post
                                        )}

                                        <div className="mt-4 flex gap-3">
                                          <button
                                            type="button"
                                            onClick={
                                              cancelEditNookPost
                                            }
                                            disabled={
                                              savingNookPost
                                            }
                                            className="rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold text-white/50 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                                          >
                                            Cancelar
                                          </button>

                                          <button
                                            type="button"
                                            onClick={
                                              handleSaveNookPostEdit
                                            }
                                            disabled={
                                              savingNookPost
                                            }
                                            className="rounded-full px-5 py-2.5 text-xs font-bold text-[#180d15] transition hover:brightness-110 disabled:opacity-40"
                                            style={{
                                              backgroundColor:
                                                profileTheme,
                                            }}
                                          >
                                            {savingNookPost
                                              ? 'Salvando...'
                                              : 'Salvar'}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {post.story_id && <LinkedStoryCard storyId={post.story_id}/>}<LinkedNewsCard slug={post.news_slug}/>{post.body &&
                                          renderPostBody(
                                            post.body
                                          )}

                                        {renderPostMedia(
                                          post
                                        )}

                                        {storyTitle && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              router.push(
                                                `/historia/${post.story_id}`
                                              )
                                            }
                                            className="mt-4 max-w-full truncate rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-white/5"
                                            style={{
                                              borderColor:
                                                `${profileTheme}30`,
                                              backgroundColor:
                                                `${profileTheme}08`,
                                              color:
                                                profileTheme,
                                            }}
                                          >
                                            <BookOpen className="inline" size={15}/>{' '}
                                            {
                                              storyTitle
                                            }
                                          </button>
                                        )}

                                        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
                                          <button type="button" aria-label="Curtir publicação" aria-pressed={social.user_reactions.includes('❤️')} onClick={()=>handleReaction(post.id,'❤️')} className="social-action"><Cloud size={20} fill={social.user_reactions.includes('❤️')?'currentColor':'none'}/><span>{social.counts['❤️']||0}</span></button>
                                          <button type="button" aria-label="Comentários" onClick={()=>toggleComments(post.id)} className="social-action"><MessageCircle size={19}/><span>{social.comments_count}</span></button>
                                        </div>

                                        <div className="mt-3 flex items-center justify-between">
                                          <span className="text-xs text-white/25">
                                            {formatPostDateTime(
                                              post.created_at
                                            )}
                                          </span>
                                        </div>

                                        {commentsOpen[
                                          post.id
                                        ] && (
                                          <div className="mt-4 border-t border-white/5 pt-4">
                                            <div className="mb-4 flex gap-2">
                                              <input
                                                type="text"
                                                value={
                                                  commentDrafts[
                                                    post.id
                                                  ] ||
                                                  ''
                                                }
                                                onChange={(
                                                  event
                                                ) =>
                                                  setCommentDrafts(
                                                    (
                                                      current
                                                    ) => ({
                                                      ...current,
                                                      [post.id]:
                                                        event
                                                          .target
                                                          .value,
                                                    })
                                                  )
                                                }
                                                maxLength={
                                                  2000
                                                }
                                                placeholder="Escreva um comentário..."
                                                className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#191219] px-4 py-2.5 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20"
                                                onKeyDown={(
                                                  event
                                                ) => {
                                                  if (
                                                    event.key ===
                                                    'Enter'
                                                  ) {
                                                    handleCreateComment(
                                                      post.id
                                                    );
                                                  }
                                                }}
                                              />

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleCreateComment(
                                                    post.id
                                                  )
                                                }
                                                disabled={
                                                  savingComment ||
                                                  !(
                                                    commentDrafts[
                                                      post.id
                                                    ] ||
                                                    ''
                                                  ).trim()
                                                }
                                                className="rounded-full px-4 py-2 text-[10px] font-bold text-[#180d15] disabled:opacity-30"
                                                style={{
                                                  backgroundColor:
                                                    profileTheme,
                                                }}
                                              >
                                                Enviar
                                              </button>
                                            </div>

                                            {loadingComments[
                                              post.id
                                            ] ? (
                                              <p className="py-5 text-center text-xs text-white/25">
                                                Carregando comentários...
                                              </p>
                                            ) : topLevelComments.length ===
                                              0 ? (
                                              <p className="py-5 text-center text-xs text-white/25">
                                                Ainda não há comentários. Seja o primeiro.
                                              </p>
                                            ) : (
                                              <div className="space-y-4">
                                                {topLevelComments.map(
                                                  (
                                                    comment
                                                  ) =>
                                                    renderComment(
                                                      comment,
                                                      comments
                                                    )
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </article>
                                );
                              }
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* LISTAS DE LEITURAS */}

              <div className="w-1/4 shrink-0">
                <section className="mx-auto w-full max-w-3xl">
                  <div className="mb-5">
                    <h2 className="text-xl font-black sm:text-2xl">
                      Listas de leituras
                    </h2>

                    <p className="mt-1 text-sm text-white/40">
                      Suas listas de histórias para ler.
                    </p>
                  </div>

                  {loadingLists ? (
                    <div className="rounded-3xl border border-white/10 bg-[#191219] px-6 py-14 text-center">
                      <p className="text-sm text-white/35">
                        Carregando listas...
                      </p>
                    </div>
                  ) : readingLists.length ===
                    0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-[#191219] px-6 py-14 text-center">
                      <p className="text-sm text-white/35">
                        Você ainda não possui listas de leituras públicas.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {readingLists.map(
                        (list) => (
                          <article
                            key={list.id}
                            className="rounded-3xl border border-white/10 bg-[#191219] p-5 sm:p-6"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h3 className="text-lg font-black">
                                  {
                                    list.name
                                  }
                                </h3>

                                {list.description && (
                                  <p className="mt-1 text-sm leading-6 text-white/40">
                                    {
                                      list.description
                                    }
                                  </p>
                                )}
                              </div>

                              <span
                                className="shrink-0 rounded-full border px-3 py-1 text-[9px] font-black uppercase"
                                style={{
                                  borderColor:
                                    `${profileTheme}35`,
                                  backgroundColor:
                                    `${profileTheme}08`,
                                  color:
                                    profileTheme,
                                }}
                              >
                                {list.items
                                  ?.length ||
                                  0}{' '}
                                histórias
                              </span>
                            </div>

                            {list.items &&
                              list.items.length >
                                0 && (
                                <div className="mt-5 space-y-2">
                                  {list.items.map(
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
                                          key={
                                            item.id
                                          }
                                          type="button"
                                          onClick={() =>
                                            router.push(
                                              `/historia/${story.id}`
                                            )
                                          }
                                          className="flex w-full overflow-hidden rounded-2xl border border-white/5 bg-[#100b12] text-left transition hover:border-white/15"
                                        >
                                          <div className="h-20 w-14 shrink-0 overflow-hidden bg-[#241722]">
                                            {story.cover_url ? (
                                              <img
                                                src={
                                                  contentMediaUrl(story.cover_url)
                                                }
                                                alt=""
                                                className="h-full w-full object-cover"
                                              />
                                            ) : (
                                              <div
                                                className="flex h-full items-center justify-center p-1 text-center text-[8px] font-black"
                                                style={{
                                                  color:
                                                    profileTheme,
                                                  background:
                                                    `linear-gradient(145deg, ${profileTheme}35, #241322)`,
                                                }}
                                              >
                                                {
                                                  story.title
                                                }
                                              </div>
                                            )}
                                          </div>

                                          <div className="min-w-0 p-3">
                                            <p className="truncate text-sm font-bold">
                                              {
                                                story.title
                                              }
                                            </p>

                                            <p
                                              className="mt-1 text-[10px] font-bold"
                                              style={{
                                                color:
                                                  profileTheme,
                                              }}
                                            >
                                              {mainFandom(
                                                story
                                              )}
                                            </p>

                                            {story.status && (
                                              <p className="mt-1 text-[9px] uppercase tracking-wide text-white/25">
                                                {
                                                  story.status
                                                }
                                              </p>
                                            )}
                                          </div>
                                        </button>
                                      );
                                    }
                                  )}
                                </div>
                              )}
                          </article>
                        )
                      )}
                    </div>
                  )}
                </section>
              </div>

              <div className="w-1/4 shrink-0"><Republicados profileId={user.id} own active={activeTab==='clubs'}/></div>
            </div>
          </div>
        </section>
      </div>

      {/* EDITOR DO PERFIL */}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="max-h-[88dvh] overflow-y-auto w-full max-w-lg rounded-3xl border border-white/10 bg-[#191219] p-6 text-white shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">
                  Editar perfil
                </h2>

                <p className="mt-1 text-sm text-white/40">
                  Atualize as informações que aparecem no seu perfil.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="text-2xl leading-none text-white/40 transition hover:text-white disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              {crop && <ImageCropDialog source={crop.source} kind={crop.kind} onCancel={() => setCrop(null)} onSave={saveCroppedImage} />}
              <div className="flex flex-wrap gap-3">
                {user?.avatar_url && <button type="button" className="nook-choice" onClick={() => setCrop({source: user.avatar_url!, kind: 'avatar'})}>Ajustar foto atual</button>}
                {user?.cover_url && <button type="button" className="nook-choice" onClick={() => setCrop({source: user.cover_url!, kind: 'cover'})}>Ajustar capa atual</button>}
              </div>
              <div className="grid grid-cols-2 gap-3"><button type="button" onClick={openAvatarPicker} disabled={uploadingAvatar} className="nook-choice">{uploadingAvatar?'Enviando…':'Alterar foto de perfil'}</button><button type="button" onClick={openCoverPicker} disabled={uploadingCover} className="nook-choice">{uploadingCover?'Enviando…':'Alterar capa'}</button></div>
              <ProfileAppearanceEditor
                layout={editHeaderLayout}
                position={editAvatarPosition}
                onLayoutChange={setEditHeaderLayout}
                onPositionChange={setEditAvatarPosition}
                cover={user.cover_url}
                avatar={user.avatar_url}
                name={editDisplayName.trim() || user.username}
                username={user.username}
                disabled={saving}
              />
              {themes ? <ProfileThemeEditor collection={themes} onChange={setThemes} cover={user.cover_url} username={user.username} /> :
                <p role="status" className="text-sm text-white/75">{themes === undefined ? 'Carregando seus temas…' : 'Meus temas está indisponível no momento.'}</p>}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/80">
                    Nome de exibição
                  </label>

                  <span className="text-xs text-white/30">
                    {
                      editDisplayName.length
                    }
                    /50
                  </span>
                </div>

                <input
                  type="text"
                  value={
                    editDisplayName
                  }
                  onChange={(event) =>
                    setEditDisplayName(
                      event.target.value
                    )
                  }
                  maxLength={50}
                  placeholder="Como você quer ser chamado?"
                  className="w-full rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-white/30"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/80">
                    Bio
                  </label>

                  <span className="text-xs text-white/30">
                    {bio.length}/500
                  </span>
                </div>

                <textarea
                  value={bio}
                  onChange={(event) =>
                    setBio(
                      event.target.value
                    )
                  }
                  maxLength={500}
                  rows={5}
                  placeholder="Conte um pouco sobre você..."
                  className="w-full resize-none rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/20 focus:border-white/30"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#100b12] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">
                      Cor do perfil
                    </p>

                    <p className="mt-1 text-xs leading-5 text-white/35">
                      Personalização privada. Outras pessoas não verão a sua escolha.
                    </p>
                  </div>

                  <div
                    className="h-8 w-8 shrink-0 rounded-full border border-white/20"
                    style={{
                      backgroundColor:
                        profileTheme,
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-sm">Escolher um tom<input aria-label="Seletor de cor do perfil" type="color" value={customColor} onChange={event => setCustomColor(event.target.value)} className="mt-2 block h-12 w-20 cursor-pointer rounded-lg" /></label>
                  <label className="text-sm">Código hexadecimal<input aria-label="Código hexadecimal da cor" value={customColor} maxLength={7} onChange={event => setCustomColor(event.target.value)} placeholder="#e53935" className="nook-input mt-2 w-32" /></label>
                  <button type="button" disabled={savingTheme || !/^#[0-9a-f]{6}$/i.test(customColor)} onClick={() => void handleThemeChange(customColor)} className="nook-primary">Aplicar cor</button>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {PROFILE_THEME_OPTIONS.map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        disabled={savingTheme}
                        onClick={() =>
                          handleThemeChange(
                            color
                          )
                        }
                        className={`h-8 w-8 rounded-full border-2 transition hover:scale-105 ${
                          profileTheme ===
                          color
                            ? 'border-white'
                            : 'border-white/10'
                        }`}
                        style={{
                          backgroundColor:
                            color,
                        }}
                        aria-label={`Escolher cor ${color}`}
                      />
                    )
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-2xl border border-green-400/20 bg-green-400/5 px-4 py-3 text-sm text-green-300">
                  {success}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="flex-1 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-[#180d15] transition hover:brightness-110 disabled:opacity-50"
                  style={{
                    backgroundColor:
                      profileTheme,
                  }}
                >
                  {saving
                    ? 'Salvando...'
                    : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function formatDate(date: string) {
  return new Date(
    date
  ).toLocaleDateString(
    'pt-BR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  );
}

function formatPostDateTime(
  date: string
) {
  const value =
    new Date(date);

  return `${value.toLocaleDateString(
    'pt-BR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  )} • ${value.toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }
  )}`;
}

function CloudLogo({
  color = '#FF78B9',
}: {
  color?: string;
}) {
  return (
    <svg
      width="48"
      height="30"
      viewBox="0 0 180 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Logo Nooklie"
    >
      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        fill={color}
      />

      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        stroke={color}
        strokeOpacity="0.75"
        strokeWidth="3"
      />
    </svg>
  );
}
