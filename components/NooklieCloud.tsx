import type { SVGProps } from 'react';

/** Official Nooklie silhouette, from the social-media logo supplied by Bárbara. */
export function NooklieCloud({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg width={size} height={size} aria-hidden="true" {...props} viewBox="0 0 398 260" fill="currentColor" stroke="none">
      <path d="M82 260C36.7 260 0 223.5 0 178.5C0 133.5 36.7 97 82 97C89.3 42.3 136.5 0 194 0C251.5 0 298.7 42.3 306 97C309.5 96.5 313 96.3 316.5 96.3C361.5 96.3 398 133 398 178.2C398 223.4 361.5 260 316.5 260H82Z" />
    </svg>
  );
}
