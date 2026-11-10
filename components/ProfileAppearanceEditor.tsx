'use client';

import { useState } from 'react';
import ProfileBanner from '@/components/ProfileBanner';
import { contentMediaUrl } from '@/lib/security/content-media';
import type { ProfileAvatarPosition, ProfileHeaderLayout } from '@/lib/profile/appearance';

type Props = {
  layout: ProfileHeaderLayout;
  position: ProfileAvatarPosition;
  onLayoutChange: (layout: ProfileHeaderLayout) => void;
  onPositionChange: (position: ProfileAvatarPosition) => void;
  cover: string | null;
  avatar: string | null;
  name: string;
  username: string;
  disabled: boolean;
};

export default function ProfileAppearanceEditor({
  layout, position, onLayoutChange, onPositionChange, cover, avatar, name, username, disabled,
}: Props) {
  const [preview, setPreview] = useState<'mobile' | 'desktop'>('mobile');

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-[#100b12] p-4" aria-labelledby="profile-appearance-title">
      <div>
        <h3 id="profile-appearance-title" className="font-bold">Aparência do cabeçalho</h3>
        <p className="mt-1 text-xs leading-5 text-white/70">As escolhas abaixo ficam visíveis para quem visita seu perfil após salvar.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Estilo do cabeçalho
          <select className="nook-input mt-2 w-full" value={layout} disabled={disabled} onChange={event => onLayoutChange(event.target.value as ProfileHeaderLayout)}>
            <option value="classic">Clássico</option>
            <option value="immersive">Imersivo</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Posição do avatar
          <select className="nook-input mt-2 w-full" value={position} disabled={disabled} onChange={event => onPositionChange(event.target.value as ProfileAvatarPosition)}>
            <option value="left">Esquerda</option>
            <option value="right">Direita</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Prévia</p>
        <div role="group" aria-label="Tamanho da prévia" className="flex gap-1">
          <button type="button" aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')} className="profile-preview-toggle">Celular</button>
          <button type="button" aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')} className="profile-preview-toggle">Computador</button>
        </div>
      </div>
      <div
        aria-hidden="true"
        data-profile-layout={layout}
        data-avatar-position={position}
        data-preview-size={preview}
        className="profile-appearance-preview mx-auto overflow-hidden rounded-2xl border border-white/15 bg-[#151015]"
      >
        <ProfileBanner cover={cover} />
        <div className="profile-preview-identity px-4 pb-4">
          <div className="profile-preview-avatar grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#151015] bg-pink-300 font-bold text-[#221321]">
            {avatar ? <img src={contentMediaUrl(avatar)} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="truncate text-xs text-white/70">@{username}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
