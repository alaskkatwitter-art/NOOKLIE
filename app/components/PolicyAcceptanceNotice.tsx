'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RequiredPolicy = { slug: string; version: string; title: string };
export default function PolicyAcceptanceNotice() {
  const [required, setRequired] = useState<RequiredPolicy[]>([]);
  useEffect(() => { let active = true; fetch('/api/policies/status', { cache: 'no-store' }).then(async (response) => { if (!response.ok) return; const data = await response.json(); if (active) setRequired(data.required || []); }).catch(() => undefined); return () => { active = false; }; }, []);
  if (!required.length) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border border-amber-300/25 bg-[#21151e] p-4 shadow-2xl shadow-black/40" aria-label="Aceite de políticas pendente">
    <p className="text-sm font-bold text-amber-100">Há uma atualização de política que pede sua confirmação.</p>
    <ul className="mt-2 space-y-1">{required.map((item) => <li key={item.slug}><Link href={`/politicas/${item.slug}`} className="text-sm text-[#ff9aca] underline">{item.title} · v{item.version}</Link></li>)}</ul>
  </aside>;
}
