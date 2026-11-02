'use client';

import { useState } from 'react';

export default function ReportProfileButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('other');
  const [details, setDetails] = useState('');
  const [evidenceLinks, setEvidenceLinks] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData();
      body.set('content_type', 'profile'); body.set('content_id', profileId); body.set('reason', reason);
      body.set('details', details); body.set('evidence_urls', JSON.stringify(evidenceLinks.split(/\r?\n/).map((url) => url.trim()).filter(Boolean)));
      evidenceFiles.forEach((file) => body.append('evidence_files', file));
      const response = await fetch('/api/reports', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a denúncia.');
      setMessage(data.message);
      setOpen(false);
      setDetails('');
      setEvidenceLinks('');
      setEvidenceFiles([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a denúncia.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={() => { setOpen((value) => !value); setError(''); }} className="text-xs font-semibold text-white/35 underline decoration-white/20 underline-offset-4 hover:text-white/70">Denunciar perfil</button>
      {message && <p role="status" className="mt-2 text-xs text-green-300">{message}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {open && <div className="mt-3 max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#191219] p-4">
        <label className="block text-xs font-semibold text-white/60">Motivo
          <select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] px-3 py-3 text-sm text-white">
            <option value="harassment">Assédio ou abuso</option><option value="spam">Spam</option><option value="inappropriate">Conteúdo inadequado</option><option value="copyright">Direitos autorais</option><option value="safety">Segurança</option><option value="other">Outro</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-white/60">Detalhes (opcional)
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={3000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" />
        </label>
        <label className="block text-xs font-semibold text-white/60">Links de evidência opcionais (até 3, um por linha)
          <textarea value={evidenceLinks} onChange={(event) => setEvidenceLinks(event.target.value)} maxLength={6000} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-[#100b12] p-3 text-sm text-white" placeholder="https://…" />
        </label>
        <label className="block text-xs font-semibold text-white/60">Imagens opcionais (JPG, PNG ou WEBP; até 1 MB cada; máximo de três links e imagens no total)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setEvidenceFiles(Array.from(event.target.files || []).slice(0, 3))} className="mt-2 block w-full text-xs text-white/60" />
          {evidenceFiles.length > 0 && <span className="mt-1 block">{evidenceFiles.map((file) => file.name).join(', ')}</span>}
        </label>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void submit()} className="rounded-xl bg-[#ff78b9] px-4 py-2 text-sm font-bold text-[#1b1018] disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar denúncia'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold">Cancelar</button></div>
      </div>}
    </div>
  );
}
