"use client";

import FormattedSynopsis from '@/components/FormattedSynopsis';
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Author = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Tag = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  category_slug: string | null;
};

type Chapter = {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  published: boolean;
  created_at: string;
};

type Story = {
  has_content_warnings?: boolean; fandom?: string; work_has_ai?: boolean; cover_has_ai?: boolean; content_warnings?: string; accepts_translation?: boolean;
  id: string;
  author_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  rating: string | null;
  created_at: string;
  updated_at: string;
  author: Author | null;
  tags: Tag[];
  chapters: Chapter[];
  likes: number;
  liked: boolean;
};

export default function HistoriaPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [story, setStory] = useState<Story | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function loadStory() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/stories/${id}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Não foi possível carregar a história."
          );
        }

        setStory(data.story || data);
      } catch (err) {
        console.error("Erro ao carregar história:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a história."
        );
      } finally {
        setLoading(false);
      }
    }

    loadStory();
    void fetch('/api/discovery/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: id }) }).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          setCurrentUserId(null);
          return;
        }

        const data = await response.json();

        setCurrentUserId(
          data?.user?.id ||
            data?.user_id ||
            data?.id ||
            null
        );
      } catch (err) {
        console.error("Erro ao carregar usuário:", err);
        setCurrentUserId(null);
      }
    }

    loadCurrentUser();
  }, []);

  async function handleLike() {
    if (!story || liking) return;

    try {
      setLiking(true);

      const response = await fetch(
        `/api/stories/${story.id}/like`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível curtir a história."
        );
      }

      setStory((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          liked:
            typeof data.liked === "boolean"
              ? data.liked
              : !previous.liked,
          likes:
            typeof data.likes === "number"
              ? data.likes
              : previous.liked
                ? Math.max(0, previous.likes - 1)
                : previous.likes + 1,
        };
      });
    } catch (err) {
      console.error(
        "Erro ao curtir história:",
        err
      );
    } finally {
      setLiking(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0710] text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-pink-400/20 border-t-pink-400" />

            <p className="text-sm text-white/50">
              Carregando história...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !story) {
    return (
      <main className="min-h-screen bg-[#0b0710] text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mb-4 text-5xl">
              ☁️
            </div>

            <h1 className="mb-2 text-2xl font-semibold">
              História não encontrada
            </h1>

            <p className="mb-6 text-sm text-white/50">
              {error ||
                "Essa história não existe ou não está disponível."}
            </p>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400"
            >
              Voltar para o início
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isOwner =
    Boolean(currentUserId) &&
    currentUserId === story.author_id;

  const publishedChapters =
    story.chapters?.filter(
      (chapter) => chapter.published
    ) || [];

  const firstChapter = publishedChapters[0];

  return (
    <main className="min-h-screen bg-[#0b0710] text-white">
      <header className="border-b border-white/5 bg-[#0b0710]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xl font-bold tracking-tight text-white transition hover:text-pink-300"
          >
            NOOKLIE
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-pink-400/30 hover:text-white"
          >
            Voltar
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
          <div>
            <div className="aspect-[2/3] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/20 via-purple-500/10 to-[#120b16] shadow-2xl">
              {story.cover_url ? (
                <img
                  src={story.cover_url}
                  alt={`Capa de ${story.title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-3 text-6xl">
                      ☁️
                    </div>

                    <p className="px-8 text-sm text-white/30">
                      Esta história ainda não possui uma capa.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {story.status && (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                  {story.status}
                </span>
              )}

              {story.rating && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                  {story.rating === "Livre"
                    ? "Livre"
                    : `${story.rating}+`}
                </span>
              )}
            </div>

            <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl">
              {story.title}
            </h1>

            {story.author && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/perfil/${story.author?.id}`
                  )
                }
                className="mb-6 flex w-fit items-center gap-3 text-left"
              >
                {story.author.avatar_url ? (
                  <img
                    src={story.author.avatar_url}
                    alt={story.author.username}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-500/20 text-sm font-semibold text-pink-300">
                    {story.author.username
                      ?.charAt(0)
                      .toUpperCase() || "?"}
                  </div>
                )}

                <div>
                  <p className="text-xs text-white/40">
                    Escrito por
                  </p>

                  <p className="font-medium text-white/80 transition hover:text-pink-300">
                    {story.author.display_name ||
                      story.author.username}
                  </p>
                </div>
              </button>
            )}

            {story.description && (
              <div className="mb-7 max-w-3xl text-base leading-7 text-white/60">
                <FormattedSynopsis text={story.description} />
              </div>
            )}

            {story.tags &&
              story.tags.length > 0 && (
                <div className="mb-8 flex flex-wrap gap-2">
                  {story.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-pink-400/10 bg-pink-500/5 px-3 py-1.5 text-xs text-pink-200/70"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

            <div className="flex flex-wrap gap-3">
              {firstChapter && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/capitulo/${firstChapter.id}`
                    )
                  }
                  className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/10 transition hover:bg-pink-400"
                >
                  Começar a ler
                </button>
              )}

              <button
                type="button"
                onClick={handleLike}
                disabled={liking}
                className={`rounded-xl border px-5 py-3 text-sm font-medium transition ${
                  story.liked
                    ? "border-pink-400/40 bg-pink-500/15 text-pink-300"
                    : "border-white/10 bg-white/5 text-white/70 hover:border-pink-400/30 hover:text-white"
                }`}
              >
                {story.liked
                  ? "♥ Curtido"
                  : "♡ Curtir"}{" "}
                <span className="ml-1 text-white/40">
                  {story.likes || 0}
                </span>
              </button>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    if (!story) return;

                    router.push(
                      `/editar-historia/${story.id}`
                    );
                  }}
                  className="rounded-xl border border-pink-400/30 bg-pink-500/10 px-5 py-3 text-sm font-medium text-pink-300 transition hover:border-pink-400/50 hover:bg-pink-500/20"
                >
                  Editar obra
                </button>
              )}

              {isOwner && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/historia/${story.id}/novo-capitulo`
                    )
                  }
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Novo capítulo
                </button>
              )}
            </div>
          </div>
        </div>

        <section aria-label="Informações e avisos da obra" className="mt-8 space-y-3 rounded-2xl border border-pink-400/20 bg-pink-400/5 p-5 text-sm leading-7">
{story.fandom && <p><strong>Fandom:</strong> {story.fandom}</p>}
{story.work_has_ai && <p className="text-pink-200">✦ Esta obra tem IA</p>}
{story.cover_has_ai && <p className="text-pink-200">✦ Esta capa tem IA</p>}
{(story.has_content_warnings || story.content_warnings) && <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><h2 className="font-bold text-amber-200">Avisos de conteúdo e gatilhos</h2><p className="whitespace-pre-wrap">{story.content_warnings || 'O autor sinalizou temas sensíveis sem detalhar os avisos.'}</p></div>}
<p>{story.accepts_translation ? 'O autor aceita propostas de tradução. Solicite autorização antes de publicar.' : 'Traduções não autorizadas. Consulte o autor antes de traduzir.'}</p>
</section><section className="mt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-pink-300/60">
                História
              </p>

              <h2 className="text-2xl font-semibold">
                Capítulos
              </h2>
            </div>

            <span className="text-sm text-white/30">
              {publishedChapters.length}{" "}
              {publishedChapters.length === 1
                ? "capítulo"
                : "capítulos"}
            </span>
          </div>

          {publishedChapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
              <div className="mb-3 text-4xl">
                📖
              </div>

              <h3 className="mb-2 font-medium text-white/70">
                Ainda não existem capítulos
              </h3>

              <p className="text-sm text-white/30">
                Essa história ainda não possui capítulos publicados.
              </p>

              {isOwner && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/historia/${story.id}/novo-capitulo`
                    )
                  }
                  className="mt-5 rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400"
                >
                  Criar primeiro capítulo
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {publishedChapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/capitulo/${chapter.id}`
                    )
                  }
                  className="group flex w-full items-center justify-between gap-5 rounded-2xl border border-white/5 bg-white/[0.025] px-5 py-5 text-left transition hover:border-pink-400/20 hover:bg-pink-500/[0.04]"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-sm font-semibold text-pink-300">
                      {chapter.chapter_number}
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs text-white/30">
                        Capítulo {chapter.chapter_number}
                      </p>

                      <h3 className="truncate font-medium text-white/80 transition group-hover:text-pink-300">
                        {chapter.title}
                      </h3>
                    </div>
                  </div>

                  <span className="shrink-0 text-xl text-white/20 transition group-hover:translate-x-1 group-hover:text-pink-300">
                    →
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
