'use client';
import StoryMetadataFields from '@/components/StoryMetadataFields';
import WritingPanel from '@/components/WritingPanel';
import { emptyStoryMetadata, StoryMetadata } from '@/lib/stories/metadata';

import React, {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
  useSearchParams,
} from 'next/navigation';

type ChapterStatus =
  | 'draft'
  | 'published'
  | 'unpublished';

type Tag = {
  id?: string;
  name: string;
};

type StoryChapter = {
  id: string;
  chapter_number: number;
  title: string;
  published: boolean;
  publication_status?: ChapterStatus;
};

type Story = {
  has_content_warnings?: boolean;
  fandom?: string;
  work_has_ai?: boolean;
  cover_has_ai?: boolean;
  content_warnings?: string;
  accepts_translation?: boolean;
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  status: string;
  rating: string;
  genre: string;
  tags: Tag[];
  chapters: StoryChapter[];
};

type ChapterMedia = {
  id: string;
  media_url: string;
  media_type: 'image' | 'gif';
  created_at?: string;
};

type Chapter = {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  body: string;
  published: boolean;
  created_at: string;
  updated_at?: string | null;
  publication_status: ChapterStatus;
  original_published_at: string | null;
  republished_at: string | null;
  author_notes: string;
  media?: ChapterMedia[];
};

type ChapterResponse = {
  chapter?: Chapter;
  media?: ChapterMedia[];
  published?: boolean;
  error?: string;
};

type EditorMedia = {
  id: string;
  url: string;
  type: 'image' | 'gif';
  existing: boolean;
  file?: File;
};

const MAX_MEDIA = 25;
const MAX_MEDIA_SIZE = 5 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getStatusLabel(
  status: ChapterStatus,
  published?: boolean
) {
  if (status === 'published' || published) {
    return 'PUBLICADO';
  }

  if (status === 'unpublished') {
    return 'FORA DO AR';
  }

  return 'RASCUNHO';
}

function getStatusClass(
  status: ChapterStatus,
  published?: boolean
) {
  if (status === 'published' || published) {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
  }

  if (status === 'unpublished') {
    return 'border-orange-400/20 bg-orange-500/10 text-orange-200';
  }

  return 'border-white/10 bg-white/[0.04] text-gray-400';
}

function sanitizeHtml(html: string) {
  if (!html) return '';

  if (typeof window === 'undefined') {
    return html;
  }

  const documentNode = new DOMParser().parseFromString(
    html,
    'text/html'
  );

  documentNode
    .querySelectorAll(
      'script, iframe, object, embed, style, link'
    )
    .forEach((element) => {
      element.remove();
    });

  documentNode
    .querySelectorAll('*')
    .forEach((element) => {
      Array.from(element.attributes).forEach(
        (attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim();

          if (name.startsWith('on')) {
            element.removeAttribute(attribute.name);
            return;
          }

          if (
            ['href', 'src', 'action', 'formaction'].includes(
              name
            ) &&
            value
              .toLowerCase()
              .startsWith('javascript:')
          ) {
            element.removeAttribute(attribute.name);
          }
        }
      );
    });

  documentNode
    .querySelectorAll('a')
    .forEach((anchor) => {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute(
        'rel',
        'noopener noreferrer nofollow'
      );
    });

  return documentNode.body.innerHTML;
}

export default function EditarHistoriaPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const id = String(params.id);

  const editorRef =
    useRef<HTMLDivElement | null>(null);

  const mediaInputRef =
    useRef<HTMLInputElement | null>(null);

  const coverInputRef =
    useRef<HTMLInputElement | null>(null);

  const linkInputRef =
    useRef<HTMLInputElement | null>(null);

  const savedSelectionRef =
    useRef<Range | null>(null);

  const storyRef =
    useRef<Story | null>(null);

  const [story, setStory] =
    useState<Story | null>(null);

  const [chapter, setChapter] =
    useState<Chapter | null>(null);

  const [selectedChapterId, setSelectedChapterId] =
    useState<string | null>(
      searchParams.get('chapter')
    );

  const [title, setTitle] =
    useState('');

  const [storyMetadata, setStoryMetadata] = useState<StoryMetadata>(emptyStoryMetadata);
  const [description, setDescription] =
    useState('');

  const [status, setStatus] =
    useState('');

  const [rating, setRating] =
    useState('');

  const [genre, setGenre] =
    useState('');

  const [tags, setTags] =
    useState<string[]>([]);

  const [tagInput, setTagInput] =
    useState('');

  const [coverPreview, setCoverPreview] =
    useState<string | null>(null);

  const [chapterTitle, setChapterTitle] =
    useState('');

  const [chapterBody, setChapterBody] =
    useState('');

  const [authorNotes, setAuthorNotes] =
    useState('');

  const [chapterStatus, setChapterStatus] =
    useState<ChapterStatus>('draft');

  const [chapterMedia, setChapterMedia] =
    useState<EditorMedia[]>([]);

  const [previewMode, setPreviewMode] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [loadingChapter, setLoadingChapter] =
    useState(false);

  const [savingStory, setSavingStory] =
    useState(false);

  const [savingChapter, setSavingChapter] =
    useState(false);

  const [creatingChapter, setCreatingChapter] =
    useState(false);

  const [mediaUploading, setMediaUploading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [showLinkBox, setShowLinkBox] =
    useState(false);

  const [linkValue, setLinkValue] =
    useState('');

  function saveSelection() {
    if (!editorRef.current) return;

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (
      editorRef.current.contains(
        range.commonAncestorContainer
      )
    ) {
      savedSelectionRef.current =
        range.cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedSelectionRef.current) return;

    const selection = window.getSelection();

    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(
      savedSelectionRef.current
    );
  }

  function syncEditorBody() {
    if (!editorRef.current) {
      return chapterBody;
    }

    const value =
      editorRef.current.innerHTML;

    setChapterBody(value);

    return value;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStory() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `/api/stories/${id}`,
          {
            cache: 'no-store',
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Não foi possível carregar a obra.'
          );
        }

        const loadedStory: Story =
          data.story || data;

        if (!loadedStory?.id) {
          throw new Error(
            'Resposta inválida da obra.'
          );
        }

        if (cancelled) return;

        const normalizedChapters =
          Array.isArray(
            loadedStory.chapters
          )
            ? loadedStory.chapters.map(
                (item: StoryChapter) => ({
                  ...item,
                  publication_status:
                    item.publication_status ||
                    (item.published
                      ? 'published'
                      : 'draft'),
                })
              )
            : [];

        const normalizedTags =
          Array.isArray(
            loadedStory.tags
          )
            ? loadedStory.tags.map(
                (tag: Tag | string) =>
                  typeof tag === 'string'
                    ? { name: tag }
                    : tag
              )
            : [];

        const normalizedStory: Story = {
          ...loadedStory,
          chapters:
            normalizedChapters,
          tags:
            normalizedTags,
        };

        storyRef.current =
          normalizedStory;

        setStory(normalizedStory);

        setTitle(
          normalizedStory.title || ''
        );

        setDescription(
          normalizedStory.description || ''
        );
        setStoryMetadata({ fandom: normalizedStory.fandom ?? "", work_has_ai: normalizedStory.work_has_ai ?? false, cover_has_ai: normalizedStory.cover_has_ai ?? false, has_content_warnings: normalizedStory.has_content_warnings ?? false, content_warnings: normalizedStory.content_warnings ?? "", accepts_translation: normalizedStory.accepts_translation ?? false });

        setStatus(
          normalizedStory.status || ''
        );

        setRating(
          normalizedStory.rating || ''
        );

        setGenre(
          normalizedStory.genre || ''
        );

        setTags(
          normalizedTags.map(
            (tag) => tag.name
          )
        );

        setCoverPreview(
          normalizedStory.cover_url || null
        );

        const requestedChapter =
          searchParams.get('chapter');

        /*
         * IMPORTANTE:
         * Não verificamos se o capítulo está na lista
         * retornada pela obra. Um capítulo recém-criado
         * pode ainda não estar nessa lista no momento
         * da navegação.
         */
        if (requestedChapter) {
          setSelectedChapterId(
            requestedChapter
          );
        }
      } catch (caughtError) {
        if (cancelled) return;

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Erro ao carregar a obra.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStory();

    return () => {
      cancelled = true;
    };
  }, [id, searchParams]);

  useEffect(() => {
    if (!selectedChapterId) {
      setChapter(null);
      setLoadingChapter(false);
      return;
    }

    let cancelled = false;

    async function loadChapter() {
      setLoadingChapter(true);
      setError('');
      setSuccess('');

      try {
        const response = await fetch(
          `/api/chapters/${selectedChapterId}`,
          {
            cache: 'no-store',
          }
        );

        const data: ChapterResponse =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Não foi possível carregar o capítulo.'
          );
        }

        if (!data.chapter) {
          throw new Error(
            'Capítulo não encontrado.'
          );
        }

        if (cancelled) return;

        const loadedChapter =
          data.chapter;

        const normalizedChapter: Chapter =
          {
            ...loadedChapter,
            publication_status:
              loadedChapter.publication_status ||
              (loadedChapter.published
                ? 'published'
                : 'draft'),
            author_notes:
              loadedChapter.author_notes ||
              '',
          };

        setChapter(
          normalizedChapter
        );

        setChapterTitle(
          normalizedChapter.title || ''
        );

        setChapterBody(
          normalizedChapter.body || ''
        );

        setAuthorNotes(
          normalizedChapter.author_notes ||
            ''
        );

        setChapterStatus(
          normalizedChapter.publication_status
        );

        const loadedMedia =
          data.media ||
          normalizedChapter.media ||
          [];

        setChapterMedia(
          loadedMedia.map(
            (media) => ({
              id: media.id,
              url: media.media_url,
              type:
                media.media_type ===
                'gif'
                  ? 'gif'
                  : 'image',
              existing: true,
            })
          )
        );

        savedSelectionRef.current =
          null;

        const currentUrl =
          new URL(
            window.location.href
          );

        currentUrl.searchParams.set(
          'chapter',
          normalizedChapter.id
        );

        window.history.replaceState(
          null,
          '',
          currentUrl.toString()
        );
      } catch (caughtError) {
        if (cancelled) return;

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Erro ao carregar o capítulo.'
        );

        setChapter(null);
      } finally {
        if (!cancelled) {
          setLoadingChapter(false);
        }
      }
    }

    void loadChapter();

    return () => {
      cancelled = true;
    };
  }, [selectedChapterId]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (!chapter) return;

    if (
      editorRef.current.innerHTML !==
      chapterBody
    ) {
      editorRef.current.innerHTML =
        chapterBody || '';
    }
  }, [chapter, chapterBody]);

  useEffect(() => {
    if (!showLinkBox) return;

    const timer =
      window.setTimeout(() => {
        linkInputRef.current?.focus();
      }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showLinkBox]);

  async function handleCreateChapter() {
    if (creatingChapter) return;

    setCreatingChapter(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        '/api/chapters/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            story_id: id,
            title: 'Novo capítulo',
            body: '<p><br></p>',
            author_notes: '',
            publication_status: 'draft',
          }),
        }
      );

      const data: ChapterResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível criar o novo capítulo.'
        );
      }

      const newChapter = data.chapter;

      if (!newChapter?.id) {
        throw new Error(
          'O capítulo foi criado, mas o ID não foi retornado.'
        );
      }

      const normalizedNewChapter: Chapter = {
        ...newChapter,
        publication_status:
          newChapter.publication_status ||
          'draft',
        author_notes:
          newChapter.author_notes || '',
      };

      setSelectedChapterId(
        normalizedNewChapter.id
      );

      setChapter(
        normalizedNewChapter
      );

      setChapterTitle(
        normalizedNewChapter.title ||
          'Novo capítulo'
      );

      setChapterBody(
        normalizedNewChapter.body ||
          '<p><br></p>'
      );

      setAuthorNotes(
        normalizedNewChapter.author_notes ||
          ''
      );

      setChapterStatus(
        normalizedNewChapter.publication_status
      );

      setChapterMedia([]);
      setPreviewMode(false);
      setShowLinkBox(false);
      setLinkValue('');

      savedSelectionRef.current =
        null;

      setStory((currentStory) => {
        if (!currentStory) {
          return currentStory;
        }

        const exists =
          currentStory.chapters.some(
            (item) =>
              item.id ===
              normalizedNewChapter.id
          );

        if (exists) {
          return currentStory;
        }

        const newStoryChapter:
          StoryChapter = {
            id: normalizedNewChapter.id,
            chapter_number:
              normalizedNewChapter.chapter_number,
            title:
              normalizedNewChapter.title ||
              'Novo capítulo',
            published:
              normalizedNewChapter.published,
            publication_status:
              normalizedNewChapter.publication_status,
          };

        const updatedStory = {
          ...currentStory,
          chapters: [
            ...currentStory.chapters,
            newStoryChapter,
          ].sort(
            (a, b) =>
              a.chapter_number -
              b.chapter_number
          ),
        };

        storyRef.current =
          updatedStory;

        return updatedStory;
      });

      const currentUrl =
        new URL(
          window.location.href
        );

      currentUrl.searchParams.set(
        'chapter',
        normalizedNewChapter.id
      );

      router.replace(
        currentUrl.pathname +
          '?' +
          currentUrl.searchParams.toString()
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível criar o novo capítulo.'
      );
    } finally {
      setCreatingChapter(false);
    }
  }

  function selectChapter(
    chapterId: string
  ) {
    setSelectedChapterId(chapterId);
    setPreviewMode(false);
    setShowLinkBox(false);
    setLinkValue('');
    setError('');
    setSuccess('');

    const currentUrl =
      new URL(window.location.href);

    currentUrl.searchParams.set(
      'chapter',
      chapterId
    );

    router.replace(
      currentUrl.pathname +
        '?' +
        currentUrl.searchParams.toString()
    );
  }

  async function handleCoverChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      !ALLOWED_MEDIA_TYPES.includes(
        file.type
      )
    ) {
      setError(
        'Formato de capa inválido.'
      );
      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      setError(
        'A capa pode ter no máximo 10 MB.'
      );
      return;
    }

    setSavingStory(true);
    setError('');
    setSuccess('');

    try {
      const formData =
        new FormData();
      Object.entries(storyMetadata).forEach(([key, value]) => formData.set(key, String(value))); 

      formData.append(
        'cover',
        file
      );

      const response =
        await fetch(
          `/api/stories/${id}`,
          {
            method: 'PUT',
            body: formData,
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível alterar a capa.'
        );
      }

      const newCover =
        data.story?.cover_url ||
        data.cover_url ||
        null;

      if (newCover) {
        setCoverPreview(newCover);

        setStory(
          (current) =>
            current
              ? {
                  ...current,
                  cover_url:
                    newCover,
                }
              : current
        );
      }

      setSuccess(
        'Capa alterada com sucesso.'
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Erro ao alterar a capa.'
      );
    } finally {
      setSavingStory(false);

      if (
        coverInputRef.current
      ) {
        coverInputRef.current.value =
          '';
      }
    }
  }

  function addTag(value?: string) {
    const valueToAdd =
      (
        value ??
        tagInput
      ).trim();

    if (!valueToAdd) return;

    const newTags =
      valueToAdd
        .split(',')
        .map((item) =>
          item.trim()
        )
        .filter(Boolean);

    setTags((current) => {
      const result = [
        ...current,
      ];

      for (const tag of newTags) {
        if (
          result.length >=
          30
        ) {
          break;
        }

        if (
          !result.some(
            (item) =>
              item.toLowerCase() ===
              tag.toLowerCase()
          )
        ) {
          result.push(tag);
        }
      }

      return result;
    });

    setTagInput('');
  }

  function removeTag(
    index: number
  ) {
    setTags((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );
  }

  function handleTagKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === 'Enter' ||
      event.key === ','
    ) {
      event.preventDefault();
      addTag();
    }

    if (
      event.key === 'Backspace' &&
      !tagInput &&
      tags.length > 0
    ) {
      setTags((current) =>
        current.slice(
          0,
          -1
        )
      );
    }
  }

  async function handleSaveStory(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!title.trim()) {
      setError(
        'O título da obra é obrigatório.'
      );
      return;
    }

    setSavingStory(true);
    setError('');
    setSuccess('');

    try {
      const formData =
        new FormData();
      Object.entries(storyMetadata).forEach(([key, value]) => formData.set(key, String(value))); 

      formData.append(
        'title',
        title.trim()
      );

      formData.append(
        'description',
        description
      );

      formData.append(
        'status',
        status
      );

      formData.append(
        'rating',
        rating
      );

      formData.append(
        'genre',
        genre
      );

      tags.forEach((tag) => {
        formData.append(
          'tags',
          tag
        );
      });

      const response =
        await fetch(
          `/api/stories/${id}`,
          {
            method: 'PUT',
            body: formData,
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível salvar a obra.'
        );
      }

      const updatedStory =
        data.story;

      if (updatedStory) {
        const normalizedStory: Story =
          {
            ...updatedStory,
            chapters:
              Array.isArray(
                updatedStory.chapters
              )
                ? updatedStory.chapters
                : story?.chapters ||
                  [],
            tags:
              Array.isArray(
                updatedStory.tags
              )
                ? updatedStory.tags.map(
                    (tag: Tag | string) =>
                      typeof tag ===
                      'string'
                        ? {
                            name: tag,
                          }
                        : tag
                  )
                : tags.map(
                    (name) => ({
                      name,
                    })
                  ),
          };

        storyRef.current =
          normalizedStory;

        setStory(
          normalizedStory
        );

        setTitle(
          normalizedStory.title ||
            title
        );

        setDescription(
          normalizedStory.description ||
            description
        );

        setStatus(
          normalizedStory.status ||
            status
        );

        setRating(
          normalizedStory.rating ||
            rating
        );

        setGenre(
          normalizedStory.genre ||
            genre
        );

        setTags(
          normalizedStory.tags.map(
            (tag) => tag.name
          )
        );

        setCoverPreview(
          normalizedStory.cover_url ||
            coverPreview
        );
      }

      setSuccess(
        'Informações da obra salvas com sucesso.'
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Erro ao salvar a obra.'
      );
    } finally {
      setSavingStory(false);
    }
  }

  function executeCommand(
    command: string,
    value?: string
  ) {
    restoreSelection();

    document.execCommand(
      command,
      false,
      value
    );

    saveSelection();
    syncEditorBody();
  }

  function setAlignment(
    alignment:
      | 'left'
      | 'center'
      | 'right'
  ) {
    restoreSelection();

    document.execCommand(
      'justify' +
        alignment.charAt(0).toUpperCase() +
        alignment.slice(1),
      false
    );

    saveSelection();
    syncEditorBody();
  }

  function addLink() {
    const value =
      linkValue.trim();

    if (!value) return;

    let url = value;

    if (
      !/^https?:\/\//i.test(
        url
      )
    ) {
      url =
        'https://' + url;
    }

    restoreSelection();

    document.execCommand(
      'createLink',
      false,
      url
    );

    saveSelection();
    syncEditorBody();

    setLinkValue('');
    setShowLinkBox(false);
  }

  function createPendingMediaMarker(
    mediaId: string,
    type: 'image' | 'gif'
  ) {
    return (
      '<div class="chapter-media-placeholder" ' +
      'data-pending-media-id="' +
      mediaId +
      '" ' +
      'data-media-type="' +
      type +
      '">' +
      'Carregando mídia...' +
      '</div>'
    );
  }

  function insertPendingMediaBatch(
    mediaItems: EditorMedia[]
  ) {
    restoreSelection();

    const html =
      mediaItems
        .map((media) =>
          createPendingMediaMarker(
            media.id,
            media.type
          )
        )
        .join('');

    document.execCommand(
      'insertHTML',
      false,
      html
    );

    saveSelection();
    syncEditorBody();
  }

  function handleMediaSelect(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files =
      Array.from(
        event.target.files || []
      );

    if (
      files.length === 0
    ) {
      return;
    }

    setError('');

    const remaining =
      MAX_MEDIA -
      chapterMedia.length;

    if (
      remaining <= 0
    ) {
      setError(
        `Este capítulo já possui o limite de ${MAX_MEDIA} mídias.`
      );
      return;
    }

    const selected =
      files.slice(
        0,
        remaining
      );

    const invalid =
      selected.find(
        (file) =>
          !ALLOWED_MEDIA_TYPES.includes(
            file.type
          ) ||
          file.size >
            MAX_MEDIA_SIZE
      );

    if (invalid) {
      setError(
        'Cada mídia deve ser JPG, PNG, WEBP ou GIF e ter no máximo 5 MB.'
      );
      return;
    }

    const newMedia: EditorMedia[] =
      selected.map(
        (file) => ({
          id:
            crypto.randomUUID(),
          url:
            URL.createObjectURL(
              file
            ),
          type:
            file.type ===
            'image/gif'
              ? 'gif'
              : 'image',
          existing: false,
          file,
        })
      );

    setChapterMedia(
      (current) => [
        ...current,
        ...newMedia,
      ]
    );

    insertPendingMediaBatch(
      newMedia
    );

    if (
      mediaInputRef.current
    ) {
      mediaInputRef.current.value =
        '';
    }
  }

  function replacePendingMediaWithRealUrls(
    body: string,
    pending: EditorMedia[],
    uploaded: ChapterMedia[]
  ) {
    let result = body;

    pending.forEach(
      (item, index) => {
        const uploadedMedia =
          uploaded[index];

        if (!uploadedMedia) {
          return;
        }

        const marker =
          new RegExp(
            '<div[^>]*data-pending-media-id=["\\\']' +
              item.id +
              '["\\\'][^>]*>.*?<\\/div>',
            'gi'
          );

        const imageHtml =
          '<img src="' +
          uploadedMedia.media_url +
          '" alt="Imagem do capítulo" data-media-id="' +
          uploadedMedia.id +
          '" data-media-type="' +
          uploadedMedia.media_type +
          '" loading="lazy" style="max-width: 100%; height: auto;">';

        result =
          result.replace(
            marker,
            imageHtml
          );
      }
    );

    return result;
  }

  function removeMedia(
    mediaId: string
  ) {
    const media =
      chapterMedia.find(
        (item) =>
          item.id === mediaId
      );

    if (
      media &&
      !media.existing
    ) {
      URL.revokeObjectURL(
        media.url
      );
    }

    setChapterMedia(
      (current) =>
        current.filter(
          (item) =>
            item.id !== mediaId
        )
    );

    if (editorRef.current) {
      const element =
        editorRef.current.querySelector(
          `[data-media-id="${mediaId}"]`
        );

      element?.remove();

      const pendingElement =
        editorRef.current.querySelector(
          `[data-pending-media-id="${mediaId}"]`
        );

      pendingElement?.remove();

      syncEditorBody();
    }
  }

  async function saveChapter(
    targetStatus?: ChapterStatus
  ) {
    if (!chapter) return;

    const finalStatus =
      targetStatus ||
      chapterStatus;

    const body =
      syncEditorBody();

    const sanitizedBody =
      sanitizeHtml(body);

    const plainText =
      sanitizedBody
        .replace(
          /<[^>]+>/g,
          ''
        )
        .replace(
          /&nbsp;/gi,
          ' '
        )
        .trim();

    if (
      !sanitizedBody ||
      sanitizedBody === '<br>' ||
      plainText === ''
    ) {
      setError(
        'O conteúdo do capítulo não pode estar vazio.'
      );
      return;
    }

    if (
      !chapterTitle.trim()
    ) {
      setError(
        'O título do capítulo é obrigatório.'
      );
      return;
    }

    if (
      chapterTitle.trim().length >
      150
    ) {
      setError(
        'O título do capítulo pode ter no máximo 150 caracteres.'
      );
      return;
    }

    if (
      authorNotes.length > 5000
    ) {
      setError(
        'As notas do autor podem ter no máximo 5000 caracteres.'
      );
      return;
    }

    const pending =
      chapterMedia.filter(
        (media) =>
          !media.existing &&
          media.file
      );

    let existing =
      chapterMedia.filter(
        (media) =>
          media.existing
      );

    try {
      setSavingChapter(true);
      setError('');
      setSuccess('');

      let workingBody =
        sanitizedBody;

      let finalMediaIds =
        existing.map(
          (media) =>
            media.id
        );

      if (
        pending.length > 0
      ) {
        setMediaUploading(true);

        const uploadData =
          new FormData();

        uploadData.append(
          'title',
          chapterTitle.trim()
        );

        uploadData.append(
          'body',
          workingBody
        );

        uploadData.append(
          'author_notes',
          authorNotes
        );

        uploadData.append(
          'publication_status',
          finalStatus
        );

        existing.forEach(
          (media) => {
            uploadData.append(
              'existing_media_ids',
              media.id
            );
          }
        );

        pending.forEach(
          (media) => {
            if (media.file) {
              uploadData.append(
                'media',
                media.file
              );
            }
          }
        );

        const uploadResponse =
          await fetch(
            `/api/chapters/${chapter.id}`,
            {
              method: 'PUT',
              body: uploadData,
            }
          );

        const uploadResult:
          ChapterResponse =
          await uploadResponse.json();

        if (
          !uploadResponse.ok
        ) {
          throw new Error(
            uploadResult.error ||
              'Não foi possível enviar as mídias.'
          );
        }

        const returnedMedia =
          uploadResult.media ||
          [];

        const newMedia =
          returnedMedia.filter(
            (media) =>
              !existing.some(
                (item) =>
                  item.id ===
                  media.id
              )
          );

        if (
          newMedia.length !==
          pending.length
        ) {
          throw new Error(
            'Algumas mídias não foram salvas corretamente.'
          );
        }

        workingBody =
          replacePendingMediaWithRealUrls(
            workingBody,
            pending,
            newMedia
          );

        finalMediaIds =
          returnedMedia.map(
            (media) =>
              media.id
          );

        existing =
          returnedMedia.map(
            (media) => ({
              id: media.id,
              url: media.media_url,
              type:
                media.media_type ===
                'gif'
                  ? 'gif'
                  : 'image',
              existing: true,
            })
          );

        setChapterMedia(
          existing
        );

        pending.forEach(
          (media) => {
            URL.revokeObjectURL(
              media.url
            );
          }
        );

        setMediaUploading(false);
      }

      const formData =
        new FormData();
      Object.entries(storyMetadata).forEach(([key, value]) => formData.set(key, String(value))); 

      formData.append(
        'title',
        chapterTitle.trim()
      );

      formData.append(
        'body',
        workingBody
      );

      formData.append(
        'author_notes',
        authorNotes
      );

      formData.append(
        'publication_status',
        finalStatus
      );

      finalMediaIds.forEach(
        (mediaId) => {
          formData.append(
            'existing_media_ids',
            mediaId
          );
        }
      );

      const response =
        await fetch(
          `/api/chapters/${chapter.id}`,
          {
            method: 'PUT',
            body: formData,
          }
        );

      const data:
        ChapterResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível salvar o capítulo.'
        );
      }

      if (!data.chapter) {
        throw new Error(
          'O servidor não retornou o capítulo salvo.'
        );
      }

      const savedChapter =
        data.chapter;

      const normalizedSavedChapter:
        Chapter = {
          ...savedChapter,
          publication_status:
            savedChapter.publication_status ||
            finalStatus,
          author_notes:
            savedChapter.author_notes ||
            '',
        };

      setChapter(
        normalizedSavedChapter
      );

      setChapterStatus(
        normalizedSavedChapter.publication_status
      );

      setChapterBody(
        normalizedSavedChapter.body ||
          workingBody
      );

      setAuthorNotes(
        normalizedSavedChapter.author_notes ||
          ''
      );

      if (data.media) {
        setChapterMedia(
          data.media.map(
            (media) => ({
              id: media.id,
              url: media.media_url,
              type:
                media.media_type ===
                'gif'
                  ? 'gif'
                  : 'image',
              existing: true,
            })
          )
        );
      }

      if (editorRef.current) {
        editorRef.current.innerHTML =
          normalizedSavedChapter.body ||
          workingBody;
      }

      savedSelectionRef.current =
        null;

      if (
        finalStatus ===
        'published'
      ) {
        setSuccess(
          'Capítulo publicado com sucesso.'
        );
      } else if (
        finalStatus ===
        'unpublished'
      ) {
        setSuccess(
          'Capítulo retirado do ar.'
        );
      } else {
        setSuccess(
          'Rascunho salvo com sucesso.'
        );
      }

      setStory((currentStory) => {
        if (!currentStory) {
          return currentStory;
        }

        const updatedChapters =
          currentStory.chapters.map(
            (item) => {
              if (
                item.id !==
                normalizedSavedChapter.id
              ) {
                return item;
              }

              return {
                ...item,
                title:
                  normalizedSavedChapter.title,
                published:
                  normalizedSavedChapter.published,
                publication_status:
                  normalizedSavedChapter.publication_status,
              };
            }
          );

        const updatedStory =
          {
            ...currentStory,
            chapters:
              updatedChapters,
          };

        storyRef.current =
          updatedStory;

        return updatedStory;
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Erro ao salvar o capítulo.'
      );
    } finally {
      setSavingChapter(false);
      setMediaUploading(false);
    }
  }

  function handleEditorInput() {
    if (!editorRef.current) return;

    setChapterBody(
      editorRef.current.innerHTML
    );

    saveSelection();
  }

  function handleEditorPaste(
    event: React.ClipboardEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const text =
      event.clipboardData.getData(
        'text/plain'
      );

    document.execCommand(
      'insertText',
      false,
      text
    );

    saveSelection();
    syncEditorBody();
  }

  function handleEditorKeyDown(
    event: KeyboardEvent<HTMLDivElement>
  ) {
    if (
      (event.ctrlKey ||
        event.metaKey) &&
      event.key.toLowerCase() ===
        's'
    ) {
      event.preventDefault();

      void saveChapter(
        chapterStatus
      );

      return;
    }

    saveSelection();
  }

  function handleChapterFormSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    void saveChapter(
      chapterStatus
    );
  }

  function addHorizontalRule() {
    restoreSelection();

    document.execCommand(
      'insertHorizontalRule',
      false
    );

    saveSelection();
    syncEditorBody();
  }

  function handleMediaButtonClick(
    event?: MouseEvent<HTMLButtonElement>
  ) {
    event?.preventDefault();

    saveSelection();

    if (
      chapterMedia.length >=
      MAX_MEDIA
    ) {
      setError(
        `Este capítulo já possui o limite de ${MAX_MEDIA} mídias.`
      );
      return;
    }

    mediaInputRef.current?.click();
  }

  function clearChapterSelection() {
    chapterMedia.forEach(
      (media) => {
        if (!media.existing) {
          URL.revokeObjectURL(
            media.url
          );
        }
      }
    );

    setSelectedChapterId(
      null
    );

    setChapter(null);
    setChapterTitle('');
    setChapterBody('');
    setAuthorNotes('');
    setChapterStatus('draft');
    setChapterMedia([]);
    setPreviewMode(false);
    setShowLinkBox(false);
    setLinkValue('');
    setError('');
    setSuccess('');

    savedSelectionRef.current =
      null;

    const currentUrl =
      new URL(
        window.location.href
      );

    currentUrl.searchParams.delete(
      'chapter'
    );

    router.replace(
      currentUrl.pathname
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b090c] text-white">
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-gray-500">
            Carregando obra...
          </p>
        </div>
      </main>
    );
  }

  if (!story) {
    return (
      <main className="min-h-screen bg-[#0b090c] text-white">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <p className="text-red-300">
            {error ||
              'Obra não encontrada.'}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/historia/${id}`
              )
            }
            className="mt-6 rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium hover:bg-pink-400 transition"
          >
            Voltar para a obra
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b090c] text-white">
      <style jsx global>{`
        .chapter-editor {
          min-height: 900px;
          outline: none;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          font: inherit;
        }

        .chapter-editor:empty:before {
          content: 'Comece a escrever seu capítulo...';
          color: rgba(156, 163, 175, 0.35);
          pointer-events: none;
        }

        .chapter-editor p {
          margin: 0 0 1.25rem;
        }

        .chapter-editor h2 {
          font-size: 1.75rem;
          line-height: 1.3;
          font-weight: 600;
          margin: 1.5rem 0 1rem;
        }

        .chapter-editor h3 {
          font-size: 1.35rem;
          line-height: 1.35;
          font-weight: 600;
          margin: 1.5rem 0 1rem;
        }

        .chapter-editor blockquote {
          border-left: 3px solid rgba(236, 72, 153, 0.6);
          padding-left: 1rem;
          margin: 1.5rem 0;
          color: rgba(209, 213, 219, 0.8);
          font-style: italic;
        }

        .chapter-editor a {
          color: rgb(244, 114, 182);
          text-decoration: underline;
        }

        .chapter-editor img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 1.5rem auto;
          border-radius: 0.75rem;
        }

        .chapter-editor hr {
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          margin: 2rem 0;
        }

        .chapter-media-placeholder {
          margin: 1.5rem 0;
          padding: 2rem;
          border: 1px dashed rgba(236, 72, 153, 0.35);
          border-radius: 0.75rem;
          color: rgba(244, 114, 182, 0.7);
          background: rgba(236, 72, 153, 0.04);
          text-align: center;
        }

        .chapter-preview p {
          margin-bottom: 1.25rem;
        }

        .chapter-preview h2 {
          font-size: 1.75rem;
          line-height: 1.3;
          font-weight: 600;
          margin: 1.5rem 0 1rem;
        }

        .chapter-preview h3 {
          font-size: 1.35rem;
          line-height: 1.35;
          font-weight: 600;
          margin: 1.5rem 0 1rem;
        }

        .chapter-preview blockquote {
          border-left: 3px solid rgba(236, 72, 153, 0.6);
          padding-left: 1rem;
          margin: 1.5rem 0;
          color: rgba(209, 213, 219, 0.8);
          font-style: italic;
        }

        .chapter-preview a {
          color: rgb(244, 114, 182);
          text-decoration: underline;
        }

        .chapter-preview img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 1.5rem auto;
          border-radius: 0.75rem;
        }

        .chapter-preview hr {
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          margin: 2rem 0;
        }

        .editor-toolbar-button {
          min-width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 9px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          color: rgba(209, 213, 219, 0.85);
          transition: all 0.15s ease;
        }

        .editor-toolbar-button:hover {
          background: rgba(255, 255, 255, 0.08);
          color: white;
        }

        .editor-toolbar-divider {
          width: 1px;
          height: 24px;
          margin: 0 3px;
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b090c]/95 backdrop-blur">
        <div className="mx-auto max-w-[1550px] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/historia/${id}`
              )
            }
            className="text-xl font-semibold tracking-tight hover:text-pink-300 transition"
          >
            Nooklie
          </button>

          <div className="flex items-center gap-2">
            {chapter && (
              <button
                type="button"
                onClick={() =>
                  setPreviewMode(
                    (current) =>
                      !current
                  )
                }
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition"
              >
                {previewMode
                  ? 'Voltar ao editor'
                  : 'Pré-visualizar'}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/historia/${id}`
                )
              }
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1550px] px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        {!chapter ? (
          <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)_350px]">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt={`Capa de ${story.title}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-gray-600">
                      Sem capa
                    </div>
                  )}
                </div>

                <label className="mt-4 block cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition">
                  ALTERAR A CAPA

                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={
                      handleCoverChange
                    }
                    className="hidden"
                  />
                </label>

                <p className="mt-2 text-center text-xs text-gray-600">
                  JPG, PNG, WEBP ou GIF
                  <br />
                  até 10 MB
                </p>
              </div>
            </aside>

            <section>
              <div className="mb-7">
                <p className="text-xs uppercase tracking-[0.18em] text-pink-300/70">
                  Editar obra
                </p>

                <h1 className="mt-2 text-3xl font-semibold">
                  {story.title}
                </h1>

                <p className="mt-2 text-sm text-gray-500">
                  Edite as informações da obra ou escolha um capítulo para editar.
                </p>
              </div>

              <form
                onSubmit={
                  handleSaveStory
                }
                className="space-y-6"
              >
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <h2 className="text-base font-medium">
                    Informações da obra
                  </h2>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm text-gray-300">
                      Título
                    </label>

                    <input
                      value={title}
                      onChange={(event) =>
                        setTitle(
                          event.target.value
                        )
                      }
                      maxLength={150}
                      required
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-pink-400/40"
                    />
                  </div>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm text-gray-300">
                      Sinopse
                    </label>

                    <WritingPanel value={description} onChange={setDescription} /><StoryMetadataFields value={storyMetadata} onChange={setStoryMetadata} />

                    <div className="mt-1 text-right text-xs text-gray-600">
                      {description.length}/5000
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm text-gray-300">
                      Status da obra
                    </label>

                    <select
                      value={status}
                      onChange={(event) =>
                        setStatus(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#110e12] px-4 py-3 text-sm text-white outline-none focus:border-pink-400/40"
                    >
                      <option value="">
                        Selecione
                      </option>

                      <option value="EM ANDAMENTO">
                        EM ANDAMENTO
                      </option>

                      <option value="CONCLUÍDA">
                        CONCLUÍDA
                      </option>

                      <option value="HIATUS">
                        HIATUS
                      </option>
                    </select>
                  </div>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm text-gray-300">
                      Classificação
                    </label>

                    <select
                      value={rating}
                      onChange={(event) =>
                        setRating(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#110e12] px-4 py-3 text-sm text-white outline-none focus:border-pink-400/40"
                    >
                      <option value="">
                        Selecione
                      </option>

                      <option value="Livre">
                        Livre
                      </option>

                      <option value="10">
                        10 anos
                      </option>

                      <option value="12">
                        12 anos
                      </option>

                      <option value="14">
                        14 anos
                      </option>

                      <option value="16">
                        16 anos
                      </option>

                      <option value="18">
                        18 anos
                      </option>
                    </select>
                  </div>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm text-gray-300">
                      Gênero
                    </label>

                    <input
                      value={genre}
                      onChange={(event) =>
                        setGenre(
                          event.target.value
                        )
                      }
                      maxLength={50}
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-pink-400/40"
                      placeholder="Romance, Fantasia, Drama..."
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <h2 className="text-base font-medium">
                    Tags
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Pressione Enter ou vírgula para adicionar.
                  </p>

                  <div className="mt-5 flex min-h-[48px] flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 focus-within:border-pink-400/40">
                    {tags.map(
                      (tag, index) => (
                        <span
                          key={`${tag}-${index}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-pink-400/20 bg-pink-500/10 px-3 py-1.5 text-sm text-pink-200"
                        >
                          {tag}

                          <button
                            type="button"
                            onClick={() =>
                              removeTag(
                                index
                              )
                            }
                            className="text-pink-300/60 hover:text-pink-200 transition"
                          >
                            ×
                          </button>
                        </span>
                      )
                    )}

                    <input
                      value={
                        tagInput
                      }
                      onChange={(event) =>
                        setTagInput(
                          event.target.value
                        )
                      }
                      onKeyDown={
                        handleTagKeyDown
                      }
                      className="min-w-[150px] flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-gray-600"
                      placeholder={
                        tags.length >=
                        30
                          ? 'Limite atingido'
                          : 'Adicionar tag...'
                      }
                      disabled={
                        tags.length >=
                        30
                      }
                    />
                  </div>

                  <div className="mt-2 text-right text-xs text-gray-600">
                    {tags.length}/30
                  </div>
                </section>

                <button
                  type="submit"
                  disabled={
                    savingStory
                  }
                  className="w-full rounded-xl bg-pink-500 px-6 py-3 text-sm font-medium text-white hover:bg-pink-400 disabled:opacity-50 transition"
                >
                  {savingStory
                    ? 'Salvando...'
                    : 'Salvar informações da obra'}
                </button>
              </form>
            </section>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-medium">
                      Capítulos
                    </h2>

                    <p className="mt-1 text-xs text-gray-600">
                      {story.chapters.length}{' '}
                      {story.chapters
                        .length === 1
                        ? 'capítulo'
                        : 'capítulos'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateChapter()
                    }
                    disabled={
                      creatingChapter
                    }
                    className="shrink-0 rounded-lg bg-pink-500 px-3 py-2 text-xs font-medium text-white hover:bg-pink-400 disabled:opacity-50 transition"
                  >
                    {creatingChapter
                      ? 'CRIANDO...'
                      : '+ NOVO CAPÍTULO'}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {story.chapters
                    .length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
                      <p className="text-sm text-gray-600">
                        Sua obra ainda não possui capítulos.
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void handleCreateChapter()
                        }
                        disabled={
                          creatingChapter
                        }
                        className="mt-4 rounded-lg bg-pink-500 px-4 py-2 text-xs font-medium text-white hover:bg-pink-400 disabled:opacity-50 transition"
                      >
                        {creatingChapter
                          ? 'CRIANDO...'
                          : '+ CRIAR PRIMEIRO CAPÍTULO'}
                      </button>
                    </div>
                  ) : (
                    story.chapters.map(
                      (item) => (
                        <div
                          key={
                            item.id
                          }
                          className="rounded-xl border border-white/10 bg-black/20 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-gray-600">
                                Capítulo{' '}
                                {
                                  item.chapter_number
                                }
                              </p>

                              <p className="mt-1 truncate text-sm text-gray-200">
                                {item.title ||
                                  'Sem título'}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-medium tracking-wide ${getStatusClass(
                                item.publication_status ||
                                  (item.published
                                    ? 'published'
                                    : 'draft'),
                                item.published
                              )}`}
                            >
                              {getStatusLabel(
                                item.publication_status ||
                                  (item.published
                                    ? 'published'
                                    : 'draft'),
                                item.published
                              )}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              selectChapter(
                                item.id
                              )
                            }
                            className="mt-3 w-full rounded-lg bg-pink-500/10 px-3 py-2 text-xs font-medium text-pink-200 hover:bg-pink-500/20 transition"
                          >
                            EDITAR CAPÍTULO
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt={`Capa de ${story.title}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-gray-600">
                      Sem capa
                    </div>
                  )}
                </div>

                <label className="mt-4 block cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white transition">
                  ALTERAR A CAPA

                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={
                      handleCoverChange
                    }
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={
                    clearChapterSelection
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-400 hover:bg-white/[0.05] hover:text-white transition"
                >
                  Voltar para a obra
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium">
                      Capítulos
                    </h2>

                    <span className="text-xs text-gray-600">
                      {story.chapters.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateChapter()
                    }
                    disabled={
                      creatingChapter
                    }
                    className="shrink-0 rounded-lg bg-pink-500 px-2.5 py-2 text-[10px] font-medium text-white hover:bg-pink-400 disabled:opacity-50 transition"
                  >
                    {creatingChapter
                      ? 'CRIANDO...'
                      : '+ NOVO CAPÍTULO'}
                  </button>
                </div>

                <div className="mt-3 max-h-[500px] overflow-y-auto space-y-2 pr-1">
                  {story.chapters.map(
                    (item) => (
                      <button
                        key={
                          item.id
                        }
                        type="button"
                        onClick={() =>
                          selectChapter(
                            item.id
                          )
                        }
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          item.id ===
                          selectedChapterId
                            ? 'border-pink-400/40 bg-pink-500/[0.08]'
                            : 'border-white/10 bg-black/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-gray-600">
                              Capítulo{' '}
                              {
                                item.chapter_number
                              }
                            </p>

                            <p className="mt-1 truncate text-sm text-gray-200">
                              {item.title ||
                                'Sem título'}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-[8px] ${getStatusClass(
                              item.publication_status ||
                                (item.published
                                  ? 'published'
                                  : 'draft'),
                              item.published
                            )}`}
                          >
                            {getStatusLabel(
                              item.publication_status ||
                                (item.published
                                  ? 'published'
                                  : 'draft'),
                              item.published
                            )}
                          </span>
                        </div>
                      </button>
                    )
                  )}
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              {loadingChapter ? (
                <div className="min-h-[700px] flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02]">
                  <p className="text-sm text-gray-500">
                    Carregando capítulo...
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={
                    handleChapterFormSubmit
                  }
                  className="space-y-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-pink-300/70">
                        Editando capítulo{' '}
                        {
                          chapter.chapter_number
                        }
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] tracking-wide ${getStatusClass(
                            chapterStatus,
                            chapter.published
                          )}`}
                        >
                          {getStatusLabel(
                            chapterStatus,
                            chapter.published
                          )}
                        </span>

                        {chapter.original_published_at && (
                          <span className="text-xs text-gray-600">
                            Original:{' '}
                            {formatDate(
                              chapter.original_published_at
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void saveChapter(
                            'draft'
                          )
                        }
                        disabled={
                          savingChapter ||
                          mediaUploading
                        }
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-50 transition"
                      >
                        {savingChapter
                          ? 'Salvando...'
                          : 'Salvar rascunho'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void saveChapter(
                            'published'
                          )
                        }
                        disabled={
                          savingChapter ||
                          mediaUploading
                        }
                        className="rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-medium hover:bg-pink-400 disabled:opacity-50 transition"
                      >
                        {savingChapter
                          ? 'Salvando...'
                          : 'Publicar'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="border-b border-white/10 bg-black/20 px-3 sm:px-6 py-3">
                      <input
                        value={
                          chapterTitle
                        }
                        onChange={(event) =>
                          setChapterTitle(
                            event.target.value
                          )
                        }
                        maxLength={150}
                        className="w-full border-none bg-transparent px-2 py-3 text-2xl sm:text-3xl font-semibold text-white outline-none placeholder:text-gray-700"
                        placeholder="Título do capítulo"
                      />
                    </div>

                    {previewMode ? (
                      <article className="chapter-preview min-h-[900px] px-4 sm:px-12 lg:px-20 py-10 text-[17px] leading-8 text-gray-200">
                        <div
                          dangerouslySetInnerHTML={{
                            __html:
                              sanitizeHtml(
                                chapterBody
                              ) ||
                              '<p>O capítulo está vazio.</p>',
                          }}
                        />

                        {authorNotes.trim() && (
                          <div className="mt-12 border-t border-white/10 pt-8">
                            <p className="text-xs uppercase tracking-[0.2em] text-pink-300/70">
                              NOTAS DO AUTOR
                            </p>

                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-400">
                              {
                                authorNotes
                              }
                            </p>
                          </div>
                        )}
                      </article>
                    ) : (
                      <>
                        <div className="sticky top-[61px] z-30 border-b border-white/10 bg-[#0d0a0e]/98 backdrop-blur">
                          <div className="flex flex-wrap items-center gap-1 p-2">
                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                executeCommand(
                                  'bold'
                                )
                              }
                              className="editor-toolbar-button font-bold"
                              title="Negrito"
                            >
                              B
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                executeCommand(
                                  'italic'
                                )
                              }
                              className="editor-toolbar-button italic"
                              title="Itálico"
                            >
                              I
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                executeCommand(
                                  'underline'
                                )
                              }
                              className="editor-toolbar-button underline"
                              title="Sublinhado"
                            >
                              U
                            </button>

                            <span className="editor-toolbar-divider" />

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                setAlignment(
                                  'left'
                                )
                              }
                              className="editor-toolbar-button"
                              title="Alinhar à esquerda"
                            >
                              <span className="text-lg">
                                ≡
                              </span>
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                setAlignment(
                                  'center'
                                )
                              }
                              className="editor-toolbar-button"
                              title="Centralizar"
                            >
                              <span className="text-lg">
                                ≡
                              </span>
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                setAlignment(
                                  'right'
                                )
                              }
                              className="editor-toolbar-button"
                              title="Alinhar à direita"
                            >
                              <span className="text-lg">
                                ≡
                              </span>
                            </button>

                            <span className="editor-toolbar-divider" />

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                executeCommand(
                                  'formatBlock',
                                  'h2'
                                )
                              }
                              className="editor-toolbar-button text-xs font-semibold"
                              title="Título"
                            >
                              Título
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                executeCommand(
                                  'formatBlock',
                                  'blockquote'
                                )
                              }
                              className="editor-toolbar-button text-xs"
                              title="Citação"
                            >
                              Citação
                            </button>

                            <span className="editor-toolbar-divider" />

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={
                                handleMediaButtonClick
                              }
                              className="editor-toolbar-button text-xs"
                              title="Adicionar imagem ou GIF"
                            >
                              Imagem / GIF
                            </button>

                            <input
                              ref={
                                mediaInputRef
                              }
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              multiple
                              onChange={
                                handleMediaSelect
                              }
                              className="hidden"
                            />

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={() =>
                                setShowLinkBox(
                                  (current) =>
                                    !current
                                )
                              }
                              className="editor-toolbar-button text-xs"
                              title="Adicionar link"
                            >
                              Link
                            </button>

                            <button
                              type="button"
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();
                                saveSelection();
                              }}
                              onClick={
                                addHorizontalRule
                              }
                              className="editor-toolbar-button text-xs"
                              title="Adicionar separador"
                            >
                              Separador
                            </button>

                            <span className="ml-auto px-2 text-[11px] text-gray-600">
                              {
                                chapterMedia.length
                              }
                              /{MAX_MEDIA}
                            </span>
                          </div>

                          {showLinkBox && (
                            <div className="border-t border-white/10 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                  ref={
                                    linkInputRef
                                  }
                                  value={
                                    linkValue
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setLinkValue(
                                      event.target.value
                                    )
                                  }
                                  onKeyDown={(
                                    event
                                  ) => {
                                    if (
                                      event.key ===
                                      'Enter'
                                    ) {
                                      event.preventDefault();
                                      addLink();
                                    }

                                    if (
                                      event.key ===
                                      'Escape'
                                    ) {
                                      event.preventDefault();
                                      setShowLinkBox(
                                        false
                                      );
                                      setLinkValue(
                                        ''
                                      );
                                    }
                                  }}
                                  placeholder="https://exemplo.com"
                                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-pink-400/40"
                                />

                                <button
                                  type="button"
                                  onMouseDown={(
                                    event
                                  ) => {
                                    event.preventDefault();
                                    saveSelection();
                                  }}
                                  onClick={
                                    addLink
                                  }
                                  className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium hover:bg-pink-400 transition"
                                >
                                  Inserir link
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div
                          ref={
                            editorRef
                          }
                          contentEditable
                          suppressContentEditableWarning
                          onInput={
                            handleEditorInput
                          }
                          onPaste={
                            handleEditorPaste
                          }
                          onKeyDown={
                            handleEditorKeyDown
                          }
                          onMouseUp={
                            saveSelection
                          }
                          onKeyUp={
                            saveSelection
                          }
                          onFocus={
                            saveSelection
                          }
                          className="chapter-editor px-5 sm:px-12 lg:px-20 py-12 text-[17px] leading-8 text-gray-200"
                          spellCheck
                        />
                      </>
                    )}
                  </div>

                  {chapterMedia.length >
                    0 && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-medium">
                            Mídias do capítulo
                          </h2>

                          <p className="mt-1 text-xs text-gray-600">
                            Máximo de 25 arquivos. Cada arquivo pode ter até 5 MB.
                          </p>
                        </div>

                        <span className="text-xs text-gray-500">
                          {
                            chapterMedia.length
                          }
                          /{MAX_MEDIA}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {chapterMedia.map(
                          (media) => (
                            <div
                              key={
                                media.id
                              }
                              className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20"
                            >
                              <div className="aspect-video">
                                <img
                                  src={
                                    media.url
                                  }
                                  alt="Mídia do capítulo"
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  removeMedia(
                                    media.id
                                  )
                                }
                                disabled={
                                  savingChapter
                                }
                                className="absolute right-2 top-2 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-xs text-gray-300 hover:bg-red-500/80 hover:text-white disabled:opacity-50 transition"
                              >
                                Remover
                              </button>

                              <div className="border-t border-white/10 px-3 py-2 text-[10px] uppercase tracking-wide text-gray-600">
                                {media.type ===
                                'gif'
                                  ? 'GIF'
                                  : 'IMAGEM'}

                                {!media.existing &&
                                  ' · NÃO SALVA'}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}

                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-medium">
                          NOTAS DO AUTOR
                        </h2>

                        <p className="mt-1 text-xs text-gray-600">
                          Uma mensagem opcional para seus leitores no final do capítulo.
                        </p>
                      </div>

                      <span className="text-xs text-gray-600">
                        {
                          authorNotes.length
                        }
                        /5000
                      </span>
                    </div>

                    <textarea
                      value={
                        authorNotes
                      }
                      onChange={(event) =>
                        setAuthorNotes(
                          event.target.value
                        )
                      }
                      maxLength={5000}
                      rows={6}
                      placeholder="Escreva uma mensagem para seus leitores..."
                      className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-pink-400/40"
                    />
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-base font-medium">
                          Publicação
                        </h2>

                        <p className="mt-1 text-xs text-gray-600">
                          Salve como rascunho, publique agora ou retire o capítulo do ar.
                        </p>
                      </div>

                      <select
                        value={
                          chapterStatus
                        }
                        onChange={(event) => {
                          const nextStatus =
                            event.target
                              .value as ChapterStatus;

                          setChapterStatus(
                            nextStatus
                          );
                        }}
                        className="rounded-xl border border-white/10 bg-[#110e12] px-4 py-3 text-sm text-white outline-none focus:border-pink-400/40"
                      >
                        <option value="draft">
                          Rascunho privado
                        </option>

                        <option value="published">
                          Publicar agora
                        </option>

                        <option value="unpublished">
                          Retirar do ar
                        </option>
                      </select>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          void saveChapter(
                            'draft'
                          )
                        }
                        disabled={
                          savingChapter ||
                          mediaUploading
                        }
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-50 transition"
                      >
                        {savingChapter
                          ? 'Salvando...'
                          : 'Salvar rascunho'}
                      </button>

                      <button
                        type="submit"
                        disabled={
                          savingChapter ||
                          mediaUploading
                        }
                        className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white hover:bg-pink-400 disabled:opacity-50 transition"
                      >
                        {savingChapter
                          ? 'Salvando...'
                          : chapterStatus ===
                              'published'
                            ? 'Publicar capítulo'
                            : chapterStatus ===
                                'unpublished'
                              ? 'Retirar do ar'
                              : 'Salvar capítulo'}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <h2 className="text-base font-medium">
                      Histórico de publicação
                    </h2>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-gray-600">
                          Criado em
                        </p>

                        <p className="mt-2 text-sm text-gray-300">
                          {formatDate(
                            chapter.created_at
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-gray-600">
                          Publicação original
                        </p>

                        <p className="mt-2 text-sm text-gray-300">
                          {formatDate(
                            chapter.original_published_at
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-gray-600">
                          Republicação
                        </p>

                        <p className="mt-2 text-sm text-gray-300">
                          {formatDate(
                            chapter.republished_at
                          )}
                        </p>
                      </div>
                    </div>
                  </section>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
