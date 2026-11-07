'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { contentMediaUrl } from '@/lib/security/content-media';
import { isUploadedBannerVideo, youtubeBannerId } from '@/lib/stories/chapter-banner';

export default function ChapterBanner({ value, className }: { value: string; className: string }) {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const youtube = youtubeBannerId(value);
  if (youtube) return <div className={className}>
    {playingVideo === youtube ? <iframe
      title="Banner do capítulo no YouTube"
      src={'https://www.youtube-nocookie.com/embed/' + youtube}
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      className="aspect-video max-h-[inherit] w-full rounded-[inherit] border-0 bg-black"
    /> : <button
      type="button"
      onClick={() => setPlayingVideo(youtube)}
      className="flex aspect-video max-h-[inherit] w-full items-center justify-center gap-2 rounded-[inherit] bg-gradient-to-br from-[#372135] to-[#191019] px-3 text-sm font-semibold text-pink-100 hover:bg-pink-950"
    ><Play size={18} aria-hidden="true" /> Carregar vídeo do YouTube</button>}
  </div>;
  if (isUploadedBannerVideo(value)) return <video
    src={contentMediaUrl(value)}
    aria-label="Vídeo do banner do capítulo"
    controls
    playsInline
    preload="none"
    className={className + ' bg-black object-contain'}
  />;
  return <img src={contentMediaUrl(value)} alt="Banner do capítulo" className={className + ' object-cover'} />;
}
