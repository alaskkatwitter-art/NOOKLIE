'use client';
import StoryMetadataFields from '@/components/StoryMetadataFields';
import WritingPanel from '@/components/WritingPanel';
import { emptyStoryMetadata, StoryMetadata } from '@/lib/stories/metadata';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CriarPage() {
  const router = useRouter();

  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [storyMetadata, setStoryMetadata] = useState<StoryMetadata>(emptyStoryMetadata);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Em andamento');

  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');

  const [genre, setGenre] = useState('');
  const [rating, setRating] = useState('');

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleCoverChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Use uma capa em JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('A capa pode ter no máximo 8 MB.');
      return;
    }

    setError('');
    setCover(file);

    const previewUrl = URL.createObjectURL(file);
    setCoverPreview(previewUrl);
  }

  function addTag() {
    const newTag = tagInput.trim();

    if (!newTag) return;

    if (newTag.length > 50) {
      setError('Cada tag pode ter no máximo 50 caracteres.');
      return;
    }

    const alreadyExists = tags.some(
      (tag) =>
        tag.toLowerCase() === newTag.toLowerCase()
    );

    if (alreadyExists) {
      setTagInput('');
      return;
    }

    if (tags.length >= 30) {
      setError('Você pode adicionar no máximo 30 tags.');
      return;
    }

    setTags((currentTags) => [
      ...currentTags,
      newTag,
    ]);

    setTagInput('');
    setError('');
  }

  function removeTag(tagToRemove: string) {
    setTags((currentTags) =>
      currentTags.filter(
        (tag) => tag !== tagToRemove
      )
    );
  }

  function handleTagKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
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
      setTags((currentTags) =>
        currentTags.slice(0, -1)
      );
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');

    if (!title.trim()) {
      setError(
        'Digite um título para sua história.'
      );
      return;
    }

    // Se o usuário digitou uma tag e esqueceu de apertar Enter,
    // ela também será adicionada automaticamente.
    let finalTags = [...tags];

    const pendingTag = tagInput.trim();

    if (pendingTag) {
      const alreadyExists = finalTags.some(
        (tag) =>
          tag.toLowerCase() ===
          pendingTag.toLowerCase()
      );

      if (!alreadyExists) {
        finalTags.push(pendingTag);
      }
    }

    if (finalTags.length > 30) {
      setError(
        'Você pode adicionar no máximo 30 tags.'
      );
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      Object.entries(storyMetadata).forEach(([key, value]) => formData.set(key, String(value))); 

      formData.append('title', title);
      formData.append(
        'description',
        description
      );
      formData.append('status', status);
      formData.append('genre', genre);
      formData.append('rating', rating);

      // A API recebe as tags separadas por vírgula.
      formData.append(
        'tags',
        finalTags.join(', ')
      );

      if (cover) {
        formData.append('cover', cover);
      }

      const response = await fetch(
        '/api/stories/create',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            'Não foi possível criar a história.'
        );
        return;
      }

      router.push(`/editar-historia/${data.story.id}`);
      router.refresh();
    } catch {
      setError(
        'Não foi possível criar a história. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#100b12] text-white">
      <header className="border-b border-white/10 bg-[#100b12]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-3"
          >
            <CloudLogo />

            <span className="text-xl font-bold tracking-[0.15em] text-[#ff78b9]">
              NOOKLIE
            </span>
          </button>

          <button
            onClick={() => router.push('/perfil')}
            className="rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-white/60 transition hover:border-[#ff78b9]/40 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
            Nova história
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Conte sua história.
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">
            Crie a página da sua história agora.
            Depois você poderá adicionar os capítulos.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* ================================================= */}
          {/* INFORMAÇÕES PRINCIPAIS */}
          {/* ================================================= */}

          <section className="rounded-3xl border border-white/10 bg-[#191219] p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-black">
                Informações principais
              </h2>

              <p className="mt-1 text-sm text-white/35">
                Essas informações aparecerão na página da história.
              </p>
            </div>

            <div className="space-y-5">
              {/* TÍTULO */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/80">
                    Título
                  </label>

                  <span className="text-xs text-white/30">
                    {title.length}/100
                  </span>
                </div>

                <input
                  type="text"
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  maxLength={100}
                  placeholder="Nome da sua história"
                  className="w-full rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff78b9]/60"
                />
              </div>

              {/* SINOPSE */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/80">
                    Sinopse
                  </label>

                  <span className="text-xs text-white/30">
                    {description.length}/2000
                  </span>
                </div>

                <WritingPanel value={description} onChange={setDescription} />
              </div>

              {/* STATUS */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-white/80">
                  Status
                </label>

                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value)
                  }
                  className="w-full rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#ff78b9]/60"
                >
                  <option value="Em andamento">
                    Em andamento
                  </option>

                  <option value="Concluída">
                    Concluída
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* CAPA */}
          {/* ================================================= */}

          <section className="rounded-3xl border border-white/10 bg-[#191219] p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-black">
                Capa
              </h2>

              <p className="mt-1 text-sm text-white/35">
                JPG, PNG ou WEBP. Máximo de 8 MB.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                coverInputRef.current?.click()
              }
              className="group relative h-72 w-full overflow-hidden rounded-3xl border border-dashed border-white/15 bg-[#100b12] transition hover:border-[#ff78b9]/50"
            >
              {coverPreview ? (
                <>
                  <img
                    src={coverPreview}
                    alt="Prévia da capa"
                    className="h-full w-full object-cover"
                  />

                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                    <span className="rounded-full bg-[#191219] px-5 py-2.5 text-sm font-bold">
                      Alterar capa
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff78b9]/10 text-3xl text-[#ff78b9]">
                    +
                  </div>

                  <p className="mt-4 text-sm font-bold text-white/70">
                    Adicionar capa
                  </p>

                  <p className="mt-1 text-xs text-white/30">
                    Toque aqui para escolher uma imagem
                  </p>
                </div>
              )}
            </button>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleCoverChange}
              className="hidden"
            />
          </section>

          {/* ================================================= */}
          {/* ORGANIZAÇÃO */}
          {/* ================================================= */}

          <section className="rounded-3xl border border-white/10 bg-[#191219] p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-black">
                Organização
              </h2>

              <p className="mt-1 text-sm leading-6 text-white/35">
                Ajude outras pessoas a encontrar sua história.
              </p>
            </div>

            <div className="space-y-5">
              {/* GÊNERO + CLASSIFICAÇÃO */}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">
                    Gênero
                  </label>

                  <input
                    type="text"
                    value={genre}
                    onChange={(event) =>
                      setGenre(event.target.value)
                    }
                    maxLength={50}
                    placeholder="Ex.: Romance"
                    className="w-full rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff78b9]/60"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">
                    Classificação
                  </label>

                  <select
                    value={rating}
                    onChange={(event) =>
                      setRating(event.target.value)
                    }
                    className="w-full rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#ff78b9]/60"
                  >
                    <option value="">
                      Selecionar
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
              </div>

              {/* TAGS */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-white/80">
                    Tags
                  </label>

                  <span className="text-xs text-white/30">
                    {tags.length}/30
                  </span>
                </div>

                <div
                  className="
                    min-h-[52px]
                    w-full
                    rounded-2xl
                    border
                    border-white/10
                    bg-[#100b12]
                    px-3
                    py-2
                    transition
                    focus-within:border-[#ff78b9]/60
                  "
                  onClick={() => {
                    document
                      .getElementById('tag-input')
                      ?.focus();
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="
                          inline-flex
                          items-center
                          gap-2
                          rounded-full
                          border
                          border-[#ff78b9]/20
                          bg-[#ff78b9]/10
                          px-3
                          py-1.5
                          text-xs
                          font-semibold
                          text-[#ff9bc9]
                        "
                      >
                        {tag}

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeTag(tag);
                          }}
                          aria-label={`Remover tag ${tag}`}
                          className="text-[#ff9bc9]/60 transition hover:text-white"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    <input
                      id="tag-input"
                      type="text"
                      value={tagInput}
                      onChange={(event) =>
                        setTagInput(event.target.value)
                      }
                      onKeyDown={handleTagKeyDown}
                      maxLength={50}
                      placeholder={
                        tags.length === 0
                          ? 'Ex.: slow burn, enemies to lovers...'
                          : 'Adicionar outra tag...'
                      }
                      className="
                        min-w-[180px]
                        flex-1
                        bg-transparent
                        px-1
                        py-2
                        text-sm
                        text-white
                        outline-none
                        placeholder:text-white/20
                      "
                    />
                  </div>
                </div>

                <p className="mt-2 text-xs text-white/25">
                  Pressione Enter ou vírgula para adicionar uma tag.
                </p>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* ERRO */}
          {/* ================================================= */}

          <StoryMetadataFields value={storyMetadata} onChange={setStoryMetadata} />
          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-5 py-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ================================================= */}
          {/* BOTÃO */}
          {/* ================================================= */}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-[#ff78b9] px-6 py-4 text-sm font-black text-[#180d15] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
          >
            {saving
              ? 'Criando história...'
              : 'Criar história'}
          </button>
        </form>
      </div>
    </main>
  );
}

function CloudLogo() {
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
        fill="#FF78B9"
      />

      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        stroke="#FF9BCB"
        strokeWidth="3"
      />
    </svg>
  );
}
