export type ProfileHeaderLayout = 'classic' | 'immersive';
export type ProfileAvatarPosition = 'left' | 'right';

export function isProfileHeaderLayout(value: unknown): value is ProfileHeaderLayout {
  return value === 'classic' || value === 'immersive';
}

export function isProfileAvatarPosition(value: unknown): value is ProfileAvatarPosition {
  return value === 'left' || value === 'right';
}
