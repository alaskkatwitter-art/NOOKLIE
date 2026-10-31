'use client';

import { FormEvent, useEffect, useState } from 'react';

type Collaborator = { role: string; profile: { username: string; display_name: string | null } | null };
const roleLabels: Record<string, string> = { coauthor: 'Coautor(a)', designer: 'Designer', reviewer: 'Revisor(a)', beta_reader: 'Leitor(a) beta', translator: 'Tradutor(a)' };

export default function StoryCollaboratorsPanel({ storyId }: { storyId: string }) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('coauthor');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { let active = true; fetch(`/api/stories/${encodeURIComponent(storyId)}/collaborators`, { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (response.ok && active) setCollaborators(data.collaborators || []); }).catch(() => undefined); return () => { active = false; }; }, [storyId]);

  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, role }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o convite.');
      setUsername(''); setNotice('Convite enviado. O crédito só aparece depois que a pessoa aceitar.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o convite.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
    <h2 className="font-bold">Coautoria e créditos</h2>
    <p className="mt-1 text-xs leading-5 text-white/50">Convites não expõem o crédito até a pessoa aceitar. Coautores podem editar a história; os demais recebem apenas o crédito indicado.</p>
    {collaborators.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">{collaborators.map((item, index) => <li key={`${item.role}-${item.profile?.username}-${index}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70">{item.profile?.display_name || `@${item.profile?.username}`} · {roleLabels[item.role] || item.role}</li>)}</ul>}
    <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <label className="sr-only" htmlFor={`collaborator-${storyId}`}>Nome de usuário</label>
      <input id={`collaborator-${storyId}`} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@usuário" className="min-w-0 rounded-xl border border-white/15 bg-[#171019] px-4 py-3 text-sm text-white" />
      <label className="sr-only" htmlFor={`collaborator-role-${storyId}`}>Função</label>
      <select id={`collaborator-role-${storyId}`} value={role} onChange={(event) => setRole(event.target.value)} className="rounded-xl border border-white/15 bg-[#171019] px-3 py-3 text-sm text-white">{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button disabled={busy} className="rounded-xl bg-[#ff78b9] px-4 py-3 text-sm font-bold text-[#1b1017] disabled:opacity-50">Enviar convite</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-200">{notice}</p>}
  </section>;
}
