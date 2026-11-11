'use client';

import { useState } from 'react';
import type { ProfileAnimation, ProfileImageKind } from '@/lib/profile/animation';
import { contentMediaUrl } from '@/lib/security/content-media';

export default function AnimatedProfileImage({ poster, animation, kind, alt, className }: {
  poster?: string | null;
  animation: ProfileAnimation;
  kind: ProfileImageKind;
  alt?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const position = `${animation.x}% ${animation.y}%`;
  return (
    <div className={`profile-animated-image ${className || ''}`} data-animation-ready={loaded === animation.url} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      {poster && <img src={contentMediaUrl(poster)} className="profile-animation-poster" alt="" />}
      <picture className="profile-animation-frame" data-kind={kind}>
        <source media="(prefers-reduced-motion: no-preference)" srcSet={animation.url} />
        <img alt="" onLoad={() => setLoaded(animation.url)} onError={() => setLoaded(null)} style={{ objectPosition: position, transformOrigin: position, transform: `scale(${animation.zoom})` }} />
      </picture>
    </div>
  );
}
