'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type User = { deactivated_at?: string | null };

export default function AccountPrivacyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error('Entre na sua conta para gerenciar a privacidade.');
      if (active) setUser(data.user);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua conta.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function runAction(action: 'deactivate' | 'reactivate' | 'request_deletion', event?: FormEvent) {
    event?.preventDefault(); setPending(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/account/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, confirmation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.');
      setMessage(data.message || 'Solicitação concluída.');
      if (action === 'deactivate' || action === 'reactivate') setUser((current) => current ? { ...current, deactivated_at: action === 'deactivate' ? new Date().toISOString() : null } : current);
      setConfirmation('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a solicitação.'); }
    finally { setPending(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6"><div className="mx-auto max-w-2xl">
    <Link href="/configuracoes" className="text-sm text-[#ff9aca] hover:underline">← Configurações</Link>
    <h1 className="mt-6 text-3xl font-black">Privacidade e estado da conta</h1>
    <p className="mt-2 text-sm leading-6 text-white/60">Você pode baixar uma cópia dos seus dados, ocultar temporariamente seu perfil e suas histórias ou solicitar a exclusão da conta. Não pedimos documentos, e-mail nem telefone para estes fluxos.</p>
    {loading && <p className="mt-6 text-white/50">Carregando…</p>}
    {error && <p role="alert" className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">{error}</p>}
    {message && <p role="status" className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">{message}</p>}
    {!loading && user && <div className="mt-8 space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-bold">Exportar seus dados</h2><p className="mt-2 text-sm leading-6 text-white/55">Baixe suas histórias, capítulos, comentários, avaliações, favoritos e progresso de leitura em JSON.</p>
        <a href="/api/account/export" className="mt-4 inline-block rounded-full border border-[#ff78b9]/40 px-4 py-2 text-sm font-semibold text-[#ff9aca] hover:bg-[#ff78b9]/10">Baixar arquivo de dados</a>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-bold">{user.deactivated_at ? 'Reativar conta' : 'Desativar temporariamente'}</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">{user.deactivated_at ? 'Ao reativar, seu perfil e suas histórias voltarão a aparecer. Seus textos, comentários e favoritos são preservados.' : 'Seu perfil e suas histórias deixam de aparecer publicamente. Seus dados, comentários, progresso e favoritos ficam preservados; entre novamente nesta tela para reativar.'}</p>
        <button type="button" disabled={pending} onClick={() => runAction(user.deactivated_at ? 'reactivate' : 'deactivate')} className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50">{pending ? 'Salvando…' : user.deactivated_at ? 'Reativar conta' : 'Desativar conta'}</button>
      </section>
      {!user.deactivated_at && <section className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] p-5">
        <h2 className="font-bold text-rose-100">Solicitar exclusão definitiva</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">A solicitação será analisada antes da exclusão. Enquanto isso, a conta e as obras continuam disponíveis. O Nooklie não vai apagar automaticamente conteúdo em coautoria nem registros de segurança sem revisão.</p>
        <form onSubmit={(event) => runAction('request_deletion', event)} className="mt-4 space-y-3">
          <label htmlFor="delete-confirmation" className="block text-sm text-white/70">Digite <strong>EXCLUIR MINHA CONTA</strong> para registrar a solicitação</label>
          <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-white/15 bg-[#171019] px-4 py-3 text-white" autoComplete="off" />
          <button type="submit" disabled={pending || confirmation !== 'EXCLUIR MINHA CONTA'} className="rounded-full border border-rose-300/30 px-4 py-2 text-sm font-semibold text-rose-100 disabled:opacity-40">Solicitar exclusão</button>
        </form>
      </section>}
    </div>}
  </div></main>;
}
