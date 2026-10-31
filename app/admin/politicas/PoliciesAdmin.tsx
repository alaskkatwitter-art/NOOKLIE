'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type Policy = { id: string; slug: string; version: string; title: string; content_md: string; status: 'draft' | 'published' | 'archived'; requires_reacceptance: boolean; published_at: string | null; created_at: string };
const names: Record<string, string> = { terms: 'Termos de Uso', privacy: 'Política de Privacidade', community: 'Diretrizes da Comunidade', 'content-rating': 'Conteúdo e Classificação', copyright: 'Direitos Autorais', collaboration: 'Colaboração e Coautoria', moderation: 'Moderação e Denúncias' };

export default function PoliciesAdmin() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [slug, setSlug] = useState('terms');
  const [version, setVersion] = useState('0.1.0');
  const [title, setTitle] = useState('Termos de Uso');
  const [content, setContent] = useState('');
  const [reaccept, setReaccept] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/admin/policies', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os documentos.');
    setPolicies(data.policies || []);
  }
  useEffect(() => { let active = true; fetch('/api/admin/policies', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os documentos.'); if (active) setPolicies(data.policies || []); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os documentos.'); }); return () => { active = false; }; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: editingId ? 'update_draft' : 'create_draft', policy_id: editingId || undefined, slug, version, title, content_md: content, requires_reacceptance: reaccept }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a minuta.');
      setNotice(editingId ? 'Minuta atualizada.' : 'Nova minuta criada.'); setEditingId(''); setTitle(''); setContent(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a minuta.'); }
    finally { setBusy(false); }
  }

  async function action(policy: Policy, actionName: 'publish' | 'archive') {
    const prompt = actionName === 'publish'
      ? `Publicar ${policy.title} v${policy.version}? A publicação exige revisão jurídica concluída.`
      : `Arquivar ${policy.title} v${policy.version}?`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, policy_id: policy.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o documento.');
      setNotice(actionName === 'publish' ? 'Versão publicada.' : 'Versão arquivada.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o documento.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-5xl">
    <Link href="/admin" className="text-sm text-[#ff9aca] hover:underline">← Painel administrativo</Link>
    <h1 className="mt-5 text-3xl font-black">Políticas institucionais</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Crie versões como minutas, revise com apoio jurídico e publique somente após aprovação. Versões publicadas são preservadas no histórico; uma nova publicação arquiva a anterior.</p>
    <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Os textos desta área não substituem orientação jurídica. A adequação às normas brasileiras, especialmente proteção de crianças/adolescentes, privacidade e direitos autorais, precisa ser verificada antes da publicação.</p>
    {error && <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-emerald-200">{notice}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-bold">{editingId ? 'Editar minuta' : 'Nova versão'}</h2>
        <label className="block text-sm">Documento<select disabled={Boolean(editingId)} value={slug} onChange={(event) => { setSlug(event.target.value); setTitle(names[event.target.value]); }} className="mt-2 w-full rounded-xl border border-white/15 bg-[#171019] p-3">{Object.entries(names).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label className="block text-sm">Versão<input disabled={Boolean(editingId)} value={version} onChange={(event) => setVersion(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#171019] p-3" placeholder="1.0.0" /></label>
        <label className="block text-sm">Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-white/15 bg-[#171019] p-3" /></label>
        <label className="block text-sm">Texto em Markdown<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={50000} rows={12} className="mt-2 w-full rounded-xl border border-white/15 bg-[#171019] p-3" placeholder="Escreva o conteúdo da minuta…" /></label>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={reaccept} onChange={(event) => setReaccept(event.target.checked)} /> Exigir novo aceite ao publicar</label>
        <div className="flex gap-3"><button disabled={busy} className="rounded-full bg-[#ff78b9] px-5 py-2.5 text-sm font-bold text-[#1b1017] disabled:opacity-50">Salvar minuta</button>{editingId && <button type="button" onClick={() => { setEditingId(''); setTitle(''); setContent(''); }} className="rounded-full border border-white/15 px-4 py-2 text-sm">Cancelar edição</button>}</div>
      </form>
      <section><h2 className="font-bold">Histórico de versões</h2><ul className="mt-4 space-y-3">{policies.map((policy) => <li key={policy.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{policy.title} <span className="text-xs text-white/45">v{policy.version}</span></h3><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">{policy.status === 'draft' ? 'Minuta' : policy.status === 'published' ? 'Publicada' : 'Arquivada'}</span></div>
        <p className="mt-1 text-xs text-white/40">{names[policy.slug] || policy.slug} · {policy.requires_reacceptance ? 'novo aceite exigido' : 'sem novo aceite'}</p>
        <div className="mt-3 flex flex-wrap gap-2">{policy.status === 'draft' && <><button type="button" disabled={busy} onClick={() => { setEditingId(policy.id); setSlug(policy.slug); setVersion(policy.version); setTitle(policy.title); setContent(policy.content_md); setReaccept(policy.requires_reacceptance); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Editar minuta</button><button type="button" disabled={busy || !policy.content_md.trim()} onClick={() => action(policy, 'publish')} className="rounded-lg border border-emerald-300/25 px-3 py-1.5 text-xs text-emerald-100">Publicar após revisão</button></>}{policy.status === 'published' && <button type="button" disabled={busy} onClick={() => action(policy, 'archive')} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Arquivar versão</button>}</div>
      </li>)}</ul>{policies.length === 0 && <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-white/50">Nenhuma versão criada ainda.</p>}</section>
    </div>
  </div></main>;
}
