'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useParams, useRouter } from 'next/navigation';

type Chapter = {
  id: string;
  story_id?: string;
  chapter_number: number;
  title: string;
  body?: string;
  published?: boolean;
  created_at?: string;
  author_notes?: string | null;
  original_published_at?: string | null;
  republished_at?: string | null;
  updated_at?: string | null;
  publication_status?: string;
};

type ChapterMedia = {
  id: string;
  url?: string;
  image_url?: string;
  media_url?: string;
  type?: string;
  mime_type?: string;
  position?: number;
};

type Sticker = {
  id: string;
  image_url: string;
  created_at: string;
  last_used_at: string | null;
};

type Comment = {
  id: string;
  chapter_id: string;
  user_id: string;
  body: string;
  selected_text: string | null;
  start_offset: number | null;
  parent_comment_id: string | null;
  sticker_id: string | null;
  created_at: string;
  profiles?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  user_stickers?: {
    id: string;
    image_url: string;
  } | null;
};

type CommentGroup = {
  comments: Comment[];
  start: number;
  end: number;
};

export default function CapituloPage() {
  const params = useParams();
  const router = useRouter();

  const id = String(params.id);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const [chapter, setChapter] =
    useState<Chapter | null>(null);

  const [media, setMedia] =
    useState<ChapterMedia[]>([]);

  const [previousChapter, setPreviousChapter] =
    useState<Chapter | null>(null);

  const [nextChapter, setNextChapter] =
    useState<Chapter | null>(null);

  const [chapters, setChapters] =
    useState<Chapter[]>([]);

  const [comments, setComments] =
    useState<Comment[]>([]);

  const [stickers, setStickers] =
    useState<Sticker[]>([]);

  const [showContents, setShowContents] =
    useState(false);

  const [selectedText, setSelectedText] =
    useState('');

  const [selectionOffset, setSelectionOffset] =
    useState<number | null>(null);

  const [showCommentBox, setShowCommentBox] =
    useState(false);

  const [commentText, setCommentText] =
    useState('');

  const [sendingComment, setSendingComment] =
    useState(false);

  const [showStickers, setShowStickers] =
    useState(false);

  const [selectedSticker, setSelectedSticker] =
    useState<Sticker | null>(null);

  const [uploadingSticker, setUploadingSticker] =
    useState(false);

  const [activeCommentGroup, setActiveCommentGroup] =
    useState<Comment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [likes, setLikes] =
    useState(0);

  const [liked, setLiked] =
    useState(false);

  const [liking, setLiking] =
    useState(false);

  const [commentMode, setCommentMode] =
    useState<'general' | 'selection'>(
      'general'
    );

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    async function loadChapter() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          `/api/chapters/${id}`,
          {
            cache: 'no-store',
          }
        );

        const text =
          await response.text();

        let data: any = null;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            'A API do capítulo retornou uma resposta inválida.'
          );
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Não foi possível carregar o capítulo.'
          );
        }

        if (!data?.chapter) {
          throw new Error(
            'Capítulo não encontrado.'
          );
        }

        if (cancelled) {
          return;
        }

        setChapter(data.chapter);

        setMedia(
          Array.isArray(data.media)
            ? data.media
            : []
        );

        setPreviousChapter(
          data.previousChapter || null
        );

        setNextChapter(
          data.nextChapter || null
        );

        setLoading(false);

        void loadStory(
          data.chapter.story_id
        );

        void loadComments();
        void loadStickers();
        void loadLikes();
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Não foi possível carregar o capítulo.'
        );

        setLoading(false);
      }
    }

    async function loadStory(
      storyId?: string
    ) {
      if (!storyId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/stories/${storyId}`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setChapters(
            Array.isArray(data.chapters)
              ? data.chapters
              : []
          );
        }
      } catch {
        // O sumário é opcional.
      }
    }

    async function loadComments() {
      try {
        const response =
          await fetch(
            `/api/comments?chapter_id=${id}`,
            {
              cache: 'no-store',
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setComments(
            Array.isArray(data.comments)
              ? data.comments
              : []
          );
        }
      } catch {
        // Comentários são opcionais.
      }
    }

    async function loadStickers() {
      try {
        const response =
          await fetch('/api/stickers', {
            cache: 'no-store',
          });

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (!cancelled) {
          setStickers(
            Array.isArray(data.stickers)
              ? data.stickers
              : []
          );
        }
      } catch {
        // Figurinhas são opcionais.
      }
    }

    async function loadLikes() {
      try {
        const response =
          await fetch(
            `/api/chapters/${id}/like`,
            {
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          return;
        }

        if (!cancelled) {
          setLikes(
            Number(data.likes) || 0
          );

          setLiked(
            Boolean(data.liked)
          );
        }
      } catch {
        // Curtidas são opcionais.
      }
    }

    void loadChapter();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleLike() {
    if (liking) {
      return;
    }

    setLiking(true);
    setError('');

    try {
      const response =
        await fetch(
          `/api/chapters/${id}/like`,
          {
            method: 'POST',
          }
        );

      const data =
        await response.json();

      if (response.status === 401) {
        setError(
          data.error ||
            'Você precisa estar logado para curtir capítulos.'
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível alterar a curtida.'
        );
      }

      setLikes(
        Number(data.likes) || 0
      );

      setLiked(
        Boolean(data.liked)
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível alterar a curtida.'
      );
    } finally {
      setLiking(false);
    }
  }

  function openGeneralComment() {
    setCommentMode('general');
    setSelectedText('');
    setSelectionOffset(null);
    setCommentText('');
    setSelectedSticker(null);
    setShowStickers(false);
    setShowCommentBox(true);
  }

  function handleTextSelection() {
    setCommentMode('selection');

    const selection =
      window.getSelection();

    if (
      !selection ||
      selection.isCollapsed
    ) {
      return;
    }

    const text =
      selection.toString().trim();

    if (!text) {
      return;
    }

    if (!chapter?.body) {
      return;
    }

    const plainBody =
      chapter.body.replace(
        /<[^>]*>/g,
        ''
      );

    const start =
      plainBody.indexOf(text);

    if (start === -1) {
      return;
    }

    setSelectedText(text);
    setSelectionOffset(start);
    setCommentText('');
    setSelectedSticker(null);
    setShowStickers(false);
    setShowCommentBox(true);
  }

  function cancelComment() {
    setShowCommentBox(false);
    setCommentText('');
    setSelectedText('');
    setSelectionOffset(null);
    setShowStickers(false);
    setSelectedSticker(null);
    setCommentMode('general');

    window
      .getSelection()
      ?.removeAllRanges();
  }

  async function handleStickerUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      setUploadingSticker(true);

      const formData =
        new FormData();

      formData.append(
        'file',
        file
      );

      const response =
        await fetch(
          '/api/stickers',
          {
            method: 'POST',
            body: formData,
          }
        );

      const data =
        await response.json();

      if (response.status === 401) {
        alert(
          'Você precisa estar logado para criar uma figurinha.'
        );
        return;
      }

      if (!response.ok) {
        alert(
          data.error ||
            'Não foi possível criar a figurinha.'
        );
        return;
      }

      const newSticker =
        data.sticker as Sticker;

      setStickers(
        (current) => [
          newSticker,
          ...current.filter(
            (sticker) =>
              sticker.id !==
              newSticker.id
          ),
        ]
      );

      setSelectedSticker(
        newSticker
      );

      setShowStickers(false);
    } catch {
      alert(
        'Não foi possível enviar a figurinha.'
      );
    } finally {
      setUploadingSticker(false);
    }
  }

  function selectSticker(
    sticker: Sticker
  ) {
    setSelectedSticker(
      sticker
    );

    setShowStickers(false);
  }

  async function submitComment() {
    if (
      !commentText.trim() &&
      !selectedSticker
    ) {
      alert(
        'Escreva um comentário ou escolha uma figurinha.'
      );
      return;
    }

    try {
      setSendingComment(true);

      const payload = {
        chapter_id: id,

        body:
          commentText.trim() ||
          ' ',

        selected_text:
          commentMode ===
          'selection'
            ? selectedText ||
              null
            : null,

        start_offset:
          commentMode ===
          'selection'
            ? selectionOffset
            : null,

        sticker_id:
          selectedSticker?.id ||
          null,
      };

      const response =
        await fetch(
          '/api/comments',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const data =
        await response.json();

      if (response.status === 401) {
        alert(
          'Você precisa estar logado para comentar.'
        );
        return;
      }

      if (!response.ok) {
        alert(
          data.error ||
            'Não foi possível publicar o comentário.'
        );
        return;
      }

      setComments(
        (current) => [
          ...current,
          data.comment,
        ]
      );

      if (selectedSticker) {
        setStickers(
          (current) =>
            current
              .map(
                (sticker) =>
                  sticker.id ===
                  selectedSticker.id
                    ? {
                        ...sticker,
                        last_used_at:
                          new Date().toISOString(),
                      }
                    : sticker
              )
              .sort(
                (a, b) => {
                  const aTime =
                    a.last_used_at
                      ? new Date(
                          a.last_used_at
                        ).getTime()
                      : 0;

                  const bTime =
                    b.last_used_at
                      ? new Date(
                          b.last_used_at
                        ).getTime()
                      : 0;

                  return (
                    bTime - aTime
                  );
                }
              )
        );
      }

      cancelComment();
    } catch {
      alert(
        'Não foi possível publicar o comentário.'
      );
    } finally {
      setSendingComment(false);
    }
  }

  function getCommentGroups(): CommentGroup[] {
    const groups =
      new Map<
        string,
        Comment[]
      >();

    comments.forEach(
      (comment) => {
        if (
          comment.start_offset ===
            null ||
          !comment.selected_text
        ) {
          return;
        }

        const key =
          String(
            comment.start_offset
          ) +
          '-' +
          String(
            comment.selected_text
              .length
          );

        const current =
          groups.get(key) || [];

        groups.set(key, [
          ...current,
          comment,
        ]);
      }
    );

    return Array.from(
      groups.values()
    )
      .map((group) => {
        const first =
          group[0];

        if (
          first.start_offset ===
            null ||
          !first.selected_text
        ) {
          return null;
        }

        return {
          comments: group,
          start:
            first.start_offset,
          end:
            first.start_offset +
            first.selected_text
              .length,
        };
      })
      .filter(
        (
          group
        ): group is CommentGroup =>
          group !== null
      )
      .sort(
        (a, b) =>
          a.start - b.start
      );
  }

  function getMediaUrl(
    item: ChapterMedia
  ) {
    return (
      item.url ||
      item.image_url ||
      item.media_url ||
      ''
    );
  }

  function renderChapterBody() {
    if (!chapter?.body) {
      return (
        <p className="text-gray-600">
          Este capítulo ainda não possui
          conteúdo.
        </p>
      );
    }

    const body =
      chapter.body;

    const looksLikeHtml =
      /<\/?[a-z][\s\S]*>/i.test(
        body
      );

    if (looksLikeHtml) {
      return (
        <div
          className="
            chapter-content
            text-[18px]
            leading-8
            text-gray-200
            font-serif
          "
          onMouseUp={
            handleTextSelection
          }
          onTouchEnd={
            handleTextSelection
          }
          dangerouslySetInnerHTML={{
            __html: body,
          }}
        />
      );
    }

    return (
      <article
        onMouseUp={
          handleTextSelection
        }
        onTouchEnd={
          handleTextSelection
        }
        className="
          chapter-content
          text-[18px]
          leading-8
          text-gray-200
          font-serif
          whitespace-pre-wrap
        "
      >
        {body}
      </article>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#ff4f9a]">
            Carregando capítulo...
          </p>

          <p className="text-xs text-gray-600 mt-2">
            Aguarde um instante.
          </p>
        </div>
      </main>
    );
  }

  if (error && !chapter) {
    return (
      <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-5">
            {error ||
              'Capítulo não encontrado.'}
          </p>

          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="
              px-5
              py-3
              rounded-xl
              bg-[#ff4f9a]
              text-black
              font-semibold
            "
          >
            Voltar
          </button>
        </div>
      </main>
    );
  }

  if (!chapter) {
    return null;
  }

  const recentStickers =
    [...stickers]
      .sort((a, b) => {
        const aTime =
          a.last_used_at
            ? new Date(
                a.last_used_at
              ).getTime()
            : 0;

        const bTime =
          b.last_used_at
            ? new Date(
                b.last_used_at
              ).getTime()
            : 0;

        return bTime - aTime;
      })
      .slice(0, 12);

  const sortedMedia =
    [...media].sort(
      (a, b) =>
        (a.position || 0) -
        (b.position || 0)
    );

  const commentGroups =
    getCommentGroups();

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <style>
        {`
          .chapter-content {
            max-width: 100%;
            overflow-wrap: anywhere;
          }

          .chapter-content p {
            margin-bottom: 1.5rem;
          }

          .chapter-content h1,
          .chapter-content h2,
          .chapter-content h3 {
            color: white;
            font-family: inherit;
            font-weight: 700;
            line-height: 1.3;
            margin-top: 2rem;
            margin-bottom: 1rem;
          }

          .chapter-content h1 {
            font-size: 2rem;
          }

          .chapter-content h2 {
            font-size: 1.6rem;
          }

          .chapter-content h3 {
            font-size: 1.3rem;
          }

          .chapter-content strong {
            font-weight: 700;
          }

          .chapter-content em {
            font-style: italic;
          }

          .chapter-content u {
            text-decoration: underline;
          }

          .chapter-content blockquote {
            margin: 1.5rem 0;
            padding-left: 1rem;
            border-left: 3px solid #ff4f9a;
            color: #b5b5b5;
            font-style: italic;
          }

          .chapter-content a {
            color: #ff4f9a;
            text-decoration: underline;
          }

          .chapter-content hr {
            border: 0;
            border-top: 1px solid rgba(255,255,255,0.12);
            margin: 2rem 0;
          }

          .chapter-content img {
            display: block;
            width: auto;
            max-width: min(100%, 560px);
            max-height: 700px;
            height: auto;
            border-radius: 1rem;
            margin: 1.5rem auto;
            object-fit: contain;
          }

          .chapter-content figure {
            margin: 1.5rem 0;
          }

          .chapter-content figcaption {
            text-align: center;
            color: #666;
            font-size: 0.8rem;
          }

          .chapter-content ul {
            list-style: disc;
            padding-left: 1.5rem;
            margin: 1rem 0;
          }

          .chapter-content ol {
            list-style: decimal;
            padding-left: 1.5rem;
            margin: 1rem 0;
          }

          .chapter-content div[style*="text-align: center"] {
            text-align: center;
          }

          .chapter-content div[style*="text-align: right"] {
            text-align: right;
          }

          .chapter-content div[style*="text-align: left"] {
            text-align: left;
          }
        `}
      </style>

      <div className="max-w-3xl mx-auto px-5 py-8">

        {/* TOPO */}

        <div className="flex items-center justify-between gap-4 mb-8">
          <button
            type="button"
            onClick={() =>
              router.push(
                '/historia/' +
                  (chapter.story_id ||
                    '')
              )
            }
            className="
              text-sm
              text-gray-400
              hover:text-white
              transition
            "
          >
            ← Voltar para a história
          </button>

          <button
            type="button"
            onClick={() =>
              setShowContents(true)
            }
            className="
              px-4
              py-2
              rounded-xl
              bg-white/5
              border
              border-white/10
              text-sm
              font-semibold
              hover:border-[#ff4f9a]/50
              transition
            "
          >
            Sumário
          </button>
        </div>

        {/* CABEÇALHO */}

        <header className="mb-10">
          <p className="text-sm text-[#ff4f9a] mb-2">
            Capítulo{' '}
            {chapter.chapter_number}
          </p>

          <h1 className="text-3xl font-bold">
            {chapter.title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleLike}
              disabled={liking}
              className={`
                rounded-xl
                border
                px-4
                py-2
                text-sm
                font-semibold
                transition
                ${
                  liked
                    ? 'border-[#ff4f9a]/60 bg-[#ff4f9a]/10 text-[#ff4f9a]'
                    : 'border-white/10 bg-white/5 text-white hover:border-[#ff4f9a]/50'
                }
                disabled:opacity-50
              `}
            >
              {liked
                ? 'Curtido'
                : 'Curtir'}{' '}
              · {likes}
            </button>

            <button
              type="button"
              onClick={
                openGeneralComment
              }
              className="
                rounded-xl
                border
                border-white/10
                bg-white/5
                px-4
                py-2
                text-sm
                font-semibold
                text-white
                hover:border-[#ff4f9a]/50
                transition
              "
            >
              Comentar
            </button>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}
        </header>

        {/* CONTEÚDO */}

        {renderChapterBody()}

        {/* MÍDIAS DO CAPÍTULO */}

        {sortedMedia.length > 0 && (
          <section className="mt-10 space-y-5">
            {sortedMedia.map(
              (item) => {
                const url =
                  getMediaUrl(item);

                if (!url) {
                  return null;
                }

                return (
                  <div
                    key={item.id}
                    className="flex justify-center"
                  >
                    <img
                      src={url}
                      alt=""
                      className="
                        max-w-[560px]
                        max-h-[600px]
                        w-auto
                        h-auto
                        rounded-2xl
                        object-contain
                      "
                    />
                  </div>
                );
              }
            )}
          </section>
        )}

        {/* MODAL DE COMENTÁRIO */}

        {showCommentBox && (
          <div
            className="
              fixed
              inset-0
              z-50
              bg-black/70
              flex
              items-end
              md:items-center
              justify-center
              p-4
            "
          >
            <div
              className="
                w-full
                max-w-xl
                bg-[#151515]
                border
                border-white/10
                rounded-2xl
                p-5
                shadow-2xl
              "
            >
              <div
                className="
                  flex
                  items-start
                  justify-between
                  gap-4
                  mb-5
                "
              >
                <div className="min-w-0">
                  <p
                    className="
                      text-xs
                      text-[#ff4f9a]
                      uppercase
                      tracking-wider
                      mb-2
                    "
                  >
                    {commentMode ===
                    'selection'
                      ? 'Comentando o trecho'
                      : 'Comentando o capítulo'}
                  </p>

                  {commentMode ===
                    'selection' &&
                    selectedText && (
                      <p
                        className="
                          text-sm
                          text-gray-300
                          italic
                          leading-6
                        "
                      >
                        “{selectedText}”
                      </p>
                    )}
                </div>

                <button
                  type="button"
                  onClick={
                    cancelComment
                  }
                  className="
                    text-gray-500
                    hover:text-white
                    text-2xl
                  "
                >
                  ×
                </button>
              </div>

              <textarea
                value={commentText}
                onChange={(event) =>
                  setCommentText(
                    event.target.value
                  )
                }
                placeholder="Escreva seu comentário..."
                rows={4}
                autoFocus
                className="
                  w-full
                  resize-none
                  rounded-xl
                  bg-white/5
                  border
                  border-white/10
                  px-4
                  py-3
                  text-white
                  placeholder:text-gray-600
                  outline-none
                  focus:border-[#ff4f9a]/60
                "
              />

              {/* FIGURINHAS */}

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowStickers(
                      (current) =>
                        !current
                    )
                  }
                  className="
                    px-4
                    py-2
                    rounded-xl
                    bg-white/5
                    border
                    border-white/10
                    text-sm
                    text-gray-300
                    hover:border-[#ff4f9a]/50
                    transition
                  "
                >
                  Figurinhas
                </button>

                {showStickers && (
                  <div
                    className="
                      mt-3
                      rounded-2xl
                      bg-[#101010]
                      border
                      border-white/10
                      p-4
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                        gap-3
                        mb-4
                      "
                    >
                      <div>
                        <p
                          className="
                            text-sm
                            font-semibold
                            text-white
                          "
                        >
                          Usadas recentemente
                        </p>

                        <p
                          className="
                            text-xs
                            text-gray-600
                            mt-1
                          "
                        >
                          Escolha uma figurinha ou
                          crie uma nova.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          fileInputRef.current?.click()
                        }
                        disabled={
                          uploadingSticker
                        }
                        className="
                          px-3
                          py-2
                          rounded-xl
                          bg-[#ff4f9a]
                          text-black
                          text-xs
                          font-semibold
                          disabled:opacity-50
                        "
                      >
                        {uploadingSticker
                          ? 'Enviando...'
                          : '+ Criar figurinha'}
                      </button>
                    </div>

                    {recentStickers.length ===
                    0 ? (
                      <div
                        className="
                          rounded-xl
                          bg-white/5
                          border
                          border-white/10
                          p-5
                          text-center
                        "
                      >
                        <p className="text-sm text-gray-500">
                          Você ainda não tem
                          figurinhas.
                        </p>

                        <p className="text-xs text-gray-600 mt-1">
                          Crie a primeira usando uma
                          imagem da sua galeria.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="
                          grid
                          grid-cols-4
                          sm:grid-cols-6
                          gap-3
                        "
                      >
                        {recentStickers.map(
                          (sticker) => (
                            <button
                              key={sticker.id}
                              type="button"
                              onClick={() =>
                                selectSticker(
                                  sticker
                                )
                              }
                              className={`
                                aspect-square
                                rounded-xl
                                overflow-hidden
                                border
                                transition
                                ${
                                  selectedSticker?.id ===
                                  sticker.id
                                    ? 'border-[#ff4f9a] ring-2 ring-[#ff4f9a]/30'
                                    : 'border-white/10 hover:border-[#ff4f9a]/50'
                                }
                              `}
                            >
                              <img
                                src={
                                  sticker.image_url
                                }
                                alt="Figurinha"
                                className="
                                  w-full
                                  h-full
                                  object-cover
                                "
                              />
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={
                  handleStickerUpload
                }
                className="hidden"
              />

              {selectedSticker && (
                <div
                  className="
                    mt-4
                    rounded-xl
                    bg-white/5
                    border
                    border-white/10
                    p-3
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      justify-between
                      mb-2
                    "
                  >
                    <p className="text-xs text-gray-500">
                      Figurinha selecionada
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSticker(
                          null
                        )
                      }
                      className="
                        text-gray-500
                        hover:text-white
                      "
                    >
                      Remover
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <img
                      src={
                        selectedSticker.image_url
                      }
                      alt="Figurinha selecionada"
                      className="
                        max-h-40
                        max-w-full
                        rounded-xl
                        object-contain
                      "
                    />
                  </div>
                </div>
              )}

              <div
                className="
                  flex
                  justify-end
                  gap-3
                  mt-4
                "
              >
                <button
                  type="button"
                  onClick={
                    cancelComment
                  }
                  className="
                    px-4
                    py-2
                    rounded-xl
                    text-sm
                    text-gray-400
                    hover:text-white
                    transition
                  "
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={
                    submitComment
                  }
                  disabled={
                    sendingComment ||
                    (!commentText.trim() &&
                      !selectedSticker)
                  }
                  className="
                    px-5
                    py-2
                    rounded-xl
                    bg-[#ff4f9a]
                    text-black
                    text-sm
                    font-semibold
                    disabled:opacity-50
                  "
                >
                  {sendingComment
                    ? 'Publicando...'
                    : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMENTÁRIOS DE TRECHOS */}

        {activeCommentGroup.length >
          0 && (
          <div
            className="
              fixed
              inset-0
              z-50
              bg-black/70
              flex
              items-end
              md:items-center
              justify-center
              p-4
            "
            onClick={() =>
              setActiveCommentGroup([])
            }
          >
            <div
              className="
                w-full
                max-w-xl
                max-h-[80vh]
                overflow-y-auto
                bg-[#151515]
                border
                border-white/10
                rounded-2xl
                p-5
                shadow-2xl
              "
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div
                className="
                  flex
                  items-start
                  justify-between
                  gap-4
                  mb-5
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      text-gray-500
                      uppercase
                      tracking-wider
                      mb-1
                    "
                  >
                    Comentários do trecho
                  </p>

                  <p className="text-sm text-white">
                    {activeCommentGroup[0]
                      ?.selected_text
                      ? '“' +
                        activeCommentGroup[0]
                          .selected_text +
                        '”'
                      : 'Trecho comentado'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setActiveCommentGroup([])
                  }
                  className="
                    text-gray-500
                    hover:text-white
                    text-2xl
                  "
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {activeCommentGroup.map(
                  (comment) => (
                    <div
                      key={comment.id}
                      className="
                        rounded-2xl
                        bg-white/5
                        border
                        border-white/10
                        p-4
                      "
                    >
                      <div
                        className="
                          flex
                          items-center
                          gap-3
                          mb-3
                        "
                      >
                        {comment.profiles
                          ?.avatar_url ? (
                          <img
                            src={
                              comment
                                .profiles
                                .avatar_url
                            }
                            alt=""
                            className="
                              w-8
                              h-8
                              rounded-full
                              object-cover
                            "
                          />
                        ) : (
                          <div
                            className="
                              w-8
                              h-8
                              rounded-full
                              bg-[#ff4f9a]/20
                              flex
                              items-center
                              justify-center
                              text-[#ff4f9a]
                              text-xs
                              font-bold
                            "
                          >
                            {(
                              comment.profiles
                                ?.display_name ||
                              comment.profiles
                                ?.username ||
                              '?'
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}

                        <div>
                          <p className="text-sm font-semibold text-white">
                            {comment.profiles
                              ?.display_name ||
                              comment.profiles
                                ?.username ||
                              'Usuário'}
                          </p>

                          {comment.profiles
                            ?.username && (
                            <p className="text-xs text-gray-600">
                              @
                              {
                                comment
                                  .profiles
                                  .username
                              }
                            </p>
                          )}
                        </div>
                      </div>

                      {comment.body.trim() && (
                        <p className="text-gray-300 leading-7">
                          {comment.body}
                        </p>
                      )}

                      {comment
                        .user_stickers
                        ?.image_url && (
                        <div className="mt-3">
                          <img
                            src={
                              comment
                                .user_stickers
                                .image_url
                            }
                            alt="Figurinha"
                            className="
                              max-w-full
                              max-h-64
                              rounded-xl
                              object-contain
                            "
                          />
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* COMENTÁRIOS */}

        <section
          className="
            mt-16
            pt-10
            border-t
            border-white/10
          "
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold">
              Comentários
            </h2>

            <button
              type="button"
              onClick={
                openGeneralComment
              }
              className="
                rounded-xl
                border
                border-white/10
                bg-white/5
                px-4
                py-2
                text-sm
                font-semibold
                hover:border-[#ff4f9a]/50
                transition
              "
            >
              Comentar capítulo
            </button>
          </div>

          {comments.length === 0 ? (
            <div
              className="
                rounded-2xl
                bg-white/5
                border
                border-white/10
                p-6
              "
            >
              <p className="text-gray-500 text-sm">
                Ainda não há comentários neste
                capítulo.
              </p>

              <p className="text-gray-600 text-xs mt-2">
                Você pode comentar o capítulo
                inteiro ou selecionar um trecho
                do texto.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map(
                (comment) => (
                  <div
                    key={comment.id}
                    className="
                      rounded-2xl
                      bg-white/5
                      border
                      border-white/10
                      p-5
                    "
                  >
                    {comment.selected_text && (
                      <div
                        className="
                          border-l-2
                          border-[#ff4f9a]
                          pl-4
                          mb-4
                        "
                      >
                        <p className="text-xs text-gray-500 mb-1">
                          Trecho comentado
                        </p>

                        <p className="text-sm text-gray-300 italic">
                          “
                          {
                            comment.selected_text
                          }
                          ”
                        </p>
                      </div>
                    )}

                    <div
                      className="
                        flex
                        items-center
                        gap-3
                        mb-3
                      "
                    >
                      {comment.profiles
                        ?.avatar_url ? (
                        <img
                          src={
                            comment.profiles
                              .avatar_url
                          }
                          alt=""
                          className="
                            w-8
                            h-8
                            rounded-full
                            object-cover
                          "
                        />
                      ) : (
                        <div
                          className="
                            w-8
                            h-8
                            rounded-full
                            bg-[#ff4f9a]/20
                            flex
                            items-center
                            justify-center
                            text-[#ff4f9a]
                            text-xs
                            font-bold
                          "
                        >
                          {(
                            comment.profiles
                              ?.display_name ||
                            comment.profiles
                              ?.username ||
                            '?'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}

                      <div>
                        <p className="text-sm font-semibold text-white">
                          {comment.profiles
                            ?.display_name ||
                            comment.profiles
                              ?.username ||
                            'Usuário'}
                        </p>

                        {comment.profiles
                          ?.username && (
                          <p className="text-xs text-gray-600">
                            @
                            {
                              comment.profiles
                                .username
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {comment.body.trim() && (
                      <p className="text-gray-300 leading-7">
                        {comment.body}
                      </p>
                    )}

                    {comment
                      .user_stickers
                      ?.image_url && (
                      <div className="mt-3">
                        <img
                          src={
                            comment
                              .user_stickers
                              .image_url
                          }
                          alt="Figurinha"
                          className="
                            max-w-full
                            max-h-64
                            rounded-xl
                            object-contain
                          "
                        />
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* NAVEGAÇÃO */}

        <nav
          className="
            mt-14
            pt-8
            border-t
            border-white/10
            flex
            items-center
            justify-between
            gap-4
          "
        >
          {previousChapter ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  '/capitulo/' +
                    previousChapter.id
                )
              }
              className="
                flex-1
                text-left
                px-4
                py-4
                rounded-xl
                bg-white/5
                border
                border-white/10
                hover:border-[#ff4f9a]/50
                transition
              "
            >
              <span className="block text-xs text-gray-500 mb-1">
                Capítulo anterior
              </span>

              <span className="text-sm font-semibold text-white">
                ← Capítulo{' '}
                {
                  previousChapter.chapter_number
                }
              </span>
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {nextChapter ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  '/capitulo/' +
                    nextChapter.id
                )
              }
              className="
                flex-1
                text-right
                px-4
                py-4
                rounded-xl
                bg-white/5
                border
                border-white/10
                hover:border-[#ff4f9a]/50
                transition
              "
            >
              <span className="block text-xs text-gray-500 mb-1">
                Próximo capítulo
              </span>

              <span className="text-sm font-semibold text-white">
                Capítulo{' '}
                {
                  nextChapter.chapter_number
                }{' '}
                →
              </span>
            </button>
          ) : (
            <div className="flex-1" />
          )}
        </nav>
      </div>

      {/* SUMÁRIO */}

      {showContents && (
        <div
          className="
            fixed
            inset-0
            z-50
            bg-black/70
          "
          onClick={() =>
            setShowContents(false)
          }
        >
          <div
            className="
              absolute
              right-0
              top-0
              h-full
              w-full
              max-w-md
              bg-[#111111]
              border-l
              border-white/10
              overflow-y-auto
            "
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className="
                sticky
                top-0
                bg-[#111111]
                border-b
                border-white/10
                px-6
                py-5
                flex
                items-center
                justify-between
              "
            >
              <div>
                <p className="text-xs text-[#ff4f9a] uppercase tracking-wider">
                  História
                </p>

                <h2 className="text-xl font-bold mt-1">
                  Sumário
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowContents(false)
                }
                className="
                  text-gray-400
                  hover:text-white
                  text-2xl
                "
              >
                ×
              </button>
            </div>

            <div className="p-4">
              {chapters.length ===
              0 ? (
                <p className="text-gray-500 text-sm px-2 py-4">
                  Nenhum capítulo encontrado.
                </p>
              ) : (
                <div className="space-y-2">
                  {chapters.map(
                    (item) => {
                      const isCurrent =
                        item.id ===
                        chapter.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setShowContents(
                              false
                            );

                            if (
                              !isCurrent
                            ) {
                              router.push(
                                '/capitulo/' +
                                  item.id
                              );
                            }
                          }}
                          className={`
                            w-full
                            text-left
                            px-4
                            py-4
                            rounded-xl
                            border
                            transition
                            ${
                              isCurrent
                                ? 'bg-[#ff4f9a]/10 border-[#ff4f9a]/50'
                                : 'bg-white/5 border-white/10 hover:border-[#ff4f9a]/40'
                            }
                          `}
                        >
                          <div
                            className="
                              flex
                              items-center
                              gap-3
                            "
                          >
                            <span
                              className={`
                                text-xs
                                font-semibold
                                ${
                                  isCurrent
                                    ? 'text-[#ff4f9a]'
                                    : 'text-gray-500'
                                }
                              `}
                            >
                              {
                                item.chapter_number
                              }
                            </span>

                            <div className="min-w-0">
                              <p
                                className={`
                                  font-semibold
                                  truncate
                                  ${
                                    isCurrent
                                      ? 'text-[#ff4f9a]'
                                      : 'text-white'
                                  }
                                `}
                              >
                                {item.title}
                              </p>

                              {isCurrent && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Você está aqui
                                </p>
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
          </div>
        </div>
      )}
    </main>
  );
}
