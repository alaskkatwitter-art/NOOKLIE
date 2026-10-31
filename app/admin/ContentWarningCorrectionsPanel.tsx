'use client';

import { useCallback, useEffect, useState } from 'react';

type Report = {
  id: string;
  content_type: string;
  content_id: string;
  status: string;
  content: { title?: string } | null;
};
type Correction = {
  id: string;
  story_id: string;
  missing_warnings: string[];
  notice: string;
  due_at: string;
  author_response: string;
  internal_notes: string;
  status: 'requested' | 'submitted' | 'resolved' | 'cancelled';
  overdue: boolean;
  created_at: string;
  decision: 'corrected' | 'not_corrected' | 'cancelled' | null;
  story: { title: string } | null;
  author: { username: string; display_name: string | null } | null;
};

function defaultDeadline() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function ContentWarningCorrectionsPanel({ reports, canManage }: { reports: Report[]; canManage: boolean }) {
  const [requests, setRequests] = useState<Correction[]>([]);
  const [warningInputs, setWarningInputs] = useState<Record<string, string>>({});
  const [noticeInputs, setNoticeInputs] = useState<Record<string, string>>({});
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fallbackDeadline] = useState(defaultDeadline);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/content-warning-corrections', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os pedidos de correção.');
    return (data.requests || []) as Correction[];
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((items) => {
      if (!active) return;
      setRequests(items);
      setNotes(Object.fromEntries(items.map((item) => [item.id, item.internal_notes || ''])));
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar pedidos de correção.'); });
    return () => { active = false; };
  }, [load]);

  async function create(report: Report) {
    if (!canManage) return;
    const warnings = Array.from(new Set((warningInputs[report.id] || '').split(',').map((item) => item.trim()).filter(Boolean)));
    const due_at = deadlines[report.id];
    if (warnings.length === 0 || !(noticeInputs[report.id] || '').trim() || !due_at) {
      setError('Informe ao menos um aviso ausente, uma orientação e uma data limite.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/content-warning-corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: report.content_id, source_report_id: report.id, missing_warnings: warnings, notice: noticeInputs[report.id], due_at: new Date(due_at).toISOString() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o pedido.');
      setMessage('Pedido enviado ao autor com prazo e orientação.');
      setRequests(await load());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao criar pedido.'); }
    finally { setBusy(false); }
  }

  async function decide(item: Correction, decision: 'corrected' | 'not_corrected' | 'cancelled') {
    if (!canManage) return;
    const confirmText = decision === 'corrected' ? 'Confirmar que os avisos foram corrigidos?' : decision === 'not_corrected' ? 'Registrar que os avisos ainda precisam de correção? A história não será removida automaticamente.' : 'Cancelar este pedido de correção?';
    if (!window.confirm(confirmText)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/content-warning-corrections', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, decision, internal_notes: notes[item.id] || '', confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a revisão.');
      setMessage('Decisão registrada no histórico administrativo.');
      setRequests(await load());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao concluir revisão.'); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
    <div><h2 className="text-xl font-bold">Correção de avisos de conteúdo</h2><p className="mt-1 text-sm leading-6 text-white/45">Registre os avisos ausentes, explique o ajuste e defina um prazo de 1 hora a 30 dias. O vencimento não remove a história automaticamente; qualquer medida posterior exige revisão humana.</p></div>
    {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-sm text-green-200">{message}</p>}
    {canManage && reports.filter((report) => report.content_type === 'story' && report.status !== 'dismissed').map((report) => {
      const open = requests.some((item) => item.story_id === report.content_id && ['requested', 'submitted'].includes(item.status));
      if (open) return null;
      return <details key={report.id} className="rounded-xl border border-white/8 bg-[#100b12] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Solicitar correção em “{report.content?.title || 'história denunciada'}”</summary>
        <div className="mt-4 grid gap-3">
          <label className="text-xs text-white/55">Avisos ausentes, separados por vírgula<input value={warningInputs[report.id] || ''} onChange={(event) => setWarningInputs((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={1200} placeholder="Ex.: violência, luto" className="mt-2 w-full rounded-xl border border-white/10 bg-[#191219] p-3 text-sm text-white" /></label>
          <label className="text-xs text-white/55">Orientação ao autor<textarea value={noticeInputs[report.id] || ''} onChange={(event) => setNoticeInputs((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#191219] p-3 text-sm text-white" placeholder="Explique quais avisos devem ser adicionados ou revisados." /></label>
          <label className="text-xs text-white/55">Prazo para correção<input type="datetime-local" value={deadlines[report.id] || fallbackDeadline} onChange={(event) => setDeadlines((current) => ({ ...current, [report.id]: event.target.value }))} className="mt-2 block rounded-xl border border-white/10 bg-[#191219] p-3 text-sm text-white" /></label>
          <button type="button" disabled={busy} onClick={() => void create(report)} className="w-fit rounded-xl bg-[#ff78b9] px-4 py-2.5 text-sm font-bold text-[#1b1018] disabled:opacity-50">Enviar pedido ao autor</button>
        </div>
      </details>;
    })}
    <div className="space-y-3">{requests.map((item) => (
      <article key={item.id} className="rounded-xl border border-white/8 bg-[#100b12] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold">{item.story?.title || 'História'} <span className="font-normal text-white/40">· @{item.author?.username || 'autor'}</span></p><p className="mt-1 text-xs text-white/40">Prazo {new Date(item.due_at).toLocaleString('pt-BR')}{item.overdue ? ' · VENCIDO' : ''}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">{item.status === 'requested' ? item.overdue ? 'Prazo vencido' : 'Aguardando autor' : item.status === 'submitted' ? 'Enviada para revisão' : item.decision === 'corrected' ? 'Correção confirmada' : item.status === 'cancelled' ? 'Cancelado' : 'Revisão concluída'}</span></div>
        <p className="mt-3 text-sm leading-6 text-white/65">{item.notice}</p>
        <div className="mt-2 flex flex-wrap gap-2">{item.missing_warnings.map((warning) => <span key={warning} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/65">{warning}</span>)}</div>
        {item.author_response && <div className="mt-3 rounded-lg bg-white/[0.04] p-3"><p className="text-[11px] font-bold text-white/45">Resposta do autor</p><p className="mt-1 whitespace-pre-wrap text-sm text-white/70">{item.author_response}</p></div>}
        {canManage && ['requested', 'submitted'].includes(item.status) && <div className="mt-3 space-y-2">
          <label className="block text-xs text-white/50">Observações internas<textarea value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={4000} rows={2} className="mt-2 w-full rounded-lg border border-white/10 bg-[#191219] p-3 text-sm text-white" /></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void decide(item, 'corrected')} className="rounded-lg bg-[#ff78b9] px-3 py-2 text-xs font-bold text-[#1b1018] disabled:opacity-50">Confirmar correção</button><button type="button" disabled={busy} onClick={() => void decide(item, 'not_corrected')} className="rounded-lg border border-amber-300/20 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">Ainda não corrigido</button><button type="button" disabled={busy} onClick={() => void decide(item, 'cancelled')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 disabled:opacity-50">Cancelar pedido</button></div>
        </div>}
      </article>
    ))}{requests.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">Nenhum pedido de correção registrado.</p>}</div>
  </section>;
}
