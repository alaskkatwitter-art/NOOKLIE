'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import ReviewInteractions from '@/components/ReviewInteractions';

type Review = { id: string; is_mine: boolean; rating: number; body: string | null; contains_spoilers: boolean; created_at: string; likes_count: number; liked_by_me: boolean; comments_count: number; reviewer: { username: string; display_name: string | null; avatar_url: string | null } };
type Summary = { average: number | null; total: number; distribution: { rating: number; count: number }[] };

export default function StoryReviewsPage() {
  const params = useParams();
  const storyId = String(params.id);
  const [storyTitle, setStoryTitle] = useState('História');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary>({ average: null, total: 0, distribution: [] });
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [spoilers, setSpoilers] = useState(false);
  const [ownReviewId, setOwnReviewId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reviews`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as resenhas.');
    setStoryTitle(data.story.title);
    setReviews(data.reviews || []);
    setSummary(data.summary);
    const authResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    if (authResponse.ok) {
      const auth = await authResponse.json();
      const own = (data.reviews || []).find((item: Review) => item.is_mine);
      if (own) {
        setOwnReviewId(own.id);
        setRating(own.rating);
        setBody(own.body || '');
        setSpoilers(own.contains_spoilers);
      }
    }
  }, [storyId]);

  useEffect(() => {
    let active = true;
    // The request resolves asynchronously; guard updates if the page unmounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as resenhas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, body, contains_spoilers: spoilers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar sua avaliação.');
      setNotice('Sua avaliação foi salva.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar sua avaliação.'); }
    finally { setSaving(false); }
  }

  async function removeOwnReview() {
    if (!ownReviewId || !window.confirm('Remover sua avaliação desta história?')) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reviews?review_id=${encodeURIComponent(ownReviewId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover sua avaliação.');
      setOwnReviewId(''); setBody(''); setRating(5); setSpoilers(false); setNotice('Sua avaliação foi removida.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível remover sua avaliação.'); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href={`/historia/${encodeURIComponent(storyId)}`} className="text-sm text-[#ff9aca] hover:underline">← Voltar à história</Link>
      <h1 className="mt-6 text-3xl font-black">Avaliações e resenhas</h1>
      <p className="mt-2 text-white/60">{storyTitle}</p>
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Média das avaliações">
        <p className="text-2xl font-bold text-[#ff9aca]">{summary.average == null ? 'Ainda sem avaliações' : `${summary.average.toFixed(1)} de 5 ★`}</p>
        <p className="mt-1 text-sm text-white/55">{summary.total} {summary.total === 1 ? 'avaliação' : 'avaliações'}</p>
        <div className="mt-4 space-y-1">{summary.distribution.map((item) => <p key={item.rating} className="text-xs text-white/50">{item.rating} ★ — {item.count}</p>)}</div>
      </section>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-[#ff78b9]/20 bg-[#ff78b9]/[0.04] p-5">
        <h2 className="text-lg font-bold">{ownReviewId ? 'Editar sua avaliação' : 'Deixe sua avaliação'}</h2>
        <label className="block text-sm">Nota
          <select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-white/15 bg-[#171019] p-3 text-white">
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'estrela' : 'estrelas'}</option>)}
          </select>
        </label>
        <label className="block text-sm">Resenha (opcional)
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={5} className="mt-2 block w-full rounded-xl border border-white/15 bg-[#171019] p-3 text-white" placeholder="Compartilhe sua opinião sobre a história." />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" checked={spoilers} onChange={(event) => setSpoilers(event.target.checked)} /> Esta resenha contém spoilers</label>
        <div className="flex flex-wrap gap-3">
          <button disabled={saving} className="rounded-full bg-[#ff78b9] px-5 py-2.5 text-sm font-bold text-[#1b1017] disabled:opacity-50">{saving ? 'Salvando…' : ownReviewId ? 'Salvar alterações' : 'Publicar avaliação'}</button>
          {ownReviewId && <button type="button" disabled={saving} onClick={removeOwnReview} className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/75">Remover minha avaliação</button>}
        </div>
      </form>

      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">{notice}</p>}
      <section className="mt-10" aria-label="Resenhas">
        <h2 className="text-xl font-bold">Resenhas da comunidade</h2>
        {loading && <p className="mt-4 text-sm text-white/55">Carregando…</p>}
        {!loading && reviews.length === 0 && <p className="mt-4 text-sm text-white/55">Ainda não há resenhas publicadas.</p>}
        <ul className="mt-4 space-y-4">{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</ul>
      </section>
    </div>
  </main>;
}

function ReviewCard({ review }: { review: Review }) {
  const [revealed, setRevealed] = useState(!review.contains_spoilers);
  return <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <div className="flex items-center justify-between gap-3"><p className="font-semibold">{review.reviewer.display_name || `@${review.reviewer.username}`}</p><p className="text-[#ff9aca]">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p></div>
    <p className="mt-1 text-xs text-white/40">{new Date(review.created_at).toLocaleDateString('pt-BR')}</p>
    {review.body && (review.contains_spoilers && !revealed
      ? <button type="button" onClick={() => setRevealed(true)} className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">Esta resenha contém spoilers · Mostrar resenha</button>
      : <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">{review.body}</p>)}
    <ReviewInteractions reviewId={review.id} initialLikes={review.likes_count || 0} initiallyLiked={review.liked_by_me || false} initialComments={review.comments_count || 0} canViewComments={!review.contains_spoilers || revealed} />
  </li>;
}

