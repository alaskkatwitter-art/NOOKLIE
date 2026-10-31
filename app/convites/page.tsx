'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Invite = { id: string; story_id: string; role: string; created_at: string; inviter: { username: string; display_name: string | null } | null; story: { title: string } | null };
const roleLabels: Record<string, string> = { coauthor: 'coautoria', designer: 'criação da capa', reviewer: 'revisão', beta_reader: 'leitura beta', translator: 'tradução' };

export default function CollaboratorInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch('/api/collaborator-invites', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os convites.'); setInvites(data.invites || []); }
  useEffect(() => { let active = true; fetch('/api/collaborator-invites', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os convites.'); if (active) setInvites(data.invites || []); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os convites.'); }); return () => { active = false; }; }, []);
  async function decide(invite: Invite, decision: 'accept' | 'decline') { setBusy(true); setError(''); setNotice(''); try { const response = await fetch(`/api/collaborator-invites/${encodeURIComponent(invite.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, agreement_acknowledged: acknowledged[invite.id] === true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível responder ao convite.'); setNotice(decision === 'accept' ? 'Convite aceito.' : 'Convite recusado.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível responder ao convite.'); } finally { setBusy(false); } }
  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6"><div className="mx-auto max-w-3xl"><Link href="/configuracoes" className="text-sm text-[#ff9aca] hover:underline">← Configurações</Link><h1 className="mt-6 text-3xl font-black">Convites de colaboração</h1><p className="mt-2 text-sm leading-6 text-white/60">Confira a função e combine responsabilidades, direitos, créditos e decisões editoriais com os demais participantes antes de aceitar.</p>
    {error && <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="mt-5 text-sm text-emerald-200">{notice}</p>}
    {invites.length === 0 && <p className="mt-8 rounded-xl border border-white/10 p-5 text-sm text-white/55">Você não tem convites pendentes.</p>}
    <ul className="mt-6 space-y-4">{invites.map((invite) => <li key={invite.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><h2 className="font-bold">{invite.story?.title || 'História'} · {roleLabels[invite.role] || invite.role}</h2><p className="mt-1 text-sm text-white/55">Convite de @{invite.inviter?.username || 'usuário'}</p><Link href={`/historia/${encodeURIComponent(invite.story_id)}`} className="mt-3 inline-block text-sm text-[#ff9aca] underline">Ver história</Link>
      {invite.role === 'coauthor' && <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50/80">Como coautor(a), você poderá editar sinopse, capítulos, tags e classificação. O Nooklie registra permissões técnicas e autoria das alterações; isso não substitui um acordo entre os participantes sobre responsabilidades e direitos.</div>}
      <label className="mt-4 flex items-start gap-2 text-sm text-white/65"><input type="checkbox" checked={acknowledged[invite.id] === true} onChange={(event) => setAcknowledged((current) => ({ ...current, [invite.id]: event.target.checked }))} className="mt-1" />Li o aviso sobre responsabilidades, créditos e direitos da colaboração.</label>
      <div className="mt-4 flex gap-3"><button type="button" disabled={busy || (invite.role === 'coauthor' && !acknowledged[invite.id])} onClick={() => decide(invite, 'accept')} className="rounded-full bg-[#ff78b9] px-4 py-2 text-sm font-bold text-[#1b1017] disabled:opacity-40">Aceitar</button><button type="button" disabled={busy} onClick={() => decide(invite, 'decline')} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/75">Recusar</button></div>
    </li>)}</ul>
  </div></main>;
}
