'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Club = {
  id: string;
  name: string;
  description: string;
  members: number;
  category: string;
};

function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M7.5 18.5H17C19.4853 18.5 21.5 16.4853 21.5 14C21.5 11.6304 19.6685 9.68907 17.3445 9.51352C16.6917 6.90473 14.3338 5 11.5 5C8.35051 5 5.7974 7.35271 5.48042 10.4199C3.20692 10.918 1.5 12.9488 1.5 15.25C1.5 17.0459 2.95406 18.5 4.75 18.5H7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M19 12H5M11 18L5 12L11 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="9"
        cy="7"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M22 21V19C22 17.1362 20.7252 15.57 19 15.126"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 3.12891C17.7252 3.57093 19 5.1362 19 7.00001C19 8.86382 17.7252 10.4291 16 10.8711"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5V19M5 12H19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersGroupIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
      <circle
        cx="9"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="17"
        cy="9"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 19C3.5 15.9624 5.96243 13.5 9 13.5C12.0376 13.5 14.5 15.9624 14.5 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.5 14.5C15.2 14.0833 16.0266 13.85 17 13.85C19.4853 13.85 21.5 15.8647 21.5 18.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ClubesPage() {
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data.authenticated) {
        window.location.href = '/login';
        return;
      }

      /*
       * A estrutura dos clubes fica pronta aqui.
       * A persistência no Supabase será adicionada quando
       * criarmos as tabelas e APIs próprias dos clubes.
       */
      setClubs([]);
    } catch (error) {
      console.error('Erro ao carregar clubes:', error);
    } finally {
      setLoading(false);
    }
  }

  function createClub() {
    const cleanName = name.trim();

    if (!cleanName) return;

    const newClub: Club = {
      id: `club-${Date.now()}`,
      name: cleanName,
      description:
        description.trim() ||
        'Um espaço para leitores e escritores compartilharem ideias.',
      members: 1,
      category: category.trim() || 'Geral',
    };

    setClubs((current) => [newClub, ...current]);

    setName('');
    setDescription('');
    setCategory('');
    setModalOpen(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">
      <header className="border-b border-white/8 bg-[#0c090d]/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <Link
            href="/feed"
            className="flex items-center gap-3 transition hover:opacity-80"
          >
            <span className="text-[#ff78b9]">
              <CloudIcon />
            </span>

            <span className="text-xl font-black tracking-tight">
              nooklie
            </span>
          </Link>


        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5 py-10 md:py-14">
        <div className="pointer-events-none absolute -left-40 top-0 h-[32rem] w-[32rem] rounded-full bg-[#ff4fa3]/10 blur-3xl" />

        <div className="pointer-events-none absolute -right-40 top-32 h-[30rem] w-[30rem] rounded-full bg-[#ff78b9]/8 blur-3xl" />

        <section className="relative">
          <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff78b9]/10 text-[#ff78b9]">
                  <UsersIcon />
                </div>

                <div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                    Clubes de fic
                  </h1>

                  <p className="mt-1 text-sm text-white/45">
                    Encontre pessoas que gostam das mesmas histórias que você.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-5 py-3 text-sm font-bold text-[#180b12] transition hover:scale-[1.02]"
            >
              <PlusIcon />
              Criar clube
            </button>
          </div>

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-64 animate-pulse rounded-3xl border border-white/8 bg-white/[0.035]"
                />
              ))}
            </div>
          ) : clubs.length === 0 ? (
            <div className="flex min-h-[430px] flex-col items-center justify-center rounded-[2rem] border border-white/8 bg-white/[0.025] px-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#ff78b9]/8 text-[#ff78b9]">
                <UsersGroupIcon />
              </div>

              <h2 className="text-2xl font-black">
                Nenhum clube por enquanto
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-white/45">
                Crie um clube para reunir leitores e escritores em torno de
                uma obra, fandom, gênero ou interesse em comum.
              </p>

              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-7 flex items-center gap-2 rounded-full border border-[#ff78b9]/30 bg-[#ff78b9]/10 px-6 py-3 text-sm font-bold text-[#ff91c4] transition hover:bg-[#ff78b9]/15"
              >
                <PlusIcon />
                Criar primeiro clube
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {clubs.map((club) => (
                <div
                  key={club.id}
                  className="group rounded-3xl border border-white/8 bg-white/[0.035] p-6 transition hover:-translate-y-1 hover:border-[#ff78b9]/30 hover:bg-white/[0.05]"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff78b9]/10 text-[#ff78b9]">
                      <UsersIcon />
                    </div>

                    <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/40">
                      {club.category}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold">
                    {club.name}
                  </h2>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/45">
                    {club.description}
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-white/8 pt-5">
                    <span className="flex items-center gap-2 text-xs text-white/35">
                      <UsersIcon />
                      {club.members}{' '}
                      {club.members === 1 ? 'membro' : 'membros'}
                    </span>

                    <button
                      type="button"
                      className="text-xs font-bold text-[#ff91c4] transition group-hover:translate-x-1"
                    >
                      Entrar →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setModalOpen(false)}
          />

          <div className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#100c11] p-6 shadow-2xl md:p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-black">
                Criar clube
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/40">
                Crie um espaço para reunir pessoas interessadas no mesmo
                universo ou assunto.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
                  Nome
                </label>

                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Clube dos fãs de HOTD"
                  className="h-12 w-full rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
                  Categoria
                </label>

                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Ex.: Fandom, Romance, Fantasia..."
                  className="h-12 w-full rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
                  Descrição
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="Sobre o que é esse clube?"
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-[#ff78b9]/40"
                />
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={createClub}
                disabled={!name.trim()}
                className="rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-6 py-3 text-sm font-bold text-[#180b12] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Criar clube
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
