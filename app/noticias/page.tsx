"use client";

import Link from "next/link";
import AuthStatus from "../../components/AuthStatus";

const menu = [
  { label: "Início", href: "/" },
  { label: "Explorar", href: "/explorar" },
  { label: "Escrever", href: "/escrever" },
  { label: "Fandoms", href: "/fandoms" },
  { label: "Notícias", href: "/noticias" },
];

const welcome = {
  title: "Bem-vindo ao Nooklie 1.0",
  description:
    "O primeiro guia do Jornal Nooklie, com capturas da plataforma e passos para ler, escrever e participar da comunidade.",
};

export default function NoticiasPage() {
  return (
    <main className="min-h-screen bg-[#100b12] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#100b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
          >
            <CloudLogo />

            <span className="text-xl font-black tracking-[0.18em] text-[#ff78b9]">
              NOOKLIE
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {menu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                  item.href === "/noticias"
                    ? "bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15]"
                    : "text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto">
            <AuthStatus />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-12 md:py-16">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-br from-[#291522] via-[#21131e] to-[#171018] p-8 md:p-12">
          <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-[#ff78b9]/10 blur-[110px]" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
              Nooklie
            </p>

            <h1 className="mt-3 text-4xl font-black md:text-5xl">
              Notícias e novidades.
            </h1>

            <p className="mt-4 max-w-2xl leading-7 text-white/50">
              Acompanhe novidades da plataforma, atualizações e tudo o que
              está acontecendo dentro do Nooklie.
            </p>
          </div>
        </section>

        <section className="mt-12" aria-label="Edições do Jornal Nooklie">
          <article className="mb-5 rounded-3xl border border-pink-300/20 bg-gradient-to-br from-[#321729] to-[#171018] p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Obras da comunidade</p>
            <h2 className="mt-4 text-3xl font-black">Conheça os originais do Nooklie</h2>
            <p className="mt-4 max-w-xl leading-7 text-white/75">Encontre novos livros, contos e poemas e veja como publicar sua própria história.</p>
            <Link href="/noticias/originais" className="mt-6 inline-flex font-bold text-pink-200 hover:underline">Ler a matéria →</Link>
          </article>
          <article className="rounded-3xl border border-[#ff78b9]/25 bg-[#171018] p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#ff9bca]">Jornal Nooklie · Edição 01</p>
            <h2 className="mt-4 text-3xl font-black">{welcome.title}</h2>
            <p className="mt-4 max-w-xl leading-7 text-white/75">{welcome.description}</p>
            <Link href="/noticias/boas-vindas" className="mt-6 inline-flex font-bold text-[#ff9bca] hover:underline">
              Ler o guia de boas-vindas →
            </Link>
          </article>
        </section>

        <section className="mt-12 rounded-[2rem] border border-white/10 bg-[#171018] p-8 text-center md:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
            Fique por dentro
          </p>

          <h2 className="mt-3 text-2xl font-black md:text-3xl">
            O Nooklie está apenas começando.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-white/40">
            Novas ferramentas, comunidades e experiências serão adicionadas
            conforme a plataforma crescer.
          </p>

          <Link
            href="/explorar"
            className="mt-7 inline-flex rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 font-bold text-[#180d15] transition hover:-translate-y-0.5 hover:brightness-110"
          >
            Explorar o Nooklie
          </Link>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#0b080d]">
        <div className="mx-auto max-w-7xl px-5 py-10 text-center">
          <p className="text-sm text-white/30">
            De escritor para escritor.
          </p>

          <p className="mt-2 text-xs text-white/15">
            © {new Date().getFullYear()} Nooklie
          </p>
        </div>
      </footer>
    </main>
  );
}

function CloudLogo() {
  return (
    <svg
      width="44"
      height="30"
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
