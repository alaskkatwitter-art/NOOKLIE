'use client';

import { useEffect, useState } from 'react';
import { contentMediaUrl } from '@/lib/security/content-media';
import { coverPalette } from './cover-palette';

export function useCoverPalette(cover: string | null | undefined) {
  const source = contentMediaUrl(cover);
  const [sample, setSample] = useState<{ source: string; colors: ReturnType<typeof coverPalette> } | null>(null);

  useEffect(() => {
    if (!source) return;
    let active = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 32, 32);
        setSample({ source, colors: coverPalette(context.getImageData(0, 0, 32, 32).data) });
      } catch {
        // A cover without CORS permission still displays normally in the banner.
      }
    };
    image.src = source;
    return () => { active = false; image.onload = null; };
  }, [source]);

  const colors = sample && sample.source === source ? sample.colors : null;
  return {
    '--profile-cover-primary': colors?.[0].join(' ') || '0 0 0',
    '--profile-cover-secondary': colors?.[1].join(' ') || '0 0 0',
  };
}
