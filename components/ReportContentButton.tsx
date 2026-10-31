'use client';

import { useState } from 'react';

const reasonOptions = [
  ['harassment', 'Assédio ou abuso'], ['spam', 'Spam'], ['inappropriate', 'Conteúdo inadequado'],
  ['copyright', 'Direitos autorais'], ['safety', 'Segurança'], ['other', 'Outro'],
] as const;

export default function ReportContentButton({ contentType, contentId, compact = false }: {
  contentType: 'post' | 'story' | 'chapter' | 'comment' | 'review' | 'review_comment';
  contentId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasonOptions)[number][0]>('inappropriate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, content_id: contentId, reason, details }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a denúncia.');
      setMessage('Denúncia enviada para análise humana.'); setDetails(''); setOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a denúncia.'); }
    finally { setBusy(false); }
  }

  return <div className="inline-flex flex-col items-start gap-2">
    <button type="button" onClick={() => { setOpen((value) => !value); setMessage(''); }} className={compact ? 'text-xs text-white/40 hover:text-rose-300' : 'rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:text-white'}>Denunciar</button>
    {open && <div className="flex w-full min-w-56 flex-col gap-2 rounded-xl border border-white/10 bg-[#171019] p-3">
      <label className="text-xs text-white/55">Motivo<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0b10] p-2 text-sm text-white">{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs text-white/55">Detalhes opcionais<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={3000} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0b10] p-2 text-sm text-white" /></label>
      <span className="flex gap-2"><button type="button" disabled={busy} onClick={() => void submit()} className="rounded-full bg-[#ff78b9] px-3 py-2 text-xs font-bold text-[#1b1017] disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar denúncia'}</button><button type="button" onClick={() => setOpen(false)} className="px-2 text-xs text-white/50">Cancelar</button></span>
    </div>}
    {message && <span role="status" className="text-xs text-white/60">{message}</span>}
  </div>;
}
