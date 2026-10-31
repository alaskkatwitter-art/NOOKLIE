'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Policy = { slug: string; version: string; title: string; content_md: string; requires_reacceptance: boolean; published_at: string };
export default function PolicyDetailPage() {
  const params = useParams(); const slug = String(params.slug);
  const [policy, setPolicy] = useState<Policy | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; fetch(`/api/policies/${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Documento não encontrado.'); if (active) setPolicy(data.policy); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o documento.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [slug]);
  async function accept() { setNotice(''); setError(''); try { const response = await fetch(`/api/policies/${encodeURIComponent(slug)}/accept`, { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Entre na sua conta para registrar o aceite.'); setNotice(`Leitura registrada para a versão ${data.version}.`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o aceite.'); } }
  return <main className="min-h-screen bg-[#100b12] px-4 py-12 text-white sm:px-6"><article className="mx-auto max-w-3xl"><Link href="/politicas" className="text-sm text-[#ff9aca] hover:underline">← Políticas</Link>{loading && <p className="mt-8 text-white/50">Carregando…</p>}{error && <p role="alert" className="mt-8 text-rose-200">{error}</p>}{policy && <><h1 className="mt-6 text-3xl font-black">{policy.title}</h1><p className="mt-2 text-xs text-white/45">Versão {policy.version} · publicada em {new Date(policy.published_at).toLocaleDateString('pt-BR')}</p>{policy.requires_reacceptance && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Esta versão solicita que você confirme a leitura.</div>}<pre className="mt-8 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-white/75">{policy.content_md}</pre>{policy.requires_reacceptance && <button type="button" onClick={accept} className="mt-8 rounded-full bg-[#ff78b9] px-5 py-3 text-sm font-bold text-[#1b1017]">Confirmar leitura e aceite</button>}</>}{notice && <p role="status" className="mt-5 text-emerald-200">{notice}</p>}</article></main>;
}
