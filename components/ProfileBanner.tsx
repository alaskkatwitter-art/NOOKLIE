import type { CSSProperties } from 'react';
import { contentMediaUrl } from '@/lib/security/content-media';

export default function ProfileBanner({ cover, accent }: { cover: string | null; accent?: string }) {
  return (
    <div
      aria-hidden="true"
      className="profile-banner"
      style={accent ? { '--profile-banner-accent': accent } as CSSProperties : undefined}
    >
      {cover && <img src={contentMediaUrl(cover)} alt="" className="profile-banner-image" />}
    </div>
  );
}
