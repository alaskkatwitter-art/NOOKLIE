'use client';

import { useCallback, useEffect, useState } from 'react';
import ModerationAppealsPanel from './ModerationAppealsPanel';
import ContentWarningCorrectionsPanel from './ContentWarningCorrectionsPanel';

type Report = {
  id: string;
  content_type: 'profile' | 'post' | 'story' | 'chapter' | 'comment' | 'review' | 'review_comment';
  content_id: string;
  reason: string;
  details: string;
  evidence_urls: string[];
  evidence_paths: string[];
  content_hidden: boolean;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  internal_notes: string;
  created_at: string;
  reporter: { username: string; display_name: string | null } | null;
  target: { username: string; display_name: string | null } | null;
  content: { title?: string; body?: string } | null;
};

const reasons: Record<string, string> = {
  harassment: 'Assédio ou abuso',
  spam: 'Spam',
  inappropriate: 'Conteúdo inadequado',
  copyright: 'Direitos autorais',
  safety: 'Segurança',
  other: 'Outro',
};

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

export default function ModerationPanel({ canViewReports, canManage, canManageAppeals }: { canViewReports: boolean; canManage: boolean; canManageAppeals: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const data = await api('/api/admin/reports');
    setReports(data.reports || []);
    setNotes(Object.fromEntries((data.reports || []).map((report: Report) => [report.id, report.internal_notes || ''])));
  }, []);

  useEffect(() => {
    if (!canViewReports) return;
    void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar denúncias.'));
  }, [canViewReports, load]);

  async function update(report: Report, status: 'in_review' | 'resolved' | 'dismissed', content_action: 'none' | 'hide' | 'restore' = 'none') {
    if (!canManage) return;
    if (status !== 'in_review' && !window.confirm(content_action === 'hide' ? 'Resolver e ocultar este conteúdo para a comunidade?' : content_action === 'restore' ? 'Resolver e restaurar este conteúdo?' : status === 'resolved' ? 'Marcar esta denúncia como resolvida?' : 'Dispensar esta denúncia?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/api/admin/reports', { method: 'PATCH', body: JSON.stringify({
        id: report.id, status, content_action, internal_notes: notes[report.id] || '', confirm: status !== 'in_review',
      }) });
      setMessage('Denúncia atualizada e ação registrada no histórico.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar denúncia.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4">
      {canViewReports && <div>
        <h2 className="text-xl font-bold">Denúncias da comunidade</h2>
        <p className="mt-1 text-sm text-white/45">As denúncias são privadas e visíveis apenas à equipe de moderação autorizada.</p>
      </div>}
      {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-sm text-green-200">{message}</div>}
      {canViewReports && reports.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-[#191219] p-8 text-center text-sm text-white/40">Nenhuma denúncia registrada.</div>}
      {reports.map((report) => (
        <article key={report.id} className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">{report.target?.display_name || report.target?.username || 'Conta indisponível'} <span className="text-xs font-normal text-white/40">· {report.content_type} · {reasons[report.reason] || report.reason}</span></p>
              <p className="mt-1 text-xs text-white/45">Denunciado por @{report.reporter?.username || 'conta indisponível'} em {new Date(report.created_at).toLocaleString('pt-BR')}</p>
              <p className="mt-2 text-xs text-white/45">Conteúdo: {report.content_hidden ? 'oculto' : 'visível'}</p>
              {report.content?.title && <p className="mt-2 text-sm font-semibold">{report.content.title}</p>}
              {report.content?.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/70">{report.content.body}</p>}
              {report.details && <p className="mt-3 whitespace-pre-wrap text-sm text-white/55">{report.details}</p>}
              {report.evidence_urls?.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-white/50">Links de evidência</p><ul className="mt-1 space-y-1">{report.evidence_urls.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[#ff9aca] underline">{url}</a></li>)}</ul><p className="mt-1 text-[10px] text-white/35">Os links são abertos no navegador e não são buscados pelo servidor do Nooklie.</p></div>}
              {report.evidence_paths?.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-white/50">Imagens privadas anexadas</p><div className="mt-2 flex flex-wrap gap-2">{report.evidence_paths.map((_, index) => <a key={`${report.id}-${index}`} href={`/api/admin/reports/${report.id}/evidence/${index}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#ff9aca] underline">Abrir imagem {index + 1}</a>)}</div></div>}
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">{report.status}</span>
          </div>
          {canManage && report.status === 'resolved' && report.content_hidden && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <button disabled={busy} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void update(report, 'resolved', 'restore')}>Restaurar conteúdo</button>
            </div>
          )}
          {canManage && report.status !== 'resolved' && report.status !== 'dismissed' && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <label className="block text-xs font-semibold text-white/55">Observações internas<textarea value={notes[report.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={8000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" /></label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void update(report, 'in_review')}>Em análise</button>
                <button disabled={busy} className="rounded-xl bg-[#ff78b9] px-4 py-2 text-sm font-bold text-[#1b1018] disabled:opacity-50" onClick={() => void update(report, 'resolved')}>Resolver</button>
                <button disabled={busy} className="rounded-xl border border-amber-300/20 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50" onClick={() => void update(report, 'resolved', report.content_hidden ? 'restore' : 'hide')}>Resolver e {report.content_hidden ? 'restaurar' : 'ocultar'}</button>
                <button disabled={busy} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void update(report, 'dismissed')}>Dispensar</button>
              </div>
            </div>
          )}
        </article>
      ))}
      {canViewReports && <ContentWarningCorrectionsPanel reports={reports} canManage={canManage} />}
      <ModerationAppealsPanel canManage={canManageAppeals} />
    </section>
  );
}
