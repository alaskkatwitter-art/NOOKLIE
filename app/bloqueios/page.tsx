'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type Block = { id: string; profile: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null };

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/user-blocks', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os bloqueios.');
    setBlocks(data.blocks || []);
  }
  useEffect(() => { let active = true; fetch('/api/user-blocks', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os bloqueios.'); if (active) setBlocks(data.blocks || []); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os bloqueios.'); }); return () => { active = false; }; }, []);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/user-blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível bloquear este perfil.');
      setUsername(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível bloquear este perfil.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/user-blocks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível desbloquear este perfil.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível desbloquear este perfil.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6"><div className="mx-auto max-w-2xl">
    <Link href="/configuracoes" className="text-sm text-[#ff9aca] hover:underline">← Configurações</Link>
    <h1 className="mt-6 text-3xl font-black">Perfis bloqueados</h1>
    <p className="mt-2 text-sm leading-6 text-white/60">Pessoas bloqueadas não poderão seguir você nem comentar nas suas histórias. O bloqueio não envia uma notificação e pode ser desfeito quando quiser.</p>
    <form onSubmit={add} className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row">
      <label className="sr-only" htmlFor="block-username">Nome de usuário</label><input id="block-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@usuário" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#171019] px-4 py-3 text-white" />
      <button disabled={busy} className="rounded-xl bg-[#ff78b9] px-5 py-3 text-sm font-bold text-[#1b1017] disabled:opacity-50">Bloquear</button>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</p>}
    <ul className="mt-6 space-y-3">{blocks.map((block) => <li key={block.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-4">
      <div><p className="font-semibold">{block.profile?.display_name || `@${block.profile?.username || 'perfil'}`}</p>{block.profile?.display_name && <p className="text-sm text-white/50">@{block.profile.username}</p>}</div>
      <button type="button" disabled={busy} onClick={() => remove(block.id)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 disabled:opacity-50">Desbloquear</button>
    </li>)}</ul>
    {blocks.length === 0 && <p className="mt-6 text-sm text-white/50">Você ainda não bloqueou ninguém.</p>}
  </div></main>;
}
