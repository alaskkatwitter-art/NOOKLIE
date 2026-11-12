"use client";
import AccountBadge from '@/components/AccountBadge';
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, MessageCircle, Send } from "lucide-react";
type Comment = {
  id: string;
  content: string;
  author?: { username: string; display_name: string | null; verified?: boolean; is_official?: boolean } | null;
};
export default function MuralActions({ postId }: { postId: string }) {
  const actions = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false),
    [likes, setLikes] = useState(0),
    [count, setCount] = useState(0),
    [open, setOpen] = useState(false),
    [comments, setComments] = useState<Comment[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const summary = useCallback(async () => {
    const r = await fetch(
      "/api/nook-posts/reactions?post_id=" + encodeURIComponent(postId),
      { cache: "no-store" },
    );
    if (r.ok) {
      const d = (await r.json()).summary;
      setLiked(d.user_reactions.includes("❤️"));
      setLikes(d.counts["❤️"] || 0);
      setCount(d.comments_count);
    }
  }, [postId]);
  const loadComments = useCallback(async () => {
    const r = await fetch(
      "/api/nook-posts/comments?post_id=" + encodeURIComponent(postId),
      { cache: "no-store" },
    );
    if (!r.ok) throw Error("Não foi possível carregar os comentários.");
    setComments((await r.json()).comments || []);
  }, [postId]);
  useEffect(() => {
    const node = actions.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      void summary().catch(() => {});
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void summary().catch(() => {});
    }, { rootMargin: '160px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [summary]);
  return (
    <div ref={actions} className="mt-4 border-t border-white/5 pt-2">
      <div className="flex gap-4">
        <button
          type="button"
          className="social-action"
          aria-label="Curtir publicação"
          aria-pressed={liked}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/nook-posts/reactions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ post_id: postId, emoji: "❤️" }),
              });
              if (!r.ok)
                throw Error(
                  r.status === 401
                    ? "Entre para curtir esta publicação."
                    : "Não foi possível curtir.",
                );
              await summary();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Cloud size={20} fill={liked ? "currentColor" : "none"} />
          {likes}
        </button>
        <button
          type="button"
          className="social-action"
          aria-label="Comentários da publicação"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (!open) void loadComments().catch((e) => setError(e.message));
          }}
        >
          <MessageCircle size={19} />
          {count}
        </button>
      </div>
      {open && (
        <div className="space-y-3 mt-3">
          {comments.map((c) => (
            <article key={c.id} className="rounded-xl bg-white/5 px-3 py-2">
              <p className="text-[11px] text-pink-200/70">
                @{c.author?.username || "leitor"}<AccountBadge account={c.author} />
              </p>
              <p className="text-sm whitespace-pre-wrap break-words mt-1">
                {c.content}
              </p>
            </article>
          ))}
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/nook-posts/comments", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    post_id: postId,
                    content: text,
                    parent_id: null,
                  }),
                });
                if (!r.ok)
                  throw Error(
                    r.status === 401
                      ? "Entre para comentar."
                      : "Não foi possível comentar.",
                  );
                setText("");
                await Promise.all([loadComments(), summary()]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="sr-only" htmlFor={"comment-" + postId}>
              Seu comentário
            </label>
            <input
              id={"comment-" + postId}
              className="nook-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              required
              placeholder="Escreva um comentário…"
            />
            <button
              className="shell-icon"
              disabled={busy || !text.trim()}
              aria-label="Enviar comentário"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="nook-status mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
