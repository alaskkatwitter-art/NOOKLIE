'use client';

import { useEffect, useState } from 'react';

export default function ChapterFavoriteButton({ chapterId }: { chapterId: string }) {
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/chapters/${encodeURIComponent(chapterId)}/favorite`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o favorito.');
        if (active) setFavorited(data.favorited === true);
      })
      .catch(() => { if (active) setMessage(''); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chapterId]);

  async function toggleFavorite() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/favorite`, { method: favorited ? 'DELETE' : 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o favorito.');
      setFavorited(data.favorited === true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o favorito.');
    } finally {
      setLoading(false);
    }
  }

  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" disabled={loading} onClick={toggleFavorite} aria-pressed={favorited}
      className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 transition hover:border-[#ff78b9]/50 hover:text-[#ff9aca] disabled:opacity-50">
      {loading ? '…' : favorited ? '♥ Capítulo favoritado' : '♡ Favoritar capítulo'}
    </button>
    {message && <span role="status" className="text-xs text-rose-200">{message}</span>}
  </span>;
}
