'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Story = {
  title: string;
  author: string;
  description: string;
  genre: string;
  rating: string;
  chapters: number;
  color: string;
};

const stories: Story[] = [
  {
    title: 'Entre Dragões e Estrelas',
    author: 'Valarr',
    description:
      'Dois destinos ligados por uma promessa antiga e um reino prestes a despertar.',
    genre: 'Fantasia',
    rating: '16+',
    chapters: 24,
    color: '#6d294f',
  },
  {
    title: 'Depois da Meia-Noite',
    author: 'Jolie',
    description:
      'Algumas histórias de amor começam justamente quando deveriam terminar.',
    genre: 'Romance',
    rating: '18+',
    chapters: 18,
    color: '#472d58',
  },
  {
    title: 'O Último Herdeiro',
    author: 'Daeron',
    description:
      'Um segredo de família pode mudar para sempre o destino de um império.',
    genre: 'Drama',
    rating: '14+',
    chapters: 12,
    color: '#293d59',
  },
  {
    title: 'Coroa de Cinzas',
    author: 'Alys',
    description:
      'Uma princesa, uma guerra e um casamento que nunca deveria acontecer.',
    genre: 'Fantasia',
    rating: '16+',
    chapters: 31,
    color: '#54302f',
  },
  {
    title: 'A Cidade Entre Nós',
    author: 'Mira',
    description:
      'Eles vivem na mesma cidade, mas parecem viver em mundos diferentes.',
    genre: 'Romance',
    rating: '12+',
    chapters: 9,
    color: '#3f3152',
  },
  {
    title: 'Quando o Inverno Chegar',
    author: 'Elena',
    description:
      'Uma promessa feita na infância retorna muitos anos depois.',
    genre: 'Drama',
    rating: '14+',
    chapters: 15,
    color: '#314552',
  },
];

const genres = [
  'Todos',
  'Romance',
  'Fantasia',
  'Drama',
  'Aventura',
  'Terror',
  'Mistério',
];

export default function ExplorePage() {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Todos');
  const [rating, setRating] = useState('Todas');

  const filteredStories = useMemo(() => {
    return stories.filter((story) => {
      const matchesSearch =
        story.title.toLowerCase().includes(search.toLowerCase()) ||
        story.author.toLowerCase().includes(search.toLowerCase());

      const matchesGenre =
        genre === 'Todos' || story.genre === genre;

      const matchesRating =
        rating === 'Todas' || story.rating === rating;

      return matchesSearch && matchesGenre && matchesRating;
    });
  }, [search, genre, rating]);

  return (
    <main className="min-h-screen bg-[#100b12] text-white">
      <header className="border-b border-white/10 bg-[#100b12]">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-5 pt-5">
          <Link href="/" className="flex flex-col items-center">
            <CloudLogo />

            <span className="mt-1 text-2xl font-bold tracking-[0.18em] text-[#ff78b9]">
              TORILAND
            </span>
          </Link>

          <nav className="mt-6 flex w-full items-center justify-center gap-1 overflow-x-auto border-t border-white/5 py-3">
            <Link
              href="/"
              className="whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            >
              Início
            </Link>

            <Link
              href="/explorar"
              className="whitespace-nowrap rounded-full bg-[#ff78b9] px-5 py-2 text-sm font-medium text-[#180d15]"
            >
              Explorar
            </Link>

            <Link
              href="/escrever"
              className="whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            >
              Escrever
            </Link>

            <Link
              href="/notificacoes"
              className="whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            >
              Notificações
            </Link>

            <Link
              href="/perfil"
              className="whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            >
              Perfil
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5">
        <section className="py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#ff78b9]">
            Descubra
          </p>

          <h1 className="mt-3 text-4xl font-black md:text-5xl">
            Encontre sua próxima história.
          </h1>

          <p className="mt-4 max-w-2xl text-white/50">
            Explore novos universos, conheça autores e encontre histórias
            feitas para você.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#191219] p-5">
          <div className="flex items-center rounded-2xl border border-white/10 bg-[#100b12] px-4 py-3">
            <span className="mr-3 text-xl text-white/30">⌕</span>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por título ou autor..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>

          <div className="mt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/35">
              Gênero
            </p>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {genres.map((item) => (
                <button
                  key={item}
                  onClick={() => setGenre(item)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${
                    genre === item
                      ? 'bg-[#ff78b9] font-semibold text-[#180d15]'
                      : 'bg-white/5 text-white/55 hover:bg-white/10'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/35">
              Classificação
            </span>

            {['Todas', '12+', '14+', '16+', '18+'].map((item) => (
              <button
                key={item}
                onClick={() => setRating(item)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  rating === item
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="py-10">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-black">
                Histórias para você
              </h2>

              <p className="mt-1 text-sm text-white/35">
                {filteredStories.length} histórias encontradas
              </p>
            </div>
          </div>

          {filteredStories.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-3">
              {filteredStories.map((story) => (
                <StoryCard
                  key={story.title}
                  story={story}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-[#191219] p-12 text-center">
              <h3 className="text-xl font-bold">
                Nenhuma história encontrada
              </h3>

              <p className="mt-2 text-sm text-white/40">
                Tente mudar sua busca ou seus filtros.
              </p>

              <button
                onClick={() => {
                  setSearch('');
                  setGenre('Todos');
                  setRating('Todas');
                }}
                className="mt-5 rounded-full bg-[#ff78b9] px-5 py-2.5 text-sm font-bold text-[#180d15]"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-white/10 bg-[#0b080d]">
        <div className="mx-auto max-w-7xl px-5 py-8 text-center text-sm text-white/30">
          TORILAND — Um lar para histórias.
        </div>
      </footer>
    </main>
  );
}

function CloudLogo() {
  return (
    <svg
      width="82"
      height="48"
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

function StoryCard({ story }: { story: Story }) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-white/10 bg-[#191219] transition hover:-translate-y-1 hover:border-[#ff78b9]/30">
      <div
        className="relative flex h-52 items-end overflow-hidden p-5"
        style={{
          background: `linear-gradient(135deg, ${story.color}, #120b16)`,
        }}
      >
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full border border-white/10 bg-white/5" />

        <span className="relative rounded-full bg-black/30 px-3 py-1 text-xs font-semibold text-white/70 backdrop-blur">
          {story.genre}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold group-hover:text-[#ff78b9]">
            {story.title}
          </h3>

          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/45">
            {story.rating}
          </span>
        </div>

        <p className="mt-1 text-sm text-[#ff78b9]">
          por {story.author}
        </p>

        <p className="mt-4 text-sm leading-6 text-white/45">
          {story.description}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
          <span className="text-xs text-white/30">
            {story.chapters} capítulos
          </span>

          <button className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold hover:border-[#ff78b9]/40 hover:text-[#ff78b9]">
            Ler história
          </button>
        </div>
      </div>
    </article>
  );
    }
