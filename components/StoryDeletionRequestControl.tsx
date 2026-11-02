'use client';

import { useCallback, useEffect, useState } from 'react';

type Vote = { coauthor_id: string; approved: boolean | null; profile: { username: string; display_name: string | null } | null };
type RequestInfo = { id: string; requested_by: string; status: string; can_vote: boolean; votes: Vote[] };

export default function StoryDeletionRequestControl({ storyId }: { storyId: string }) {
  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/deletion-request`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar os votos.');
    setRequest(data.request);
  }, [storyId]);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar.')).finally(() => setLoading(false)); }, [load]);

  async function createRequest() {
    if (!window.confirm('Solicitar exclusão? A história só será apagada se todos os coautores ativos aprovarem.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/deletion-request`, { method: 'POST' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha ao criar solicitação.');
      setMessage('Solicitação enviada. Os coautores precisam votar.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao criar solicitação.'); }
    finally { setBusy(false); }
  }

  async function vote(approved: boolean) {
    if (!request) return;
    if (!window.confirm(approved ? 'Aprovar? A história será excluída quando todos aprovarem.' : 'Recusar? A solicitação será encerrada e a história continuará publicada.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/deletion-request`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: request.id, approved }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha ao registrar o voto.');
      setMessage(data.status === 'approved' ? 'Todos aprovaram; a história foi excluída.' : data.status === 'rejected' ? 'Solicitação recusada; a história permanece publicada.' : 'Voto registrado.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao registrar o voto.'); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.03] p-4">
    <h2 className="font-semibold text-rose-100">Exclusão da obra</h2>
    <p className="text-xs leading-5 text-white/50">Em histórias em coautoria, todos os coautores ativos precisam aprovar. Uma recusa mantém a história publicada.</p>
    {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}{message && <p role="status" className="text-xs text-emerald-200">{message}</p>}
    {!loading && !request && <button type="button" disabled={busy} onClick={() => void createRequest()} className="rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50">Solicitar exclusão</button>}
    {request && <><p className="text-xs text-white/60">Estado: {request.status === 'pending' ? `aguardando votos (${request.votes.filter((vote) => vote.approved === true).length}/${request.votes.length})` : request.status === 'approved' ? 'aprovada' : 'recusada'}</p>{request.votes.map((vote) => <p key={vote.coauthor_id} className="text-xs text-white/45">@{vote.profile?.username || 'coautor'} · {vote.approved === null ? 'aguardando' : vote.approved ? 'aprovou' : 'recusou'}</p>)}{request.can_vote && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void vote(true)} className="rounded-xl bg-rose-400 px-3 py-2 text-xs font-bold text-[#1b1017]">Aprovar</button><button type="button" disabled={busy} onClick={() => void vote(false)} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Recusar</button></div>}</>}
  </section>;
}
