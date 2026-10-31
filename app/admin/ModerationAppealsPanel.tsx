'use client';

import { useCallback, useEffect, useState } from 'react';

type Appeal = { id: string; details: string; status: 'pending' | 'in_review' | 'accepted' | 'rejected'; internal_notes: string; created_at: string; appellant: { username: string; display_name: string | null } | null; action: { action_type: string; reason: string } };

async function callApi(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

export default function ModerationAppealsPanel({ canManage }: { canManage: boolean }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const data = await callApi('/api/admin/appeals'); setAppeals(data.appeals || []);
    setNotes(Object.fromEntries((data.appeals || []).map((appeal: Appeal) => [appeal.id, appeal.internal_notes || ''])));
  }, []);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar recursos.')); }, [load]);

  async function update(appeal: Appeal, status: 'in_review' | 'accepted' | 'rejected') {
    if (!canManage) return;
    if (status !== 'in_review' && !window.confirm(status === 'accepted' ? 'Aceitar este recurso e registrar a revisão?' : 'Rejeitar este recurso?')) return;
    setBusy(true); setError('');
    try { await callApi('/api/admin/appeals', { method: 'PATCH', body: JSON.stringify({ id: appeal.id, status, internal_notes: notes[appeal.id] || '', confirm: status !== 'in_review' }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 space-y-4 border-t border-white/10 pt-6">
    <div><h3 className="text-lg font-bold">Recursos de decisões</h3><p className="mt-1 text-sm text-white/45">Recursos são analisados por uma pessoa; a quantidade de denúncias não substitui a revisão.</p></div>
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
    {!appeals.length && <p className="text-sm text-white/40">Nenhum recurso disponível para sua permissão.</p>}
    {appeals.map((appeal) => <article key={appeal.id} className="space-y-3 rounded-2xl border border-white/10 bg-[#191219] p-4">
      <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{appeal.appellant?.display_name || `@${appeal.appellant?.username || 'conta'}`} · {appeal.action.action_type.replaceAll('_', ' ')}</p><span className="text-xs text-white/45">{appeal.status}</span></div>
      <p className="whitespace-pre-wrap text-sm text-white/70">{appeal.details}</p><p className="text-xs text-white/45">Medida: {appeal.action.reason}</p>
      {canManage && appeal.status !== 'accepted' && appeal.status !== 'rejected' && <><label className="block text-xs text-white/55">Anotação interna<textarea value={notes[appeal.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [appeal.id]: event.target.value }))} maxLength={8000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" /></label><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void update(appeal, 'in_review')} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Em análise</button><button disabled={busy} onClick={() => void update(appeal, 'accepted')} className="rounded-xl bg-[#ff78b9] px-3 py-2 text-xs font-bold text-[#1b1017]">Aceitar</button><button disabled={busy} onClick={() => void update(appeal, 'rejected')} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Rejeitar</button></div></>}
    </article>)}
  </section>;
}
