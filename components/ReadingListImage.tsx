'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';

export default function ReadingListImage({ src, className = '' }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState('');
  return <span className={'relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-lg bg-pink-300/10 text-pink-200 ' + className}>
    {src && failed !== src
      ? <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={() => setFailed(src)} />
      : <BookOpen size={26} aria-hidden="true" />}
  </span>;
}
