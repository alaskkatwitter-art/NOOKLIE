"use client";

import OriginalsShelf from '@/components/OriginalsShelf';
import Link from "next/link";
import AuthStatus from "../components/AuthStatus";

const fandoms = [
  "House of the Dragon",
  "Game of Thrones",
  "Harry Potter",
  "Marvel",
  "DC",
  "K-pop",
];

const genres = [
  "Romance",
  "Fantasia",
  "Drama",
  "Aventura",
  "Mistério",
  "Terror",
  "Comédia",
  "Ficção",
];

const menu = [
  { label: "Início", href: "/" },
  { label: "Explorar", href: "/explorar" },
  { label: "Escrever", href: "/escrever" },
  { label: "Fandoms", href: "/fandoms" },
  { label: "Notícias", href: "/noticias" },
  { label: "Oportunidades", href: "/oportunidades" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#100b12] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#100b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2"
          >
            <CloudLogo />

            <span className="text-xl font-black tracking-[0.18em] text-[#ff78b9] transition group-hover:text-[#ff9bca] font-nooklie-logo">
              NOOKLIE
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {menu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                  item.href === "/"
                    ? "bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15] shadow-[0_0_20px_rgba(255,120,185,0.15)]"
                    : "text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto shrink-0">
            <AuthStatus />
          </div>
        </div>

        <div className="overflow-x-auto border-t border-white/5 md:hidden">
          <nav className="mx-auto flex min-w-max items-center justify-center gap-1 px-4 py-2">
            {menu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
                  item.href === "/"
                    ? "bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15]"
                    : "text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5">
        <section className="relative py-16 md:py-24">
          <div className="pointer-events-none absolute -left-40 top-[-80px] h-[520px] w-[520px] rounded-full bg-[#ff4fa3]/10 blur-[110px]" />

          <div className="pointer-events-none absolute right-[-120px] top-[-120px] h-[520px] w-[520px] rounded-full bg-[#ff78b9]/10 blur-[120px]" />

          <div className="pointer-events-none absolute left-[30%] top-[25%] h-[360px] w-[360px] rounded-full bg-[#ff68ae]/[0.035] blur-[100px]" />

          <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
                De escritor para escritor.
              </p>

              <h1 className="max-w-3xl text-4xl font-black leading-[1.05] md:text-6xl">
                Encontre uma história.
                <br />

                <span className="bg-gradient-to-r from-[#ff68ae] to-[#ff9acb] bg-clip-text text-transparent">
                  Ou escreva a sua.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-white/55 md:text-lg">
                Um espaço para descobrir novos universos, acompanhar autores,
                conversar sobre histórias e transformar suas ideias em
                capítulos.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/explorar"
                  className="rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 text-center font-bold text-[#180d15] shadow-[0_10px_35px_rgba(255,104,174,0.15)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
                >
                  Explorar histórias
                </Link>

                <Link
                  href="/escrever"
                  className="rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-center font-bold transition duration-300 hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
                >
                  Começar a escrever
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-[#ff78b9]/[0.035] blur-3xl" />

              <div className="relative rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-br from-[#21131e] to-[#171018] p-7 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
                    O que existe no Nooklie
                  </p>

                  <h2 className="mt-2 text-2xl font-black">
                    Mais do que publicar histórias.
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FeatureCard
                    title="Clubes de leitura"
                    description="Converse com outros leitores sobre suas histórias favoritas."
                  />

                  <FeatureCard
                    title="Calendário"
                    description="Acompanhe próximas atualizações e capítulos."
                  />

                  <FeatureCard
                    title="Feed social"
                    description="Compartilhe novidades e acompanhe quem você segue."
                  />

                  <FeatureCard
                    title="Biblioteca"
                    description="Guarde histórias para continuar lendo quando quiser."
                  />

                  <FeatureCard
                    title="Listas de leitura"
                    description="Organize suas leituras em listas públicas ou privadas."
                  />

                  <FeatureCard
                    title="Fandoms"
                    description="Encontre comunidades e histórias dos universos que você gosta."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-12">
          <Link
            href="/explorar"
            className="group flex items-center rounded-2xl border border-white/10 bg-[#191219] px-5 py-4 transition hover:border-[#ff78b9]/30 hover:bg-[#1d141c]"
          >
            <SearchIcon />

            <span className="ml-3 text-sm text-white/30 transition group-hover:text-white/50">
              Pesquisar histórias, autores, fandoms ou gêneros...
            </span>

            <span className="ml-auto text-white/20 transition group-hover:translate-x-1 group-hover:text-[#ff78b9]">
              →
            </span>
          </Link>
        </section>

      <OriginalsShelf />
        <section className="pb-16">
          <SectionHeading
            title="Fandoms"
            subtitle="Encontre histórias dentro dos universos que você já conhece."
            href="/fandoms"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fandoms.map((fandom, index) => (
              <Link
                key={fandom}
                href={`/fandoms?fandom=${encodeURIComponent(fandom)}`}
              >
                <CategoryCard
                  title={fandom}
                  type="Fandom"
                  index={index}
                />
              </Link>
            ))}
          </div>
        </section>

        <section className="pb-16">
          <SectionHeading
            title="Gêneros"
            subtitle="Escolha o tipo de história que você quer encontrar."
            href="/explorar"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {genres.map((genre, index) => (
              <Link
                key={genre}
                href={`/explorar?genre=${encodeURIComponent(genre)}`}
              >
                <CategoryCard
                  title={genre}
                  type="Gênero"
                  index={index}
                />
              </Link>
            ))}
          </div>
        </section>

        <section className="relative mb-20 overflow-hidden rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-r from-[#291522] via-[#21131e] to-[#171018]">
          <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#ff78b9]/10 blur-[90px]" />

          <div className="relative flex flex-col items-start justify-between gap-8 p-8 md:flex-row md:items-center md:p-12">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
                Para quem escreve
              </p>

              <h2 className="mt-3 text-3xl font-black md:text-4xl">
                Sua história merece um lugar.
              </h2>

              <p className="mt-4 leading-7 text-white/50">
                Crie seu perfil, publique seus capítulos, encontre leitores e
                construa seu próprio espaço dentro do Nooklie.
              </p>
            </div>

            <Link
              href="/escrever"
              className="shrink-0 rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 font-bold text-[#180d15] transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
            >
              Começar a escrever
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#0b080d]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-10 text-sm text-white/35">
          <div className="flex items-center gap-6">
            <Link
              href="/sobre"
              className="transition hover:text-[#ff9bca]"
            >
              Sobre
            </Link>

            <Link
              href="/termos"
              className="transition hover:text-[#ff9bca]"
            >
              Termos
            </Link>

            <Link
              href="/privacidade"
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

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition duration-300 hover:border-[#ff78b9]/20 hover:bg-[#ff78b9]/5">
      <h3 className="font-bold text-white transition group-hover:text-[#ff9bca]">
        {title}
      </h3>

      <p className="mt-1.5 text-sm leading-5 text-white/40">
        {description}
      </p>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <div className="mb-6">
      <Link
        href={href}
        className="group inline-block"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
          Descubra
        </p>

        <h2 className="mt-2 text-3xl font-black transition group-hover:text-[#ff9bca]">
          {title}
        </h2>

        <p className="mt-1 text-sm text-white/40">
          {subtitle}
        </p>
      </Link>
    </div>
  );
}

function CategoryCard({
  title,
  type,
  index,
}: {
  title: string;
  type: "Fandom" | "Gênero";
  index: number;
}) {
  const gradients = [
    "from-[#5a2345] to-[#21121d]",
    "from-[#46284f] to-[#171018]",
    "from-[#303e59] to-[#13131b]",
    "from-[#58332f] to-[#1a1015]",
    "from-[#3d4b42] to-[#121714]",
    "from-[#523f62] to-[#17121c]",
  ];

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${
        gradients[index % gradients.length]
      } p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:border-[#ff78b9]/30`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-white/5 bg-white/5 transition duration-500 group-hover:scale-125" />

      <div className="relative">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-white/35">
          {type}
        </span>

        <h3 className="mt-2 text-lg font-bold transition group-hover:text-[#ff9bca]">
          {title}
        </h3>

        <span className="mt-4 inline-block text-xs text-white/30 transition group-hover:text-white/50">
          Explorar
        </span>
      </div>
    </div>
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
