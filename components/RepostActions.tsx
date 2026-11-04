"use client";
import AccountBadge from '@/components/AccountBadge';
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { CloudUpload, X } from "lucide-react";
import { contentMediaUrl } from "@/lib/security/content-media";
type Person = {
  id: string;
  username: string;
  display_name: string | null; verified?: boolean; is_official?: boolean;
  avatar_url: string | null;
};
export default function RepostActions({ postId }: { postId: string }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"menu" | "quote" | "people">("menu"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [people, setPeople] = useState<
      { id: string; author: Person; comment: string | null }[]
    >([]);
  async function load() {
    try {
      setBusy(true);
      const r = await fetch(
        "/api/nook-posts/reposts?post_id=" + encodeURIComponent(postId),
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Não foi possível carregar.");
      setPeople(data.reposts);
      setDone(data.nookled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  function open() {
    setMode("menu");
    setError("");
    dialog.current?.showModal();
    void load();
  }
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/nook-posts/reposts", {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          ...(mode === "quote" ? { comment: text } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Não foi possível nooklar.");
      setDone(!remove);
      setText("");
      await load();
      setMode("menu");
      window.dispatchEvent(new Event("nooklie:reposts-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label="Nooklar publicação"
        aria-pressed={done}
        onClick={open}
        className={`flex min-h-11 min-w-14 items-center justify-center gap-1 rounded-xl px-2 hover:bg-white/5 ${done ? "text-[#ff9bca]" : "text-white/50"}`}
      >
        <CloudUpload size={21} />
        <span className="text-xs">{people.length || ""}</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="nook-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {mode === "quote"
              ? "Nooklar com comentário"
              : mode === "people"
                ? "Quem nooklou"
                : "Leve para seu cantinho"}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Fechar"
            className="p-3"
          >
            <X size={20} />
          </button>
        </div>
        {error && (
          <p role="alert" className="my-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        {mode === "menu" && (
          <div className="mt-4 grid gap-2">
            <button
              disabled={busy}
              onClick={() => void save(done)}
              className="nook-choice"
            >
              <CloudUpload size={20} />
              {done ? "Desfazer nooklada" : "Nooklar"}
            </button>
            {!done && (
              <button
                disabled={busy}
                onClick={() => setMode("quote")}
                className="nook-choice"
              >
                Nooklar com comentário
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => setMode("people")}
              className="nook-choice"
            >
              Ver quem nooklou ({people.length})
            </button>
            <p className="px-3 pt-2 text-xs leading-6 text-white/50">
              Seus republicados aparecem na aba Republicados do perfil. Você
              pode deixá-los privados.
            </p>
          </div>
        )}
        {mode === "quote" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="mt-4 space-y-4"
          >
            <textarea
              aria-label="Seu comentário"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
              rows={5}
              className="w-full rounded-2xl border border-white/15 bg-black/20 p-4"
              placeholder="Acrescente seu comentário…"
            />
            <button disabled={busy || !text.trim()} className="nook-primary">
              {busy ? "Nooklando…" : "Nooklar com comentário"}
            </button>
          </form>
        )}
        {mode === "people" && (
          <div className="mt-4 space-y-3">
            {!people.length && (
              <p className="text-sm text-white/60">
                Nenhuma nooklada visível por enquanto.
              </p>
            )}
            {people.map((p) => (
              <div key={p.id}>
                <Link
                  href={"/perfil/" + encodeURIComponent(p.author.username)}
                  className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"
                >
                  {p.author.avatar_url ? (
                    <img
                      src={contentMediaUrl(p.author.avatar_url)}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff9bca]/20">
                      {p.author.username[0]}
                    </span>
                  )}
                  <span>
                    <strong className="block text-sm">
                      {p.author.display_name || p.author.username}<AccountBadge account={p.author} />
                    </strong>
                    <span className="text-xs text-white/50">
                      @{p.author.username}
                    </span>
                  </span>
                </Link>
                {p.comment && (
                  <p className="ml-14 whitespace-pre-wrap break-words text-sm text-white/70">
                    {p.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
