'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Favorite = { id: string; created_at: string; chapter: { id: string; chapter_number: number; title: string }; story: { id: string; title: string } };

export default function FavoriteChaptersPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/favorites/chapters', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar sua lista.');
      if (active) setFavorites(data.favorites || []);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua lista.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href="/biblioteca" className="text-sm text-[#ff9aca] hover:underline">← Biblioteca</Link>
      <h1 className="mt-6 text-3xl font-black">Capítulos favoritos</h1>
      <p className="mt-2 text-sm text-white/60">Um atalho para voltar aos capítulos que você guardou.</p>
      {loading && <p className="mt-8 text-white/60">Carregando…</p>}
      {error && <p role="alert" className="mt-8 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">{error}</p>}
      {!loading && !error && favorites.length === 0 && <p className="mt-8 rounded-xl border border-white/10 p-5 text-white/60">Você ainda não favoritou nenhum capítulo.</p>}
      <ul className="mt-6 space-y-3">{favorites.map((item) => <li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs text-white/50">{item.story.title}</p>
        <Link href={`/capitulo/${encodeURIComponent(item.chapter.id)}`} className="mt-1 inline-block font-semibold text-white hover:text-[#ff9aca]">Capítulo {item.chapter.chapter_number}: {item.chapter.title}</Link>
      </li>)}</ul>
    </div>
  </main>;
}
