'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Decision = { id: string; action_type: string; reason: string; starts_at: string; ends_at: string | null; appeal_status: string; appeal: { id: string; details: string; status: string; created_at: string } | null };

export default function AppealsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/moderation/appeals', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as decisões.');
    setDecisions(data.decisions || []);
  }, []);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar.')); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, decision: Decision) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/moderation/appeals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action_id: decision.id, details: details[decision.id] || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o recurso.');
      setMessage('Recurso enviado para análise humana.');
      setDetails((current) => ({ ...current, [decision.id]: '' })); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar recurso.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6">
    <section className="mx-auto max-w-3xl space-y-5">
      <a href="/perfil" className="text-sm text-[#ff9aca]">← Voltar ao perfil</a>
      <header><h1 className="text-2xl font-bold">Decisões e recursos</h1><p className="mt-2 text-sm text-white/55">Consulte medidas aplicadas à sua conta e, quando disponível, peça uma revisão humana. O recurso não altera automaticamente a medida enquanto estiver em análise.</p></header>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 p-3 text-sm text-rose-200">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-400/20 p-3 text-sm text-emerald-200">{message}</p>}
      {!decisions.length && <p className="rounded-2xl border border-white/10 p-6 text-sm text-white/55">Nenhuma decisão de moderação disponível.</p>}
      {decisions.map((decision) => <article key={decision.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{decision.action_type.replaceAll('_', ' ')}</h2><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">{decision.appeal?.status || decision.appeal_status}</span></div>
        <p className="whitespace-pre-wrap text-sm text-white/70">{decision.reason}</p>
        <p className="text-xs text-white/40">Aplicada em {new Date(decision.starts_at).toLocaleString('pt-BR')}{decision.ends_at ? ` · termina em ${new Date(decision.ends_at).toLocaleString('pt-BR')}` : ''}</p>
        {decision.appeal ? <p className="rounded-xl bg-black/20 p-3 text-sm text-white/65">Seu recurso: {decision.appeal.details}</p>
          : decision.appeal_status === 'not_requested' && (!decision.ends_at || new Date(decision.ends_at).getTime() > Date.now()) && <form onSubmit={(event) => void submit(event, decision)} className="space-y-2">
            <label className="block text-sm text-white/65">Se quiser, explique por que solicita uma revisão<textarea required minLength={1} maxLength={5000} rows={4} value={details[decision.id] || ''} onChange={(event) => setDetails((current) => ({ ...current, [decision.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" /></label>
            <button disabled={busy || !(details[decision.id] || '').trim()} className="rounded-full bg-[#ff78b9] px-4 py-2 text-sm font-bold text-[#1b1017] disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar recurso'}</button>
          </form>}
      </article>)}
    </section>
  </main>;
}
