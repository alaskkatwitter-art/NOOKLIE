"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { contentMediaUrl } from "@/lib/security/content-media";
type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};
export default function ProfileStats({
  profileId,
  stories,
}: {
  profileId: string;
  stories: number;
}) {
  const [counts, setCounts] = useState({
      followers_count: 0,
      following_count: 0,
    }),
    [kind, setKind] = useState<"followers" | "following">("followers"),
    [people, setPeople] = useState<Person[]>([]),
    [next, setNext] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/follows?user_id=" + encodeURIComponent(profileId), {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (r.ok) setCounts(await r.json());
      })
      .catch(() => {});
    return () => c.abort();
  }, [profileId]);
  async function load(value: typeof kind, offset = 0) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/follows/list?user_id=${encodeURIComponent(profileId)}&kind=${value}&offset=${offset}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Não foi possível abrir a lista.");
      setPeople((old) => (offset ? [...old, ...data.people] : data.people));
      setNext(data.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  function open(value: typeof kind) {
    setKind(value);
    setPeople([]);
    setNext(null);
    dialog.current?.showModal();
    void load(value);
  }
  return (
    <>
      <div className="profile-stat-strip" aria-label="Histórias e conexões">
        <div>
          <strong>{stories}</strong>
          <span>Histórias</span>
        </div>
        <button onClick={() => open("followers")}>
          <strong>{counts.followers_count}</strong>
          <span>Seguidores</span>
        </button>
        <button onClick={() => open("following")}>
          <strong>{counts.following_count}</strong>
          <span>Seguindo</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="nook-dialog"
        aria-labelledby="connections-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 id="connections-title" className="text-xl font-bold">
            {kind === "followers" ? "Seguidores" : "Seguindo"}
          </h2>
          <button
            aria-label="Fechar"
            onClick={() => dialog.current?.close()}
            className="p-3"
          >
            <X size={20} />
          </button>
        </header>
        {error && (
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
        )}
        {people.map((p) => (
          <Link
            key={p.id}
            href={"/perfil/" + encodeURIComponent(p.username)}
            className="flex items-center gap-3 rounded-2xl p-3 hover:bg-white/5"
          >
            {p.avatar_url ? (
              <img
                src={contentMediaUrl(p.avatar_url)}
                alt=""
                className="h-11 w-11 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff9bca]/15">
                {p.username[0]}
              </span>
            )}
            <span>
              <strong className="block text-sm">
                {p.display_name || p.username}
              </strong>
              <span className="text-xs text-white/50">@{p.username}</span>
            </span>
          </Link>
        ))}
        {busy ? (
          <p role="status" className="p-4 text-sm">
            Carregando…
          </p>
        ) : !people.length && !error ? (
          <p className="p-4 text-sm text-white/60">
            Nenhuma pessoa por aqui ainda.
          </p>
        ) : (
          next !== null && (
            <button
              onClick={() => void load(kind, next)}
              className="nook-choice"
            >
              Ver mais
            </button>
          )
        )}
      </dialog>
    </>
  );
}
