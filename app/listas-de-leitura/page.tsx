'use client';

import Link from 'next/link';
import { useState } from 'react';

type ReadingList = {
  id: string;
  name: string;
  description: string;
  count: number;
};

function CloudIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.5 18.5H17a4.5 4.5 0 0 0 .72-8.942A6.5 6.5 0 0 0 5.02 10.5H4.5a4 4 0 0 0 0 8h3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ListasDeLeituraPage() {
  const [lists, setLists] =
    useState<ReadingList[]>([]);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [listName, setListName] =
    useState('');

  const [listDescription, setListDescription] =
    useState('');

  function createList() {
    const name =
      listName.trim();

    if (!name) {
      return;
    }

    const newList: ReadingList = {
      id:
        `list-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
      name,
      description:
        listDescription.trim(),
      count: 0,
    };

    setLists((current) => [
      ...current,
      newList,
    ]);

    setListName('');
    setListDescription('');
    setModalOpen(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">

      {/* BACKGROUND */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-180px] h-[500px] w-[500px] rounded-full bg-[#ff4d9d]/[0.08] blur-[130px]" />

        <div className="absolute right-[-180px] top-[25%] h-[500px] w-[500px] rounded-full bg-[#c63dff]/[0.045] blur-[140px]" />

        <div className="absolute bottom-[-200px] left-[35%] h-[450px] w-[450px] rounded-full bg-[#ff78b9]/[0.035] blur-[130px]" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[1180px] px-4 pb-20 pt-5 sm:px-6 lg:px-8 lg:pt-8">

        {/* HEADER */}

        <header className="mb-8 flex items-center justify-between gap-4">

          <div className="flex min-w-0 items-center gap-3">



            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]">
              <CloudIcon />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#ff78b9]/70">
                Nooklie
              </p>

              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white sm:text-2xl">
                Minhas listas de leitura
              </h1>
            </div>

          </div>

          <button
            type="button"
            onClick={() =>
              setModalOpen(true)
            }
            className="inline-flex items-center gap-2 rounded-full bg-[#ff78b9] px-4 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110 sm:px-5"
          >
            <PlusIcon />

            <span className="hidden sm:inline">
              Nova lista
            </span>

            <span className="sm:hidden">
              Nova
            </span>
          </button>

        </header>

        {/* HERO */}

        <section className="mb-7 overflow-hidden rounded-[30px] border border-[#ff78b9]/10 bg-gradient-to-br from-[#ff78b9]/[0.09] via-[#100c11]/90 to-[#c63dff]/[0.05] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.24)] sm:p-8">

          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff78b9]">
            Organização
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Organize suas próximas
            leituras do seu jeito.
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40 sm:text-[15px]">
            Crie listas para separar histórias
            que você quer começar, continuar,
            reler ou simplesmente guardar.
          </p>

        </section>

        {/* TÍTULO */}

        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff78b9]">
            Suas listas
          </p>

          <h2 className="mt-1 text-xl font-black text-white">
            Listas de leitura
          </h2>
        </div>

        {/* LISTAS */}

        {lists.length === 0 ? (

          <div className="flex min-h-[430px] items-center justify-center rounded-[28px] border border-white/[0.06] bg-white/[0.015]">

            <div className="max-w-md px-6 text-center">

              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#ff78b9]/15 bg-[#ff78b9]/[0.05] text-[#ff78b9]/50">
                <BookmarkIcon />
              </div>

              <h2 className="mt-6 text-xl font-black text-white">
                Você ainda não criou
                nenhuma lista.
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/35">
                Crie sua primeira lista para
                organizar as histórias que
                você quer ler.
              </p>

              <button
                type="button"
                onClick={() =>
                  setModalOpen(true)
                }
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ff78b9] px-5 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110"
              >
                <PlusIcon />
                Criar minha primeira lista
              </button>

            </div>

          </div>

        ) : (

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

            {lists.map((list) => (

              <Link
                key={list.id}
                href={`/listas-de-leitura/${list.id}`}
                className="group rounded-[26px] border border-white/[0.07] bg-[#100c11]/90 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[#ff78b9]/20 hover:shadow-[0_20px_70px_rgba(255,120,185,0.06)]"
              >

                <div className="flex items-start justify-between gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ff78b9]/15 bg-[#ff78b9]/[0.06] text-[#ff78b9]">
                    <BookmarkIcon />
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-white/25 transition group-hover:border-[#ff78b9]/20 group-hover:text-[#ff78b9]">
                    <ChevronRightIcon />
                  </div>

                </div>

                <h3 className="mt-6 truncate text-lg font-black text-white transition group-hover:text-[#ff78b9]">
                  {list.name}
                </h3>

                <p className="mt-2 min-h-[48px] text-sm leading-6 text-white/35">
                  {list.description ||
                    'Nenhuma descrição adicionada.'}
                </p>

                <div className="mt-5 border-t border-white/[0.06] pt-4">

                  <span className="text-xs font-semibold text-white/25">
                    {list.count}{' '}
                    {list.count === 1
                      ? 'história'
                      : 'histórias'}
                  </span>

                </div>

              </Link>

            ))}

          </div>

        )}

      </div>

      {/* MODAL */}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">

          <button
            type="button"
            onClick={() =>
              setModalOpen(false)
            }
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
          />

          <div className="relative z-10 w-full max-w-[500px] rounded-[28px] border border-white/[0.08] bg-[#100c11] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:p-8">

            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff78b9]">
              Nova lista
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Criar lista de leitura
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/35">
              Dê um nome para sua lista e,
              se quiser, escreva uma pequena
              descrição.
            </p>

            <div className="mt-6">

              <label
                htmlFor="list-name"
                className="text-xs font-bold text-white/55"
              >
                Nome da lista
              </label>

              <input
                id="list-name"
                value={listName}
                onChange={(event) =>
                  setListName(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter'
                  ) {
                    createList();
                  }
                }}
                placeholder="Ex.: Quero ler"
                maxLength={80}
                autoFocus
                className="mt-2 w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/40"
              />

            </div>

            <div className="mt-5">

              <label
                htmlFor="list-description"
                className="text-xs font-bold text-white/55"
              >
                Descrição
                <span className="ml-1 font-normal text-white/20">
                  opcional
                </span>
              </label>

              <textarea
                id="list-description"
                value={listDescription}
                onChange={(event) =>
                  setListDescription(
                    event.target.value
                  )
                }
                placeholder="Sobre o que é essa lista?"
                maxLength={240}
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/40"
              />

            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setListName('');
                  setListDescription('');
                }}
                className="rounded-full border border-white/[0.08] bg-white/[0.025] px-5 py-3 text-xs font-bold text-white/45 transition hover:text-white"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={createList}
                disabled={
                  !listName.trim()
                }
                className="rounded-full bg-[#ff78b9] px-5 py-3 text-xs font-black text-[#190d16] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Criar lista
              </button>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}
