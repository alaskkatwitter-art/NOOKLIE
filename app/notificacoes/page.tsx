'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const continueReading = [
  {
    id: 1,
    title: 'Entre Dois Mundos',
    author: 'alaska',
    chapter: 'Capítulo 8',
    progress: 68,
    cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 2,
    title: 'Depois da Meia-Noite',
    author: 'lune',
    chapter: 'Capítulo 14',
    progress: 42,
    cover: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 3,
    title: 'O Último Verão',
    author: 'mavi',
    chapter: 'Capítulo 5',
    progress: 24,
    cover: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=500&q=80',
  },
];

const recommendedStories = [
  {
    id: 4,
    title: 'A Cidade Depois da Chuva',
    author: 'nox',
    description:
      'Ela só queria começar uma vida nova. Não esperava encontrar alguém que conhecesse todos os seus segredos.',
    genre: 'Romance',
    rating: '16+',
    likes: '12,4 mil',
    chapters: 32,
    cover: 'https://images.unsplash.com/photo-1496345875659-11f7dd282d1d?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 5,
    title: 'Entre Estrelas',
    author: 'solaris',
    description:
      'Dois desconhecidos. Uma viagem inesperada. E apenas uma semana para descobrir o que realmente sentem.',
    genre: 'Romance',
    rating: '14+',
    likes: '8,7 mil',
    chapters: 21,
    cover: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 6,
    title: 'As Cinzas do Reino',
    author: 'valyria',
    description:
      'Quando o último dragão desperta, uma princesa precisa decidir entre salvar o reino ou destruir tudo.',
    genre: 'Fantasia',
    rating: '16+',
    likes: '25,1 mil',
    chapters: 47,
    cover: 'https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?auto=format&fit=crop&w=600&q=80',
  },
];

const newestStories = [
  {
    id: 7,
    title: 'Setembro em Londres',
    author: 'jules',
    genre: 'Romance',
    chapters: 3,
    cover: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 8,
    title: 'A Última Profecia',
    author: 'rhaenyra',
    genre: 'Fantasia',
    chapters: 6,
    cover: 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 9,
    title: 'Notas de Um Amor',
    author: 'violet',
    genre: 'Drama',
    chapters: 4,
    cover: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=500&q=80',
  },
  {
    id: 10,
    title: 'O Apartamento 404',
    author: 'cass',
    genre: 'Mistério',
    chapters: 8,
    cover: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=500&q=80',
  },
];

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  created_at: string;
  read_at: string | null;
};

export default function Home() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationError, setNotificationError] = useState('');

  async function loadNotifications() {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) {
        setNotifications([]);
        return;
      }
      const data = await response.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setNotificationError('Não foi possível carregar suas notificações.');
    }
  }

  useEffect(() => { void loadNotifications(); }, []);

  async function markNotificationRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadNotifications();
  }

  async function markAllNotificationsRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    await loadNotifications();
  }

  function safeNotificationHref(href: string | null) {
    return href && href.startsWith('/') && !href.startsWith('//') ? href : '/';
  }

  return (
    <main className="min-h-screen bg-[#100b12] text-white">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#100b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-8 px-5">

          <Link href="/" className="flex shrink-0 items-center gap-3">
            <CloudLogo />

            <span className="hidden text-xl font-black tracking-[0.16em] text-[#ff78b9] sm:block">
              TORILAND
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-white/45 md:flex">
            <Link
              href="/"
              className="text-[#ff78b9]"
            >
              Início
            </Link>

            <Link
              href="/explorar"
              className="transition hover:text-white"
            >
              Explorar
            </Link>

            <Link
              href="/escrever"
              className="transition hover:text-white"
            >
              Escrever
            </Link>

            <Link
              href="/notificacoes"
              className="transition hover:text-white"
            >
              Notificações
            </Link>

            <Link
              href="/perfil"
              className="transition hover:text-white"
            >
              Perfil
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">

            <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 md:flex">
              <SearchIcon />

              <input
                placeholder="Pesquisar histórias..."
                className="ml-2 w-44 bg-transparent text-sm outline-none placeholder:text-white/20"
              />
            </div>

            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/50 transition hover:border-[#ff78b9]/30 hover:text-[#ff78b9] md:hidden"
              aria-label="Pesquisar"
            >
              <SearchIcon />
            </button>

            <Link
              href="/perfil"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff78b9]/15 text-sm font-bold text-[#ff78b9] ring-1 ring-[#ff78b9]/20"
            >
              A
            </Link>

          </div>

        </div>

        {/* MOBILE NAV */}

        <div className="border-t border-white/5 px-5 py-3 md:hidden">
          <nav className="mx-auto flex max-w-7xl items-center justify-between text-xs font-medium text-white/40">
            <Link href="/" className="text-[#ff78b9]">
              Início
            </Link>

            <Link href="/explorar">
              Explorar
            </Link>

            <Link href="/escrever">
              Escrever
            </Link>

            <Link href="/notificacoes">
              Notificações
            </Link>

            <Link href="/perfil">
              Perfil
            </Link>
          </nav>
        </div>
      </header>

      {/* CONTENT */}

      <div className="mx-auto max-w-7xl px-5 py-10">

        {notifications.length > 0 && (
          <section aria-label="Notificações da sua conta" className="mb-8 rounded-3xl border border-[#ff78b9]/15 bg-[#191219] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-black">Notificações</h2><p className="mt-1 text-xs text-white/40">Atualizações da sua conta e da equipe Nooklie.</p></div>
              {notifications.some((item) => !item.read_at) && <button type="button" onClick={() => void markAllNotificationsRead()} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 hover:border-[#ff78b9]/40">Marcar todas como lidas</button>}
            </div>
            <div className="mt-4 space-y-2">
              {notifications.map((item) => <article key={item.id} className={item.read_at ? 'rounded-xl border border-white/5 bg-[#100b12] p-4' : 'rounded-xl border border-[#ff78b9]/20 bg-[#ff78b9]/[0.04] p-4'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-bold">{item.title}</p><p className="mt-1 text-sm leading-6 text-white/60">{item.body}</p><p className="mt-2 text-[10px] text-white/30">{new Date(item.created_at).toLocaleString('pt-BR')}</p></div>
                  <div className="flex gap-2">
                    {item.href && <Link href={safeNotificationHref(item.href)} className="rounded-full border border-[#ff78b9]/25 px-3 py-2 text-xs font-semibold text-[#ff9aca]">Abrir</Link>}
                    {!item.read_at && <button type="button" onClick={() => void markNotificationRead(item.id)} className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/55">Marcar como lida</button>}
                  </div>
                </div>
              </article>)}
            </div>
          </section>
        )}
        {notificationError && <p role="alert" className="mb-6 text-sm text-red-200">{notificationError}</p>}

        {/* WELCOME */}

        <section className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ff78b9]">
            Seu feed
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Olá, Alaska.
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-white/35">
            Continue de onde parou ou descubra uma nova história para chamar
            de favorita.
          </p>
        </section>

        {/* CONTINUE READING */}

        <section className="mb-14">

          <SectionHeader
            title="Continue lendo"
            description="Suas histórias recentes"
          />

          <div className="mt-5 grid gap-4 md:grid-cols-3">

            {continueReading.map((story) => (
              <Link
                href={`/ler/${story.id}`}
                key={story.id}
                className="group flex gap-4 rounded-2xl border border-white/7 bg-[#191219] p-3 transition hover:-translate-y-0.5 hover:border-[#ff78b9]/20"
              >

                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-[#241923]">
                  <img
                    src={story.cover}
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="min-w-0 flex-1 py-1">

                  <h3 className="truncate text-sm font-bold text-white">
                    {story.title}
                  </h3>

                  <p className="mt-1 text-xs text-white/30">
                    @{story.author}
                  </p>

                  <p className="mt-5 text-xs text-white/40">
                    {story.chapter}
                  </p>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/7">
                    <div
                      className="h-full rounded-full bg-[#ff78b9]"
                      style={{ width: `${story.progress}%` }}
                    />
                  </div>

                  <p className="mt-2 text-[10px] text-white/20">
                    {story.progress}% concluído
                  </p>

                </div>

              </Link>
            ))}

          </div>

        </section>

        {/* RECOMMENDED */}

        <section className="mb-14">

          <SectionHeader
            title="Para você"
            description="Histórias que podem combinar com seus gostos"
            link="/explorar"
          />

          <div className="mt-6 grid gap-6 lg:grid-cols-3">

            {recommendedStories.map((story) => (
              <Link
                href={`/historia/${story.id}`}
                key={story.id}
                className="group overflow-hidden rounded-3xl border border-white/7 bg-[#191219] transition duration-300 hover:-translate-y-1 hover:border-[#ff78b9]/20"
              >

                <div className="relative h-64 overflow-hidden">

                  <img
                    src={story.cover}
                    alt=""
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#191219] via-transparent to-transparent" />

                  <span className="absolute left-4 top-4 rounded-full bg-[#100b12]/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 backdrop-blur-md">
                    {story.genre}
                  </span>

                  <span className="absolute right-4 top-4 rounded-full bg-[#100b12]/80 px-3 py-1 text-[10px] font-bold text-[#ff78b9] backdrop-blur-md">
                    {story.rating}
                  </span>

                </div>

                <div className="p-5">

                  <h3 className="text-lg font-black">
                    {story.title}
                  </h3>

                  <p className="mt-1 text-xs text-[#ff78b9]">
                    @{story.author}
                  </p>

                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/35">
                    {story.description}
                  </p>

                  <div className="mt-5 flex items-center gap-4 text-xs text-white/25">
                    <span>{story.likes} curtidas</span>
                    <span>{story.chapters} capítulos</span>
                  </div>

                </div>

              </Link>
            ))}

          </div>

        </section>

        {/* NEW STORIES */}

        <section className="mb-14">

          <SectionHeader
            title="Novas histórias"
            description="Acabaram de chegar ao Toriland"
            link="/explorar"
          />

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">

            {newestStories.map((story) => (
              <Link
                href={`/historia/${story.id}`}
                key={story.id}
                className="group"
              >

                <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/7 bg-[#191219]">

                  <img
                    src={story.cover}
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />

                </div>

                <h3 className="mt-3 truncate text-sm font-bold">
                  {story.title}
                </h3>

                <p className="mt-1 text-xs text-white/30">
                  @{story.author}
                </p>

                <div className="mt-2 flex gap-2 text-[10px] text-white/20">
                  <span>{story.genre}</span>
                  <span>•</span>
                  <span>{story.chapters} caps.</span>
                </div>

              </Link>
            ))}

          </div>

        </section>

        {/* FOLLOWING */}

        <section className="rounded-3xl border border-[#ff78b9]/10 bg-[#ff78b9]/5 p-6 sm:p-8">

          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
                Sua comunidade
              </p>

              <h2 className="mt-2 text-xl font-black">
                Acompanhe quem você gosta.
              </h2>

              <p className="mt-2 max-w-lg text-sm leading-6 text-white/30">
                Siga autores e receba atualizações quando novas histórias ou
                capítulos forem publicados.
              </p>
            </div>

            <Link
              href="/explorar"
              className="shrink-0 rounded-full bg-[#ff78b9] px-6 py-3 text-center text-sm font-bold text-[#180d15] transition hover:brightness-110"
            >
              Explorar autores
            </Link>

          </div>

        </section>

      </div>

      {/* FOOTER */}

      <footer className="border-t border-white/5 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-white/20 sm:flex-row">
          <span>TORILAND</span>
          <span>Um lar para histórias.</span>
        </div>
      </footer>

    </main>
  );
}

function SectionHeader({
  title,
  description,
  link,
}: {
  title: string;
  description: string;
  link?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">

      <div>
        <h2 className="text-xl font-black sm:text-2xl">
          {title}
        </h2>

        <p className="mt-1 text-xs text-white/25 sm:text-sm">
          {description}
        </p>
      </div>

      {link && (
        <Link
          href={link}
          className="shrink-0 text-xs font-semibold text-[#ff78b9] hover:underline"
        >
          Ver tudo
        </Link>
      )}

    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function CloudLogo() {
  return (
    <svg
      width="42"
      height="28"
      viewBox="0 0 180 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        fill="#FF78B9"
      />

      <path
        d="M45 79C26 79 14 67 14 51C14 36 25 24 40 23C45 9 58 2 73 2C89 2 102 12 106 27C111 24 117 22 124 22C143 22 158 36 158 54C158 57 158 60 157 63C168 66 174 74 174 84C174 96 164 103 151 103H45C28 103 17 94 17 83C17 81 17 80 18 78C26 79 35 79 45 79Z"
        stroke="#FF9BCB"
        strokeWidth="3"
      />
    </svg>
  );
}
