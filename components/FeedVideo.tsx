'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Ellipsis, Link2 } from 'lucide-react';
import { VideoAutoplay } from '@/components/VideoAutoplayPreference';

export default function FeedVideo({ id, standalone = false }: { id: string; standalone?: boolean }) {
  const [notice, setNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplay = useContext(VideoAutoplay);
  const manual = useRef(false);
  const automatic = useRef(false);
  const videoPath = '/video/' + id;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoplay || !('IntersectionObserver' in window)) return;

    let visible = false;
    function updatePlayback() {
      if (!video) return;
      if (!visible || document.hidden) {
        if (automatic.current) video.pause();
        return;
      }
      if (!manual.current && video.paused) {
        video.muted = true;
        automatic.current = true;
        void video.play().catch(() => { automatic.current = false; });
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      updatePlayback();
    }, { threshold: 0.5 });
    observer.observe(video);
    document.addEventListener('visibilitychange', updatePlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', updatePlayback);
      if (automatic.current) video.pause();
    };
  }, [autoplay, id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(videoPath, window.location.origin).href);
      setNotice('Link do vídeo copiado.');
    } catch {
      setNotice('Você pode copiar o endereço na página do vídeo.');
    }
  }

  return (
    <div className="mt-2 min-w-0">
      <div className="relative w-fit max-w-full overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          aria-label="Vídeo do Nooklie"
          src={'/api/nook-posts/video/' + id}
          controls
          loop
          playsInline
          preload={standalone ? 'metadata' : 'none'}
          onPointerDown={() => { manual.current = true; }}
          onKeyDown={() => { manual.current = true; }}
          className={`block aspect-[auto_16/9] w-auto max-w-full ${standalone ? 'max-h-[70dvh]' : 'max-h-[65dvh]'}`}
        />
        {!standalone && (
          <details className="absolute right-2 top-2 text-sm text-white">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full bg-black/75" aria-label="Opções do vídeo"><Ellipsis size={20} /></summary>
            <div className="absolute right-0 mt-1 w-36 rounded-lg bg-black/90 p-1">
              <button type="button" onClick={copyLink} className="block min-h-11 w-full px-2 text-left hover:bg-white/15">Copiar link</button>
              <Link href={videoPath} prefetch={false} className="flex min-h-11 items-center px-2 hover:bg-white/15">Abrir vídeo</Link>
            </div>
          </details>
        )}
      </div>
      {standalone && <button type="button" onClick={copyLink} className="mt-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-pink-200"><Link2 size={16} aria-hidden="true" /> Copiar link</button>}
      <span role="status" className={notice ? 'block text-xs text-pink-200' : 'sr-only'}>{notice}</span>
    </div>
  );
}
