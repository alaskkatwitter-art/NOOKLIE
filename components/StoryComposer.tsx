'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import {
  useEffect,
  useRef,
  useState,
} from 'react';

type StoryComposerProps = {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ACCEPTED_TYPES =
  'image/jpeg,image/png,image/webp,image/gif';

const MAX_THOUGHT_LENGTH = 100;

type Filter =
  | 'normal'
  | 'grayscale'
  | 'sepia'
  | 'bright'
  | 'contrast'
  | 'blur';

export default function StoryComposer({
  open,
  onClose,
  onPublished,
}: StoryComposerProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const previewUrlRef =
    useRef<string | null>(null);

  const [file, setFile] =
    useState<File | null>(null);

  const [preview, setPreview] =
    useState('');

  const [thought, setThought] =
    useState('');

  const [text, setText] =
    useState('');

  const [selectedEmoji, setSelectedEmoji] =
    useState('');

  const [filter, setFilter] =
    useState<Filter>('normal');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [step, setStep] =
    useState<'select' | 'edit'>('select');

  /*
   * Limpa Object URLs quando o componente
   * troca de imagem ou é desmontado.
   */
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(
          previewUrlRef.current
        );
      }
    };
  }, []);

  /*
   * Fecha o editor com ESC.
   */
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === 'Escape' &&
        !loading
      ) {
        close();
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open, loading]);

  function clearPreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(
        previewUrlRef.current
      );

      previewUrlRef.current = null;
    }
  }

  function resetComposer() {
    clearPreviewUrl();

    setFile(null);
    setPreview('');
    setThought('');
    setText('');
    setSelectedEmoji('');
    setFilter('normal');
    setError('');
    setStep('select');

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function close() {
    if (loading) return;

    resetComposer();
    onClose();
  }

  function handleFile(
    selectedFile: File | null
  ) {
    setError('');

    if (!selectedFile) return;

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      setError(
        'A imagem ou GIF deve ter no máximo 5 MB.'
      );

      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (
      !allowedTypes.includes(
        selectedFile.type
      )
    ) {
      setError(
        'Formato não permitido. Use JPG, PNG, WEBP ou GIF.'
      );

      return;
    }

    clearPreviewUrl();

    const url =
      URL.createObjectURL(
        selectedFile
      );

    previewUrlRef.current = url;

    setFile(selectedFile);
    setPreview(url);
    setThought('');
    setText('');
    setSelectedEmoji('');
    setFilter('normal');

    setStep('edit');
  }

  function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile =
      event.target.files?.[0] ||
      null;

    handleFile(selectedFile);
  }

  function handleThoughtChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const value =
      event.target.value.slice(
        0,
        MAX_THOUGHT_LENGTH
      );

    setThought(value);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  /*
   * Retorna o filtro CSS visual.
   */
  function getFilterStyle() {
    switch (filter) {
      case 'grayscale':
        return 'grayscale(1)';

      case 'sepia':
        return 'sepia(0.8)';

      case 'bright':
        return 'brightness(1.25)';

      case 'contrast':
        return 'contrast(1.35)';

      case 'blur':
        return 'blur(2px)';

      default:
        return 'none';
    }
  }

  /*
   * Para manter GIF animado, a imagem original
   * é enviada quando nenhum filtro/edição visual
   * foi aplicado.
   *
   * Texto e pensamento continuam sendo enviados
   * separadamente para a API.
   */
  async function publish() {
    if (!file || loading) return;

    setLoading(true);
    setError('');

    try {
      const formData =
        new FormData();

      formData.append(
        'file',
        file
      );

      if (thought.trim()) {
        formData.append(
          'thought',
          thought.trim()
        );
      }

      const response =
        await fetch(
          '/api/stories',
          {
            method: 'POST',
            body: formData,
          }
        );

      let data: any = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível publicar o Story.'
        );
      }

      resetComposer();

      onPublished?.();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível publicar o Story.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          close();
        }
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[28px] bg-[#fffafc] shadow-2xl">
        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#21151d]">
              {step === 'select'
                ? 'Criar Story'
                : 'Editar Story'}
            </h2>

            {step === 'edit' && (
              <p className="text-xs text-black/45">
                Personalize antes de publicar.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={close}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-lg font-bold text-black/60 transition hover:bg-black/10 disabled:opacity-50"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* CONTEÚDO */}

        <div className="flex min-h-0 flex-1 overflow-auto">
          {step === 'select' ? (
            <div className="flex w-full flex-col items-center justify-center px-6 py-16">
              <button
                type="button"
                onClick={openFilePicker}
                className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[#21151d] text-4xl text-white shadow-xl transition hover:scale-105 hover:bg-[#35242e]"
              >
                +
              </button>

              <h3 className="mt-6 text-xl font-black text-[#21151d]">
                Adicione uma imagem
              </h3>

              <p className="mt-2 max-w-[360px] text-center text-sm leading-6 text-black/50">
                Escolha uma imagem ou GIF para
                começar seu Story.
              </p>

              <button
                type="button"
                onClick={openFilePicker}
                className="mt-6 rounded-full bg-[#21151d] px-7 py-3 text-sm font-black text-white transition hover:opacity-90"
              >
                Escolher arquivo
              </button>

              <p className="mt-4 text-xs text-black/35">
                JPG, PNG, WEBP ou GIF · máximo
                5 MB
              </p>

              {error && (
                <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col gap-5 p-5 lg:flex-row">
              {/* PREVIEW */}

              <div className="flex flex-1 items-center justify-center">
                <div className="relative aspect-[9/14] w-full max-w-[390px] overflow-hidden rounded-[24px] bg-black shadow-2xl">
                  {preview && (
                    <img
                      src={contentMediaUrl(preview)}
                      alt="Prévia do Story"
                      className="h-full w-full object-cover"
                      style={{
                        filter:
                          getFilterStyle(),
                      }}
                    />
                  )}

                  {/* PENSAMENTO */}

                  {thought.trim() && (
                    <div className="absolute left-1/2 top-8 z-20 w-[78%] -translate-x-1/2">
                      <div className="relative rounded-[22px] bg-white px-4 py-3 text-center text-xs font-bold leading-[1.35] text-[#21151d] shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
                        {thought}

                        <span className="absolute -bottom-2 left-[28%] h-3 w-3 rounded-full bg-white" />

                        <span className="absolute -bottom-4 left-[24%] h-2 w-2 rounded-full bg-white" />
                      </div>
                    </div>
                  )}

                  {/* TEXTO */}

                  {text.trim() && (
                    <div className="absolute left-1/2 top-1/2 z-20 w-[85%] -translate-x-1/2 -translate-y-1/2 text-center">
                      <span className="rounded-xl bg-black/45 px-4 py-2 text-2xl font-black text-white backdrop-blur-sm">
                        {text}
                      </span>
                    </div>
                  )}

                  {/* EMOJI */}

                  {selectedEmoji && (
                    <div className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2 text-6xl drop-shadow-lg">
                      {selectedEmoji}
                    </div>
                  )}
                </div>
              </div>

              {/* CONTROLES */}

              <div className="w-full space-y-4 lg:w-[330px]">
                {/* PENSAMENTO */}

                <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-black text-[#21151d]">
                      💭 Pensamento
                    </label>

                    <span className="text-[10px] font-bold text-black/35">
                      {thought.length}/100
                    </span>
                  </div>

                  <input
                    type="text"
                    value={thought}
                    onChange={
                      handleThoughtChange
                    }
                    maxLength={
                      MAX_THOUGHT_LENGTH
                    }
                    placeholder="O que você está pensando?"
                    className="w-full rounded-xl border border-black/10 bg-[#fffafc] px-3 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#21151d]"
                  />

                  <p className="mt-2 text-[11px] leading-4 text-black/40">
                    Isso aparece em uma nuvem
                    acima do seu avatar nos
                    Stories.
                  </p>
                </div>

                {/* TEXTO */}

                <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <label className="mb-2 block text-sm font-black text-[#21151d]">
                    ✏️ Texto
                  </label>

                  <input
                    type="text"
                    value={text}
                    onChange={(event) =>
                      setText(
                        event.target.value
                      )
                    }
                    maxLength={80}
                    placeholder="Adicionar texto..."
                    className="w-full rounded-xl border border-black/10 bg-[#fffafc] px-3 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#21151d]"
                  />
                </div>

                {/* EMOJIS */}

                <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-black text-[#21151d]">
                    😊 Emoji
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {[
                      '❤️',
                      '✨',
                      '😭',
                      '😂',
                      '🥹',
                      '😍',
                      '🔥',
                      '💀',
                      '👀',
                      '💭',
                      '📚',
                      '✍️',
                    ].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() =>
                          setSelectedEmoji(
                            selectedEmoji ===
                              emoji
                              ? ''
                              : emoji
                          )
                        }
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl transition ${
                          selectedEmoji ===
                          emoji
                            ? 'bg-black/10 scale-110'
                            : 'bg-black/[0.03] hover:bg-black/[0.07]'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FILTROS */}

                <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-black text-[#21151d]">
                    🎨 Filtro
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        [
                          'normal',
                          'Normal',
                        ],
                        [
                          'grayscale',
                          'P&B',
                        ],
                        [
                          'sepia',
                          'Sépia',
                        ],
                        [
                          'bright',
                          'Brilho',
                        ],
                        [
                          'contrast',
                          'Contraste',
                        ],
                        [
                          'blur',
                          'Suave',
                        ],
                      ] as [
                        Filter,
                        string
                      ][]
                    ).map(
                      ([
                        value,
                        label,
                      ]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setFilter(
                              value
                            )
                          }
                          className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                            filter ===
                            value
                              ? 'bg-[#21151d] text-white'
                              : 'bg-black/[0.04] text-black/60 hover:bg-black/[0.08]'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* ERRO */}

                {error && (
                  <div className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-600">
                    {error}
                  </div>
                )}

                {/* AÇÕES */}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setStep('select')
                    }
                    disabled={loading}
                    className="flex-1 rounded-xl border border-black/10 px-4 py-3 text-sm font-black text-[#21151d] transition hover:bg-black/[0.03] disabled:opacity-50"
                  >
                    Trocar
                  </button>

                  <button
                    type="button"
                    onClick={publish}
                    disabled={
                      !file ||
                      loading
                    }
                    className="flex-[1.5] rounded-xl bg-[#21151d] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? 'Publicando...'
                      : 'Publicar Story'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* INPUT OCULTO */}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={
            handleInputChange
          }
          className="hidden"
        />
      </div>
    </div>
  );
}
