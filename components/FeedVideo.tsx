'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function FeedVideo({ id }: { id: string }) {
  const [notice, setNotice] = useState('');
  return <div className="mt-2 rounded-xl border border-white/15 bg-black/30 p-2">
    <video src={'/api/nook-posts/video/' + id} controls playsInline preload="none" className="max-h-96 w-full rounded-lg bg-black" />
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-pink-200">
      <button type="button" className="min-h-9 rounded-lg border border-white/15 px-2" onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL('/video/' + id, window.location.origin).href);
          setNotice('Link do vídeo copiado.');
        } catch {
          setNotice('Abra o vídeo para copiar o endereço.');
        }
      }}>Copiar link do vídeo</button>
      <Link href={'/video/' + id} className="p-2 underline">Abrir vídeo</Link>
      {notice && <span role="status">{notice}</span>}
    </div>
  </div>;
}
