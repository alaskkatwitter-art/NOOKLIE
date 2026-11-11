import AnimatedProfileImage from './AnimatedProfileImage';
import type { ProfileAnimation } from '@/lib/profile/animation';
import type { CSSProperties } from 'react';
import { contentMediaUrl } from '@/lib/security/content-media';

export default function ProfileBanner({ cover, accent, animation }: { cover: string | null; accent?: string; animation?: ProfileAnimation | null }) {
  return (
    <div
      aria-hidden="true"
      className="profile-banner"
      style={accent ? { '--profile-banner-accent': accent } as CSSProperties : undefined}
    >
      {animation ? <AnimatedProfileImage poster={cover} animation={animation} kind="cover" className="profile-banner-image" /> : cover && <img src={contentMediaUrl(cover)} alt="" className="profile-banner-image" />}
    </div>
  );
}
