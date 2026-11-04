'use client';

import AccountBadge from '@/components/AccountBadge';
import {contentMediaUrl} from '@/lib/security/content-media';
import Link from 'next/link';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useEffect, useState } from 'react';

const fandoms = [
  {
    name: 'House of the Dragon',
    description:
      'Dragões, Targaryen e as disputas pelo Trono de Ferro.',
    slug: 'house-of-the-dragon',
    gradient:
      'from-[#5a2345] to-[#21121d]',
  },
  {
    name: 'Game of Thrones',
    description:
      'Westeros, grandes casas, guerras e intrigas.',
    slug: 'game-of-thrones',
    gradient:
      'from-[#46284f] to-[#171018]',
  },
  {
    name: 'Harry Potter',
    description:
      'Magia, Hogwarts e o mundo bruxo.',
    slug: 'harry-potter',
    gradient:
      'from-[#303e59] to-[#13131b]',
  },
  {
    name: 'Marvel',
    description:
      'Heróis, vilões e universos extraordinários.',
    slug: 'marvel',
    gradient:
      'from-[#58332f] to-[#1a1015]',
  },
  {
    name: 'DC',
    description:
      'Gotham, Metropolis e os maiores heróis da DC.',
    slug: 'dc',
    gradient:
      'from-[#3d4b42] to-[#121714]',
  },
  {
    name: 'K-pop',
    description:
      'Ídolos, grupos, música e histórias inspiradas no K-pop.',
    slug: 'k-pop',
    gradient:
      'from-[#523f62] to-[#17121c]',
  },
];

type CurrentUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
  is_official?: boolean;
};

export default function FandomsContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const selected =
    searchParams.get('fandom') || '';

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [loadingUser, setLoadingUser] =
    useState(true);

  const filteredFandoms = selected
    ? fandoms.filter((fandom) =>
        fandom.name
          .toLowerCase()
          .includes(
            selected.toLowerCase()
          )
      )
    : fandoms;

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        setLoadingUser(true);

        const response = await fetch(
          '/api/auth/me',
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          if (!cancelled) {
            setCurrentUser(null);
          }

          return;
        }

        const data = await response.json();

        if (!cancelled) {
          setCurrentUser(
            data?.authenticated &&
              data?.user
              ? data.user
              : null
          );
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingUser(false);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateSearch(value: string) {
    const params =
      new URLSearchParams(
        searchParams.toString()
      );

    if (value.trim()) {
      params.set(
        'fandom',
        value
      );
    } else {
      params.delete('fandom');
    }

    const queryString =
      params.toString();

    router.replace(
      queryString
        ? `${pathname}?${queryString}`
        : pathname
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#100b12] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#100b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2"
            aria-label="Ir para o início"
          >
            <CloudLogo />

            <span className="text-xl font-black tracking-[0.18em] text-[#ff78b9] transition group-hover:text-[#ff9bca]">
              NOOKLIE
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            <NavLink
              href="/"
              label="Início"
            />

            <NavLink
              href="/explorar"
              label="Explorar"
            />

            <NavLink
              href="/escrever"
              label="Escrever"
            />

            <NavLink
              href="/fandoms"
              label="Fandoms"
              active
            />

            <NavLink
              href="/noticias"
              label="Notícias"
            />
          </nav>

          {loadingUser ? (
            <div className="ml-auto h-10 w-24 animate-pulse rounded-full bg-white/5" />
          ) : currentUser ? (
            <Link
              href={`/perfil/${encodeURIComponent(
                currentUser.username
              )}`}
              className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10"
            >
              <Avatar
                src={
                  currentUser.avatar_url
                }
                name={
                  currentUser.display_name ||
                  currentUser.username
                }
                size="small"
              />

              <span className="hidden max-w-28 truncate text-sm font-semibold text-white/70 sm:block">
                {currentUser.display_name ||
                  currentUser.username}
              </span>

              <AccountBadge account={currentUser} />
            </Link>
          ) : (
            <Link
              href="/login"
              className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
            >
              Entrar
            </Link>
          )}
        </div>

        <div className="overflow-x-auto border-t border-white/5 md:hidden">
          <nav className="mx-auto flex min-w-max items-center justify-center gap-1 px-4 py-2">
            <MobileNavLink
              href="/"
              label="Início"
            />

            <MobileNavLink
              href="/explorar"
              label="Explorar"
            />

            <MobileNavLink
              href="/escrever"
              label="Escrever"
            />

            <MobileNavLink
              href="/fandoms"
              label="Fandoms"
              active
            />

            <MobileNavLink
              href="/noticias"
              label="Notícias"
            />
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5">
        <div className="pointer-events-none absolute -left-40 top-0 h-[34rem] w-[34rem] rounded-full bg-[#ff4fa3]/10 blur-3xl" />

        <div className="pointer-events-none absolute -right-40 top-20 h-[32rem] w-[32rem] rounded-full bg-[#ff78b9]/10 blur-3xl" />

        <section className="relative py-16 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
            Comunidades
          </p>

          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[1.05] md:text-6xl">
            Explore os{' '}
            <span className="bg-gradient-to-r from-[#ff68ae] to-[#ff9acb] bg-clip-text text-transparent">
              fandoms
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-white/50 md:text-lg">
            Encontre histórias, autores e leitores apaixonados pelos mesmos
            universos que você.
          </p>

          <div className="mt-9 flex items-center rounded-2xl border border-white/10 bg-[#191219] px-5 py-4 transition focus-within:border-[#ff78b9]/30 focus-within:bg-[#1d141c]">
            <SearchIcon />

            <input
              value={selected}
              onChange={(event) =>
                updateSearch(
                  event.target.value
                )
              }
              placeholder="Pesquisar fandom..."
              className="ml-3 w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>
        </section>

        <section className="relative pb-20">
          {filteredFandoms.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFandoms.map(
                (fandom) => (
                  <Link
                    key={fandom.slug}
                    href={`/explorar?fandom=${encodeURIComponent(
                      fandom.name
                    )}`}
                    className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${fandom.gradient} p-6 transition duration-300 hover:-translate-y-1 hover:border-[#ff78b9]/30`}
                  >
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-white/5 bg-white/5 transition duration-500 group-hover:scale-125" />

                    <div className="relative">
                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-white/35">
                        Fandom
                      </span>

                      <h2 className="mt-3 text-2xl font-black transition group-hover:text-[#ff9bca]">
                        {fandom.name}
                      </h2>

                      <p className="mt-3 max-w-sm text-sm leading-6 text-white/45">
                        {fandom.description}
                      </p>

                      <span className="mt-6 inline-flex text-sm font-semibold text-[#ff78b9] transition group-hover:text-[#ff9bca]">
                        Explorar histórias →
                      </span>
                    </div>
                  </Link>
                )
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#191219] px-6 py-12 text-center">
              <h2 className="text-xl font-bold">
                Nenhum fandom encontrado
              </h2>

              <p className="mt-2 text-sm text-white/40">
                Tente pesquisar por outro nome.
              </p>

              <Link
                href="/fandoms"
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-6 py-3 text-sm font-bold text-[#180d15] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                Ver todos os fandoms
              </Link>
            </div>
          )}
        </section>

        <section className="relative mb-20 overflow-hidden rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-r from-[#291522] via-[#21131e] to-[#171018]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#ff78b9]/10 blur-3xl" />

          <div className="relative p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
              Nooklie
            </p>

            <h2 className="mt-3 text-3xl font-black md:text-4xl">
              Não encontrou o que procura?
            </h2>

            <p className="mt-4 max-w-2xl leading-7 text-white/50">
              Explore todas as histórias do Nooklie e use os filtros para
              encontrar exatamente o que você quer ler.
            </p>

            <Link
              href="/explorar"
              className="mt-7 inline-flex rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 font-bold text-[#180d15] transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
            >
              Ir para Explorar
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#0b080d]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-10 text-sm text-white/35">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Sobre
            </Link>

            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Termos
            </Link>

            <Link
              href="/"
              className="transition hover:text-[#ff9bca]"
            >
              Privacidade
            </Link>
          </div>

          <p className="text-white/25">
            De escritor para escritor.
          </p>

          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} Nooklie
          </p>
        </div>
      </footer>
    </main>
  );
}

function Avatar({
  src,
  name,
  size = 'normal',
}: {
  src: string | null;
  name: string;
  size?: 'small' | 'normal';
}) {
  const classes =
    size === 'small'
      ? 'h-7 w-7 text-[10px]'
      : 'h-12 w-12 text-sm';

  if (src) {
    return (
      <img
        src={contentMediaUrl(src)}
        alt=""
        className={`${classes} shrink-0 rounded-full object-cover ring-1 ring-white/10`}
      />
    );
  }

  return (
    <div
      className={`${classes} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff68ae] to-[#ff91c4] font-black text-[#180d15]`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}


function NavLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
        active
          ? 'bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15] shadow-[0_0_20px_rgba(255,120,185,0.15)]'
          : 'text-white/60 hover:bg-gradient-to-r hover:from-[#ff5fab]/15 hover:to-[#ff9bca]/15 hover:text-[#ff9bca]'
      }`}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
        active
          ? 'bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15]'
          : 'text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]'
      }`}
    >
      {label}
    </Link>
  );
}

function CloudLogo() {
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 180 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Logo Nooklie"
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

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-white/35"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M16 16L21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
