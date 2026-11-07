'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import ReadingListForm from './ReadingListForm';

type ReadingList = { id: string; name: string; containsStory: boolean };

export default function StoryReadingActions({ storyId }: { storyId: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function request(url: string, body?: object) {
    setBusy(true);
    setError('');
    setNeedsLogin(false);
    try {
      const response = await fetch(url, body ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      } : { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) {
        setNeedsLogin(response.status === 401);
        throw new Error(result.error);
      }
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a história.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function finish(message: string) {
    dialog.current?.close();
    if (menu.current) menu.current.open = false;
    setNotice(message);
  }

  return <div>
    <details ref={menu} className="relative">
      <summary aria-label="Opções de leitura" className="cursor-pointer list-none rounded-xl border border-white/15 px-4 py-2 text-xl leading-6">⋯</summary>
      <div className="absolute right-0 z-20 mt-2 grid w-60 gap-1 rounded-xl border border-pink-300/25 bg-[#1b101a] p-2 text-sm shadow-xl">
        <button type="button" disabled={busy || saved} className="rounded-lg p-2 text-left hover:bg-white/10" onClick={async () => {
          if (await request('/api/library', { story_id: storyId })) {
            setSaved(true);
            finish('História adicionada à biblioteca.');
          }
        }}>{saved ? 'Na biblioteca' : 'Adicionar história à biblioteca'}</button>
        <button type="button" disabled={busy} className="rounded-lg p-2 text-left hover:bg-white/10" onClick={async () => {
          const result = await request('/api/reading-lists?story=' + storyId);
          if (result) {
            setLists(result.lists);
            if (menu.current) menu.current.open = false;
            dialog.current?.showModal();
          }
        }}>Adicionar a uma lista de leitura</button>
        {error && <p role="alert" className="p-2 text-pink-200">{error} {needsLogin && <Link className="underline" href="/login">Entrar</Link>}</p>}
      </div>
    </details>
    <dialog ref={dialog} className="nook-dialog" aria-label="Adicionar a uma lista de leitura">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Listas de leitura</h2>
        <button type="button" onClick={() => dialog.current?.close()} className="p-2 text-sm">Fechar</button>
      </div>
      <div className="mb-4 grid gap-2">
        {lists.map(list => <button type="button" key={list.id} disabled={busy || list.containsStory} className="rounded-xl border border-white/15 p-3 text-left disabled:opacity-50" onClick={async () => {
          if (await request('/api/reading-lists', { listId: list.id, storyId })) finish('História adicionada à lista.');
        }}>{list.name}{list.containsStory && ' · História adicionada'}</button>)}
      </div>
      {error && <p role="alert" className="mb-3 text-pink-200">{error}</p>}
      <h3 className="mb-3 font-semibold">Criar uma lista</h3>
      <ReadingListForm storyId={storyId} onCreated={() => finish('Lista criada e história adicionada.')} />
    </dialog>
    {notice && <p role="status" className="absolute right-4 mt-2 rounded bg-[#1b101a] p-2 text-xs text-pink-200">{notice}</p>}
  </div>;
}
