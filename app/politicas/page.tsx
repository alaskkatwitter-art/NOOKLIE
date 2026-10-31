'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Policy = { slug: string; version: string; title: string; requires_reacceptance: boolean; published_at: string };
const descriptions: Record<string, string> = {
  terms: 'Como funciona o serviço gratuito e como a plataforma trata as obras.',
  privacy: 'Quais dados a conta usa e como pedir uma cópia ou exclusão.',
  community: 'Regras para conversas, críticas e convivência.',
  'content-rating': 'Classificação e avisos de conteúdo das histórias.',
  copyright: 'Autoria, fanfictions, traduções e créditos.',
  collaboration: 'Convites, créditos e coautoria.',
  moderation: 'Denúncias, análise humana, medidas e recursos.',
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; fetch('/api/policies', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os documentos.'); if (active) setPolicies(data.policies || []); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os documentos.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <main className="min-h-screen bg-[#100b12] px-4 py-12 text-white sm:px-6"><div className="mx-auto max-w-4xl">
    <Link href="/" className="text-sm text-[#ff9aca] hover:underline">← Início</Link>
    <h1 className="mt-6 text-3xl font-black">Políticas do Nooklie</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Documentos institucionais com versão e data de publicação. Dúvidas e revisões devem ser encaminhadas à equipe pelo canal de suporte disponível no site.</p>
    {loading && <p className="mt-7 text-sm text-white/50">Carregando documentos…</p>}
    {error && <p role="alert" className="mt-7 rounded-xl border border-rose-300/20 p-4 text-sm text-rose-100">{error}</p>}
    {!loading && !error && policies.length === 0 && <p className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/60">Os documentos estão sendo preparados. As regras atuais da comunidade continuam acessíveis nas telas de denúncia e publicação.</p>}
    <ul className="mt-7 grid gap-3 sm:grid-cols-2">{policies.map((policy) => <li key={policy.slug}><Link href={`/politicas/${policy.slug}`} className="block h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#ff78b9]/35"><span className="text-xs text-[#ff9aca]">v{policy.version} · {new Date(policy.published_at).toLocaleDateString('pt-BR')}</span><h2 className="mt-2 font-bold">{policy.title}</h2><p className="mt-2 text-sm leading-6 text-white/55">{descriptions[policy.slug] || 'Leia este documento institucional.'}</p>{policy.requires_reacceptance && <span className="mt-3 inline-block rounded-full border border-amber-300/20 px-2.5 py-1 text-xs text-amber-100">Aceite solicitado</span>}</Link></li>)}</ul>
  </div></main>;
}
