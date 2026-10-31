'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CorrectionRequest = {
  id: string;
  story_id: string;
  missing_warnings: string[];
  notice: string;
  due_at: string;
  author_response: string;
  status: 'requested' | 'submitted' | 'resolved' | 'cancelled';
  overdue: boolean;
  created_at: string;
  decision: 'corrected' | 'not_corrected' | 'cancelled' | null;
  story: { id: string; title: string } | null;
};

export default function ContentWarningRequestsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/account/content-warning-corrections', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os pedidos.');
    return (data.requests || []) as CorrectionRequest[];
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((items) => { if (active) setRequests(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar os pedidos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function submit(item: CorrectionRequest) {
    const author_response = (responses[item.id] || '').trim();
    if (!author_response) { setError('Explique o que foi atualizado antes de enviar.'); return; }
    setBusyId(item.id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/account/content-warning-corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, author_response }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar sua resposta.');
      setMessage('Resposta enviada. A moderação fará uma revisão humana.');
      setRequests(await load());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar resposta.'); }
    finally { setBusyId(null); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6">
    <section className="mx-auto max-w-3xl space-y-5">
      <Link href="/configuracoes" className="text-sm text-[#ff9aca] hover:underline">← Configurações</Link>
      <header>
        <h1 className="text-2xl font-bold">Avisos de conteúdo</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">A moderação pode pedir que você complemente os avisos de uma história. Atualize a obra pelo editor e depois informe o que mudou. O envio não encerra o pedido automaticamente; uma pessoa da equipe revisará a correção.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">{message}</p>}
      {loading ? <p className="text-sm text-white/50">Carregando pedidos…</p> : requests.length === 0 ?
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/50">Você não tem pedidos de correção de avisos.</p> :
        requests.map((item) => {
          const open = item.status === 'requested';
          const overdue = open && item.overdue;
          const statusLabel = item.status === 'requested' ? overdue ? 'Prazo vencido — aguardando análise' : 'Aguardando sua correção' : item.status === 'submitted' ? 'Correção enviada — em análise' : item.decision === 'corrected' ? 'Correção confirmada' : item.status === 'cancelled' ? 'Pedido cancelado' : 'Revisão concluída';
          return <article key={item.id} className="space-y-4 rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-bold">{item.story?.title || 'História'}</h2><p className="mt-1 text-xs text-white/40">Solicitado em {new Date(item.created_at).toLocaleString('pt-BR')}</p></div>
              <span className="rounded-full border border-[#ff78b9]/20 px-3 py-1 text-xs text-[#ffb0d2]">{statusLabel}</span>
            </div>
            <p className="text-sm leading-6 text-white/70">{item.notice}</p>
            <div><p className="text-xs font-bold uppercase tracking-wide text-white/45">Avisos que precisam ser adicionados ou revistos</p><ul className="mt-2 flex flex-wrap gap-2">{item.missing_warnings.map((warning) => <li key={warning} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70">{warning}</li>)}</ul></div>
            <p className={overdue ? 'text-xs font-semibold text-amber-200' : 'text-xs text-white/45'}>Prazo: {new Date(item.due_at).toLocaleString('pt-BR')}</p>
            {item.status === 'requested' && <div className="space-y-3 border-t border-white/10 pt-4">
              {item.story && <Link href={`/editar-historia/${item.story.id}`} className="inline-block text-sm font-semibold text-[#ff9aca] hover:underline">Abrir editor da história →</Link>}
              <label className="block text-xs font-semibold text-white/55">Depois de atualizar a história, descreva o que mudou<textarea value={responses[item.id] || ''} onChange={(event) => setResponses((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" placeholder="Ex.: adicionei os avisos de violência e luto à descrição da história." /></label>
              <button type="button" disabled={busyId === item.id} onClick={() => void submit(item)} className="rounded-xl bg-[#ff78b9] px-4 py-2.5 text-sm font-bold text-[#1b1018] disabled:opacity-50">{busyId === item.id ? 'Enviando…' : 'Enviar para revisão'}</button>
            </div>}
            {item.author_response && <div className="rounded-xl bg-[#100b12] p-3"><p className="text-xs font-bold text-white/45">Sua resposta</p><p className="mt-1 whitespace-pre-wrap text-sm text-white/70">{item.author_response}</p></div>}
            {item.status === 'resolved' && item.decision === 'not_corrected' && <p className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-sm text-amber-100">A equipe identificou que ainda faltam ajustes. Consulte a história e as orientações desta solicitação; a equipe pode abrir um novo pedido se necessário.</p>}
          </article>;
        })}
    </section>
  </main>;
}
