'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Role = 'coauthor' | 'designer' | 'reviewer' | 'beta_reader' | 'translator';
type Collaboration = { id: string; story_id: string; role: Role; accepted_at: string | null; story_title: string };

const roleLabels: Record<Role, string> = {
  coauthor: 'Coautoria',
  designer: 'Design de capa',
  reviewer: 'Revisão',
  beta_reader: 'Leitura beta',
  translator: 'Tradução',
};

export default function MyCollaborationsPage() {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/account/collaborations', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar suas colaborações.');
    setCollaborations(data.collaborations || []);
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function leave(item: Collaboration) {
    const action = item.role === 'coauthor' ? 'sair da coautoria' : 'retirar a confirmação deste crédito';
    if (!window.confirm(`Deseja ${action} em “${item.story_title}”? A história continuará com os demais autores e colaboradores.`)) return;
    setBusyId(item.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/account/collaborations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: item.story_id, role: item.role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível encerrar a colaboração.');
      setCollaborations((current) => current.filter((collaboration) => collaboration.id !== item.id));
      setNotice(item.role === 'coauthor' ? 'Você saiu da coautoria. A história e os direitos dos outros autores foram preservados.' : 'Sua confirmação de crédito foi retirada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao encerrar a colaboração.');
    } finally {
      setBusyId(null);
    }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6">
    <section className="mx-auto max-w-3xl space-y-5">
      <Link href="/conta/creditos" className="text-sm text-[#ff9aca]">← Créditos e portfólio</Link>
      <header>
        <h1 className="text-2xl font-bold">Minhas colaborações</h1>
        <p className="mt-2 text-sm text-white/55">Você pode retirar um crédito confirmado ou sair de uma coautoria. A história continua com quem permanecer; sair não transfere direitos nem apaga a obra.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-400/20 p-3 text-sm text-emerald-200">{notice}</p>}
      {loading ? <p className="text-sm text-white/50">Carregando…</p> : collaborations.length === 0 ?
        <p className="rounded-2xl border border-white/10 p-6 text-sm text-white/55">Você não tem colaborações ativas.</p> :
        <div className="space-y-3">
          {collaborations.map((item) => <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wide text-[#ff9aca]">{roleLabels[item.role]}</span>
              <h2 className="mt-1 truncate font-semibold">{item.story_title}</h2>
              {item.accepted_at && <p className="mt-1 text-xs text-white/40">Aceita em {item.accepted_at.slice(0, 10).split('-').reverse().join('/')}</p>}
            </div>
            <button type="button" disabled={busyId !== null} onClick={() => void leave(item)} className="shrink-0 rounded-xl border border-rose-300/25 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">
              {busyId === item.id ? 'Salvando…' : item.role === 'coauthor' ? 'Sair da coautoria' : 'Retirar crédito'}
            </button>
          </article>)}
        </div>}
    </section>
  </main>;
}
