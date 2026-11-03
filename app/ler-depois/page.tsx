'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type SavedItem = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  storyId: string | null;
  chapterId: string | null;
  description: string;
};

function CloudIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 4.75C6 3.7835 6.7835 3 7.75 3H16.25C17.2165 3 18 3.7835 18 4.75V21L12 17.25L6 21V4.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 5.5C4 4.67157 4.67157 4 5.5 4H10.5C11.3284 4 12 4.67157 12 5.5V20C11.5 19.5 10.75 19 9.5 19H5.5C4.67157 19 4 18.3284 4 17.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.5C20 4.67157 19.3284 4 18.5 4H13.5C12.6716 4 12 4.67157 12 5.5V20C12.5 19.5 13.25 19 14.5 19H18.5C19.3284 19 20 18.3284 20 17.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LerDepoisPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSavedItems();
  }, []);

  async function loadSavedItems() {
    try {
      setLoading(true);

      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data.authenticated) {
        window.location.href = '/login';
        return;
      }

      /*
       * A estrutura está preparada para receber os itens salvos
       * quando criarmos a tabela/API de "Ler depois".
       *
       * Por enquanto, começamos com a página vazia.
       */
      setItems([]);
    } catch (error) {
      console.error('Erro ao carregar Ler depois:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">
      <header className="border-b border-white/8 bg-[#0c090d]/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <Link
            href="/feed"
            className="flex items-center gap-3 text-white transition hover:opacity-80"
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
          <div className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff78b9]/10 text-[#ff78b9]">
                <BookmarkIcon filled />
              </div>

              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                  Ler depois
                </h1>

                <p className="mt-1 text-sm text-white/45">
                  Histórias e capítulos que você salvou para ler mais tarde.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-72 animate-pulse rounded-3xl border border-white/8 bg-white/[0.035]"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[430px] flex-col items-center justify-center rounded-[2rem] border border-white/8 bg-white/[0.025] px-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#ff78b9]/8 text-[#ff78b9]">
                <BookIcon />
              </div>

              <h2 className="text-2xl font-black">
                Sua lista está vazia
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-white/45">
                Quando você encontrar uma história ou capítulo que queira
                guardar para depois, salve aqui para não perder.
              </p>

              <Link
                href="/explorar"
                className="mt-7 rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-6 py-3 text-sm font-bold text-[#160b11] transition hover:scale-[1.02]"
              >
                Explorar histórias
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const destination = item.storyId
                  ? `/historia/${item.storyId}`
                  : item.chapterId
                    ? `/capitulo/${item.chapterId}`
                    : '/explorar';

                return (
                  <Link
                    key={item.id}
                    href={destination}
                    className="group overflow-hidden rounded-3xl border border-white/8 bg-white/[0.035] transition hover:-translate-y-1 hover:border-[#ff78b9]/30 hover:bg-white/[0.05]"
                  >
                    <div className="relative h-48 overflow-hidden bg-[#171018]">
                      {item.cover ? (
                        <img
                          src={contentMediaUrl(item.cover)}
                          alt=""
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#ff78b9]/40">
                          <BookIcon />
                        </div>
                      )}

                      <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-[#ff91c4] backdrop-blur-sm">
                        <BookmarkIcon filled />
                      </div>
                    </div>

                    <div className="p-5">
                      <h2 className="line-clamp-2 text-lg font-bold">
                        {item.title}
                      </h2>

                      <p className="mt-1 text-sm text-[#ff91c4]">
                        por {item.author}
                      </p>

                      {item.description && (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/45">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4">
                        <span className="text-xs font-semibold text-white/35">
                          Salvo para depois
                        </span>

                        <span className="text-xs font-bold text-[#ff91c4] transition group-hover:translate-x-1">
                          Abrir →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
