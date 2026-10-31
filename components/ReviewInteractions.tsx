'use client';

import { FormEvent, useState } from 'react';
import ReportContentButton from '@/components/ReportContentButton';

type ReviewComment = {
  id: string;
  parent_comment_id: string | null;
  body: string;
  contains_spoilers: boolean;
  created_at: string;
  is_mine: boolean;
  can_manage: boolean;
  author: { username: string; display_name: string | null; avatar_url: string | null };
};

export default function ReviewInteractions({ reviewId, initialLikes, initiallyLiked, initialComments, canViewComments }: {
  reviewId: string;
  initialLikes: number;
  initiallyLiked: boolean;
  initialComments: number;
  canViewComments: boolean;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initiallyLiked);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState('');
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [reply, setReply] = useState<{ id: string; username: string } | null>(null);
  const [error, setError] = useState('');

  async function toggleLike() {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/likes`, { method: liked ? 'DELETE' : 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a curtida.');
      setLiked(data.liked); setLikes(data.count);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a curtida.'); }
    finally { setSaving(false); }
  }

  async function loadComments() {
    setLoading(true); setError('');
    try {
      const reveal = canViewComments ? '?reveal_spoilers=1' : '';
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/comments${reveal}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os comentários.');
      setComments(data.comments || []); setCommentsLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os comentários.'); }
    finally { setLoading(false); }
  }

  async function openComments() {
    if (!canViewComments) return;
    const opening = !commentsOpen;
    setCommentsOpen(opening);
    if (opening && !commentsLoaded) await loadComments();
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parent_comment_id: reply?.id || null, contains_spoilers: containsSpoilers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível publicar o comentário.');
      setBody(''); setReply(null); setContainsSpoilers(false);
      await loadComments();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível publicar o comentário.'); }
    finally { setSaving(false); }
  }

  async function removeComment(comment: ReviewComment) {
    if (!window.confirm('Remover este comentário?')) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/comments?comment_id=${encodeURIComponent(comment.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover o comentário.');
      await loadComments();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível remover o comentário.'); }
    finally { setSaving(false); }
  }

  return <div className="mt-4 border-t border-white/10 pt-3">
    <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" disabled={saving} onClick={toggleLike} aria-pressed={liked} className={liked ? 'text-[#ff9aca]' : 'text-white/55 hover:text-white'}>
        {liked ? '♥ Curtido' : '♡ Curtir'} · {likes}
      </button>
      <button type="button" disabled={!canViewComments || loading} onClick={openComments} className="text-white/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
        {canViewComments ? `${commentsOpen ? 'Ocultar' : 'Comentários'} · ${commentsLoaded ? comments.length : initialComments}` : 'Comentários protegidos até revelar spoilers'}
      </button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    {commentsOpen && <div className="mt-4 space-y-3">
      {loading && <p className="text-sm text-white/45">Carregando comentários…</p>}
      {!loading && comments.length === 0 && <p className="text-sm text-white/45">Ainda não há comentários.</p>}
      {comments.map((comment) => <article key={comment.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-white/75">{comment.author.display_name || `@${comment.author.username}`}</p>
          <span className="text-xs text-white/35">{new Date(comment.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        {comment.contains_spoilers
          ? <SpoilerText text={comment.body} />
          : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">{comment.body}</p>}
        <div className="mt-2 flex gap-3 text-xs text-white/40">
          <button type="button" onClick={() => setReply({ id: comment.id, username: comment.author.username })} className="hover:text-white/80">Responder</button>
          {comment.can_manage && <button type="button" disabled={saving} onClick={() => removeComment(comment)} className="hover:text-rose-300">Remover</button>}
          {!comment.is_mine && <ReportContentButton contentType="review_comment" contentId={comment.id} compact />}
        </div>
      </article>)}
      <form onSubmit={submitComment} className="space-y-2 rounded-xl border border-white/10 p-3">
        {reply && <p className="text-xs text-white/50">Respondendo a @{reply.username} <button type="button" onClick={() => setReply(null)} className="ml-2 text-[#ff9aca]">Cancelar</button></p>}
        <label className="sr-only" htmlFor={`review-comment-${reviewId}`}>Seu comentário</label>
        <textarea id={`review-comment-${reviewId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={3} className="w-full rounded-lg border border-white/10 bg-[#171019] p-3 text-sm text-white" placeholder="Comente ou responda…" required />
        <label className="flex items-center gap-2 text-xs text-white/55"><input type="checkbox" checked={containsSpoilers} onChange={(event) => setContainsSpoilers(event.target.checked)} /> Este comentário contém spoilers</label>
        <button type="submit" disabled={saving || !body.trim()} className="rounded-full bg-[#ff78b9] px-4 py-2 text-xs font-bold text-[#1b1017] disabled:opacity-50">{saving ? 'Enviando…' : 'Comentar'}</button>
      </form>
    </div>}
    <div className="mt-2"><ReportContentButton contentType="review" contentId={reviewId} compact /></div>
  </div>;
}

function SpoilerText({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return revealed
    ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">{text}</p>
    : <button type="button" onClick={() => setRevealed(true)} className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Este comentário contém spoilers · Mostrar</button>;
}
