"use client";
import { useState } from 'react';
export default function AuthorInviteLink({ username }: { username: string }) {
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  async function copy() {
    const url = new URL(`/convite/${encodeURIComponent(username)}`, window.location.origin).href;
    setLink(url);
    try { await navigator.clipboard.writeText(url); setNotice('Convite copiado! Envie para seus leitores.'); }
    catch { setNotice('Selecione o link abaixo para copiar.'); }
  }
  return <div className="mb-2"><button type="button" onClick={copy} className="rounded-2xl border border-pink-300/30 px-4 py-2.5 text-sm font-bold text-pink-200">Convidar leitores</button>{link && <div className="mt-2 max-w-xs"><label className="text-sm text-pink-200">Seu link de convite<input aria-label="Seu link de convite" readOnly value={link} onFocus={event => event.target.select()} className="mt-1 w-full rounded-lg border border-white/15 bg-black p-3 text-sm text-white" /></label><p role="status" className="mt-2 text-sm text-white/70">{notice}</p></div>}</div>;
}
