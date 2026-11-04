'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type Invite = { id: string; title: string; story_title: string; owner: boolean; author_name: string; reader_name: string; accepted_at: string | null };
type Draft = { title: string; story_title: string; body: string; owner: boolean; accepted: boolean; notes: { id: string; excerpt: string; body: string }[] };

async function betaRequest(path = '', init?: RequestInit) {
  const response = await fetch(`/api/beta-reading${path}`, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a leitura beta.');
  return data;
}

export default function BetaReadingPage() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    betaRequest('', { signal: controller.signal }).then(data => setInvites(data.invites)).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, []);

  async function act(invite: Invite, action: 'read' | 'accept' | 'revoke' | 'note') {
    setBusy(true);
    setError('');
    if (action !== 'note') {
      setSelected(invite.id);
      setDraft(null);
      setExcerpt('');
      setBody('');
    }
    try {
      if (action !== 'read') {
        await betaRequest('', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, invite_id: invite.id, excerpt, body }),
        });
      }
      if (action === 'accept' || action === 'revoke') setInvites((await betaRequest()).invites);
      if (action !== 'revoke') setDraft((await betaRequest(`?invite=${encodeURIComponent(invite.id)}`)).draft);
      if (action === 'note') {
        setExcerpt('');
        setBody('');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'A ação não foi concluída.');
    } finally {
      setBusy(false);
    }
  }

  const activeInvite = invites?.find(invite => invite.id === selected);

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeInvite) void act(activeInvite, 'note');
  }

  return (
    <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-pink-300/20 bg-gradient-to-br from-[#35192b] to-[#171018] p-6 sm:p-10">
          <Link href="/minhas-historias" className="text-sm font-semibold text-pink-200 hover:underline">Minhas histórias</Link>
          <h1 className="mt-3 text-3xl font-black">Leitura beta</h1>
          <p className="mt-3 text-white/70">Aceite convites, leia rascunhos e compartilhe comentários privados com a pessoa autora.</p>
        </header>
        {error && <p role="alert" className="rounded-xl border border-rose-300/20 p-4 text-rose-200">{error}</p>}
        {!invites && !error && <p role="status" className="text-white/70">Carregando convites…</p>}
        {invites?.length === 0 && <p className="text-white/70">Nenhum convite de leitura beta por aqui.</p>}
        {invites?.map(invite => (
          <section key={invite.id} className="rounded-2xl border border-white/10 bg-[#191219] p-5">
            <h2 className="font-bold">{invite.title} <span className="text-white/55">· {invite.story_title}</span></h2>
            <p className="my-2 text-sm text-white/65">{invite.owner ? `Para @${invite.reader_name}` : `De @${invite.author_name}`} · {invite.accepted_at ? 'Aceito' : 'Aguardando resposta'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className="nook-primary" onClick={() => void act(invite, invite.owner || invite.accepted_at ? 'read' : 'accept')}>
                {invite.owner ? 'Ver comentários' : invite.accepted_at ? 'Abrir rascunho' : 'Aceitar e ler'}
              </button>
              <button type="button" disabled={busy} className="discovery-secondary" onClick={() => void act(invite, 'revoke')}>{invite.owner ? 'Revogar convite' : invite.accepted_at ? 'Sair da leitura' : 'Recusar convite'}</button>
            </div>
          </section>
        ))}
        {draft && (
          <section className="space-y-5 rounded-3xl border border-pink-300/20 bg-[#191219] p-5 sm:p-8">
            <h2 className="text-2xl font-bold">{draft.title}</h2>
            <div className="select-none space-y-3 rounded-2xl bg-[#100b12] p-5 leading-8" dangerouslySetInnerHTML={{ __html: draft.body }} />
            {!draft.owner && draft.accepted && (
              <form onSubmit={submitNote} className="space-y-3">
                <label className="block text-sm">Trecho ou referência (opcional)<input maxLength={400} value={excerpt} onChange={e => setExcerpt(e.target.value)} className="mt-1 block w-full rounded-xl border border-white/20 bg-[#100b12] p-3" /></label>
                <label className="block text-sm">Comentário privado<textarea required rows={4} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} className="mt-1 block w-full rounded-xl border border-white/20 bg-[#100b12] p-3" /></label>
                <button disabled={busy} type="submit" className="nook-primary">Enviar comentário</button>
              </form>
            )}
            <h3 className="font-bold">Comentários privados</h3>
            {draft.notes.length === 0 && <p className="text-sm text-white/65">Ainda não há comentários.</p>}
            {draft.notes.map(note => <article key={note.id} className="rounded-xl border border-white/10 p-4">
              {note.excerpt && <blockquote className="mb-2 border-l-2 border-pink-300 pl-3 text-sm text-pink-200">{note.excerpt}</blockquote>}
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{note.body}</p>
            </article>)}
          </section>
        )}
      </div>
    </main>
  );
}
