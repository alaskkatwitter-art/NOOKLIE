'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ReadingListForm from '@/components/ReadingListForm';

type ReadingList = { id: string; name: string; description: string; count: number };

export default function ListasDeLeituraPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lists, setLists] = useState<ReadingList[] | null>(null);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/reading-lists', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) {
          setLogin(response.status === 401);
          throw new Error(data.error);
        }
        setLists(data.lists);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as listas.');
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  return <main className="mx-auto min-h-screen max-w-5xl space-y-6 p-5 text-white sm:p-8">
    <Link href="/biblioteca" className="text-sm text-pink-200">← Biblioteca</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-black">Minhas listas de leitura</h1>
      <button type="button" disabled={login} onClick={() => dialog.current?.showModal()} className="rounded-full bg-pink-300 px-4 py-2 text-sm font-bold text-[#190d16] disabled:opacity-50">+ Nova lista</button>
    </header>
    <p className="text-white/70">Organize as histórias que você quer começar, continuar ou reler.</p>
    {error && <p role="alert">{error} {login && <Link className="text-pink-200 underline" href="/login">Entrar</Link>}</p>}
    {!lists && !error && <p role="status">Carregando suas listas…</p>}
    {lists?.length === 0 && <p>Você ainda não criou nenhuma lista.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {lists?.map(list => <Link key={list.id} href={'/listas-de-leitura/' + list.id} className="rounded-2xl border border-pink-300/20 bg-pink-300/5 p-5 hover:border-pink-300/60">
        <h2 className="text-lg font-bold">{list.name}</h2>
        {list.description && <p className="mt-1 break-words text-white/70">{list.description}</p>}
        <p className="mt-3 text-sm text-pink-200">{list.count} {list.count === 1 ? 'história' : 'histórias'}</p>
      </Link>)}
    </div>
    <dialog ref={dialog} className="nook-dialog" aria-label="Criar lista de leitura">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Criar lista de leitura</h2>
        <button type="button" onClick={() => dialog.current?.close()} className="p-2 text-sm">Fechar</button>
      </div>
      <ReadingListForm key={revision} onCreated={() => { dialog.current?.close(); setRevision(value => value + 1); }} />
    </dialog>
  </main>;
}
