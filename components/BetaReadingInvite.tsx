'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

export default function BetaReadingInvite({ chapterId }: { chapterId: string }) {
  const [reader, setReader] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/beta-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', chapter_id: chapterId, reader }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReader('');
      setStatus('Convite disponível para a pessoa leitora em Leitura beta.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível criar o convite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mb-5 rounded-2xl border border-pink-300/20 bg-gradient-to-br from-[#321729] to-[#171018] p-4">
      <summary className="cursor-pointer text-sm font-bold text-pink-200">Convidar para leitura beta</summary>
      <p className="my-3 text-sm text-white/70">A pessoa convidada poderá comentar este rascunho em privado após aceitar.</p>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm">Nome de usuário
          <input required maxLength={50} placeholder="@leitora" value={reader} onChange={event => setReader(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-white/20 bg-[#100b12] px-3" />
        </label>
        <button type="submit" disabled={busy} className="nook-primary">{busy ? 'Criando…' : 'Criar convite'}</button>
      </form>
      {status && <p role="status" className="mt-3 text-sm text-pink-100">{status}</p>}
      <Link href="/leitura-beta" className="mt-3 inline-flex min-h-11 items-center text-sm text-pink-200 hover:underline">Gerenciar convites e comentários</Link>
    </details>
  );
}
