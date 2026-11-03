"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudUpload, LockKeyhole } from "lucide-react";
import { contentMediaUrl } from "@/lib/security/content-media";
import RepostActions from "./RepostActions";
type Post = {
  id: string;
  body: string | null;
  image_url: string | null;
  author: { username: string; display_name: string | null };
  media: { id: string; media_url: string }[];
  repost: { id: string; comment: string | null; created_at: string };
};
export default function Republicados({
  profileId,
  own = false,
  active = true,
}: {
  profileId: string;
  own?: boolean;
  active?: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hidden, setHidden] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          "/api/nook-posts/reposts?profile_id=" + encodeURIComponent(profileId),
          { cache: "no-store", signal: controller.signal },
        );
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "Não foi possível carregar.");
        setPosts(data.posts);
        if (own) {
          const privacy = await fetch("/api/profile/privacy", {
            signal: controller.signal,
          });
          if (!privacy.ok)
            throw Error("Não foi possível carregar a privacidade.");
          setHidden((await privacy.json()).reposts_private === true);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Tente novamente.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    window.addEventListener("nooklie:reposts-changed", load);
    return () => {
      controller.abort();
      window.removeEventListener("nooklie:reposts-changed", load);
    };
  }, [profileId, own, active]);
  async function privacy() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/profile/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reposts_private: !hidden }),
      });
      if (!r.ok) throw Error("Não foi possível alterar a privacidade.");
      setHidden(!hidden);
      window.dispatchEvent(new Event("nooklie:reposts-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <CloudUpload className="text-[#ff9bca]" />
          Republicados
        </h2>
        {own && (
          <button
            onClick={() => void privacy()}
            disabled={saving || loading}
            aria-pressed={hidden}
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-xs"
          >
            <LockKeyhole size={15} />
            {hidden ? "Privados · só você vê" : "Públicos · tornar privados"}
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando republicados…</p>
      ) : !posts.length ? (
        <p className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-white/60">
          Nenhum republicado disponível.
        </p>
      ) : (
        posts.map((p) => (
          <article
            key={p.repost.id}
            className="rounded-3xl border border-white/10 bg-white/[.025] p-5"
          >
            <p className="mb-4 flex items-center gap-2 text-xs text-[#ffb9da]">
              <CloudUpload size={16} />
              Nooklado em{" "}
              {new Date(p.repost.created_at).toLocaleDateString("pt-BR")}
            </p>
            {p.repost.comment && (
              <p className="mb-5 whitespace-pre-wrap break-words leading-7">
                {p.repost.comment}
              </p>
            )}
            <Link
              href={"/feed?post=" + p.id}
              className="block rounded-2xl border border-white/10 p-4 hover:border-[#ff9bca]/40"
            >
              <strong className="text-sm text-[#ffb9da]">
                {p.author.display_name || p.author.username}{" "}
                <span className="font-normal text-white/40">
                  @{p.author.username}
                </span>
              </strong>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-white/80">
                {p.body}
              </p>
              {(p.media?.length
                ? p.media
                : p.image_url
                  ? [{ id: "legacy", media_url: p.image_url }]
                  : []
              ).map((m) => (
                <img
                  key={m.id}
                  src={contentMediaUrl(m.media_url)}
                  alt="Mídia da publicação"
                  loading="lazy"
                  className="mt-3 max-h-80 w-full rounded-xl object-contain"
                />
              ))}
              <span className="mt-3 block text-xs text-white/50">
                Abrir publicação e comentários
              </span>
            </Link>
            <RepostActions postId={p.id} />
          </article>
        ))
      )}
    </section>
  );
}
