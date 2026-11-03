"use client";

import Link from "next/link";
import AuthStatus from "../../components/AuthStatus";

export default function EscreverPage() {
  return (
    <main className="min-h-screen bg-[#100b12] text-white">
      <div className="mx-auto max-w-7xl px-4 py-7 md:py-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#ff78b9]/15 bg-gradient-to-br from-[#291522] via-[#21131e] to-[#171018] p-6 md:p-10">
          <div className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#ff78b9]/10 blur-[120px]" />

          <div className="relative max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
              Área de escrita
            </p>

            <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
              Transforme uma ideia em uma história.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/50 md:text-lg">
              Crie sua obra, organize capítulos, escolha seus fandoms e
              publique suas histórias no Nooklie.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/criar"
                className="rounded-full bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-7 py-3.5 text-center font-bold text-[#180d15] shadow-[0_10px_35px_rgba(255,104,174,0.15)] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                Criar nova história
              </Link>

              <Link
                href="/minhas-historias"
                className="rounded-full border border-white/10 bg-white/5 px-7 py-3.5 text-center font-bold text-white/70 transition hover:border-[#ff78b9]/30 hover:bg-[#ff78b9]/10 hover:text-white"
              >
                Minhas histórias
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <WritingCard
            number="01"
            title="Crie sua obra"
            description="Comece com título, descrição, capa, classificação e informações da história."
          />

          <WritingCard
            number="02"
            title="Escreva capítulos"
            description="Use o editor do Nooklie para escrever e organizar seus capítulos."
          />

          <WritingCard
            number="03"
            title="Publique"
            description="Quando estiver pronta, publique sua história para que leitores possam encontrá-la."
          />
        </section>

        <section className="mt-12 rounded-[2rem] border border-white/10 bg-[#171018] p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">
            Seu espaço
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Escreva do seu jeito.
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-white/40">
            O Nooklie foi pensado para que a criação da história não fique
            escondida atrás de uma interface complicada. Você cria a obra,
            entra no editor e começa a escrever.
          </p>
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
      className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-gradient-to-r from-[#ff5fab] to-[#ff8fc5] text-[#180d15]"
          : "text-white/60 hover:bg-[#ff78b9]/10 hover:text-[#ff9bca]"
      }`}
    >
      {label}
    </Link>
  );
}

function WritingCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#171018] p-6 transition hover:border-[#ff78b9]/20 hover:bg-[#1b131a]">
      <span className="text-sm font-bold text-[#ff78b9]">
        {number}
      </span>

      <h2 className="mt-4 text-xl font-bold">
        {title}
      </h2>

      <p className="mt-3 text-sm leading-6 text-white/40">
        {description}
      </p>
    </div>
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
