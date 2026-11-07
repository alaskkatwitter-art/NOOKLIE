'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Character = { id: string; name: string; universe: string; biography?: string; source_url?: string; approved_at?: string };
type Edit = { id: string; biography: string; source_url: string; wiki_characters: { name: string; universe: string } };
type Catalog = { authenticated: boolean; canReview: boolean; characters: Character[]; favorites: Character[] };

const field = 'mt-1 block w-full rounded-xl border border-white/20 bg-black/25 p-3';
const panel = 'space-y-3 rounded-2xl border border-pink-300/20 bg-pink-300/5 p-4';

export default function CharacterWiki({ id }: { id?: string }) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [edits, setEdits] = useState<Edit[]>([]);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(id ? { id } : { q: search });
    async function load() {
      try {
        const options = { cache: 'no-store' as const, signal: controller.signal };
        const response = await fetch('/api/characters?' + params, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCatalog(data);
        if (data.canReview) {
          const review = await fetch('/api/characters?pending=1', options);
          if (!review.ok) throw new Error('A fila de revisão está indisponível.');
          setEdits((await review.json()).edits);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os personagens.');
      }
    }
    void load();
    return () => controller.abort();
  }, [id, search, revision]);

  async function save(payload: object, message: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/characters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStatus(message);
      setRevision(value => value + 1);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const character = id ? catalog?.characters[0] ?? catalog?.favorites.find(item => item.id === id) : undefined;
  const favorite = Boolean(id && catalog?.favorites.some(item => item.id === id));
  const canEdit = catalog?.authenticated && (!id || favorite);

  function cards(items: Character[]) {
    return <ul className="grid gap-2 sm:grid-cols-2">{items.map(item => <li key={item.id}>
      <Link href={'/personagens/' + item.id} className="block rounded-xl border border-white/15 p-3 hover:border-pink-300/60">
        <strong>{item.name}</strong><span className="block text-sm text-white/70">{item.universe}{!item.approved_at && ' · Em revisão'}</span>
      </Link>
    </li>)}</ul>;
  }

  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 p-5 text-white sm:p-8">
    <Link href={id ? '/personagens' : '/fandoms'} className="text-pink-200">{id ? '← Personagens favoritos' : '← Meus universos'}</Link>
    <h1 className="text-3xl font-black">{character?.name ?? 'Personagens favoritos'}</h1>
    {error && <p role="alert" className="text-rose-200">{error}</p>}
    {status && <p role="status" className="text-pink-200">{status}</p>}
    {!catalog && !error && <p role="status">Carregando personagens…</p>}
    {character && <section className={panel}>
      <p className="font-semibold text-pink-200">{character.universe}</p>
      <p className="whitespace-pre-wrap break-words">{character.biography || 'A página está aguardando revisão da equipe.'}</p>
      {character.source_url && <a href={character.source_url} target="_blank" rel="noreferrer" className="block text-pink-200 underline">Consultar fonte</a>}
      {catalog?.authenticated && character.approved_at && <button disabled={busy} className="discovery-secondary" onClick={() => void save({ action: 'favorite', id, enabled: !favorite }, favorite ? 'Personagem removido dos favoritos.' : 'Personagem adicionado aos favoritos.')}>
        {favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      </button>}
    </section>}
    {!id && catalog && <>
      {catalog.authenticated && <section className={panel}><h2 className="text-lg font-bold">Meus favoritos</h2>
        {catalog.favorites.length ? cards(catalog.favorites) : <p>Seus personagens favoritos aparecem aqui.</p>}
      </section>}
      <section className={panel}>
        <h2 className="text-lg font-bold">Wiki da comunidade</h2>
        <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); setError(''); setSearch(query.trim()); }}>
          <label className="min-w-0 flex-1 text-sm">Pesquisar personagem<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} className={field} /></label>
          <button className="discovery-secondary">Pesquisar</button>
        </form>
        {catalog.characters.length ? cards(catalog.characters) : <p>Nenhum personagem encontrado.</p>}
      </section>
    </>}
    {catalog && !catalog.authenticated && <p><Link href="/login" className="text-pink-200 underline">Entre</Link> para favoritar personagens ou contribuir.</p>}
    {canEdit && <section className={panel}>
      <h2 className="text-lg font-bold">{id ? 'Sugerir uma atualização' : 'Cadastrar personagem'}</h2>
      <p className="text-sm text-white/70">Use informações sobre o personagem e inclua uma fonte. A equipe confere a sugestão antes de publicar.</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        if (await save({ action: 'submit', id, ...values }, 'Sugestão enviada para revisão.')) form.reset();
      }}>
        {!id && <div className="grid gap-3 sm:grid-cols-2">
          <label>Nome<input name="name" required minLength={2} maxLength={100} className={field} /></label>
          <label>Obra ou universo<input name="universe" required minLength={2} maxLength={160} className={field} /></label>
        </div>}
        <label className="block">Sobre o personagem<textarea name="biography" required minLength={20} maxLength={5000} rows={5} defaultValue={character?.biography} className={field} /></label>
        <label className="block">Link da fonte<input type="url" name="source" required maxLength={1500} defaultValue={character?.source_url} className={field} /></label>
        <button disabled={busy} className="nook-primary">Enviar para revisão</button>
      </form>
    </section>}
    {!id && catalog?.canReview && <section className={panel}>
      <h2 className="text-lg font-bold">Revisão da equipe</h2>
      {!edits.length && <p>Nenhuma sugestão pendente.</p>}
      {edits.map(edit => <article key={edit.id} className="space-y-2 border-t border-white/15 py-3">
        <h3 className="font-bold">{edit.wiki_characters.name} · {edit.wiki_characters.universe}</h3>
        <p className="whitespace-pre-wrap break-words">{edit.biography}</p>
        <a href={edit.source_url} target="_blank" rel="noreferrer" className="block text-pink-200 underline">Conferir fonte</a>
        <div className="flex gap-2"><button disabled={busy} className="nook-primary" onClick={() => void save({ action: 'review', id: edit.id, decision: 'approved' }, 'Página publicada.')}>Aprovar</button>
          <button disabled={busy} className="discovery-secondary" onClick={() => void save({ action: 'review', id: edit.id, decision: 'rejected' }, 'Sugestão recusada.')}>Recusar</button></div>
      </article>)}
    </section>}
  </main>;
}
