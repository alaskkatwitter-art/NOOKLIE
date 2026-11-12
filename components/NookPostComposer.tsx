'use client';

import { feedImageTypes, feedVideoTypes, maxFeedUploadBytes } from '@/lib/social/attachments';
import { activeMention } from '@/lib/social/mentions';
import LinkedNewsCard from './LinkedNewsCard';
import {isNewsArticle, newsArticles, newsArticleSlugs} from '@/lib/news/articles';
import {contentMediaUrl} from '@/lib/security/content-media';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ImagePlus, Newspaper, X } from 'lucide-react';

type Story = {
  id: string;
  title: string;
  cover_url: string | null;
};

type Props = {
  open: boolean;
  origin?: 'feed' | 'mural';
  initialNewsSlug?: string;
  initialStoryId?: string;
  initialBody?: string;
  author?: { avatar_url?: string | null; username?: string } | null;
  onClose: () => void;
  onPublished?: () => void;
};

const MAX_TEXT = 5000;
const MAX_MEDIA = 4;
const ACCEPTED_TYPES = [...feedImageTypes, ...feedVideoTypes];

export default function NookPostComposer({
  open,
  onClose,
  onPublished,
  origin = 'feed',
  initialNewsSlug,
  initialStoryId = '',
  initialBody = '',
  author,
}: Props) {
  const titleId = useId();
  const attachmentId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [linkPicker, setLinkPicker] = useState<'story' | 'news' | null>(null);
  const [body, setBody] = useState(initialBody);
  const [caret, setCaret] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [matches, setMatches] = useState<{ query: string; people: { id: string; username: string; display_name: string | null }[] }>();
  const textInput = useRef<HTMLTextAreaElement>(null);
  const mention = mentionDismissed ? null : activeMention(body, caret);
  const query = open ? mention?.query : undefined;
  const suggestions = query && matches?.query === query ? matches.people : [];

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/chat/people?q=' + encodeURIComponent(query), { signal: controller.signal });
        if (!response.ok) return;
        const { people } = await response.json();
        if (!controller.signal.aborted) setMatches({ query, people: (people ?? []).slice(0, 5) });
      } catch { /* Typing a full username works without suggestions. */ }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function selectMention(username: string) {
    if (!mention) return;
    const prefix = body.slice(0, mention.start) + '@' + username + ' ';
    const updated = prefix + body.slice(mention.end);
    if (updated.length > MAX_TEXT) return;
    setBody(updated);
    setCaret(prefix.length);
    setMentionDismissed(true);
    requestAnimationFrame(() => {
      textInput.current?.focus();
      textInput.current?.setSelectionRange(prefix.length, prefix.length);
    });
  }
  const [storyId, setStoryId] = useState(initialStoryId);
  const [newsSlug,setNewsSlug]=useState(isNewsArticle(initialNewsSlug)?initialNewsSlug:'');
  const [stories, setStories] = useState<Story[]>([]);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const previewUrls = useRef(new Set<string>());
  const [loadingStories, setLoadingStories] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const canPublish = useMemo(() => {
    return body.trim().length > 0 || mediaFiles.length > 0 || !!newsSlug;
  }, [body, mediaFiles, newsSlug]);

  const needsStories = open && (linkPicker === 'story' || Boolean(storyId));
  useEffect(() => {
    if (!needsStories) return;

    setError('');

    let active = true;

    async function loadStories() {
      setLoadingStories(true);

      try {
        const response = await fetch('/api/profile/stories', {
          cache: 'no-store',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || 'Não foi possível carregar suas histórias.'
          );
        }

        if (active) {
          setStories(data.stories || []);
        }
      } catch (err) {
        console.error(err);

        if (active) {
          setStories([]);
        }
      } finally {
        if (active) {
          setLoadingStories(false);
        }
      }
    }

    loadStories();

    return () => {
      active = false;
    };
  }, [needsStories]);

  /*
   * Libera os previews criados com URL.createObjectURL
   * quando o componente for desmontado.
   */
  useEffect(() => {
    const urls = previewUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      node?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  /*
   * Limpa completamente o compositor.
   */
  function resetComposer() {
    mediaPreviews.forEach((url) => {
      URL.revokeObjectURL(url);
      previewUrls.current.delete(url);
    });

    setBody('');
    setCaret(0);
    setMentionDismissed(false);
    setStoryId('');
    setNewsSlug('');
    setLinkPicker(null);
    setMediaFiles([]);
    setMediaPreviews([]);
    setError('');
  }

  function handleClose() {
    if (publishing) return;

    resetComposer();
    onClose();
  }

  /*
   * Seleção de imagens/GIFs.
   */
  function handleMediaSelection(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(event.target.files || []);

    if (!selected.length) return;

    setError('');

    if (mediaFiles.length + selected.length > MAX_MEDIA) {
      setError(
        `Você pode adicionar no máximo ${MAX_MEDIA} arquivos.`
      );

      event.target.value = '';
      return;
    }

    for (const file of selected) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Use JPG, PNG, WebP, GIF, MP4 ou WebM.');

        event.target.value = '';
        return;
      }

    }
    if ([...mediaFiles, ...selected].reduce((size, file) => size + file.size, 0) > maxFeedUploadBytes) {
      setError('Os arquivos podem somar até 4 MB.');
      event.target.value = '';
      return;
    }

    const previews = selected.map((file) =>
      URL.createObjectURL(file)
    );

    previews.forEach(url => previewUrls.current.add(url));
    setMediaFiles((current) => [...current, ...selected]);
    setMediaPreviews((current) => [...current, ...previews]);

    event.target.value = '';
  }

  /*
   * Remove uma imagem/GIF selecionado.
   */
  function removeMedia(index: number) {
    const preview = mediaPreviews[index];

    if (preview) {
      URL.revokeObjectURL(preview);
      previewUrls.current.delete(preview);
    }

    setMediaFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index)
    );

    setMediaPreviews((current) =>
      current.filter((_, previewIndex) => previewIndex !== index)
    );
  }

  async function handlePublish() {
    if (!canPublish || publishing) return;

    setPublishing(true);
    setError('');

    try {
      const fields = { origin, body: body.trim(), story_id: storyId || null, news_slug: newsSlug || null };
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value) form.set(key, value);
      }
      for (const file of mediaFiles) form.append('files', file);
      const response = mediaFiles.length
        ? await fetch('/api/nook-posts/attachments', { method: 'POST', body: form })
        : await fetch('/api/nook-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Não foi possível criar a publicação.');

      /*
       * Sucesso.
       *
       * Importante:
       * não usamos handleClose() aqui porque publishing ainda
       * está como true. Resetamos diretamente antes de fechar.
       */
      resetComposer();
      onClose();
      onPublished?.();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível publicar.'
      );
    } finally {
      setPublishing(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={`nook-composer ${origin === 'feed' ? 'nook-composer-feed' : ''}`}
      onCancel={event => { event.preventDefault(); handleClose(); }}
      onClick={event => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div className="nook-composer-layout">
        <header className="nook-composer-header">
          <button type="button" onClick={handleClose} disabled={publishing} className="nook-composer-tool" aria-label="Fechar">
            <X size={24} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="sr-only">{origin === 'mural' ? 'Publicar no mural' : 'Nova publicação'}</h2>
          <button type="button" onClick={handlePublish} disabled={!canPublish || publishing} className="nook-composer-publish">
            {publishing ? 'Publicando…' : 'Publicar'}
          </button>
        </header>
        <div className="nook-composer-body">
          <span className="nook-composer-avatar" aria-hidden="true">
            {author?.avatar_url ? <img src={contentMediaUrl(author.avatar_url)} alt="" /> : author?.username?.charAt(0).toUpperCase() || 'N'}
          </span>
          <div className="min-w-0 flex-1">
            <textarea
              ref={textInput}
              value={body}
              maxLength={MAX_TEXT}
              onChange={(event) => {
                setBody(event.target.value);
                setCaret(event.target.selectionStart);
                setMentionDismissed(false);
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && suggestions.length) {
                  event.preventDefault();
                  event.stopPropagation();
                  setMentionDismissed(true);
                }
              }}
              aria-label="Texto do aviso ou publicação"
              placeholder={origin === 'mural' ? 'Publique alguma coisa no seu mural…' : 'O que está acontecendo?'}
              rows={5}
              className="nook-composer-text"
            />

            {suggestions.length > 0 && <ul aria-label="Sugestões de menções" className="mt-2 rounded-xl border border-pink-200/20 bg-[#211520] p-1">
              {suggestions.map(person => <li key={person.id}>
                <button type="button" onClick={() => selectMention(person.username)} disabled={publishing}
                  className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-pink-200 hover:bg-white/10">
                  @{person.username}{person.display_name && <span className="ml-2 text-white/70">{person.display_name}</span>}
                </button>
              </li>)}
            </ul>}

            {mediaPreviews.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {mediaPreviews.map((preview, index) => (
                  <div
                    key={`${preview}-${index}`}
                    className="group relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30"
                  >
                    {feedVideoTypes.includes(mediaFiles[index]?.type) ? (
                      <video src={preview} muted playsInline preload="metadata" className="h-full w-full object-contain" />
                    ) : (
                    <img
                      src={contentMediaUrl(preview)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    )}

                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      disabled={publishing}
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-[#ff78b9] hover:text-[#190d16] disabled:opacity-30"
                      aria-label="Remover arquivo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div id={attachmentId}>
              {(linkPicker === 'news' || newsSlug) && (
                <div className="mt-3">
                  <label className="block text-sm font-semibold">Matéria do jornal
                    <select value={newsSlug} disabled={publishing} onChange={event => {
                      setNewsSlug(event.target.value);
                      if (event.target.value) setStoryId('');
                    }} className="nook-input mt-2 w-full">
                      <option value="">Nenhuma matéria</option>
                      {newsArticleSlugs.map(slug => <option key={slug} value={slug}>{newsArticles[slug].title}</option>)}
                    </select>
                  </label>
                  <LinkedNewsCard slug={newsSlug} />
                </div>
              )}
              {(linkPicker === 'story' || storyId) && (
                <label className="mt-3 block text-sm font-semibold">História vinculada
                  <select value={storyId} disabled={publishing || loadingStories} onChange={event => {
                    setStoryId(event.target.value);
                    if (event.target.value) setNewsSlug('');
                  }} className="nook-input mt-2 w-full">
                    <option value="">{loadingStories ? 'Carregando histórias…' : 'Nenhuma história'}</option>
                    {stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}
                  </select>
                </label>
              )}
            </div>

            {/* Erro */}
            {error && (
              <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3">
                <p className="text-xs font-semibold leading-5 text-red-300">
                  {error}
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="nook-composer-toolbar">
          <input ref={mediaInput} type="file" accept={ACCEPTED_TYPES.join(',')} multiple onChange={handleMediaSelection} hidden />
          <button type="button" className="nook-composer-tool" aria-label="Adicionar imagens, GIFs ou vídeos" title="Adicionar imagens, GIFs ou vídeos" disabled={publishing || mediaFiles.length >= MAX_MEDIA} onClick={() => mediaInput.current?.click()}>
            <ImagePlus size={23} aria-hidden="true" />
          </button>
          <button type="button" className="nook-composer-tool" aria-label="Vincular história" title="Vincular história" aria-controls={attachmentId} aria-pressed={linkPicker === 'story' || Boolean(storyId)} disabled={publishing} onClick={() => setLinkPicker(linkPicker === 'story' ? null : 'story')}>
            <BookOpen size={23} aria-hidden="true" />
          </button>
          <button type="button" className="nook-composer-tool" aria-label="Vincular matéria do jornal" title="Vincular matéria do jornal" aria-controls={attachmentId} aria-pressed={linkPicker === 'news' || Boolean(newsSlug)} disabled={publishing} onClick={() => setLinkPicker(linkPicker === 'news' ? null : 'news')}>
            <Newspaper size={23} aria-hidden="true" />
          </button>
          <span className="ml-auto text-xs tabular-nums text-[var(--ui-muted)]">{body.length} / {MAX_TEXT}</span>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
