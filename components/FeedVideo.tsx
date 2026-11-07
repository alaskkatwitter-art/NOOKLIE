'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Link2, Repeat2, Video } from 'lucide-react';

const actionClass = 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-pink-200/20 px-3 text-xs font-semibold text-pink-100 transition hover:bg-pink-300/15 focus-visible:outline-2 focus-visible:outline-pink-300';

export default function FeedVideo({ id, standalone = false }: { id: string; standalone?: boolean }) {
  const [notice, setNotice] = useState('');
  const videoPath = '/video/' + id;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(videoPath, window.location.origin).href);
      setNotice('Link do vídeo copiado.');
    } catch {
      setNotice('Você pode copiar o endereço na página do vídeo.');
    }
  }

  return <div className="mt-2 overflow-hidden rounded-2xl border border-pink-200/20 bg-gradient-to-br from-[#251423] via-[#19121c] to-[#120e16] shadow-lg shadow-black/20">
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-pink-100">
        <Video aria-hidden="true" className="size-4 text-pink-300" /> Vídeo
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-pink-300/10 px-2 py-1 text-xs text-pink-200">
        <Repeat2 aria-hidden="true" className="size-3.5" /> Em loop
      </span>
    </div>
    <video
      aria-label="Vídeo do Nooklie"
      src={'/api/nook-posts/video/' + id}
      controls
      loop
      playsInline
      preload={standalone ? 'metadata' : 'none'}
      className={`block aspect-video w-full border-y border-pink-200/10 bg-gradient-to-br from-[#201320] to-[#0c090e] object-contain ${standalone ? 'max-h-[70dvh]' : 'max-h-96'}`}
    />
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <button type="button" className={actionClass} onClick={copyLink}>
        <Link2 aria-hidden="true" className="size-3.5" /> Copiar link
      </button>
      {!standalone && <Link href={videoPath} className={actionClass}>
        Abrir vídeo <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Link>}
      <span role="status" className="text-xs text-pink-200">{notice}</span>
    </div>
  </div>;
}
