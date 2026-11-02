'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RequiredPolicy = { slug: string; version: string; title: string };
export default function PolicyAcceptanceNotice() {
  const [required, setRequired] = useState<RequiredPolicy[]>([]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch('/api/policies/status', { cache: 'no-store' });
        if (!response.ok) { if (response.status === 401 && active) setRequired([]); return; }
        const data = await response.json();
        if (active) setRequired(data.required || []);
      } catch { /* Keep the existing notice on a temporary network error. */ }
    }
    void refresh();
    window.addEventListener('nooklie:policy-accepted', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('nooklie:policy-accepted', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  if (!required.length) return null;
  return <aside className="mx-auto my-4 max-w-3xl rounded-2xl border border-amber-300/25 bg-[#21151e] p-4 text-white" aria-label="Aceite de políticas pendente">
    <p className="text-sm font-bold text-amber-100">Há uma atualização de política que pede sua confirmação.</p>
    <ul className="mt-2 space-y-1">{required.map((item) => <li key={item.slug}><Link href={`/politicas/${item.slug}`} className="text-sm text-[#ff9aca] underline">{item.title} · v{item.version}</Link></li>)}</ul>
  </aside>;
}
