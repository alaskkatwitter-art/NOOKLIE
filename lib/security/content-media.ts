const buckets = new Set(['story-covers', 'stories', 'nook-media', 'chapter-media', 'social-stories']);

export function contentMediaUrl(
  value: string | null | undefined,
  variant?: 'cover' | 'feed',
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (configured && url.origin !== new URL(configured).origin) return value;
    const match = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match || !buckets.has(match[1])) return value;
    const path = '/api/content-media?bucket=' + encodeURIComponent(match[1]) +
      '&path=' + encodeURIComponent(decodeURIComponent(match[2]));
    if (variant === 'cover' && match[1] === 'story-covers') return path + '&variant=cover';
    if (variant === 'feed' && match[1] === 'nook-media') return path + '&variant=feed';
    return path;
  } catch {
    return value;
  }
}
