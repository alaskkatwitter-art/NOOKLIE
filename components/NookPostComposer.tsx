'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import { useEffect, useMemo, useState } from 'react';

type Story = {
  id: string;
  title: string;
  cover_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
};

const MAX_TEXT = 5000;
const MAX_MEDIA = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export default function NookPostComposer({
  open,
  onClose,
  onPublished,
}: Props) {
  const [body, setBody] = useState('');
  const [storyId, setStoryId] = useState('');
  const [stories, setStories] = useState<Story[]>([]);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const canPublish = useMemo(() => {
    return body.trim().length > 0 || mediaFiles.length > 0;
  }, [body, mediaFiles]);

  /*
   * Carrega as histórias do usuário quando o compositor é aberto.
   */
  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  /*
   * Libera os previews criados com URL.createObjectURL
   * quando o componente for desmontado.
   */
  useEffect(() => {
    return () => {
      mediaPreviews.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [mediaPreviews]);

  /*
   * Fecha com ESC.
   */
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !publishing) {
        handleClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, publishing]);

  /*
   * Limpa completamente o compositor.
   */
  function resetComposer() {
    mediaPreviews.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    setBody('');
    setStoryId('');
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
        `Você pode adicionar no máximo ${MAX_MEDIA} imagens ou GIFs.`
      );

      event.target.value = '';
      return;
    }

    for (const file of selected) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Use apenas JPG, PNG, WEBP ou GIF.');

        event.target.value = '';
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError('Cada arquivo pode ter no máximo 10 MB.');

        event.target.value = '';
        return;
      }
    }

    const previews = selected.map((file) =>
      URL.createObjectURL(file)
    );

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
    }

    setMediaFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index)
    );

    setMediaPreviews((current) =>
      current.filter((_, previewIndex) => previewIndex !== index)
    );
  }

  /*
   * Faz upload dos arquivos depois que o post já foi criado.
   */
  async function uploadPostMedia(postId: string) {
    for (const file of mediaFiles) {
      const formData = new FormData();

      formData.append('file', file);
      formData.append('post_id', postId);

      const response = await fetch('/api/nook-posts/media', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível enviar uma das imagens.'
        );
      }
    }
  }

  /*
   * Publica o post.
   */
  async function handlePublish() {
    if (!canPublish || publishing) return;

    setPublishing(true);
    setError('');

    try {
      /*
       * Primeiro criamos o post.
       */
      const response = await fetch('/api/nook-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: body.trim() || null,
          image_url: null,
          story_id: storyId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Não foi possível criar a publicação.'
        );
      }

      /*
       * Depois enviamos as imagens/GIFs.
       */
      if (data.post?.id && mediaFiles.length > 0) {
        try {
          await uploadPostMedia(data.post.id);
        } catch (mediaError) {
          console.error(mediaError);

          setError(
            mediaError instanceof Error
              ? mediaError.message
              : 'A publicação foi criada, mas não foi possível enviar todas as imagens.'
          );

          setPublishing(false);
          return;
        }
      }

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      {/* Fundo clicável */}
      <div
        className="absolute inset-0"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#100c11] shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#ff78b9]">
              Nooklie
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              Novo aviso ou publicação
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={publishing}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-white/45 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Conteúdo */}
        <div className="max-h-[78vh] overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-2xl border border-[#ff78b9]/20 bg-gradient-to-br from-[#ff78b9]/15 to-transparent p-5"><p className="text-lg font-bold text-[#ff9bca]">Uma novidade para compartilhar?</p><p className="mt-2 text-sm leading-6 text-white/60">Conte sobre o próximo capítulo, uma pausa na escrita ou uma ideia. Você também pode anexar imagens e vincular uma história.</p></div>
          {/* Texto */}
          <textarea
            value={body}
            onChange={(event) =>
              setBody(event.target.value.slice(0, MAX_TEXT))
            }
            aria-label="Texto do aviso ou publicação"
            placeholder="Dê um título ao seu aviso na primeira linha…\n\nDepois, conte os detalhes para seus leitores."
            rows={10}
            autoFocus
            className="w-full resize-y rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-4 text-[15px] leading-7 text-white outline-none transition placeholder:text-white/25 focus:border-[#ff78b9]/35"
          />

          {/* Contador */}
          <div className="mt-2 flex justify-end">
            <span className="text-[11px] text-white/25">
              {body.length}/{MAX_TEXT}
            </span>
          </div>

          {/* Previews */}
          {mediaPreviews.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {mediaPreviews.map((preview, index) => (
                <div
                  key={`${preview}-${index}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30"
                >
                  <img
                    src={contentMediaUrl(preview)}
                    alt=""
                    className="h-full w-full object-cover"
                  />

                  <button
                    type="button"
                    onClick={() => removeMedia(index)}
                    disabled={publishing}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-[#ff78b9] hover:text-[#190d16] disabled:opacity-30"
                    aria-label="Remover imagem"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload */}
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white/75">
                Adicionar imagens ou GIFs
              </p>

              <p className="mt-1 text-xs text-white/30">
                Até 4 arquivos • 10 MB cada
              </p>
            </div>

            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[#ff78b9]/20 bg-[#ff78b9]/[0.08] px-4 py-2.5 text-xs font-bold text-[#ff78b9] transition hover:bg-[#ff78b9]/[0.14]">
              Escolher arquivos

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleMediaSelection}
                disabled={
                  publishing ||
                  mediaFiles.length >= MAX_MEDIA
                }
                className="hidden"
              />
            </label>
          </div>

          {/* História */}
          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <label className="block text-sm font-bold text-white/75">
              Vincular a uma história
            </label>

            <p className="mt-1 text-xs text-white/30">
              Opcional. A publicação ficará associada à sua história.
            </p>

            <select
              value={storyId}
              onChange={(event) =>
                setStoryId(event.target.value)
              }
              disabled={publishing || loadingStories}
              className="mt-3 w-full rounded-xl border border-white/[0.08] bg-[#171118] px-3 py-3 text-sm text-white outline-none focus:border-[#ff78b9]/35"
            >
              <option value="">
                {loadingStories
                  ? 'Carregando histórias...'
                  : 'Nenhuma história'}
              </option>

              {stories.map((story) => (
                <option
                  key={story.id}
                  value={story.id}
                >
                  {story.title}
                </option>
              ))}
            </select>
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

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.07] px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={publishing}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white/45 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-30"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish || publishing}
            className="rounded-xl bg-[#ff78b9] px-5 py-2.5 text-sm font-black text-[#190d16] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {publishing ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
